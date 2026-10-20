"""A student's private notebook. Only their writer ever reads a notebook, a note or its files: anyone else gets 404.

- Notebooks: the student's own, and one per module (a module's notes go to it, made when the first one is written).
- A note may be about a module (set from where it was started, changeable) and one of its lessons. A module's notebook
  holds only that module's notes: a note given another module there moves to that module's notebook.
- A note with nothing in it (no title, text, files, PDF or ink) isn't listed or counted, and is deleted an hour on:
  "New note" makes one at once, and a student who leaves it empty never sees it again.
- A note saves its typed text with the version it was loaded at, and each sheet's ink with that sheet's version. A
  save over something saved since (another tab, another device) answers 409 note_changed or ink_changed, and the
  writer chooses: load the newer one, or save theirs over it.
- Pictures and files are the student's uploads (purpose note_file) that a note's document refers to, and its PDF; the
  note lists them (`Note.uploads`). A file is in use while any of the student's notes lists it, so a picture copied
  into a second note stays when the first goes; one no note lists any more is released (it stops counting against
  the student's room, and the sweep deletes it).
- Limits: MAX_NOTEBOOKS and MAX_NOTES per student; WRITING_LIMIT across their typed text and ink (in the database)
  and FILES_LIMIT across their files (in file storage); SHEET_MAX_BYTES of ink on one sheet; CREATES_PER_HOUR new
  notes; SAVES_PER_MINUTE saves of one note (text and ink together: the web app saves about once a second) and
  PERSON_SAVES_PER_MINUTE of all of a student's notes.
- A note is read without its ink, and each sheet's ink on its own: no request loads more than one sheet's."""

from __future__ import annotations

import json
import uuid
from collections.abc import Iterable
from datetime import timedelta

from sqlalchemy import ColumnElement, and_, case, cast, delete, exists, func, or_, select, update
from sqlalchemy.dialects.postgresql import array
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
    SharedNote,
    Upload,
    UploadPurpose,
    UploadStatus,
    User,
)
from app.schemas.notes import (
    EXCERPT_LENGTH,
    MAX_SHEETS,
    PAPER_SHEETS_FROM,
    SHEET_MAX_BYTES,
    InkInfo,
    InkSave,
    InkSheet,
    NotebookCreate,
    NotebookList,
    NoteCreate,
    NotePage,
    NotePdf,
    NoteShare,
    NoteSummary,
    NoteUpdate,
    PageChange,
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
WRITING_LIMIT = 25 * 1024 * 1024  # a student's typed text and ink, in the database: hundreds of dense pages
FILES_LIMIT = 250 * 1024 * 1024  # a student's pictures, files and PDFs, in file storage
CREATES_PER_HOUR = 60
SAVES_PER_MINUTE = 240
PERSON_SAVES_PER_MINUTE = 400
SAVE_WINDOW = timedelta(minutes=1)
SEARCH_MAX = 100
MAX_SHEET_INDEX = PAPER_SHEETS_FROM + MAX_SHEETS
OWN_NOTEBOOK = "My notebook"
# A note left empty this long is deleted when the student starts another.
EMPTY_KEPT = timedelta(hours=1)
# A note file that is still there: uploaded and not placed yet, in a note, or released and not swept yet (a save that
# shows it again, after an undo, takes it back).
KEPT_UPLOADS = (UploadStatus.uploaded, UploadStatus.attached, UploadStatus.released)


def _like(text: str) -> str:
    """`text` anywhere, with LIKE's wildcards taken literally."""
    escaped = text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _json_bytes(value: object) -> int:
    return len(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode())


# ── storage ──────────────────────────────────────────────────────────────────────────────────


def writing_used(db: Session, user: User) -> int:
    """Bytes of the student's typed text (as stored) and ink."""
    text_bytes = db.scalar(
        select(func.coalesce(func.sum(func.octet_length(cast(Note.doc, TextType))), 0)).where(Note.user_id == user.id)
    )
    ink_bytes = db.scalar(
        select(func.coalesce(func.sum(NoteInk.size_bytes), 0))
        .join(Note, Note.id == NoteInk.note_id)
        .where(Note.user_id == user.id)
    )
    return int(text_bytes or 0) + int(ink_bytes or 0)


def files_used(db: Session, user: User) -> int:
    """Bytes of the student's note files: pictures, files and PDFs in their notes, or on their way to one. Released
    files (no note shows them any more) don't count."""
    file_bytes = db.scalar(
        select(func.coalesce(func.sum(Upload.size_bytes), 0)).where(
            Upload.user_id == user.id,
            Upload.purpose == UploadPurpose.note_file,
            Upload.status != UploadStatus.released,
        )
    )
    return int(file_bytes or 0)


def storage_use(db: Session, user: User) -> StorageUse:
    return StorageUse(
        writing_bytes=writing_used(db, user),
        writing_limit_bytes=WRITING_LIMIT,
        files_bytes=files_used(db, user),
        files_limit_bytes=FILES_LIMIT,
    )


def _mb(limit: int) -> int:
    return limit // (1024 * 1024)


def check_writing(db: Session, user: User, more: int) -> None:
    """409 notes_full when `more` bytes of text or ink would take the student past WRITING_LIMIT. Holds the student's
    notebook lock until the transaction ends, so parallel saves count one after the other."""
    if more <= 0:
        return
    ratelimit.lock(db, f"notes:{user.id}")
    if writing_used(db, user) + more > WRITING_LIMIT:
        raise conflict(
            "notes_full",
            f"Your notes are full: their text and handwriting take {_mb(WRITING_LIMIT)} MB. "
            "Delete some notes or pages to make room.",
        )


def check_files(db: Session, user: User, more: int) -> None:
    """409 notes_full when a file of `more` bytes would take the student's note files past FILES_LIMIT."""
    if more <= 0:
        return
    ratelimit.lock(db, f"notes:{user.id}")
    if files_used(db, user) + more > FILES_LIMIT:
        raise conflict(
            "notes_full",
            f"Your notes' pictures and files take {_mb(FILES_LIMIT)} MB, the most they can. "
            "Delete some to make room for this one.",
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
        .where(Note.user_id == user.id, ~_empty())
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
    n, last = db.execute(
        select(func.count(), func.max(Note.updated_at)).where(Note.notebook_id == nb.id, ~_empty())
    ).one()
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


def release(db: Session, user: User, upload_ids: Iterable[uuid.UUID]) -> None:
    """Of these files of the student's, the ones none of their notes, and none of the copies they shared with a
    module, lists any more are released: they stop counting against the student's room, and the sweep deletes them.
    Run after the notes' and copies' lists are written (flushed)."""
    ids = set(upload_ids)
    if not ids:
        return
    listed = (
        select(Note.id)
        .where(
            Note.user_id == user.id,
            or_(Note.uploads.contains(array([Upload.id])), Note.pdf_upload_id == Upload.id),
        )
        .exists()
    )
    shared = (
        select(SharedNote.id)
        .where(SharedNote.user_id == user.id, SharedNote.uploads.contains(array([Upload.id])))
        .exists()
    )
    db.execute(
        update(Upload)
        .where(
            Upload.id.in_(ids),
            Upload.user_id == user.id,
            Upload.purpose == UploadPurpose.note_file,
            Upload.status == UploadStatus.attached,
            ~listed,
            ~shared,
        )
        .values(status=UploadStatus.released)
    )


def delete_notebook(db: Session, user: User, notebook_id: uuid.UUID) -> None:
    """Deletes the notebook and every note in it; their files that no other note shows are released."""
    nb = _own_notebook(db, user, notebook_id)
    shown = {u for (uploads,) in db.execute(select(Note.uploads).where(Note.notebook_id == nb.id)) for u in uploads}
    db.delete(nb)
    db.flush()
    release(db, user, shown)


# ── notes: reading ───────────────────────────────────────────────────────────────────────────


def _empty() -> ColumnElement[bool]:
    """A note with nothing in it: no title, typed text, files or PDF, and no ink."""
    return and_(
        Note.title == "",
        Note.text == "",
        func.cardinality(Note.uploads) == 0,
        Note.library_item_id.is_(None),
        Note.pdf_upload_id.is_(None),
        ~exists().where(NoteInk.note_id == Note.id),
    )


def _pdf_of(db: Session, note: Note) -> NotePdf | None:
    if note.library_item_id is not None:
        item = db.get(LibraryItem, note.library_item_id)
        ok = item is not None and item.status == ItemStatus.published and item.storage_key is not None
        return NotePdf(
            library_item_id=note.library_item_id,
            slug=item.slug if item else None,
            upload_id=None,
            title=item.title if item else "",
            available=ok,
        )
    if note.pdf_upload_id is not None:
        up = db.get(Upload, note.pdf_upload_id)
        ok = up is not None and up.status in KEPT_UPLOADS
        return NotePdf(
            library_item_id=None,
            slug=None,
            upload_id=note.pdf_upload_id,
            title=up.file_name if up else "",
            available=ok,
        )
    return None


def _on_pdf(note: Note) -> bool:
    return note.library_item_id is not None or note.pdf_upload_id is not None


def to_out(db: Session, note: Note) -> NoteOut:
    ink = db.execute(
        select(NoteInk.sheet, NoteInk.version).where(NoteInk.note_id == note.id).order_by(NoteInk.sheet)
    ).all()
    return NoteOut.model_validate(
        {
            "id": note.id,
            "notebook_id": note.notebook_id,
            "title": note.title,
            "excerpt": note.text[:EXCERPT_LENGTH],
            "module_id": note.module_id,
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
            "ink": [InkInfo(sheet=sheet, version=version) for sheet, version in ink],
            "share": _share_of(db, note),
        }
    )


def _share_of(db: Session, note: Note) -> NoteShare | None:
    """The note's copy shared with its module (services/shared_notes.py), as its writer sees it from the note."""
    share = db.scalar(select(SharedNote).where(SharedNote.note_id == note.id))
    if share is None or share.withdrawn_at is not None:
        return None
    return NoteShare(
        id=share.id,
        module_id=share.module_id,
        credited=share.credited,
        hidden=share.hidden,
        shared_at=share.shared_at,
        updated_at=share.updated_at,
        up_to_date=_same_as(db, note, share),
    )


def _same_as(db: Session, note: Note, share: SharedNote) -> bool:
    """Whether the shared copy still has the note as it is: its module, title, text, paper, pages and ink."""
    if note.updated_at <= share.updated_at and note.module_id == share.module_id:
        return True
    fields = (note.module_id, note.title, note.doc, note.paper, note.sheets)
    if fields != (share.module_id, share.title, share.doc, share.paper, share.sheets):
        return False
    rows = db.execute(
        select(NoteInk.sheet, NoteInk.strokes)
        .where(
            NoteInk.note_id == note.id,
            NoteInk.sheet >= PAPER_SHEETS_FROM,
            NoteInk.sheet < PAPER_SHEETS_FROM + note.sheets,
        )
        .order_by(NoteInk.sheet)
    ).tuples()
    return [{"sheet": sheet, "strokes": strokes} for sheet, strokes in rows if strokes] == share.ink


def count_notes(db: Session, user: User) -> int:
    """The student's notes with something in them (what list_notes counts with no filter)."""
    return db.scalar(select(func.count()).select_from(Note).where(Note.user_id == user.id, ~_empty())) or 0


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
    """The student's notes with something in them, last edited first. `q` matches the title or the typed text (any
    part, any case); `notebook_id` keeps one notebook's notes, `module_id` one module's, `lesson_id` one lesson's."""
    where: list[ColumnElement[bool]] = [Note.user_id == user.id, ~_empty()]
    text = (q or "").strip()[:SEARCH_MAX]
    if text:
        pattern = _like(text)
        where.append(or_(Note.title.ilike(pattern, escape="\\"), Note.text.ilike(pattern, escape="\\")))
    if notebook_id is not None:
        where.append(Note.notebook_id == notebook_id)
    if module_id is not None:
        where.append(Note.module_id == module_id)
    if lesson_id is not None:
        where.append(Note.lesson_id == lesson_id)
    base = select(Note).where(*where)
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = db.execute(
        select(
            Note.id,
            Note.notebook_id,
            Note.title,
            func.left(Note.text, EXCERPT_LENGTH).label("excerpt"),
            Note.module_id,
            Note.lesson_id,
            (Note.library_item_id.is_not(None) | Note.pdf_upload_id.is_not(None)).label("on_pdf"),
            Note.version,
            Note.created_at,
            Note.updated_at,
        )
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


def get_note(db: Session, user: User, note_id: uuid.UUID, *, lock: bool = False) -> Note:
    return _own(db, user, note_id, lock=lock)


# ── notes: writing ───────────────────────────────────────────────────────────────────────────


def _check_module(db: Session, module_id: str | None, note: Note | None = None) -> None:
    """The module is one students see (a note may keep a module hidden since)."""
    if module_id is None or (note is not None and module_id == note.module_id):
        return
    module = db.get(Module, module_id)
    if module is None or module.hidden:
        raise invalid("moduleId", "This module doesn't exist.")


def _check_lesson(db: Session, module_id: str | None, lesson_id: str | None, note: Note | None = None) -> None:
    """The lesson is one students see, in the note's module (a note may keep a lesson hidden since)."""
    if lesson_id is None:
        return
    if module_id is None:
        raise invalid("lessonId", "Choose the note's module before its lesson.")
    current = note.lesson_id if note is not None else None
    lesson = db.get(Lesson, lesson_id) if lesson_id == current else student_lesson(db, lesson_id)
    if lesson is None or lesson.module_id != module_id:
        raise invalid("lessonId", "This lesson doesn't exist.")


def _attach(db: Session, user: User, note: Note, uploads: Iterable[uuid.UUID]) -> None:
    """The note lists the files its document shows, and its PDF, and those are in use; the ones it no longer shows
    are released unless another of the student's notes shows them. Ids that aren't the student's note files are
    left out: the web app shows them as missing. A released file shown again (an undo) counts against the student's
    room again, so it must fit (409 notes_full): checked under the notebook lock, after this save's own releases."""
    wanted = set(uploads)
    if note.pdf_upload_id is not None:
        wanted.add(note.pdf_upload_id)
    before = set(note.uploads or [])
    rows: list[tuple[uuid.UUID, UploadStatus, int]] = []
    if wanted:
        ratelimit.lock(db, f"notes:{user.id}")
        found = db.execute(
            select(Upload.id, Upload.status, Upload.size_bytes).where(
                Upload.id.in_(wanted),
                Upload.user_id == user.id,
                Upload.purpose == UploadPurpose.note_file,
                Upload.status.in_(KEPT_UPLOADS),
            )
        ).tuples()
        rows = list(found)
    owned = {up_id for up_id, _, _ in rows}
    revived = sum(size for _, status, size in rows if status == UploadStatus.released)
    note.uploads = sorted(owned)
    db.flush()
    release(db, user, before - owned)
    check_files(db, user, revived)
    if owned:
        db.execute(update(Upload).where(Upload.id.in_(owned)).values(status=UploadStatus.attached))


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
        or up.status not in KEPT_UPLOADS
        or up.content_type != "application/pdf"
    ):
        raise invalid("pdfUploadId", "This PDF didn't upload. Choose it again.")
    return up


def _purge_empty(db: Session, user: User) -> None:
    """The student's notes left empty for EMPTY_KEPT: they were started and never written in."""
    db.execute(
        delete(Note)
        .where(Note.user_id == user.id, Note.updated_at < utcnow() - EMPTY_KEPT, _empty())
        .execution_options(synchronize_session=False)
    )


def create_note(db: Session, user: User, body: NoteCreate) -> Note:
    if body.notebook_id is not None:
        nb = _own_notebook(db, user, body.notebook_id)
    elif body.module_id is not None:
        nb = module_notebook(db, user, body.module_id)
    else:
        nb = own_notebook(db, user)
    module_id = nb.module_id if nb.module_id is not None else body.module_id
    _check_module(db, module_id)
    _check_lesson(db, module_id, body.lesson_id)
    pdf = _pdf_upload(db, user, body.pdf_upload_id) if body.pdf_upload_id is not None else None
    sheets = body.sheets if pdf is not None else max(1, body.sheets)
    checked = note_doc.check(body.doc, sheets=sheets)
    _purge_empty(db, user)
    _creating(db, user)
    check_writing(db, user, _json_bytes(body.doc))
    now = utcnow()
    note = Note(
        user_id=user.id,
        notebook_id=nb.id,
        title=body.title,
        doc=body.doc,
        text=checked.text,
        paper=body.paper,
        sheets=sheets,
        module_id=module_id,
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
    shown = module is not None and not module.hidden
    nb = module_notebook(db, user, module.id) if module is not None and shown else own_notebook(db, user)
    _creating(db, user)
    now = utcnow()
    note = Note(
        user_id=user.id,
        notebook_id=nb.id,
        # named as the library names the paper ('ST2133 · May 2024 · Zone A'), not by its file's title (ST-80)
        title=library.exam_title(item, (module.unit_code or module.short_name) if module is not None else None)[:200],
        doc={"type": "doc", "content": []},
        text="",
        paper="lined",
        sheets=0,
        module_id=module.id if module is not None and shown else None,
        library_item_id=item.id,
        saves_since=now,
        created_at=now,
        updated_at=now,
    )
    db.add(note)
    db.flush()
    return note, True


def _count_save(db: Session, user: User, note: Note) -> None:
    """One more save of the note in this minute, or 429 when there were SAVES_PER_MINUTE of it already, or
    PERSON_SAVES_PER_MINUTE of all the student's notes (counted under the student's notebook lock)."""
    now = utcnow()
    if now - note.saves_since >= SAVE_WINDOW:
        note.saves_since, note.saves = now, 0
    ratelimit.lock(db, f"notes:{user.id}")
    others = db.scalar(
        select(func.coalesce(func.sum(Note.saves), 0)).where(
            Note.user_id == user.id, Note.id != note.id, Note.saves_since > now - SAVE_WINDOW
        )
    )
    if note.saves >= SAVES_PER_MINUTE or note.saves + int(others or 0) >= PERSON_SAVES_PER_MINUTE:
        wait = max(1, int((note.saves_since + SAVE_WINDOW - now).total_seconds()) + 1)
        raise rate_limited(wait, "You're saving very fast. Your note is kept on this device: it saves in a moment.")
    note.saves += 1
    note.updated_at = now


def update_note(db: Session, user: User, note_id: uuid.UUID, body: NoteUpdate) -> Note:
    """Saves the note as sent, if it is still at `body.version` (409 note_changed otherwise). The row is locked, so of
    two saves of the same version, the second gets 409. Sending what is already saved changes nothing.

    A module's notebook holds that module's notes: a note moved into one is about its module, and a note there given
    another module (or none) goes to that module's notebook (or the student's own). A note about another module lets
    go of its lesson."""
    note = _own(db, user, note_id, lock=True)
    if note.version != body.version:
        raise conflict("note_changed", "This note was changed in another tab or on another device.")
    nb = _own_notebook(db, user, body.notebook_id)
    module_id = body.module_id
    if nb.module_id is not None and module_id != nb.module_id:
        if nb.id == note.notebook_id:
            nb = module_notebook(db, user, module_id) if module_id is not None else own_notebook(db, user)
        else:
            module_id = nb.module_id
    _check_module(db, module_id, note)
    lesson_id = body.lesson_id
    if lesson_id is not None and module_id != note.module_id:
        lesson = db.get(Lesson, lesson_id)
        if lesson is None or lesson.module_id != module_id:
            lesson_id = None
    _check_lesson(db, module_id, lesson_id, note)
    sheets = body.sheets if _on_pdf(note) else max(1, body.sheets)
    fields = {
        "title": body.title,
        "doc": body.doc,
        "paper": body.paper,
        "sheets": sheets,
        "module_id": module_id,
        "lesson_id": lesson_id,
        "notebook_id": nb.id,
    }
    if all(getattr(note, k) == v for k, v in fields.items()):
        return note
    # the text is checked again when it changed, or when the paper did (a free picture is on one of its sheets)
    changed = body.doc != note.doc or sheets != note.sheets
    checked = note_doc.check(body.doc, sheets=sheets) if changed else None
    _count_save(db, user, note)
    if checked is not None:
        check_writing(db, user, _json_bytes(body.doc) - _json_bytes(note.doc))
        note.text = checked.text
        _attach(db, user, note, checked.uploads)
    if sheets < note.sheets:  # the pages taken off take their handwriting
        db.execute(delete(NoteInk).where(NoteInk.note_id == note.id, NoteInk.sheet >= PAPER_SHEETS_FROM + sheets))
    for k, v in fields.items():
        setattr(note, k, v)
    note.version += 1
    db.flush()
    return note


def _has_sheet(note: Note, sheet: int) -> bool:
    """Whether the sheet is one of the note's: a page of its PDF (when it has one), or one of its pages of paper."""
    if sheet < PAPER_SHEETS_FROM:
        return _on_pdf(note)
    return sheet < PAPER_SHEETS_FROM + note.sheets


def page_mapping(change: PageChange, pages: int) -> dict[int, int | None]:
    """Where each page of paper goes (as sheets: PAPER_SHEETS_FROM + its place) for a change to a note with `pages`
    pages; pages not listed stay. None: the page is deleted. 422 for a page or a place the note doesn't have."""
    first, at = PAPER_SHEETS_FROM, change.page
    moves: dict[int, int | None] = {}
    if change.action == "insert":
        if at > pages or pages >= MAX_SHEETS:
            raise invalid("page", "A page can't be added there.")
        moves.update({first + k: first + k + 1 for k in range(at, pages)})
        return moves
    if at >= pages:
        raise invalid("page", "This page isn't in the note any more.")
    if change.action == "delete":
        if pages <= 1:
            raise invalid("page", "A note keeps at least one page.")
        moves[first + at] = None
        moves.update({first + k: first + k - 1 for k in range(at + 1, pages)})
        return moves
    to = change.to if change.to is not None else at
    if to >= pages:
        raise invalid("to", "A page can't go there.")
    step = 1 if to < at else -1  # the pages between make room: down when it goes up, up when it goes down
    between = range(to, at) if to < at else range(at + 1, to + 1)
    moves.update({first + k: first + k + step for k in between})
    moves[first + at] = first + to
    return moves


def _renumber_ink(db: Session, note: Note, pages: dict[int, int | None]) -> None:
    """The note's ink rows follow their pages: a page deleted takes its row, the others are renumbered. The primary
    key is checked row by row, so the rows that move step out of the way first (to negative sheets)."""
    gone = [sheet for sheet, to in pages.items() if to is None]
    if gone:
        db.execute(delete(NoteInk).where(NoteInk.note_id == note.id, NoteInk.sheet.in_(gone)))
    moving = {sheet: to for sheet, to in pages.items() if to is not None and to != sheet}
    if not moving:
        return
    mine = NoteInk.note_id == note.id
    db.execute(update(NoteInk).where(mine, NoteInk.sheet.in_(moving)).values(sheet=-NoteInk.sheet - 1))
    db.execute(
        update(NoteInk)
        .where(mine, NoteInk.sheet < 0)
        .values(sheet=case({-sheet - 1: to for sheet, to in moving.items()}, value=NoteInk.sheet))
    )


def change_pages(db: Session, user: User, note_id: uuid.UUID, body: PageChange) -> Note:
    """Adds, deletes or moves a page of paper at once: its handwriting and its free pictures go with it, and so do
    the pages after it. The note must still be at `body.version` (409 note_changed otherwise), as for a save; a page
    of typed text is the web app's to keep."""
    note = _own(db, user, note_id, lock=True)
    if note.version != body.version:
        raise conflict("note_changed", "This note was changed in another tab or on another device.")
    pages = page_mapping(body, note.sheets)
    _count_save(db, user, note)
    _renumber_ink(db, note, pages)
    doc = note_doc.repaged(note.doc, pages)
    sheets = note.sheets + {"insert": 1, "delete": -1, "move": 0}[body.action]
    if doc != note.doc:
        checked = note_doc.check(doc, sheets=sheets)
        note.doc, note.text = doc, checked.text
        _attach(db, user, note, checked.uploads)
    note.sheets = sheets
    note.version += 1
    db.flush()
    return note


def save_ink(db: Session, user: User, note_id: uuid.UUID, sheet: int, body: InkSave) -> InkSheet:
    """Saves one sheet's ink as sent, if it is still at `body.version` (0 when it had none; 409 ink_changed
    otherwise). An empty sheet is removed."""
    if not 0 <= sheet < MAX_SHEET_INDEX:
        raise not_found("This sheet doesn't exist.")
    note = _own(db, user, note_id, lock=True)
    if not _has_sheet(note, sheet):
        raise not_found("This page isn't in the note any more.")
    row = db.get(NoteInk, (note.id, sheet))
    if (row.version if row is not None else 0) != body.version:
        raise conflict("ink_changed", "This page was written on in another tab or on another device.")
    strokes = [s.model_dump(mode="json", exclude_none=True) for s in body.strokes]
    size = _json_bytes(strokes) if strokes else 0
    if size > SHEET_MAX_BYTES:
        raise invalid("strokes", "This page holds too much handwriting. Go on writing on a new page.")
    if row is not None and row.strokes == strokes:
        return InkSheet(sheet=sheet, strokes=body.strokes, version=row.version)
    _count_save(db, user, note)
    check_writing(db, user, size - (row.size_bytes if row is not None else 0))
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


def get_ink(db: Session, user: User, note_id: uuid.UUID, sheet: int) -> InkSheet:
    """One sheet's ink (an empty sheet at version 0 when it has none)."""
    if not 0 <= sheet < MAX_SHEET_INDEX:
        raise not_found("This sheet doesn't exist.")
    note = _own(db, user, note_id)
    row = db.get(NoteInk, (note.id, sheet))
    if row is None:
        return InkSheet(sheet=sheet, strokes=[], version=0)
    return InkSheet.model_validate({"sheet": sheet, "strokes": row.strokes, "version": row.version})


def delete_note(db: Session, user: User, note_id: uuid.UUID) -> None:
    """Deletes the note; its files that no other note shows are released."""
    note = _own(db, user, note_id)
    shown = set(note.uploads or [])
    db.delete(note)
    db.flush()
    release(db, user, shown)


# ── files ────────────────────────────────────────────────────────────────────────────────────


def file_url(db: Session, user: User, upload_id: uuid.UUID, *, download: bool, storage: Storage | None = None) -> str:
    """A short-lived link to one of the student's note files: shown in the browser (pictures and PDFs) unless
    `download`, which saves it under its name. Anyone else's file, and one not uploaded yet, answers 404."""
    up = db.get(Upload, upload_id)
    if up is None or up.user_id != user.id or up.purpose != UploadPurpose.note_file or up.status not in KEPT_UPLOADS:
        raise not_found("This file doesn't exist.")
    st = storage or get_storage()
    return st.presigned_get(
        up.storage_key, file_name=up.file_name, content_type=serve_type(up.file_name), inline=not download
    )


def check_upload(db: Session, user: User, size_bytes: int) -> None:
    """Before a note file travels: the student's notebooks have room for it."""
    check_files(db, user, size_bytes)
