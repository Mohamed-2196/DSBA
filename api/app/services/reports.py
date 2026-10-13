"""Reports of forum threads, forum replies and library items, and the queues of the people who handle them. Owner:
community agent.

A report names its target by type and id. Each person may have one open report per target. Forum reports are for
people with forum.moderate and library reports for people with library.manage: they resolve or dismiss them (hiding
the post or removing the file is a separate action), and the reporter is told. Who reported is shown to admins only:
student reps are classmates (security review, finding 22)."""

from __future__ import annotations

import uuid
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, defer
from sqlalchemy.orm.attributes import set_committed_value

from app.core.access import Box, Feature
from app.core.errors import conflict, not_found
from app.core.time import utcnow
from app.models import ForumReply, ForumThread, ItemStatus, LibraryItem, PostStatus, Report, ReportStatus, User
from app.schemas.moderation import ReportCreate, ReportOut, ReportPage, ReportResolve
from app.services import access
from app.services.accounts import public_user
from app.services.forum.rules import audit
from app.services.forum.text import clean_body, excerpt
from app.services.forum.visibility import REPLY_OPTS, THREAD_OPTS, can_see_reply, can_see_thread, get_thread
from app.services.notify import notify
from app.services.ratelimit import enforce

REPORTS_PER_HOUR = 20  # a cap on what lands in the reps' queue (security design review, finding 19)
ALREADY_REPORTED = "You've already reported this. A student rep will look at it soon."
TARGET_FEATURES: dict[str, Feature] = {"thread": Feature.forum, "reply": Feature.forum, "library_item": Feature.library}


def _users(db: Session, ids: Iterable[uuid.UUID | None]) -> dict[uuid.UUID, User]:
    wanted = {i for i in ids if i is not None}
    if not wanted:
        return {}
    found = {u.id: u for u in db.scalars(select(User).where(User.id.in_(wanted)))}
    access.prefetch(db, found.values())
    return found


@dataclass(frozen=True, slots=True)
class _Target:
    title: str | None
    url: str | None
    excerpt: str | None
    status: str
    author_id: uuid.UUID | None
    public: bool  # a guest can see it right now


def _targets(db: Session, keys: Iterable[tuple[str, uuid.UUID]]) -> dict[tuple[str, uuid.UUID], _Target]:
    ids: dict[str, set[uuid.UUID]] = {}
    for kind, target_id in keys:
        ids.setdefault(kind, set()).add(target_id)
    out: dict[tuple[str, uuid.UUID], _Target] = {}
    if ids.get("thread"):
        for t in db.scalars(select(ForumThread).where(ForumThread.id.in_(ids["thread"])).options(*THREAD_OPTS)):
            out["thread", t.id] = _Target(
                t.title,
                f"/forum/{t.slug}",
                excerpt(t.body) or None,
                t.status.value,
                t.author_id,
                can_see_thread(t, None),
            )
    if ids.get("reply"):
        rows = db.execute(
            select(ForumReply, ForumThread)
            .join(ForumThread, ForumThread.id == ForumReply.thread_id)
            .where(ForumReply.id.in_(ids["reply"]))
            .options(*REPLY_OPTS, *THREAD_OPTS)
        ).all()
        for r, t in rows:
            public = r.status == PostStatus.visible and can_see_thread(t, None)
            out["reply", r.id] = _Target(
                t.title, f"/forum/{t.slug}#reply-{r.id}", excerpt(r.body) or None, r.status.value, r.author_id, public
            )
    if ids.get("library_item"):
        items = db.scalars(
            select(LibraryItem).where(LibraryItem.id.in_(ids["library_item"])).options(defer(LibraryItem.search_vector))
        )
        for it in items:
            out["library_item", it.id] = _Target(
                it.title,
                f"/library/{it.slug}",
                excerpt(it.description or "") or None,
                it.status.value,
                it.uploaded_by,
                it.status == ItemStatus.published,
            )
    return out


def _reportable(db: Session, kind: str, target_id: uuid.UUID, user: User) -> bool:
    """The target exists and the reporter can see it."""
    if kind == "thread":
        t = get_thread(db, target_id)
        return t is not None and can_see_thread(t, user)
    if kind == "reply":
        r = db.get(ForumReply, target_id, options=REPLY_OPTS)
        t = get_thread(db, r.thread_id) if r is not None else None
        return (
            r is not None
            and t is not None
            and r.status != PostStatus.deleted
            and can_see_reply(r, user)
            and can_see_thread(t, user)
        )
    item = db.get(LibraryItem, target_id, options=[defer(LibraryItem.search_vector)])
    return item is not None and item.status == ItemStatus.published


def create_report(db: Session, user: User, data: ReportCreate) -> Report:
    if not _reportable(db, data.target_type, data.target_id, user):
        raise not_found("This post doesn't exist or was removed.")
    already = db.scalar(
        select(Report.id).where(
            Report.reporter_id == user.id,
            Report.target_type == data.target_type,
            Report.target_id == data.target_id,
            Report.status == ReportStatus.open,
        )
    )
    if already is not None:
        raise conflict("already_reported", ALREADY_REPORTED)
    enforce(
        db,
        f"reports:{user.id}",
        Report.created_at,
        [Report.reporter_id == user.id],
        limit=REPORTS_PER_HOUR,
        window=timedelta(hours=1),
        message="You've sent a lot of reports in the last hour. Try again in {}.",
    )
    note = clean_body(data.note) if data.note else ""
    report = Report(
        reporter_id=user.id,
        target_type=data.target_type,
        target_id=data.target_id,
        reason=data.reason,
        note=note or None,
        status=ReportStatus.open,
        created_at=utcnow(),
    )
    try:
        with db.begin_nested():
            db.add(report)
    except IntegrityError:  # the same report, sent twice at once (the unique index on open reports)
        raise conflict("already_reported", ALREADY_REPORTED) from None
    return report


def _queue(db: Session, user: User) -> list[str]:
    """The target types this person acts on: forum posts with forum.moderate, library files with library.manage, each
    while its feature is on for them."""
    types: list[str] = []
    if access.can(user, Box.forum_moderate) and access.feature_on(db, user, Feature.forum):
        types += ["thread", "reply"]
    if access.can(user, Box.library_manage) and access.feature_on(db, user, Feature.library):
        types.append("library_item")
    return types


def open_count(db: Session, user: User) -> int:
    """The open reports in this person's queue (the dashboard's count)."""
    where = (Report.status == ReportStatus.open, Report.target_type.in_(_queue(db, user)))
    return db.scalar(select(func.count()).select_from(Report).where(*where)) or 0


def _report_outs(db: Session, reports: Sequence[Report], viewer: User) -> list[ReportOut]:
    """Reports for the moderators' queue. Who reported is shown to admins only: student reps are classmates
    (security review, finding 22)."""
    show_reporter = access.is_admin(viewer)
    targets = _targets(db, ((r.target_type, r.target_id) for r in reports))
    people = _users(
        db,
        [r.reporter_id for r in reports] + [r.resolved_by for r in reports] + [t.author_id for t in targets.values()],
    )
    out: list[ReportOut] = []
    for r in reports:
        target = targets.get((r.target_type, r.target_id))
        out.append(
            ReportOut.model_validate(
                {
                    "id": r.id,
                    "target_type": r.target_type,
                    "target_id": r.target_id,
                    "target_title": target.title if target else None,
                    "target_url": target.url if target else None,
                    "target_excerpt": target.excerpt if target else None,
                    "target_status": target.status if target else None,
                    "target_author": public_user(people.get(target.author_id)) if target and target.author_id else None,
                    "reason": r.reason,
                    "note": r.note,
                    "status": r.status.value,
                    "reporter": public_user(people.get(r.reporter_id)) if show_reporter and r.reporter_id else None,
                    "created_at": r.created_at,
                    "resolved_by": public_user(people.get(r.resolved_by)) if r.resolved_by else None,
                    "resolved_at": r.resolved_at,
                    "resolution_note": r.resolution_note,
                }
            )
        )
    return out


def list_reports(db: Session, user: User, status: str, limit: int, offset: int) -> ReportPage:
    """Open reports oldest first (a queue); closed ones most recently closed first. Only the reports in this person's
    queue (_queue)."""
    st = ReportStatus(status)
    total = (
        db.scalar(
            select(func.count())
            .select_from(Report)
            .where(Report.status == st, Report.target_type.in_(_queue(db, user)))
        )
        or 0
    )
    order: list[Any] = (
        [Report.created_at.asc(), Report.id]
        if st == ReportStatus.open
        else [Report.resolved_at.desc().nulls_last(), Report.created_at.desc(), Report.id]
    )
    reports = db.scalars(
        select(Report)
        .where(Report.status == st, Report.target_type.in_(_queue(db, user)))
        .order_by(*order)
        .limit(limit)
        .offset(offset)
    ).all()
    return ReportPage(items=_report_outs(db, reports, user), total=total, limit=limit, offset=offset)


_TARGET_WORDS = {"thread": "the thread", "reply": "a reply in", "library_item": "the library file"}


def resolve_report(db: Session, user: User, report_id: uuid.UUID, data: ReportResolve, ip: str | None) -> ReportOut:
    """Close a report (resolved: a moderator acted; dismissed: left as it is). Tells the reporter. Audited. Closing is
    one conditional UPDATE: when two reps close it at once, the second gets report_closed (code quality review CQ-14)
    and the reporter hears once."""
    report = db.get(Report, report_id)
    if report is None or report.target_type not in _queue(db, user):
        raise not_found("This report doesn't exist.")
    note = clean_body(data.note) if data.note else ""
    values = {
        "status": ReportStatus(data.status),
        "resolved_by": user.id,
        "resolved_at": utcnow(),
        "resolution_note": note or None,
    }
    closed = db.execute(
        update(Report)
        .where(Report.id == report.id, Report.status == ReportStatus.open)
        .values(**values)
        .returning(Report.id)
        .execution_options(synchronize_session=False)
    ).first()
    if closed is None:
        raise conflict("report_closed", "This report was already closed.")
    for key, value in values.items():
        set_committed_value(report, key, value)
    target = _targets(db, [(report.target_type, report.target_id)]).get((report.target_type, report.target_id))
    if report.reporter_id is not None:
        what = _TARGET_WORDS.get(report.target_type, "the post")
        about = f"{what} “{target.title}”" if target and target.title else "the post you reported"
        outcome = "and took action" if report.status == ReportStatus.resolved else "and left it up"
        notify(
            db,
            report.reporter_id,
            "report_resolved",
            "Thanks for your report",
            body=f"A student rep looked at {about} {outcome}.",
            url=target.url if target and target.public else None,
            actor=user,
            data={"reportId": str(report.id), "status": report.status.value},
        )
    audit(
        db,
        user,
        "report.resolve",
        "report",
        report.id,
        ip,
        status=report.status.value,
        targetType=report.target_type,
        targetId=str(report.target_id),
        title=target.title if target else None,
    )
    return _report_outs(db, [report], user)[0]
