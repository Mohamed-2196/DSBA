"""A student's private notebook (R-5): notebooks, notes, their ink and files. Reading needs an account; writing an
active one (a suspended account reads its notes). Nobody else, admins included, reads someone's notebook: another
person's notebook, note or file answers 404."""

from __future__ import annotations

from uuid import UUID

from fastapi import Path, Query, Response, status
from fastapi.responses import RedirectResponse

from app.core.access import Feature
from app.core.pagination import Limit, Offset
from app.core.security import DB, ActiveUser, CurrentUser, needs_feature
from app.routers._base import router_for
from app.schemas.notes import (
    AnnotateRequest,
    InkSave,
    InkSheet,
    Note,
    Notebook,
    NotebookCreate,
    NotebookList,
    NotebookUpdate,
    NoteCreate,
    NotePage,
    NoteUpdate,
)
from app.services import notes

router = router_for("notes", needs_feature(Feature.notes))

# The presigned link lives download_url_ttl_seconds (300 s by default): the browser may reuse the redirect for less.
FILE_CACHE = "private, max-age=240"


# ── notebooks ──


@router.get("/notebooks", response_model=NotebookList)
def list_notebooks(user: CurrentUser, db: DB) -> NotebookList:
    """Your notebooks, the one changed last first, and how much of your notebook storage you use."""
    return notes.list_notebooks(db, user)


@router.post("/notebooks", response_model=Notebook, status_code=status.HTTP_201_CREATED)
def create_notebook(body: NotebookCreate, user: ActiveUser, db: DB) -> Notebook:
    """A notebook of your own (`title`), or a module's (`moduleId`: the one you have, or a new one). Errors:
    invalid_input (422), too_many_notebooks (409)."""
    nb = notes.create_notebook(db, user, body)
    db.commit()
    return notes.notebook_out(db, nb)


@router.patch("/notebooks/{notebook_id}", response_model=Notebook)
def rename_notebook(notebook_id: UUID, body: NotebookUpdate, user: ActiveUser, db: DB) -> Notebook:
    nb = notes.rename_notebook(db, user, notebook_id, body.title)
    db.commit()
    return notes.notebook_out(db, nb)


@router.delete("/notebooks/{notebook_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_notebook(notebook_id: UUID, user: ActiveUser, db: DB) -> Response:
    """Deletes the notebook and every note in it."""
    notes.delete_notebook(db, user, notebook_id)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── notes ──


@router.get("/notes", response_model=NotePage)
def list_notes(
    user: CurrentUser,
    db: DB,
    q: str | None = Query(default=None, max_length=200),
    notebook_id: UUID | None = None,
    module_id: str | None = Query(default=None, max_length=64),
    lesson_id: str | None = Query(default=None, pattern=r"^[a-z0-9]{1,16}$"),
    limit: Limit = 20,
    offset: Offset = 0,
) -> NotePage:
    """Your notes, last edited first, each with the start of its text. `q` searches titles and text; `notebook_id`
    keeps one notebook's notes, `module_id` the module's notebook's, and `lesson_id` one lesson's."""
    return notes.list_notes(
        db, user, q=q, notebook_id=notebook_id, module_id=module_id, lesson_id=lesson_id, limit=limit, offset=offset
    )


@router.post("/notes", response_model=Note, status_code=status.HTTP_201_CREATED)
def create_note(body: NoteCreate, user: ActiveUser, db: DB) -> Note:
    """A new note. Errors: invalid_input (422: an unknown notebook, module or lesson, a PDF that isn't yours, or text
    the editor doesn't write), too_many_notes (409), too_many_notebooks (409), notes_full (409), rate_limited (429)."""
    note = notes.create_note(db, user, body)
    db.commit()
    return notes.to_out(db, note)


@router.post("/notes/annotate", response_model=Note)
def annotate(body: AnnotateRequest, user: ActiveUser, db: DB, response: Response) -> Note:
    """Your note written over a library PDF: the one you have (200), or a new one in the module's notebook (201).
    Errors: invalid_input (422: not a published PDF), not_found (404), too_many_notes (409), rate_limited (429)."""
    note, made = notes.annotate(db, user, body.library_item_id)
    db.commit()
    if made:
        response.status_code = status.HTTP_201_CREATED
    return notes.to_out(db, note)


@router.get("/notes/{note_id}", response_model=Note)
def get_note(note_id: UUID, user: CurrentUser, db: DB) -> Note:
    """The note with its typed text, its ink and the PDF it is written over."""
    return notes.to_out(db, notes.get_note(db, user, note_id))


@router.put("/notes/{note_id}", response_model=Note)
def save_note(note_id: UUID, body: NoteUpdate, user: ActiveUser, db: DB) -> Note:
    """Save the note's text, paper, sheets, lesson and notebook. Send the `version` you loaded: if it was saved since
    (another tab), 409 note_changed; load it again, or send its new version to save yours over it. Errors:
    notes_full (409), rate_limited (429: saving very fast)."""
    note = notes.update_note(db, user, note_id, body)
    db.commit()
    return notes.to_out(db, note)


@router.put("/notes/{note_id}/ink/{sheet}", response_model=InkSheet)
def save_ink(
    note_id: UUID, body: InkSave, user: ActiveUser, db: DB, sheet: int = Path(ge=0, lt=notes.MAX_SHEET_INDEX)
) -> InkSheet:
    """Save one sheet's ink: 0-999 are the PDF's pages (0 its first), 1000 and up the paper sheets (1000 the first).
    Send the `version` you loaded (0 for a sheet without ink): if it was saved since, 409 ink_changed. Errors:
    notes_full (409), rate_limited (429)."""
    out = notes.save_ink(db, user, note_id, sheet, body)
    db.commit()
    return out


@router.delete("/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note(note_id: UUID, user: ActiveUser, db: DB) -> Response:
    notes.delete_note(db, user, note_id)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/notes/files/{upload_id}", response_class=RedirectResponse, status_code=status.HTTP_302_FOUND)
def note_file(upload_id: UUID, user: CurrentUser, db: DB, download: bool = False) -> RedirectResponse:
    """One of your note's pictures, files or PDFs: 302 to a short-lived link, shown in the browser (pictures and
    PDFs) or, with `download`, saved under its name."""
    url = notes.file_url(db, user, upload_id, download=download)
    return RedirectResponse(url, status_code=status.HTTP_302_FOUND, headers={"Cache-Control": FILE_CACHE})
