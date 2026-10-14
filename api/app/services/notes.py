"""A student's private notes (R-5). Only their writer ever reads a note: someone else's note answers 404.

- Saving sends the whole note and the version it was loaded at. A note saved since (another tab, another device)
  answers 409 note_changed, and the writer chooses: load the newer one, or save theirs over it.
- Limits: MAX_NOTES per student, CREATES_PER_HOUR new notes, SAVES_PER_MINUTE saves of one note (the web app saves
  as the student types, about once a second at most)."""

from __future__ import annotations

import uuid
from datetime import timedelta

from sqlalchemy import ColumnElement, func, or_, select
from sqlalchemy.orm import Session

from app.core.errors import conflict, invalid, not_found, rate_limited
from app.core.time import utcnow
from app.models import Lesson, Module, User
from app.models import Note as NoteRow
from app.schemas.notes import EXCERPT_LENGTH, Note, NoteCreate, NoteFields, NotePage, NoteSummary, NoteUpdate
from app.services import ratelimit
from app.services.modules import student_lesson

MAX_NOTES = 1000
CREATES_PER_HOUR = 60
SAVES_PER_MINUTE = 120
SAVE_WINDOW = timedelta(minutes=1)
SEARCH_MAX = 100


def _like(text: str) -> str:
    """`text` anywhere, with LIKE's wildcards taken literally."""
    escaped = text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _check_place(db: Session, fields: NoteFields, *, current: str | None = None) -> None:
    """The module and lesson a note is about exist (422 otherwise). A lesson needs its module. A note may keep a lesson
    that was hidden since (`current`)."""
    if fields.module_id is None:
        if fields.lesson_id is not None:
            raise invalid("moduleId", "Choose the lesson's module too.")
        return
    if db.get(Module, fields.module_id) is None:
        raise invalid("moduleId", "This module doesn't exist.")
    if fields.lesson_id is None:
        return
    lesson = db.get(Lesson, fields.lesson_id) if fields.lesson_id == current else student_lesson(db, fields.lesson_id)
    if lesson is None or lesson.module_id != fields.module_id:
        raise invalid("lessonId", "This lesson doesn't exist.")


def to_out(note: NoteRow) -> Note:
    return Note.model_validate(
        {
            "id": note.id,
            "title": note.title,
            "body": note.body,
            "excerpt": note.body[:EXCERPT_LENGTH],
            "module_id": note.module_id,
            "lesson_id": note.lesson_id,
            "version": note.version,
            "created_at": note.created_at,
            "updated_at": note.updated_at,
        }
    )


def list_notes(
    db: Session,
    user: User,
    *,
    q: str | None = None,
    module_id: str | None = None,
    lesson_id: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> NotePage:
    """The student's notes, last edited first. `q` matches the title or the body (any part, any case); `module_id`
    keeps a module's notes, and `lesson_id` one lesson's."""
    where: list[ColumnElement[bool]] = [NoteRow.user_id == user.id]
    text = (q or "").strip()[:SEARCH_MAX]
    if text:
        pattern = _like(text)
        where.append(or_(NoteRow.title.ilike(pattern, escape="\\"), NoteRow.body.ilike(pattern, escape="\\")))
    if module_id is not None:
        where.append(NoteRow.module_id == module_id)
    if lesson_id is not None:
        where.append(NoteRow.lesson_id == lesson_id)
    total = db.scalar(select(func.count()).select_from(NoteRow).where(*where)) or 0
    rows = db.execute(
        select(
            NoteRow.id,
            NoteRow.title,
            func.left(NoteRow.body, EXCERPT_LENGTH).label("excerpt"),
            NoteRow.module_id,
            NoteRow.lesson_id,
            NoteRow.version,
            NoteRow.created_at,
            NoteRow.updated_at,
        )
        .where(*where)
        .order_by(NoteRow.updated_at.desc(), NoteRow.id)
        .limit(limit)
        .offset(offset)
    ).mappings()
    items = [NoteSummary.model_validate(dict(r)) for r in rows]
    return NotePage(items=items, total=total, limit=limit, offset=offset)


def _own(db: Session, user: User, note_id: uuid.UUID, *, lock: bool = False) -> NoteRow:
    query = select(NoteRow).where(NoteRow.id == note_id, NoteRow.user_id == user.id)
    note = db.scalar(query.with_for_update() if lock else query)
    if note is None:
        raise not_found("This note doesn't exist.")
    return note


def get_note(db: Session, user: User, note_id: uuid.UUID) -> NoteRow:
    return _own(db, user, note_id)


def create_note(db: Session, user: User, body: NoteCreate) -> NoteRow:
    _check_place(db, body)
    ratelimit.enforce(
        db,
        f"notes:{user.id}",
        NoteRow.created_at,
        [NoteRow.user_id == user.id],
        limit=CREATES_PER_HOUR,
        window=timedelta(hours=1),
        message="You've started a lot of notes. Try again in {}.",
    )
    count = db.scalar(select(func.count()).select_from(NoteRow).where(NoteRow.user_id == user.id)) or 0
    if count >= MAX_NOTES:
        raise conflict("too_many_notes", f"You have {MAX_NOTES} notes, the most you can keep. Delete some to add more.")
    now = utcnow()
    note = NoteRow(
        user_id=user.id,
        title=body.title,
        body=body.body,
        module_id=body.module_id,
        lesson_id=body.lesson_id,
        saves_since=now,
        created_at=now,
        updated_at=now,
    )
    db.add(note)
    db.flush()
    return note


def update_note(db: Session, user: User, note_id: uuid.UUID, body: NoteUpdate) -> NoteRow:
    """Saves the note as sent, if it is still at `body.version` (409 note_changed otherwise). The row is locked, so of
    two saves of the same version, the second gets 409. Sending what is already saved changes nothing."""
    note = _own(db, user, note_id, lock=True)
    if note.version != body.version:
        raise conflict("note_changed", "This note was changed in another tab or on another device.")
    _check_place(db, body, current=note.lesson_id)
    fields = {
        "title": body.title,
        "body": body.body,
        "module_id": body.module_id,
        "lesson_id": body.lesson_id,
    }
    if all(getattr(note, k) == v for k, v in fields.items()):
        return note
    now = utcnow()
    if now - note.saves_since >= SAVE_WINDOW:
        note.saves_since, note.saves = now, 0
    if note.saves >= SAVES_PER_MINUTE:
        wait = max(1, int((note.saves_since + SAVE_WINDOW - now).total_seconds()) + 1)
        raise rate_limited(wait, "You're saving very fast. Your note is kept on this device: it saves in a moment.")
    for k, v in fields.items():
        setattr(note, k, v)
    note.saves += 1
    note.version += 1
    note.updated_at = now
    db.flush()
    return note


def delete_note(db: Session, user: User, note_id: uuid.UUID) -> None:
    db.delete(_own(db, user, note_id))
    db.flush()
