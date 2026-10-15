"""Requests from students: a student asks the reps for something (a past paper, a fix, a date, a feature), others
add "me too", and people with requests.manage answer with a status and a public reply.

- Everyone reads the open list; the me-too count orders it, and a signed-in student's own requests come first.
- A status change tells the requester and everyone who said "me too", while the feature is on for them, and goes to
  the audit log. So does removing a request, which makes it gone for everyone.
- Requests that close themselves (while requests.autoclose is on): a paper request that names its module
  and library kind is matched with a published file of that module and kind (and its exam year and zone, when the
  request gives them). The match is conservative and waits: the requester or a rep says yes, which closes the
  request as done and tells everyone who wanted it, or no, which keeps it open. A date request names an unconfirmed
  event, and closes when a rep confirms the date."""

from __future__ import annotations

import datetime as dt
import uuid
from collections.abc import Sequence
from datetime import timedelta
from typing import Any

from sqlalchemy import ColumnElement, and_, delete, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.access import Box, Feature
from app.core.errors import conflict, forbidden, invalid, not_found
from app.core.time import BAHRAIN, bahrain_today, utcnow
from app.models import (
    CalendarEvent,
    ItemStatus,
    LibraryItem,
    Module,
    RequestMeToo,
    RequestStatus,
    StudentRequest,
    User,
)
from app.schemas.requests import (
    DoneRequests,
    FoundItem,
    RequestAnswer,
    RequestCreate,
    RequestEvent,
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
        dict(
            db.execute(select(Module.id, Module.name).where(Module.id.in_(module_ids), Module.hidden.is_(False)))
            .tuples()
            .all()
        )
        if module_ids
        else {}
    )
    found_ids = {r.found_item_id for r in reqs if r.found_item_id}
    found = (
        {
            i.id: i
            for i in db.scalars(
                select(LibraryItem).where(LibraryItem.id.in_(found_ids), LibraryItem.status == ItemStatus.published)
            )
        }
        if found_ids
        else {}
    )
    event_ids = {r.event_id for r in reqs if r.event_id}
    events = (
        {e.id: e for e in db.scalars(select(CalendarEvent).where(CalendarEvent.id.in_(event_ids)))} if event_ids else {}
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
            wanted_kind=r.wanted_kind,
            exam_year=r.exam_year,
            zone=r.zone,
            event=_event_out(events.get(r.event_id)) if r.event_id else None,
            found=_found_out(found.get(r.found_item_id)) if r.found_item_id else None,
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


def _event_out(e: CalendarEvent | None) -> RequestEvent | None:
    return RequestEvent(id=e.id, title=e.title, date=e.date, sample=e.sample) if e is not None else None


def _found_out(item: LibraryItem | None) -> FoundItem | None:
    if item is None:
        return None
    return FoundItem(
        id=item.id, slug=item.slug, title=item.title, kind=item.kind, exam_year=item.exam_year, zone=item.zone
    )


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


def done(db: Session, viewer: User | None, *, until: dt.date | None, days: int, limit: int) -> DoneRequests:
    """ "You asked, we did": the requests marked done in the `days` (days in Bahrain) up to `until`, today when it's
    None, the latest answered first."""
    last = until or bahrain_today()
    since = last - timedelta(days=days - 1)
    start = dt.datetime.combine(since, dt.time(), tzinfo=BAHRAIN)
    end = dt.datetime.combine(last + timedelta(days=1), dt.time(), tzinfo=BAHRAIN)
    where = [
        StudentRequest.removed_at.is_(None),
        StudentRequest.status == RequestStatus.done,
        StudentRequest.answered_at >= start,
        StudentRequest.answered_at < end,
    ]
    total = db.scalar(select(func.count()).select_from(StudentRequest).where(*where)) or 0
    reqs = db.scalars(
        select(StudentRequest).where(*where).order_by(StudentRequest.answered_at.desc(), StudentRequest.id).limit(limit)
    ).all()
    return DoneRequests(since=since, until=last, total=total, items=_outs(db, reqs, viewer))


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


def _check_wants(db: Session, user: User, data: RequestCreate) -> None:
    """What a paper or date request names must fit its kind, and a person asks for the same thing once."""
    if data.kind != "paper" and (data.wanted_kind or data.exam_year or data.zone):
        raise invalid("wantedKind", "Only a request for a paper or notes says which file it wants.")
    if data.kind != "event" and data.event_id:
        raise invalid("eventId", "Only a request about a date names an event.")
    if data.wanted_kind and not data.module_id:
        raise invalid("moduleId", "Pick the module the file is for.")
    still_open = [StudentRequest.removed_at.is_(None), StudentRequest.status.in_(OPEN_FOR_ME_TOO)]
    if data.event_id:
        event = db.get(CalendarEvent, data.event_id)
        if event is None:
            raise invalid("eventId", "This date isn't in the calendar any more. Pick another.")
        if not event.sample:
            raise invalid("eventId", "This date is already confirmed.")
        if db.scalar(select(StudentRequest.id).where(*still_open, StudentRequest.event_id == event.id).limit(1)):
            raise conflict("already_asked", 'Someone already asked about this date. Say "me too" on their request.')
    if data.wanted_kind:
        same = db.scalar(
            select(StudentRequest.id)
            .where(
                *still_open,
                StudentRequest.author_id == user.id,
                StudentRequest.module_id == data.module_id,
                StudentRequest.wanted_kind == data.wanted_kind,
                StudentRequest.exam_year.is_not_distinct_from(data.exam_year),
                StudentRequest.zone.is_not_distinct_from(data.zone),
            )
            .limit(1)
        )
        if same:
            raise conflict("already_asked", "You already asked for this. It's in your requests.")


def create_request(db: Session, user: User, data: RequestCreate) -> StudentRequest:
    """A new request. A paper request that names its file is matched with one already in the library, while
    requests.autoclose is on for the person."""
    title = _title(data.title)
    details = clean_body(data.details)
    require_module(db, data.module_id, visible=True)
    _check_wants(db, user, data)
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
        wanted_kind=data.wanted_kind,
        exam_year=data.exam_year,
        zone=data.zone,
        event_id=data.event_id,
        status=RequestStatus.open,
        created_at=utcnow(),
    )
    db.add(req)
    db.flush()
    if req.wanted_kind and access.feature_on(db, user, Feature.requests_autoclose):
        item = db.scalars(
            select(LibraryItem)
            .where(LibraryItem.status == ItemStatus.published, *_fits(req))
            .order_by(LibraryItem.published_at.desc().nulls_last(), LibraryItem.id)
            .limit(1)
        ).first()
        if item is not None:
            req.found_item_id, req.found_at = item.id, utcnow()
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


def _tell(db: Session, req: StudentRequest, actor: User, body: str | None = None) -> int:
    """Notifies the requester and everyone who said "me too" about the request's new status, each while the feature
    is on for them. -> how many were told."""
    return _tell_within(db, access.audience(db, Feature.requests), req, actor, body)


def _tell_within(
    db: Session, audience: ColumnElement[bool] | None, req: StudentRequest, actor: User, body: str | None = None
) -> int:
    """_tell() for the people in `audience` (access.audience() of requests, worked out once for many requests)."""
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
            body=body or req.reply,
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
    before, before_reply = req.status, req.reply
    req.status = status
    req.reply = reply or None
    req.answered_by = user.id
    req.answered_at = utcnow()
    db.flush()
    told = _tell(db, req, user) if status != before else 0
    changes: dict[str, Any] = {
        "from": before.value,
        "to": status.value,
        "title": req.title,
        "kind": req.kind,
        "told": told,
    }
    if req.reply != before_reply:
        changes["reply"] = {"from": before_reply, "to": req.reply}
    record(db, user, "request.status", "request", req.id, changes, ip)


def remove(db: Session, user: User, req: StudentRequest, ip: str | None) -> None:
    """Removes the request for everyone. Audited with its title."""
    req.removed_at = utcnow()
    req.removed_by = user.id
    record(db, user, "request.remove", "request", req.id, {"title": req.title, "kind": req.kind}, ip)


# ── requests that close themselves ────────────────────────────────────────────────


def _fits(req: StudentRequest) -> list[ColumnElement[bool]]:
    """Conditions on LibraryItem for a file that is what the paper request asked for: the same module and kind, and
    its exam year and zone when the request gives them."""
    fits = [LibraryItem.module_id == req.module_id, LibraryItem.kind == req.wanted_kind]
    if req.exam_year is not None:
        fits.append(LibraryItem.exam_year == req.exam_year)
    if req.zone is not None:
        fits.append(LibraryItem.zone == req.zone)
    return fits


def _autoclose_audience(db: Session) -> ColumnElement[bool] | None:
    """The accounts both requests and requests.autoclose are on for, or None when either is off for everyone."""
    asked, auto = access.audience(db, Feature.requests), access.audience(db, Feature.requests_autoclose)
    return None if asked is None or auto is None else and_(asked, auto)


def match_published(db: Session, item: LibraryItem) -> int:
    """For the library's publish step: the open paper requests `item` answers, which aren't waiting on another file
    still in the library, get it as their found file, and their requesters are asked whether it's the one. -> how
    many requests matched."""
    if item.status != ItemStatus.published or item.module_id is None:
        return 0
    told = _autoclose_audience(db)
    if told is None:
        return 0
    fits: list[ColumnElement[bool]] = [
        StudentRequest.removed_at.is_(None),
        StudentRequest.status.in_(OPEN_FOR_ME_TOO),
        or_(  # not waiting on another file, or that file left the library
            StudentRequest.found_item_id.is_(None),
            StudentRequest.found_item_id.in_(select(LibraryItem.id).where(LibraryItem.status != ItemStatus.published)),
        ),
        StudentRequest.module_id == item.module_id,
        StudentRequest.wanted_kind == item.kind,
        or_(StudentRequest.exam_year.is_(None), StudentRequest.exam_year == item.exam_year),
        or_(StudentRequest.zone.is_(None), StudentRequest.zone == item.zone),
    ]
    reqs = db.scalars(select(StudentRequest).where(*fits).with_for_update(skip_locked=True)).all()
    now = utcnow()
    for req in reqs:
        req.found_item_id, req.found_at = item.id, now
    authors = {r.author_id for r in reqs if r.author_id}
    readers = set(db.scalars(select(User.id).where(User.id.in_(authors), told))) if authors else set()
    for req in reqs:
        if req.author_id in readers:
            notify(
                db,
                req.author_id,
                "request_update",
                f"Is this the file you asked for? {item.title}",
                body="Say yes to close your request, or no to keep it open.",
                url=f"/requests/{req.id}",
                data={"requestId": str(req.id), "foundItemId": str(item.id)},
            )
    return len(reqs)


def may_confirm(user: User, req: StudentRequest) -> bool:
    """The requester and the people who handle requests say whether a found file is the one."""
    return req.author_id == user.id or access.can(user, Box.requests_manage)


def answer_found(db: Session, user: User, req: StudentRequest, confirm: bool, ip: str | None) -> None:
    """Yes closes the request as done and tells everyone who wanted it; no clears the file and keeps the request open.
    Audited when a rep answers for the requester."""
    if not may_confirm(user, req):
        raise forbidden("Only the person who asked, or a student rep, can say whether this is the file.")
    item = db.get(LibraryItem, req.found_item_id) if req.found_item_id else None
    if item is None or item.status != ItemStatus.published or req.status not in OPEN_FOR_ME_TOO:
        raise conflict("nothing_found", "No file is waiting for an answer on this request.")
    if confirm:
        before = req.status
        req.status = RequestStatus.done
        req.answered_by = user.id
        req.answered_at = utcnow()
        db.flush()
        told = _tell(db, req, user, f"It's in the library: {item.title}")
        extra: dict[str, Any] = {"from": before.value, "to": req.status.value, "told": told}
    else:
        req.found_item_id = req.found_at = None
        extra = {}
    if req.author_id != user.id:
        record(
            db,
            user,
            "request.found",
            "request",
            req.id,
            {"title": req.title, "item": item.title, "confirm": confirm, **extra},
            ip,
        )


def close_for_date(db: Session, user: User, event: CalendarEvent, reply: str, ip: str | None) -> int:
    """For the calendar: a rep confirmed `event`, so the open requests asking about it close as done, with `reply`,
    and everyone who wanted them is told. Audited each. -> how many closed."""
    if _autoclose_audience(db) is None:
        return 0
    reqs = db.scalars(
        select(StudentRequest)
        .where(
            StudentRequest.event_id == event.id,
            StudentRequest.removed_at.is_(None),
            StudentRequest.status.in_(OPEN_FOR_ME_TOO),
        )
        .with_for_update()
    ).all()
    now = utcnow()
    audience = access.audience(db, Feature.requests)
    for req in reqs:
        before = req.status
        req.status, req.reply, req.answered_by, req.answered_at = RequestStatus.done, reply, user.id, now
        db.flush()
        told = _tell_within(db, audience, req, user)
        record(
            db,
            user,
            "request.status",
            "request",
            req.id,
            {
                "from": before.value,
                "to": req.status.value,
                "title": req.title,
                "kind": req.kind,
                "told": told,
                "via": "calendar",
            },
            ip,
        )
    return len(reqs)
