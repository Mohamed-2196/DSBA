"""A student's private notes (R-5). Reading needs an account; writing an active one (a suspended account reads its
notes). Nobody else, admins included, reads someone's notes: another person's note answers 404."""

from __future__ import annotations

from uuid import UUID

from fastapi import Query, Response, status

from app.core.access import Feature
from app.core.pagination import Limit, Offset
from app.core.security import DB, ActiveUser, CurrentUser, needs_feature
from app.routers._base import router_for
from app.schemas.notes import Note, NoteCreate, NotePage, NoteUpdate
from app.services import notes

router = router_for("notes", needs_feature(Feature.notes))


@router.get("/notes", response_model=NotePage)
def list_notes(
    user: CurrentUser,
    db: DB,
    q: str | None = Query(default=None, max_length=200),
    module_id: str | None = Query(default=None, max_length=64),
    lesson_id: str | None = Query(default=None, pattern=r"^[a-z0-9]{1,16}$"),
    limit: Limit = 20,
    offset: Offset = 0,
) -> NotePage:
    """Your notes, last edited first, each with the start of its body. `q` searches titles and bodies; `module_id`
    keeps one module's notes, and `lesson_id` one lesson's."""
    return notes.list_notes(db, user, q=q, module_id=module_id, lesson_id=lesson_id, limit=limit, offset=offset)


@router.post("/notes", response_model=Note, status_code=status.HTTP_201_CREATED)
def create_note(body: NoteCreate, user: ActiveUser, db: DB) -> Note:
    """A new note. Errors: invalid_input (422: an unknown module or lesson, or too long), too_many_notes (409),
    rate_limited (429)."""
    note = notes.create_note(db, user, body)
    db.commit()
    return notes.to_out(note)


@router.get("/notes/{note_id}", response_model=Note)
def get_note(note_id: UUID, user: CurrentUser, db: DB) -> Note:
    return notes.to_out(notes.get_note(db, user, note_id))


@router.put("/notes/{note_id}", response_model=Note)
def save_note(note_id: UUID, body: NoteUpdate, user: ActiveUser, db: DB) -> Note:
    """Save the whole note. Send the `version` you loaded: if it was saved since (another tab), 409 note_changed;
    load it again, or send its new version to save yours over it. Errors: rate_limited (429: saving very fast)."""
    note = notes.update_note(db, user, note_id, body)
    db.commit()
    return notes.to_out(note)


@router.delete("/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note(note_id: UUID, user: ActiveUser, db: DB) -> Response:
    notes.delete_note(db, user, note_id)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
