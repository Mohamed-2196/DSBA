"""A student's private notebook. Only their writer ever reads a notebook, a note or its files: anyone else gets 404.

- Notebooks: the student's own, and one per module (a module's notes go to it, made when the first one is written).
- A note saves its typed text with the version it was loaded at, and each sheet's ink with that sheet's version. A
  save over something saved since (another tab, another device) answers 409 note_changed or ink_changed, and the
  writer chooses: load the newer one, or save theirs over it.
- Pictures and files are uploads (purpose note_file) that the note's text refers to: a save attaches them to the
  note and lets go of the ones it no longer shows (the sweep deletes those).
- Limits: MAX_NOTEBOOKS and MAX_NOTES per student, STORAGE_LIMIT across their text, ink and files, CREATES_PER_HOUR
  new notes, SAVES_PER_MINUTE saves of one note (text and ink together: the web app saves about once a second)."""

from __future__ import annotations

import json
import uuid
from collections.abc import Iterable
from datetime import timedelta

from sqlalchemy import ColumnElement, cast, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session
from sqlalchemy.types import Text as TextType

from app.core.errors import conflict, invalid, not_found, rate_limited
from app.core.time import utcnow
from app.models import (
    ItemSource,
    ItemStatus,
    Lesson,
    LibraryItem,
    Module,
    Note,
    Notebook,
    NoteInk,
    Upload,
    UploadPurpose,
    UploadStatus,
    User,
)
from app.schemas.notes import (
    EXCERPT_LENGTH,
    MAX_SHEETS,
    InkSave,
    InkSheet,
    NotebookCreate,
    NotebookList,
    NoteCreate,
    NoteFields,
    NotePage,
    NotePdf,
    NoteSummary,
    NoteUpdate,
    StorageUse,
)
from app.schemas.notes import Note as NoteOut
from app.schemas.notes import Notebook as NotebookOut
from app.services import library, note_doc, ratelimit
from app.services.modules import student_lesson
from app.services.storage import Storage, get_storage
from app.services.uploads import serve_type

MAX_NOTEBOOKS = 100
MAX_NOTES = 2000
STORAGE_LIMIT = 250 * 1024 * 1024  # a student's typed text, ink and files together
CREATES_PER_HOUR = 60
SAVES_PER_MINUTE = 240
SAVE_WINDOW = timedelta(minutes=1)
SEARCH_MAX = 100
PAPER_SHEETS_FROM = 1000  # sheets 0-999 are a PDF's pages, 1000 and up its paper (schemas/notes.py MAX_SHEETS)
MAX_SHEET_INDEX = PAPER_SHEETS_FROM + MAX_SHEETS
OWN_NOTEBOOK = "My notebook"
LIVE_UPLOADS = (UploadStatus.uploaded, UploadStatus.attached)


def _like(text: str) -> str:
    """`text` anywhere, with LIKE's wildcards taken literally."""
    escaped = text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _json_bytes(value: object) -> int:
    return len(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode())


# ── storage ──────────────────────────────────────────────────────────────────────────────────


def storage_used(db: Session, user: User) -> int:
    """Bytes the student's notebooks hold: typed text (as stored), ink, and files."""
    text_bytes = db.scalar(
        select(func.coalesce(func.sum(func.octet_length(cast(Note.doc, TextType))), 0)).where(Note.user_id == user.id)
    )
    ink_bytes = db.scalar(
        select(func.coalesce(func.sum(NoteInk.size_bytes), 0))
        .join(Note, Note.id == NoteInk.note_id)
        .where(Note.user_id == user.id)
    )
    file_bytes = db.scalar(
        select(func.coalesce(func.sum(Upload.size_bytes), 0)).where(
            Upload.user_id == user.id, Upload.purpose == UploadPurpose.note_file
        )
    )
    return int(text_bytes or 0) + int(ink_bytes or 0) + int(file_bytes or 0)


def storage_use(db: Session, user: User) -> StorageUse:
    return StorageUse(used_bytes=storage_used(db, user), limit_bytes=STORAGE_LIMIT)


def check_room(db: Session, user: User, more: int) -> None:
    """409 notes_full when `more` bytes would take the student's notebooks past STORAGE_LIMIT. Holds the student's
    notebook lock until the transaction ends, so parallel saves count one after the other."""
    if more <= 0:
        return
    ratelimit.lock(db, f"notes:{user.id}")
    if storage_used(db, user) + more > STORAGE_LIMIT:
        mb = STORAGE_LIMIT // (1024 * 1024)
        raise conflict(
            "notes_full",
            f"Your notebooks are full ({mb} MB). Delete some notes, pictures or files to make room for this.",
        )


# ── notebooks ────────────────────────────────────────────────────────────────────────────────


def _module_title(module: Module) -> str:
    return f"{module.unit_code} {module.name}" if module.unit_code else module.name


def _own_notebook(db: Session, user: User, notebook_id: uuid.UUID) -> Notebook:
    nb = db.scalar(select(Notebook).where(Notebook.id == notebook_id, Notebook.user_id == user.id))
    if nb is None:
        raise not_found("This notebook doesn't exist.")
    return nb


def _check_notebook_count(db: Session, user: User) -> None:
    count = db.scalar(select(func.count()).select_from(Notebook).where(Notebook.user_id == user.id)) or 0
    if count >= MAX_NOTEBOOKS:
        raise conflict(
            "too_many_notebooks", f"You have {MAX_NOTEBOOKS} notebooks, the most you can keep. Delete one to add more."
        )


def module_notebook(db: Session, user: User, module_id: str) -> Notebook:
    """The student's notebook for a module students see, made when it isn't there yet (422 for another module)."""
    nb = db.scalar(select(Notebook).where(Notebook.user_id == user.id, Notebook.module_id == module_id))
    if nb is not None:
        return nb
    module = db.get(Module, module_id)
    if module is None or module.hidden:
        raise invalid("moduleId", "This module doesn't exist.")
    _check_notebook_count(db, user)
    now = utcnow()
    db.execute(
        pg_insert(Notebook)
        .values(id=uuid.uuid4(), user_id=user.id, title=_module_title(module), module_id=module_id, created_at=now)
        .on_conflict_do_nothing(index_elements=["user_id", "module_id"], index_where=Notebook.module_id.is_not(None))
    )
    made = db.scalar(select(Notebook).where(Notebook.user_id == user.id, Notebook.module_id == module_id))
    assert made is not None  # inserted above, or by a parallel request
    return made


def own_notebook(db: Session, user: User) -> Notebook:
    """The student's first notebook of their own (not a module's), made when there is none."""
    nb = db.scalar(
        select(Notebook)
        .where(Notebook.user_id == user.id, Notebook.module_id.is_(None))
        .order_by(Notebook.created_at, Notebook.id)
        .limit(1)
    )
    if nb is not None:
        return nb
    _check_notebook_count(db, user)
    nb = Notebook(user_id=user.id, title=OWN_NOTEBOOK)
    db.add(nb)
    db.flush()
    return nb


def list_notebooks(db: Session, user: User) -> NotebookList:
    """The student's notebooks, the one changed last first, with how many notes each holds."""
    stats = (
        select(Note.notebook_id, func.count().label("n"), func.max(Note.updated_at).label("last"))
        .where(Note.user_id == user.id)
        .group_by(Note.notebook_id)
        .subquery()
    )
    rows = db.execute(
        select(Notebook, func.coalesce(stats.c.n, 0), stats.c.last)
        .outerjoin(stats, stats.c.notebook_id == Notebook.id)
        .where(Notebook.user_id == user.id)
    ).all()
    items = [
        NotebookOut(
            id=nb.id,
            title=nb.title,
            module_id=nb.module_id,
            note_count=n,
            created_at=nb.created_at,
            updated_at=max(nb.updated_at, last) if last else nb.updated_at,
        )
        for nb, n, last in rows
    ]
    items.sort(key=lambda i: (i.updated_at, str(i.id)), reverse=True)
    return NotebookList(items=items, storage=storage_use(db, user))


def notebook_out(db: Session, nb: Notebook) -> NotebookOut:
    n, last = db.execute(select(func.count(), func.max(Note.updated_at)).where(Note.notebook_id == nb.id)).one()
    return NotebookOut(
        id=nb.id,
        title=nb.title,
        module_id=nb.module_id,
        note_count=n,
        created_at=nb.created_at,
        updated_at=max(nb.updated_at, last) if last else nb.updated_at,
    )


def create_notebook(db: Session, user: User, body: NotebookCreate) -> Notebook:
    """A notebook of the student's own (a title is needed), or a module's: the one there is, or a new one."""
    if body.module_id is not None:
        nb = module_notebook(db, user, body.module_id)
        if body.title and nb.title != body.title:
            nb.title, nb.updated_at = body.title, utcnow()
        return nb
    if not body.title:
        raise invalid("title", "Give the notebook a name.")
    _check_notebook_count(db, user)
    nb = Notebook(user_id=user.id, title=body.title)
    db.add(nb)
    db.flush()
    return nb


def rename_notebook(db: Session, user: User, notebook_id: uuid.UUID, title: str) -> Notebook:
    nb = _own_notebook(db, user, notebook_id)
    if nb.title != title:
        nb.title, nb.updated_at = title, utcnow()
    return nb


def _let_go_of_files(db: Session, notes: ColumnElement[bool]) -> None:
    """The files of the notes matching `notes` are no longer used: the sweep deletes them."""
    db.execute(
        update(Upload)
        .where(Upload.purpose == UploadPurpose.note_file, Upload.note_id.in_(select(Note.id).where(notes)))
        .values(status=UploadStatus.uploaded, note_id=None)
    )


def delete_notebook(db: Session, user: User, notebook_id: uuid.UUID) -> None:
    """Deletes the notebook and every note in it."""
    nb = _own_notebook(db, user, notebook_id)
    _let_go_of_files(db, Note.notebook_id == nb.id)
    db.delete(nb)
    db.flush()


# ── notes: reading ───────────────────────────────────────────────────────────────────────────


def _pdf_of(db: Session, note: Note) -> NotePdf | None:
    if note.library_item_id is not None:
        item = db.get(LibraryItem, note.library_item_id)
        ok = item is not None and item.status == ItemStatus.published and item.storage_key is not None
        return NotePdf(
            library_item_id=note.library_item_id, upload_id=None, title=item.title if item else "", available=ok
        )
    if note.pdf_upload_id is not None:
        up = db.get(Upload, note.pdf_upload_id)
        ok = up is not None and up.status in LIVE_UPLOADS
        return NotePdf(
            library_item_id=None, upload_id=note.pdf_upload_id, title=up.file_name if up else "", available=ok
        )
    return None


def _on_pdf(note: Note) -> bool:
    return note.library_item_id is not None or note.pdf_upload_id is not None


def to_out(db: Session, note: Note) -> NoteOut:
    nb = db.get(Notebook, note.notebook_id)
    ink = db.scalars(select(NoteInk).where(NoteInk.note_id == note.id).order_by(NoteInk.sheet)).all()
    return NoteOut.model_validate(
        {
            "id": note.id,
            "notebook_id": note.notebook_id,
            "title": note.title,
            "excerpt": note.text[:EXCERPT_LENGTH],
            "module_id": nb.module_id if nb else None,
            "lesson_id": note.lesson_id,
            "on_pdf": _on_pdf(note),
            "version": note.version,
            "created_at": note.created_at,
            "updated_at": note.updated_at,
            "doc": note.doc,
            "text": note.text,
            "paper": note.paper,
            "sheets": note.sheets,
            "pdf": _pdf_of(db, note),
            "ink": [InkSheet(sheet=i.sheet, strokes=i.strokes, version=i.version) for i in ink],
        }
    )


def list_notes(
    db: Session,
    user: User,
    *,
    q: str | None = None,
    notebook_id: uuid.UUID | None = None,
    module_id: str | None = None,
    lesson_id: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> NotePage:
    """The student's notes, last edited first. `q` matches the title or the typed text (any part, any case);
    `notebook_id` keeps one notebook's notes, `module_id` the module's notebook's, and `lesson_id` one lesson's."""
    where: list[ColumnElement[bool]] = [Note.user_id == user.id]
    text = (q or "").strip()[:SEARCH_MAX]
    if text:
        pattern = _like(text)
        where.append(or_(Note.title.ilike(pattern, escape="\\"), Note.text.ilike(pattern, escape="\\")))
    if notebook_id is not None:
        where.append(Note.notebook_id == notebook_id)
    if module_id is not None:
        where.append(Notebook.module_id == module_id)
    if lesson_id is not None:
        where.append(Note.lesson_id == lesson_id)
    base = select(Note).join(Notebook, Notebook.id == Note.notebook_id).where(*where)
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = db.execute(
        select(
            Note.id,
            Note.notebook_id,
            Note.title,
            func.left(Note.text, EXCERPT_LENGTH).label("excerpt"),
            Notebook.module_id,
            Note.lesson_id,
            (Note.library_item_id.is_not(None) | Note.pdf_upload_id.is_not(None)).label("on_pdf"),
            Note.version,
            Note.created_at,
            Note.updated_at,
        )
        .join(Notebook, Notebook.id == Note.notebook_id)
        .where(*where)
        .order_by(Note.updated_at.desc(), Note.id)
        .limit(limit)
        .offset(offset)
    ).mappings()
    items = [NoteSummary.model_validate(dict(r)) for r in rows]
    return NotePage(items=items, total=total, limit=limit, offset=offset)


def _own(db: Session, user: User, note_id: uuid.UUID, *, lock: bool = False) -> Note:
    query = select(Note).where(Note.id == note_id, Note.user_id == user.id)
    note = db.scalar(query.with_for_update() if lock else query)
    if note is None:
        raise not_found("This note doesn't exist.")
    return note


def get_note(db: Session, user: User, note_id: uuid.UUID) -> Note:
    return _own(db, user, note_id)


# ── notes: writing ───────────────────────────────────────────────────────────────────────────


def _check_lesson(db: Session, nb: Notebook, fields: NoteFields, note: Note | None = None) -> None:
    """The lesson is one students see, in the notebook's module (a note may keep a lesson hidden since)."""
    if fields.lesson_id is None:
        return
    if nb.module_id is None:
        raise invalid("lessonId", "Only a module's notebook keeps notes about its lessons.")
    current = note.lesson_id if note is not None else None
    lesson = db.get(Lesson, fields.lesson_id) if fields.lesson_id == current else student_lesson(db, fields.lesson_id)
    if lesson is None or lesson.module_id != nb.module_id:
        raise invalid("lessonId", "This lesson doesn't exist.")


def _attach(db: Session, user: User, note: Note, uploads: Iterable[uuid.UUID]) -> None:
    """The note's files are the ones its text shows, and its PDF: those become attached to it, the ones it no longer
    shows are let go of (the sweep deletes them). Ids that aren't the student's free or own files are left alone:
    the web app shows them as missing."""
    keep = set(uploads)
    if note.pdf_upload_id is not None:
        keep.add(note.pdf_upload_id)
    if keep:
        db.execute(
            update(Upload)
            .where(
                Upload.id.in_(keep),
                Upload.user_id == user.id,
                Upload.purpose == UploadPurpose.note_file,
                Upload.status.in_(LIVE_UPLOADS),
                or_(Upload.note_id.is_(None), Upload.note_id == note.id),
            )
            .values(status=UploadStatus.attached, note_id=note.id)
        )
    db.execute(
        update(Upload)
        .where(Upload.note_id == note.id, Upload.id.not_in(keep) if keep else Upload.id.is_not(None))
        .values(status=UploadStatus.uploaded, note_id=None)
    )


def _creating(db: Session, user: User) -> None:
    ratelimit.enforce(
        db,
        f"notes-new:{user.id}",
        Note.created_at,
        [Note.user_id == user.id],
        limit=CREATES_PER_HOUR,
        window=timedelta(hours=1),
        message="You've started a lot of notes. Try again in {}.",
    )
    count = db.scalar(select(func.count()).select_from(Note).where(Note.user_id == user.id)) or 0
    if count >= MAX_NOTES:
        raise conflict("too_many_notes", f"You have {MAX_NOTES} notes, the most you can keep. Delete some to add more.")


def _pdf_upload(db: Session, user: User, upload_id: uuid.UUID) -> Upload:
    up = db.get(Upload, upload_id)
    if (
        up is None
        or up.user_id != user.id
        or up.purpose != UploadPurpose.note_file
        or up.status not in LIVE_UPLOADS
        or up.content_type != "application/pdf"
    ):
        raise invalid("pdfUploadId", "This PDF didn't upload. Choose it again.")
    if up.note_id is not None:
        raise invalid("pdfUploadId", "This PDF is in another note already. Upload it again for a new note.")
    return up


def create_note(db: Session, user: User, body: NoteCreate) -> Note:
    if body.notebook_id is not None:
        nb = _own_notebook(db, user, body.notebook_id)
    elif body.module_id is not None:
        nb = module_notebook(db, user, body.module_id)
    else:
        nb = own_notebook(db, user)
    _check_lesson(db, nb, body)
    checked = note_doc.check(body.doc)
    pdf = _pdf_upload(db, user, body.pdf_upload_id) if body.pdf_upload_id is not None else None
    _creating(db, user)
    check_room(db, user, _json_bytes(body.doc))
    now = utcnow()
    note = Note(
        user_id=user.id,
        notebook_id=nb.id,
        title=body.title,
        doc=body.doc,
        text=checked.text,
        paper=body.paper,
        sheets=body.sheets if pdf is not None else max(1, body.sheets),
        lesson_id=body.lesson_id,
        pdf_upload_id=pdf.id if pdf is not None else None,
        saves_since=now,
        created_at=now,
        updated_at=now,
    )
    db.add(note)
    db.flush()
    _attach(db, user, note, checked.uploads)
    return note


def annotate(db: Session, user: User, item_id: uuid.UUID) -> tuple[Note, bool]:
    """The student's note written over a library PDF: the one there is, or a new one in the module's notebook (or
    their own when the file has no module). -> (note, made now)."""
    item = library.get_visible(db, item_id, user)
    if item.source != ItemSource.file or serve_type(item.file_name) != "application/pdf":
        raise invalid("libraryItemId", "Only a PDF can be written over. Download this file instead.")
    if item.status != ItemStatus.published:
        raise invalid("libraryItemId", "This file isn't public yet: you can write over it once it's published.")
    found = db.scalar(select(Note).where(Note.user_id == user.id, Note.library_item_id == item.id))
    if found is not None:
        return found, False
    module = db.get(Module, item.module_id) if item.module_id else None
    nb = module_notebook(db, user, module.id) if module is not None and not module.hidden else own_notebook(db, user)
    _creating(db, user)
    now = utcnow()
    note = Note(
        user_id=user.id,
        notebook_id=nb.id,
        title=item.title[:200],
        doc={"type": "doc", "content": []},
        text="",
        paper="lined",
        sheets=0,
        library_item_id=item.id,
        saves_since=now,
        created_at=now,
        updated_at=now,
    )
    db.add(note)
    db.flush()
    return note, True


def _count_save(note: Note) -> None:
    """One more save of the note in this minute, or 429 when there were SAVES_PER_MINUTE already."""
    now = utcnow()
    if now - note.saves_since >= SAVE_WINDOW:
        note.saves_since, note.saves = now, 0
    if note.saves >= SAVES_PER_MINUTE:
        wait = max(1, int((note.saves_since + SAVE_WINDOW - now).total_seconds()) + 1)
        raise rate_limited(wait, "You're saving very fast. Your note is kept on this device: it saves in a moment.")
    note.saves += 1
    note.updated_at = now


def update_note(db: Session, user: User, note_id: uuid.UUID, body: NoteUpdate) -> Note:
    """Saves the note as sent, if it is still at `body.version` (409 note_changed otherwise). The row is locked, so of
    two saves of the same version, the second gets 409. Sending what is already saved changes nothing. Moving it to
    a notebook of another module lets go of its lesson."""
    note = _own(db, user, note_id, lock=True)
    if note.version != body.version:
        raise conflict("note_changed", "This note was changed in another tab or on another device.")
    nb = _own_notebook(db, user, body.notebook_id)
    if nb.id != note.notebook_id and body.lesson_id is not None:
        before = db.get(Notebook, note.notebook_id)
        if before is None or before.module_id != nb.module_id:
            body = body.model_copy(update={"lesson_id": None})
    _check_lesson(db, nb, body, note)
    fields = {
        "title": body.title,
        "doc": body.doc,
        "paper": body.paper,
        "sheets": body.sheets if _on_pdf(note) else max(1, body.sheets),
        "lesson_id": body.lesson_id,
        "notebook_id": nb.id,
    }
    if all(getattr(note, k) == v for k, v in fields.items()):
        return note
    checked = note_doc.check(body.doc) if body.doc != note.doc else None
    _count_save(note)
    if checked is not None:
        check_room(db, user, _json_bytes(body.doc) - _json_bytes(note.doc))
        note.text = checked.text
        _attach(db, user, note, checked.uploads)
    for k, v in fields.items():
        setattr(note, k, v)
    note.version += 1
    db.flush()
    return note


def save_ink(db: Session, user: User, note_id: uuid.UUID, sheet: int, body: InkSave) -> InkSheet:
    """Saves one sheet's ink as sent, if it is still at `body.version` (0 when it had none; 409 ink_changed
    otherwise). An empty sheet is removed."""
    if not 0 <= sheet < MAX_SHEET_INDEX:
        raise not_found("This sheet doesn't exist.")
    note = _own(db, user, note_id, lock=True)
    row = db.get(NoteInk, (note.id, sheet))
    if (row.version if row is not None else 0) != body.version:
        raise conflict("ink_changed", "This page was written on in another tab or on another device.")
    strokes = [s.model_dump(mode="json") for s in body.strokes]
    if row is not None and row.strokes == strokes:
        return InkSheet(sheet=sheet, strokes=body.strokes, version=row.version)
    size = _json_bytes(strokes) if strokes else 0
    _count_save(note)
    check_room(db, user, size - (row.size_bytes if row is not None else 0))
    now = utcnow()
    if not strokes:
        if row is not None:
            db.delete(row)
        db.flush()
        return InkSheet(sheet=sheet, strokes=[], version=0)
    if row is None:
        row = NoteInk(note_id=note.id, sheet=sheet, strokes=strokes, size_bytes=size, version=1, updated_at=now)
        db.add(row)
    else:
        row.strokes, row.size_bytes, row.updated_at = strokes, size, now
        row.version += 1
    db.flush()
    return InkSheet(sheet=sheet, strokes=body.strokes, version=row.version)


def delete_note(db: Session, user: User, note_id: uuid.UUID) -> None:
    note = _own(db, user, note_id)
    _let_go_of_files(db, Note.id == note.id)
    db.delete(note)
    db.flush()


# ── files ────────────────────────────────────────────────────────────────────────────────────


def file_url(db: Session, user: User, upload_id: uuid.UUID, *, download: bool, storage: Storage | None = None) -> str:
    """A short-lived link to one of the student's note files: shown in the browser (pictures and PDFs) unless
    `download`, which saves it under its name. Anyone else's file, and one not uploaded yet, answers 404."""
    up = db.get(Upload, upload_id)
    if up is None or up.user_id != user.id or up.purpose != UploadPurpose.note_file or up.status not in LIVE_UPLOADS:
        raise not_found("This file doesn't exist.")
    st = storage or get_storage()
    return st.presigned_get(
        up.storage_key, file_name=up.file_name, content_type=serve_type(up.file_name), inline=not download
    )


def check_upload(db: Session, user: User, size_bytes: int) -> None:
    """Before a note file travels: the student's notebooks have room for it."""
    check_room(db, user, size_bytes)
