"""Requests from students: a student asks the reps for something (a past paper, a fix, a date, a feature), others
add "me too", and people with requests.manage answer with a status and a public reply.

- Everyone reads the open list; the me-too count orders it, and a signed-in student's own requests come first.
- A status change tells the requester and everyone who said "me too", while the feature is on for them, and goes to
  the audit log. So does removing a request, which makes it gone for everyone."""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import timedelta
from typing import Any

from sqlalchemy import ColumnElement, delete, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.access import Feature
from app.core.errors import conflict, invalid, not_found
from app.core.time import utcnow
from app.models import Module, RequestMeToo, RequestStatus, StudentRequest, User
from app.schemas.requests import (
    RequestAnswer,
    RequestCreate,
    RequestKind,
    RequestOut,
    RequestPage,
    RequestSort,
    SimilarRequest,
)
from app.schemas.requests import RequestStatus as StatusKey
from app.services import access
from app.services.accounts import public_user
from app.services.audit import record
from app.services.forum.text import clean_body, clean_title, has_text
from app.services.modules import require_module
from app.services.notify import notify
from app.services.ratelimit import enforce
from app.services.search import text_query, words

REQUESTS_PER_DAY = 5
SIMILAR_LIMIT = 5
SIMILAR_WORDS = 8
# Words too common to say two requests are alike.
COMMON_WORDS = frozenset(
    {"the", "and", "for", "with", "from", "please", "can", "could", "you", "add", "any", "some", "need", "want"}
)
OPEN_FOR_ME_TOO = (RequestStatus.open, RequestStatus.planned)
STATUS_WORDS: dict[RequestStatus, str] = {
    RequestStatus.open: "open again",
    RequestStatus.planned: "planned",
    RequestStatus.done: "done",
    RequestStatus.declined: "declined",
}

# ── reading ─────────────────────────────────────────────────────────────────────────────────


def get_request(db: Session, request_id: uuid.UUID, *, lock: bool = False) -> StudentRequest:
    """The request, or 404 when there is none or it was removed."""
    req = db.get(StudentRequest, request_id, with_for_update=lock or None)
    if req is None or req.removed_at is not None:
        raise not_found("This request doesn't exist or was removed.")
    return req


def _outs(db: Session, reqs: Sequence[StudentRequest], viewer: User | None) -> list[RequestOut]:
    ids = [r.id for r in reqs]
    people_ids = {i for r in reqs for i in (r.author_id, r.answered_by) if i is not None}
    people = {u.id: u for u in db.scalars(select(User).where(User.id.in_(people_ids)))} if people_ids else {}
    access.prefetch(db, people.values())
    module_ids = {r.module_id for r in reqs if r.module_id}
    modules = (
        dict(db.execute(select(Module.id, Module.name).where(Module.id.in_(module_ids))).tuples().all())
        if module_ids
        else {}
    )
    mine: set[uuid.UUID] = set()
    if viewer is not None and ids:
        mine = set(
            db.scalars(
                select(RequestMeToo.request_id).where(
                    RequestMeToo.user_id == viewer.id, RequestMeToo.request_id.in_(ids)
                )
            )
        )
    return [
        RequestOut(
            id=r.id,
            kind=r.kind,
            title=r.title,
            details=r.details,
            module_id=r.module_id,
            module_title=modules.get(r.module_id) if r.module_id else None,
            status=r.status.value,
            author=public_user(people.get(r.author_id)) if r.author_id else None,
            mine=viewer is not None and r.author_id == viewer.id,
            me_too=r.id in mine,
            me_too_count=r.me_too_count,
            reply=r.reply,
            answered_by=public_user(people.get(r.answered_by)) if r.answered_by else None,
            answered_at=r.answered_at,
            created_at=r.created_at,
        )
        for r in reqs
    ]


def request_out(db: Session, req: StudentRequest, viewer: User | None) -> RequestOut:
    return _outs(db, [req], viewer)[0]


def list_requests(
    db: Session,
    viewer: User | None,
    *,
    kind: RequestKind | None,
    status: StatusKey | None,
    sort: RequestSort,
    q: str | None,
    mine: bool,
    limit: int,
    offset: int,
) -> RequestPage:
    """Requests that weren't removed, the most wanted first (or the newest). A signed-in student's own come first."""
    where: list[ColumnElement[bool]] = [StudentRequest.removed_at.is_(None)]
    if kind is not None:
        where.append(StudentRequest.kind == kind)
    if status is not None:
        where.append(StudentRequest.status == RequestStatus(status))
    if mine:
        if viewer is None:
            return RequestPage(items=[], total=0, limit=limit, offset=offset)
        where.append(StudentRequest.author_id == viewer.id)
    tsq = text_query(q) if q else None
    if tsq is not None:
        where.append(StudentRequest.search_vector.op("@@")(tsq))
    total = db.scalar(select(func.count()).select_from(StudentRequest).where(*where)) or 0
    order: list[Any] = []
    if viewer is not None:
        order.append((StudentRequest.author_id == viewer.id).desc())
    if sort == "me_too":
        order.append(StudentRequest.me_too_count.desc())
    order += [StudentRequest.created_at.desc(), StudentRequest.id]
    reqs = db.scalars(select(StudentRequest).where(*where).order_by(*order).limit(limit).offset(offset)).all()
    return RequestPage(items=_outs(db, reqs, viewer), total=total, limit=limit, offset=offset)


def similar(db: Session, q: str) -> list[SimilarRequest]:
    """Requests whose title or details share a word with `q` (the "Similar requests" hint while a title is typed):
    any word of three letters or more, matched as a prefix, best match first."""
    terms = [w for w in dict.fromkeys(words(q)) if len(w) >= 3 and w not in COMMON_WORDS][:SIMILAR_WORDS]
    if not terms:
        return []
    # Each term holds only letters and digits (search.words): no tsquery syntax gets through.
    tsq = func.to_tsquery("simple", " | ".join(f"{t}:*" for t in terms))
    rows = db.scalars(
        select(StudentRequest)
        .where(StudentRequest.removed_at.is_(None), StudentRequest.search_vector.op("@@")(tsq))
        .order_by(func.ts_rank(StudentRequest.search_vector, tsq).desc(), StudentRequest.me_too_count.desc())
        .limit(SIMILAR_LIMIT)
    ).all()
    return [
        SimilarRequest(
            id=r.id,
            title=r.title,
            kind=r.kind,
            status=r.status.value,
            me_too_count=r.me_too_count,
        )
        for r in rows
    ]


def open_count(db: Session) -> int:
    """Requests waiting for an answer (Manage's count)."""
    return (
        db.scalar(
            select(func.count())
            .select_from(StudentRequest)
            .where(StudentRequest.removed_at.is_(None), StudentRequest.status == RequestStatus.open)
        )
        or 0
    )


# ── students ────────────────────────────────────────────────────────────────────────────────


def _title(value: str) -> str:
    title = clean_title(value)
    if len(title) < 5:
        raise invalid("title", "Make the title a little longer (at least 5 characters).")
    if not any(ch.isalnum() for ch in title):
        raise invalid("title", "Write the title in words.")
    return title


def create_request(db: Session, user: User, data: RequestCreate) -> StudentRequest:
    title = _title(data.title)
    details = clean_body(data.details)
    require_module(db, data.module_id)
    enforce(
        db,
        f"requests:{user.id}",
        StudentRequest.created_at,
        [StudentRequest.author_id == user.id],
        limit=REQUESTS_PER_DAY,
        window=timedelta(days=1),
        message=f"You've sent {REQUESTS_PER_DAY} requests today. Try again in {{}}.",
    )
    req = StudentRequest(
        author_id=user.id,
        kind=data.kind,
        title=title,
        details=details if has_text(details) else "",
        module_id=data.module_id,
        status=RequestStatus.open,
        created_at=utcnow(),
    )
    db.add(req)
    db.flush()
    return req


def set_me_too(db: Session, user: User, req: StudentRequest, on: bool) -> None:
    """Adds or takes back the person's "me too". Saying it twice, or taking back one never given, changes nothing.
    The count changes in the same statement as the row, so it stays exact under parallel clicks."""
    if req.author_id == user.id:
        raise conflict("own_request", "You asked for this, so you're already counted.")
    if on:
        if req.status not in OPEN_FOR_ME_TOO:
            raise conflict("request_closed", "This request is closed, so it doesn't take me-toos.")
        added = db.execute(
            pg_insert(RequestMeToo)
            .values(request_id=req.id, user_id=user.id)
            .on_conflict_do_nothing()
            .returning(RequestMeToo.user_id)
        ).first()
        change = 1 if added else 0
    else:
        taken = db.execute(
            delete(RequestMeToo)
            .where(RequestMeToo.request_id == req.id, RequestMeToo.user_id == user.id)
            .returning(RequestMeToo.user_id)
        ).first()
        change = -1 if taken else 0
    if change:
        db.execute(
            update(StudentRequest)
            .where(StudentRequest.id == req.id)
            .values(me_too_count=func.greatest(StudentRequest.me_too_count + change, 0))
            .execution_options(synchronize_session=False)
        )
        db.refresh(req, ["me_too_count"])


# ── people who handle requests ──────────────────────────────────────────────────────────────


def _tell(db: Session, req: StudentRequest, actor: User) -> int:
    """Notifies the requester and everyone who said "me too" about the request's new status, each while the feature
    is on for them. -> how many were told."""
    audience = access.audience(db, Feature.requests)
    if audience is None:
        return 0
    wanted = or_(
        User.id == req.author_id,
        User.id.in_(select(RequestMeToo.user_id).where(RequestMeToo.request_id == req.id)),
    )
    told = 0
    for user_id in db.scalars(select(User.id).where(wanted, audience)):
        sent = notify(
            db,
            user_id,
            "request_update",
            f"Request {STATUS_WORDS[req.status]}: {req.title}",
            body=req.reply,
            url=f"/requests/{req.id}",
            actor=actor,
            data={"requestId": str(req.id), "status": req.status.value},
        )
        told += sent is not None
    return told


def answer(db: Session, user: User, req: StudentRequest, data: RequestAnswer, ip: str | None) -> None:
    """Sets the status and the public reply. Declining needs a reason. A new status notifies the people who want it.
    Audited."""
    reply = clean_body(data.reply or "")
    reply = reply if has_text(reply) else ""
    status = RequestStatus(data.status)
    if status == RequestStatus.declined and not reply:
        raise invalid("reply", "Say why it's declined: the students who asked will see it.")
    before = req.status
    req.status = status
    req.reply = reply or None
    req.answered_by = user.id
    req.answered_at = utcnow()
    db.flush()
    told = _tell(db, req, user) if status != before else 0
    record(
        db,
        user,
        "request.status",
        "request",
        req.id,
        {"from": before.value, "to": status.value, "title": req.title, "kind": req.kind, "told": told},
        ip,
    )


def remove(db: Session, user: User, req: StudentRequest, ip: str | None) -> None:
    """Removes the request for everyone. Audited with its title."""
    req.removed_at = utcnow()
    req.removed_by = user.id
    record(db, user, "request.remove", "request", req.id, {"title": req.title, "kind": req.kind}, ip)
