"""Requests from students, their me-toos, and the answers of the people who handle them. The rules live in
app/services/requests.py."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import Query, Request, Response, status

from app.core.access import Box, Feature
from app.core.pagination import Limit, Offset
from app.core.security import DB, ActiveUser, OptionalUser, client_ip, needs_feature, requires
from app.models import User
from app.routers._base import router_for
from app.schemas.requests import (
    RequestAnswer,
    RequestCreate,
    RequestKind,
    RequestOut,
    RequestPage,
    RequestSort,
    RequestStatus,
    SimilarRequest,
)
from app.services import requests as svc

router = router_for("requests", needs_feature(Feature.requests))
Handler = Annotated[User, requires(Box.requests_manage)]


@router.get("/requests", response_model=RequestPage)
def list_requests(
    db: DB,
    viewer: OptionalUser,
    kind: RequestKind | None = None,
    status_: RequestStatus | None = Query(default=None, alias="status"),
    sort: RequestSort = "me_too",
    q: Annotated[str | None, Query(max_length=200)] = None,
    mine: bool = False,
    limit: Limit = 20,
    offset: Offset = 0,
) -> RequestPage:
    """Requests, the most wanted first (`sort=me_too`) or the newest first. A signed-in student's own requests come
    first either way; `mine=true` lists only theirs. `q` searches titles and details."""
    return svc.list_requests(
        db, viewer, kind=kind, status=status_, sort=sort, q=q, mine=mine, limit=limit, offset=offset
    )


@router.get("/requests/similar", response_model=list[SimilarRequest])
def similar_requests(db: DB, q: Annotated[str, Query(max_length=200)]) -> list[SimilarRequest]:
    """Up to five requests that share a word with `q`: the hint shown while a student types a title, so they can
    say "me too" instead of asking again."""
    return svc.similar(db, q)


@router.get("/requests/{request_id}", response_model=RequestOut)
def get_request(request_id: UUID, db: DB, viewer: OptionalUser) -> RequestOut:
    """One request. Errors: not_found (404) when there is none or it was removed."""
    return svc.request_out(db, svc.get_request(db, request_id), viewer)


@router.post("/requests", response_model=RequestOut, status_code=status.HTTP_201_CREATED)
def create_request(body: RequestCreate, user: ActiveUser, db: DB) -> RequestOut:
    """Ask for something. Errors: invalid_input (422: a short title, an unknown module), rate_limited (429: five a
    day)."""
    req = svc.create_request(db, user, body)
    db.commit()
    return svc.request_out(db, req, user)


@router.put("/requests/{request_id}/me-too", response_model=RequestOut)
def add_me_too(request_id: UUID, user: ActiveUser, db: DB) -> RequestOut:
    """Say "me too". Saying it twice changes nothing. Errors: not_found (404), own_request (409), request_closed
    (409: done or declined)."""
    req = svc.get_request(db, request_id)
    svc.set_me_too(db, user, req, True)
    db.commit()
    return svc.request_out(db, req, user)


@router.delete("/requests/{request_id}/me-too", response_model=RequestOut)
def take_back_me_too(request_id: UUID, user: ActiveUser, db: DB) -> RequestOut:
    """Take back a "me too". Errors: not_found (404), own_request (409)."""
    req = svc.get_request(db, request_id)
    svc.set_me_too(db, user, req, False)
    db.commit()
    return svc.request_out(db, req, user)


@router.post("/requests/{request_id}/answer", response_model=RequestOut)
def answer_request(request_id: UUID, body: RequestAnswer, request: Request, user: Handler, db: DB) -> RequestOut:
    """Set the status (open, planned, done, declined) and the public reply. Declining needs a reply. A new status
    notifies the requester and everyone who said "me too". Audited (`request.status`).

    Errors: not_found (404), invalid_input (422: declined without a reason)."""
    req = svc.get_request(db, request_id, lock=True)
    svc.answer(db, user, req, body, client_ip(request))
    db.commit()
    return svc.request_out(db, req, user)


@router.delete("/requests/{request_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_request(request_id: UUID, request: Request, user: Handler, db: DB) -> Response:
    """Remove a request for everyone. Audited (`request.remove`). Errors: not_found (404)."""
    svc.remove(db, user, svc.get_request(db, request_id, lock=True), client_ip(request))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
