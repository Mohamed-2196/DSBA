"""The DSBA Newsletter: who sees which issue, writing and publishing issues, reactions, and an issue's plain text
(for search).

An issue's cover and sections are typed (app/schemas/newsletter.py): writes are validated there, links included
(app/schemas/links.py), and stored as JSON in that shape. Reads parse the stored JSON with the same models.
Services leave the commit to the handler."""

from __future__ import annotations

import re
import uuid
from collections.abc import Sequence
from typing import Any

from pydantic import BaseModel
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import ApiError, conflict, invalid, not_found
from app.core.links import json_size
from app.core.security import is_moderator
from app.core.time import utcnow
from app.models import IssueStatus, NewsletterIssue, NewsletterReaction, User
from app.schemas.newsletter import (
    CardAside,
    CtaBlock,
    IssueCover,
    IssueCreate,
    IssueDetail,
    IssueSection,
    IssueSummary,
    IssueUpdate,
    ListBlock,
    ParagraphBlock,
    ReactionCounts,
    SignoffBlock,
    StatsAside,
)
from app.services.content import apply_patch, record
from app.services.notify import notify_all

REACTIONS = ("useful", "love", "laugh")
MAX_ISSUE_BYTES = 256 * 1024  # the whole issue as JSON (security review SEC-6); the launch edition is about 8 KB
TOO_LONG = "This issue is too long: shorten it or split it into two issues."
# Fields a moderator edits (PATCH), and those that may be emptied (to "": the columns are never null).
EDITABLE = ("slug", "number", "title", "date", "cover", "dek", "summary", "editors", "sections")
BLANK = ("dek", "summary")


def _stored(model: BaseModel) -> Any:
    """A typed part of an issue as it is stored: camelCase JSON, without empty optional fields."""
    return model.model_dump(mode="json", by_alias=True, exclude_none=True)


# ── visibility and reading ───────────────────────────────────────────────────────────────────


def can_see(issue: NewsletterIssue, user: User | None) -> bool:
    return issue.status == IssueStatus.published or is_moderator(user)


def get_by_slug(db: Session, slug: str, user: User | None) -> NewsletterIssue:
    issue = db.scalar(select(NewsletterIssue).where(NewsletterIssue.slug == slug))
    if issue is None or not can_see(issue, user):
        raise not_found("This issue doesn't exist.")
    return issue


def get_by_id(db: Session, issue_id: uuid.UUID) -> NewsletterIssue:
    issue = db.get(NewsletterIssue, issue_id)
    if issue is None:
        raise not_found("This issue doesn't exist.")
    return issue


def read_cover(issue: NewsletterIssue) -> IssueCover:
    return IssueCover.model_validate(issue.cover or {})


def read_sections(issue: NewsletterIssue) -> list[IssueSection]:
    return [IssueSection.model_validate(raw) for raw in issue.sections or []]


def section_ids(issue: NewsletterIssue) -> list[str]:
    return [s.id for s in read_sections(issue)]


def _summary_fields(issue: NewsletterIssue) -> dict[str, Any]:
    return {
        "id": issue.id,
        "slug": issue.slug,
        "number": issue.number,
        "title": issue.title,
        "date": issue.date,
        "cover": read_cover(issue),
        "dek": issue.dek,
        "summary": issue.summary,
        "editors": [str(e) for e in issue.editors or []],
        "status": issue.status.value,
        "published_at": issue.published_at,
    }


def to_summary(issue: NewsletterIssue) -> IssueSummary:
    return IssueSummary.model_validate(_summary_fields(issue))


def reaction_counts(
    db: Session, issue: NewsletterIssue, user: User | None, ids: Sequence[str]
) -> dict[str, ReactionCounts]:
    """Counts per section and reaction, plus the reactions of the person asking ('mine')."""
    counts: dict[str, dict[str, Any]] = {sid: {"useful": 0, "love": 0, "laugh": 0, "mine": []} for sid in ids}
    where = [NewsletterReaction.issue_id == issue.id, NewsletterReaction.section_id.in_(ids)]
    rows = db.execute(
        select(NewsletterReaction.section_id, NewsletterReaction.reaction, func.count())
        .where(*where)
        .group_by(NewsletterReaction.section_id, NewsletterReaction.reaction)
    ).all()
    for sid, reaction, n in rows:
        if reaction in REACTIONS:
            counts[sid][reaction] = int(n)
    if user is not None:
        mine = db.execute(
            select(NewsletterReaction.section_id, NewsletterReaction.reaction).where(
                *where, NewsletterReaction.user_id == user.id
            )
        ).all()
        for sid, reaction in mine:
            if reaction in REACTIONS:
                counts[sid]["mine"].append(reaction)
    for c in counts.values():
        c["mine"].sort(key=REACTIONS.index)
    return {sid: ReactionCounts.model_validate(c) for sid, c in counts.items()}


def to_detail(db: Session, issue: NewsletterIssue, user: User | None) -> IssueDetail:
    sections = read_sections(issue)
    reactions = reaction_counts(db, issue, user, [s.id for s in sections])
    return IssueDetail.model_validate({**_summary_fields(issue), "sections": sections, "reactions": reactions})


def list_issues(db: Session, include_drafts: bool) -> Sequence[NewsletterIssue]:
    q = select(NewsletterIssue)
    if not include_drafts:
        q = q.where(NewsletterIssue.status == IssueStatus.published)
    return db.scalars(
        q.order_by(NewsletterIssue.date.desc(), NewsletterIssue.number.desc(), NewsletterIssue.created_at.desc())
    ).all()


# ── writing ──────────────────────────────────────────────────────────────────────────────────


def _check_size(issue: NewsletterIssue) -> None:
    """The whole issue at most 256 KB as JSON (each part has its own limits in the schema; the cover's keep it
    under 1 KB)."""
    whole = {
        "title": issue.title,
        "dek": issue.dek,
        "summary": issue.summary,
        "editors": issue.editors,
        "cover": issue.cover,
        "sections": issue.sections,
    }
    if json_size(whole) > MAX_ISSUE_BYTES:
        raise invalid("sections", TOO_LONG)


def _slug_taken() -> ApiError:
    return conflict("slug_taken", "Another issue already uses this address.")


def check_slug_free(db: Session, slug: str, issue_id: uuid.UUID | None = None) -> None:
    """409 slug_taken when another issue has this address (two reps saving at once are caught on insert)."""
    q = select(NewsletterIssue.id).where(NewsletterIssue.slug == slug)
    if issue_id is not None:
        q = q.where(NewsletterIssue.id != issue_id)
    if db.scalar(q) is not None:
        raise _slug_taken()


def _insert(db: Session, issue: NewsletterIssue) -> None:
    """Inserts the issue in a savepoint: two reps saving the same address at once get 409 slug_taken, not a 500."""
    try:
        with db.begin_nested():
            db.add(issue)
            db.flush()
    except IntegrityError:
        raise _slug_taken() from None


def new_draft(body: IssueCreate, author: User | None = None) -> NewsletterIssue:
    """A draft from its typed form, stored in that shape (the API and the seed both make issues this way). Checks the
    size; the caller inserts it."""
    issue = NewsletterIssue(
        slug=body.slug,
        number=body.number,
        title=body.title,
        date=body.date,
        cover=_stored(body.cover),
        dek=body.dek,
        summary=body.summary,
        editors=list(body.editors),
        sections=[_stored(s) for s in body.sections],
        status=IssueStatus.draft,
        created_by=author.id if author else None,
    )
    _check_size(issue)
    return issue


def create_issue(db: Session, user: User, body: IssueCreate, ip: str | None) -> NewsletterIssue:
    """A new draft."""
    check_slug_free(db, body.slug)
    issue = new_draft(body, user)
    _insert(db, issue)
    record(db, user, "newsletter.create", "newsletter_issue", issue.id, issue.title, ip, slug=issue.slug)
    return issue


def update_issue(db: Session, user: User, issue: NewsletterIssue, body: IssueUpdate, ip: str | None) -> None:
    """Edits a draft or a published issue. On any refusal the issue is left as it was: the edit is written in a
    savepoint, so a new address that another rep took a moment earlier answers 409 slug_taken, not a 500."""
    if body.slug is not None and body.slug != issue.slug:
        check_slug_free(db, body.slug, issue.id)
    try:
        with db.begin_nested():  # flushes what was pending before, then holds this edit
            changed = apply_patch(issue, body, EDITABLE, blank=BLANK)
            _check_size(issue)
            db.flush()
    except IntegrityError:
        db.expire(issue)
        raise _slug_taken() from None
    except ApiError:
        db.expire(issue)  # drop the unsaved changes
        raise
    if changed:
        record(
            db,
            user,
            "newsletter.update",
            "newsletter_issue",
            issue.id,
            issue.title,
            ip,
            slug=issue.slug,
            fields=changed,
        )


def delete_issue(db: Session, user: User, issue: NewsletterIssue, ip: str | None) -> None:
    """The audit row keeps the slug, so the seed never brings a deleted issue back."""
    record(
        db,
        user,
        "newsletter.delete",
        "newsletter_issue",
        issue.id,
        issue.title,
        ip,
        slug=issue.slug,
        status=issue.status.value,
    )
    db.delete(issue)


def publish(db: Session, user: User, issue: NewsletterIssue, ip: str | None) -> int:
    """Publishes a draft and tells every account about it (decision D1: the notification in the Hub always comes;
    an email goes to those who keep "New newsletter issues" on). Publishing a published issue changes nothing and
    tells nobody. -> the number of notifications."""
    if issue.status == IssueStatus.published:
        return 0
    issue.status = IssueStatus.published
    issue.published_at = utcnow()
    notified = notify_all(
        db,
        "new_issue",
        f"New issue of The DSBA Newsletter: {issue.title}",
        body=issue.dek or None,
        url=f"/newsletter/{issue.slug}",
        actor=user,
        data={"issueId": str(issue.id), "slug": issue.slug},
    )
    record(
        db,
        user,
        "newsletter.publish",
        "newsletter_issue",
        issue.id,
        issue.title,
        ip,
        slug=issue.slug,
        notified=notified,
    )
    return notified


def set_reaction(
    db: Session, user: User, issue: NewsletterIssue, section_id: str, reaction: str, on: bool
) -> ReactionCounts:
    if issue.status != IssueStatus.published:
        if is_moderator(user):
            raise ApiError(409, "not_published", "Reactions open when the issue is published.")
        raise not_found("This issue doesn't exist.")
    if section_id not in section_ids(issue):
        raise not_found("This section doesn't exist.")
    if on:
        db.execute(
            pg_insert(NewsletterReaction)
            .values(user_id=user.id, issue_id=issue.id, section_id=section_id, reaction=reaction)
            .on_conflict_do_nothing()
        )
    else:
        db.execute(
            delete(NewsletterReaction).where(
                NewsletterReaction.user_id == user.id,
                NewsletterReaction.issue_id == issue.id,
                NewsletterReaction.section_id == section_id,
                NewsletterReaction.reaction == reaction,
            )
        )
    return reaction_counts(db, issue, user, [section_id])[section_id]


# ── plain text (search) ──────────────────────────────────────────────────────────────────────

_MARKUP = (
    (re.compile(r"\[([^\]]+)\]\([^)\s]+\)"), r"\1"),
    (re.compile(r"\*\*([^*]+)\*\*"), r"\1"),
    (re.compile(r"==([^=]+)=="), r"\1"),
    (re.compile(r"\*([^*\s][^*]*)\*"), r"\1"),
)


def plain_markup(text: str) -> str:
    """The issue copy's inline markup (**bold**, *italic*, ==mark==, [label](url)) as plain text."""
    for rx, repl in _MARKUP:
        text = rx.sub(repl, text)
    return text


def section_text(s: IssueSection) -> str:
    """The editorial copy of one section (what live sections list at read time is not part of it)."""
    parts = [s.label or "", s.title]
    if s.figure and s.figure.caption:
        parts.append(s.figure.caption)
    for b in [*s.blocks, *s.after]:
        if isinstance(b, ParagraphBlock | SignoffBlock):
            parts.append(b.text)
        elif isinstance(b, ListBlock):
            parts += b.items
        elif isinstance(b, CtaBlock):
            parts.append(b.label)
    if isinstance(s.aside, CardAside):
        parts += [s.aside.kicker, s.aside.title, s.aside.text]
    elif isinstance(s.aside, StatsAside):
        parts += [s.aside.title, *(f"{i.value} {i.label}" for i in s.aside.items), s.aside.foot or ""]
    return " ".join(plain_markup(p) for p in parts if p)


def issue_text(issue: NewsletterIssue) -> list[str]:
    """[title, dek and summary] followed by each section's text: where search snippets come from."""
    head = plain_markup(f"{issue.title}. {issue.dek} {issue.summary}".strip())
    return [head, *(t for t in (section_text(s) for s in read_sections(issue)) if t)]
