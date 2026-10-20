"""Notes shared with a module (IDEA-29): a student shares a copy of one of their notes with its module's students.

- The copy is a snapshot: the note's title, typed text, paper, pages, handwriting and the pictures and files it shows,
  as they are when it is shared. The note stays private and goes on changing; sharing again ("Update the shared
  copy") copies it again. Nothing else of the student's notebook is ever shown.
- A note is shared with the module it is about (one students see), once: one copy per note. A note written over a
  PDF can't be shared (the PDF isn't the student's to share), nor one with nothing in it, nor one bigger than
  SHARE_MAX_BYTES of text and handwriting.
- Everyone who may read the module reads its shared notes, with the writer's name and year unless they shared it
  without them (then only admins see who wrote it, in a report). Its pictures and files are served to whoever may
  read the copy: they stay in use while the copy lists them (services/notes.py release), whatever the note does since.
- The writer stops sharing it whenever they like: the copy is emptied and shown to nobody, but kept, so sharing the
  note again finds it as a moderator left it (a hidden copy stays hidden). Deleting the note, its notebook or the
  account deletes the copy.
- SHARES_PER_HOUR shares, updates and unshares an hour per student, counted as events (`NoteShareEvent`): unsharing
  never gives one back.
- Moderation as for other students' content: anyone may report it (reports.py), and people with library.manage hide
  it (the writer is told) or show it again, both audited. A hidden copy, or one of a hidden module, is 404 to everyone
  but its writer (hidden copies only) and moderators.
Services leave the commit to the handler."""

from __future__ import annotations

import json
import uuid
from datetime import timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.access import Box
from app.core.errors import invalid, not_found
from app.core.time import utcnow
from app.models import Module, Note, NoteInk, NoteShareEvent, SharedNote, Upload, UploadPurpose, User
from app.schemas.notes import (
    EXCERPT_LENGTH,
    PAPER_SHEETS_FROM,
    HideRequest,
    InkPage,
    SharedNotePage,
    SharedNoteSummary,
    ShareRequest,
)
from app.schemas.notes import SharedNote as SharedNoteOut
from app.services import access, notes
from app.services.accounts import public_user
from app.services.audit import record
from app.services.notify import notify
from app.services.ratelimit import enforce
from app.services.storage import Storage, get_storage
from app.services.uploads import serve_type

SHARES_PER_HOUR = 20
SHARE_MAX_BYTES = 3 * 1024 * 1024  # the copy's typed text and handwriting: a long lecture's worth, with its ink
GONE = "This shared note doesn't exist, or it was taken down."


def _bytes(value: object) -> int:
    return len(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode())


def _excerpt(text: str) -> str:
    return " ".join(text.split())[:EXCERPT_LENGTH]


def can_moderate(user: User | None) -> bool:
    return access.can(user, Box.library_manage)


def path(share: SharedNote) -> str:
    return f"/notes/shared/{share.id}"


# ── reading ─────────────────────────────────────────────────────────────────────────────────


def get_visible(db: Session, user: User | None, share_id: uuid.UUID) -> SharedNote:
    """The copy, if this person may read it: anyone while it is shown and its module is open to students; its writer
    while it is hidden; moderators always. 404 otherwise."""
    share = db.get(SharedNote, share_id)
    if share is None or share.withdrawn_at is not None:
        raise not_found(GONE)
    if can_moderate(user):
        return share
    module = db.get(Module, share.module_id)
    mine = user is not None and share.user_id == user.id
    if module is None or module.hidden or (share.hidden and not mine):
        raise not_found(GONE)
    return share


def _authors(db: Session, shares: list[SharedNote]) -> dict[uuid.UUID, User]:
    ids = {s.user_id for s in shares if s.credited}
    if not ids:
        return {}
    found = {u.id: u for u in db.scalars(select(User).where(User.id.in_(ids)))}
    access.prefetch(db, found.values())
    return found


def _summary(share: SharedNote, viewer: User | None, authors: dict[uuid.UUID, User]) -> dict[str, Any]:
    return {
        "id": share.id,
        "module_id": share.module_id,
        "title": share.title,
        "excerpt": _excerpt(share.text),
        "author": public_user(authors.get(share.user_id)) if share.credited else None,
        "credited": share.credited,
        "mine": viewer is not None and share.user_id == viewer.id,
        "hidden": share.hidden,
        "shared_at": share.shared_at,
        "updated_at": share.updated_at,
    }


def to_out(db: Session, share: SharedNote, viewer: User | None) -> SharedNoteOut:
    module = db.get(Module, share.module_id)
    return SharedNoteOut.model_validate(
        {
            **_summary(share, viewer, _authors(db, [share])),
            "module_title": module.name if module else "",
            "note_id": share.note_id if viewer is not None and share.user_id == viewer.id else None,
            "doc": share.doc,
            "paper": share.paper,
            "sheets": share.sheets,
            "ink": [InkPage.model_validate(page) for page in share.ink],
            "can_moderate": can_moderate(viewer),
        }
    )


def module_list(db: Session, user: User | None, module_id: str, limit: int, offset: int) -> SharedNotePage:
    """The module's shared notes students see, the newest first (by when each was first shared)."""
    module = db.get(Module, module_id)
    if module is None or (module.hidden and not can_moderate(user)):
        raise not_found("This module doesn't exist.")
    where = (SharedNote.module_id == module_id, SharedNote.hidden.is_(False), SharedNote.withdrawn_at.is_(None))
    total = db.scalar(select(func.count()).select_from(SharedNote).where(*where)) or 0
    rows = list(
        db.scalars(
            select(SharedNote)
            .where(*where)
            .order_by(SharedNote.shared_at.desc(), SharedNote.id)
            .limit(limit)
            .offset(offset)
        )
    )
    authors = _authors(db, rows)
    items = [SharedNoteSummary.model_validate(_summary(s, user, authors)) for s in rows]
    return SharedNotePage(items=items, total=total, limit=limit, offset=offset)


def file_url(
    db: Session,
    user: User | None,
    share_id: uuid.UUID,
    upload_id: uuid.UUID,
    *,
    download: bool,
    storage: Storage | None = None,
) -> str:
    """A short-lived link to a picture or file the copy shows, for whoever may read the copy (404 otherwise)."""
    share = get_visible(db, user, share_id)
    up = db.get(Upload, upload_id) if upload_id in (share.uploads or []) else None
    if up is None or up.user_id != share.user_id or up.purpose != UploadPurpose.note_file:
        raise not_found("This file doesn't exist.")
    st = storage or get_storage()
    return st.presigned_get(
        up.storage_key, file_name=up.file_name, content_type=serve_type(up.file_name), inline=not download
    )


# ── the writer ──────────────────────────────────────────────────────────────────────────────


def _ink(db: Session, note: Note) -> list[dict[str, Any]]:
    """The handwriting on the note's pages of paper, sheet by sheet (sheets past its last page are left out)."""
    rows = db.scalars(
        select(NoteInk)
        .where(
            NoteInk.note_id == note.id,
            NoteInk.sheet >= PAPER_SHEETS_FROM,
            NoteInk.sheet < PAPER_SHEETS_FROM + note.sheets,
        )
        .order_by(NoteInk.sheet)
    )
    return [{"sheet": row.sheet, "strokes": row.strokes} for row in rows if row.strokes]


def _count_event(db: Session, user: User) -> None:
    """One more share, update or unshare, or 429 at SHARES_PER_HOUR in the last hour."""
    enforce(
        db,
        f"note-shares:{user.id}",
        NoteShareEvent.at,
        [NoteShareEvent.user_id == user.id],
        limit=SHARES_PER_HOUR,
        window=timedelta(hours=1),
        message=f"You've shared or unshared {SHARES_PER_HOUR} notes in the last hour. Try again in {{}}.",
    )
    db.add(NoteShareEvent(user_id=user.id, at=utcnow()))


def share(db: Session, user: User, note_id: uuid.UUID, body: ShareRequest) -> SharedNote:
    """Shares a copy of the note with its module's students, or copies it again over the copy shared (which keeps
    its place in the list) or the one its writer stopped sharing (back at the top). Either way a copy a moderator hid
    stays hidden."""
    note = notes.get_note(db, user, note_id, lock=True)
    if note.module_id is None:
        raise invalid("noteId", "Pick the note's module first: a note is shared with its module's students.")
    module = db.get(Module, note.module_id)
    if module is None or module.hidden:
        raise invalid("noteId", "This module isn't open to students, so notes can't be shared with it.")
    if note.library_item_id is not None or note.pdf_upload_id is not None:
        raise invalid("noteId", "A note written over a PDF can't be shared. Share a note on paper instead.")
    ink = _ink(db, note)
    if not note.title.strip() and not note.text.strip() and not note.uploads and not ink:
        raise invalid("noteId", "Write something in the note before you share it.")
    if _bytes(note.doc) + _bytes(ink) > SHARE_MAX_BYTES:
        raise invalid(
            "noteId",
            f"This note is too big to share: {SHARE_MAX_BYTES // (1024 * 1024)} MB of text and handwriting at most. "
            "Share a shorter note.",
        )
    _count_event(db, user)
    copy = db.scalar(select(SharedNote).where(SharedNote.note_id == note.id).with_for_update())
    before = set(copy.uploads or []) if copy is not None else set()
    now = utcnow()
    fields: dict[str, Any] = {
        "module_id": module.id,
        "credited": body.credited,
        "title": note.title,
        "doc": note.doc,
        "text": note.text,
        "paper": note.paper,
        "sheets": note.sheets,
        "ink": ink,
        "uploads": list(note.uploads or []),
        "note_version": note.version,
        "updated_at": now,
    }
    if copy is None:
        copy = SharedNote(note_id=note.id, user_id=user.id, shared_at=now, **fields)
        db.add(copy)
    else:
        if copy.withdrawn_at is not None:
            fields |= {"withdrawn_at": None, "shared_at": now}
        for key, value in fields.items():
            setattr(copy, key, value)
    db.flush()
    notes.release(db, user, before - set(copy.uploads))
    return copy


def unshare(db: Session, user: User, share_id: uuid.UUID) -> None:
    """The writer stops sharing it (404 for anyone else's, or one already stopped): the copy is emptied and shown to
    nobody, and the files only it showed are released. The row stays with its moderation (hidden or not)."""
    copy = db.scalar(
        select(SharedNote)
        .where(SharedNote.id == share_id, SharedNote.user_id == user.id, SharedNote.withdrawn_at.is_(None))
        .with_for_update()
    )
    if copy is None:
        raise not_found(GONE)
    _count_event(db, user)
    shown = set(copy.uploads or [])
    copy.withdrawn_at = utcnow()
    copy.doc, copy.text, copy.ink, copy.uploads = {}, "", [], []
    db.flush()
    notes.release(db, user, shown)


# ── moderators ──────────────────────────────────────────────────────────────────────────────


def set_hidden(
    db: Session, user: User, share_id: uuid.UUID, hidden: bool, body: HideRequest | None, ip: str | None
) -> SharedNote:
    """Hides the copy from students (its writer is told why) or shows it again. Audited (`shared_note.hide`,
    `shared_note.show`). Doing what is already done changes nothing."""
    copy = db.get(SharedNote, share_id, with_for_update=True)
    if copy is None:
        raise not_found(GONE)
    if copy.hidden == hidden:
        return copy
    copy.hidden = hidden
    copy.hidden_by = user.id if hidden else None
    copy.hidden_at = utcnow() if hidden else None
    db.flush()
    reason = body.reason if body is not None else ""
    record(
        db,
        user,
        "shared_note.hide" if hidden else "shared_note.show",
        "shared_note",
        copy.id,
        {"title": copy.title, "moduleId": copy.module_id, **({"reason": reason} if reason else {})},
        ip,
    )
    title = copy.title or "your shared note"
    if hidden:
        notify(
            db,
            copy.user_id,
            "system",
            f"A student rep hid “{title}” from the module",
            body=reason or "Only you can see it now. Your note itself is unchanged.",
            url=path(copy),
            actor=user,
        )
    else:
        notify(db, copy.user_id, "system", f"“{title}” is shared with the module again", url=path(copy), actor=user)
    return copy
