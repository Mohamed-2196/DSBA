"""Notes shared with a module: a student shares a copy of one of their notes with its module's students, who read
it; the writer updates it or stops sharing it; moderators (library.manage) hide it. The rules live in
app/services/shared_notes.py."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import Query, Request, Response, status
from fastapi.responses import RedirectResponse

from app.core.access import Box, Feature
from app.core.pagination import Limit, Offset
from app.core.security import DB, ActiveUser, OptionalUser, client_ip, needs_feature, requires
from app.models import User
from app.routers._base import router_for
from app.schemas.notes import HideRequest, SharedNote, SharedNotePage, ShareRequest
from app.services import shared_notes as svc

router = router_for("shared-notes", needs_feature(Feature.notes_share))
Moderator = Annotated[User, requires(Box.library_manage)]

# The presigned link lives download_url_ttl_seconds (300 s by default): the browser may reuse the redirect for less.
FILE_CACHE = "private, max-age=240"


@router.put(
    "/notes/{note_id}/share",
    response_model=SharedNote,
    dependencies=[needs_feature(Feature.notes)],
)
def share_note(note_id: UUID, body: ShareRequest, user: ActiveUser, db: DB) -> SharedNote:
    """Share a copy of your note with its module's students, or copy it again over the one shared. The note stays
    private: they see the copy, as it is now, with your name and year unless `credited` is false.

    Errors: not_found (404: not your note), invalid_input (422: no module, a hidden module, written over a PDF,
    nothing in it, too big), rate_limited (429: twenty an hour)."""
    copy = svc.share(db, user, note_id, body)
    db.commit()
    return svc.to_out(db, copy, user)


@router.delete("/shared-notes/{share_id}", status_code=status.HTTP_204_NO_CONTENT)
def unshare_note(share_id: UUID, user: ActiveUser, db: DB) -> Response:
    """Stop sharing your note: the copy goes from the module. Your note stays. Errors: not_found (404: not yours)."""
    svc.unshare(db, user, share_id)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/shared-notes", response_model=SharedNotePage)
def module_shared_notes(
    db: DB,
    user: OptionalUser,
    module_id: Annotated[str, Query(alias="moduleId", max_length=64)],
    limit: Limit = 20,
    offset: Offset = 0,
) -> SharedNotePage:
    """The notes students shared with a module, the newest first. Errors: not_found (404: no such module)."""
    return svc.module_list(db, user, module_id, limit, offset)


@router.get("/shared-notes/{share_id}", response_model=SharedNote)
def get_shared_note(share_id: UUID, db: DB, user: OptionalUser) -> SharedNote:
    """A shared note to read. Hidden ones (and those of a hidden module) are 404, except to their writer and
    moderators."""
    return svc.to_out(db, svc.get_visible(db, user, share_id), user)


@router.get(
    "/shared-notes/{share_id}/files/{upload_id}",
    response_class=RedirectResponse,
    status_code=status.HTTP_302_FOUND,
)
def shared_note_file(
    share_id: UUID, upload_id: UUID, db: DB, user: OptionalUser, download: bool = False
) -> RedirectResponse:
    """A picture or file the shared note shows: 302 to a short-lived link, shown in the browser (pictures and PDFs)
    or, with `download`, saved under its name. 404 to anyone who can't read the note."""
    url = svc.file_url(db, user, share_id, upload_id, download=download)
    return RedirectResponse(url, status_code=status.HTTP_302_FOUND, headers={"Cache-Control": FILE_CACHE})


@router.post("/shared-notes/{share_id}/hide", response_model=SharedNote)
def hide_shared_note(share_id: UUID, body: HideRequest, request: Request, user: Moderator, db: DB) -> SharedNote:
    """Hide it from the module (library.manage). Its writer is told, with `reason`. Audited (`shared_note.hide`)."""
    copy = svc.set_hidden(db, user, share_id, True, body, client_ip(request))
    db.commit()
    return svc.to_out(db, copy, user)


@router.post("/shared-notes/{share_id}/show", response_model=SharedNote)
def show_shared_note(share_id: UUID, request: Request, user: Moderator, db: DB) -> SharedNote:
    """Show a hidden one again (library.manage). Its writer is told. Audited (`shared_note.show`)."""
    copy = svc.set_hidden(db, user, share_id, False, None, client_ip(request))
    db.commit()
    return svc.to_out(db, copy, user)
