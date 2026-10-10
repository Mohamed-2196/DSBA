"""The DSBA Newsletter: who sees which issue, reactions, publishing, and an issue's plain text (for search).

Sections are JSON blocks written by moderators and rendered by the web app (web/src/features/newsletter). The API
relies on each section having a unique `id`, which reactions refer to, and checks every link in what moderators
and admins write (issues here, the Career Navigator in routers/content.py): https://, mailto:, or a page of the Hub
(security-design finding 18)."""

from __future__ import annotations

import json
import re
import uuid
from collections.abc import Sequence
from typing import Any
from urllib.parse import urlsplit

from sqlalchemy import delete, func, insert, literal, not_, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.errors import ApiError, conflict, invalid, not_found
from app.core.security import is_moderator
from app.core.time import utcnow
from app.models import IssueStatus, NewsletterIssue, NewsletterReaction, Notification, User
from app.schemas.newsletter import IssueDetail, IssueSummary, ReactionCounts
from app.services import audit

REACTIONS = ("useful", "love", "laugh")
SECTION_ID_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
SECTION_ID_MAX = 64  # newsletter_reactions.section_id
MAX_SECTIONS = 40
MAX_SECTIONS_BYTES = 256 * 1024  # an issue's sections as JSON (the launch edition is about 12 KB)
MAX_COVER_BYTES = 16 * 1024

# ── links in moderator- and admin-written JSON ───────────────────────────────────────────────

_MD_LINK = re.compile(r"\[([^\]]*)\]\(([^)\s]*)\)")
_LINK_KEYS = frozenset({"href", "url", "src", "art", "link", "image"})
_ASSET_PATH = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9_./-]*$")  # 'demo/news/speech-day.jpg', relative to the app
LINK_RULE = "Links must start with https:// or point to a page of the Hub (like /calendar)."


def safe_link(value: str) -> bool:
    """https:// (no user:password@), mailto:, a path in the app ('/career', not '//host' or '/\\host'), an
    #anchor, or a relative asset path. Never javascript:, data: or any other scheme."""
    v = value.strip()
    if v.lower().startswith("https://"):
        try:
            parts = urlsplit(v)
        except ValueError:
            return False
        return bool(parts.hostname) and parts.username is None and parts.password is None and "\\" not in v
    if v.lower().startswith("mailto:") or v.startswith("#"):
        return True
    if v.startswith("/"):
        return not v.startswith(("//", "/\\"))
    return bool(_ASSET_PATH.match(v)) and ".." not in v


def check_links(value: Any, path: str) -> None:
    """422 when a string under a link-like key (href, url, src, ...Url) or a [label](link) inside any text is not a
    safe link. `path` names the field in the error ('sections.3.figure.src')."""

    def walk(v: Any, p: str, key: str) -> None:
        if isinstance(v, dict):
            for k, x in v.items():
                walk(x, f"{p}.{k}" if p else str(k), str(k))
        elif isinstance(v, list):
            for i, x in enumerate(v):
                walk(x, f"{p}.{i}" if p else str(i), key)
        elif isinstance(v, str):
            is_link = key.lower() in _LINK_KEYS or key.endswith(("Url", "Href", "Src"))
            if (is_link and v.strip() and not safe_link(v)) or any(
                not safe_link(m.group(2)) for m in _MD_LINK.finditer(v)
            ):
                raise invalid(p or "request", LINK_RULE)

    walk(value, path, "")


def json_size(value: Any) -> int:
    return len(json.dumps(value, ensure_ascii=False).encode())


# ── visibility and output ────────────────────────────────────────────────────────────────────


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


def section_ids(issue: NewsletterIssue) -> list[str]:
    return [s["id"] for s in issue.sections if isinstance(s, dict) and isinstance(s.get("id"), str)]


def to_summary(issue: NewsletterIssue) -> IssueSummary:
    return IssueSummary.model_validate(_summary_fields(issue))


def _summary_fields(issue: NewsletterIssue) -> dict[str, Any]:
    return {
        "id": issue.id,
        "slug": issue.slug,
        "number": issue.number,
        "title": issue.title,
        "date": issue.date,
        "cover": issue.cover or {},
        "dek": issue.dek,
        "summary": issue.summary,
        "editors": [str(e) for e in issue.editors or []],
        "status": issue.status.value,
        "published_at": issue.published_at,
    }


def reaction_counts(
    db: Session, issue: NewsletterIssue, user: User | None, only: str | None = None
) -> dict[str, ReactionCounts]:
    """Counts per section and reaction, plus the reactions of the person asking ('mine')."""
    ids = [only] if only is not None else section_ids(issue)
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
    return IssueDetail.model_validate(
        {
            **_summary_fields(issue),
            "sections": [s for s in issue.sections if isinstance(s, dict)],
            "reactions": reaction_counts(db, issue, user),
        }
    )


def list_issues(db: Session, include_drafts: bool) -> Sequence[NewsletterIssue]:
    q = select(NewsletterIssue)
    if not include_drafts:
        q = q.where(NewsletterIssue.status == IssueStatus.published)
    return db.scalars(
        q.order_by(NewsletterIssue.date.desc(), NewsletterIssue.number.desc(), NewsletterIssue.created_at.desc())
    ).all()


# ── writing ──────────────────────────────────────────────────────────────────────────────────


def check_sections(sections: list[dict[str, Any]]) -> None:
    """Every section has a unique id (lower-case words and dashes): reactions are stored against it."""
    if len(sections) > MAX_SECTIONS:
        raise invalid("sections", f"An issue can have up to {MAX_SECTIONS} sections.")
    if json_size(sections) > MAX_SECTIONS_BYTES:
        raise invalid("sections", "This issue is too long.")
    seen: set[str] = set()
    for i, s in enumerate(sections):
        sid = s.get("id")
        if not isinstance(sid, str) or len(sid) > SECTION_ID_MAX or not SECTION_ID_RE.match(sid):
            raise invalid(f"sections.{i}.id", "Give each section an id: lower-case letters, digits and dashes.")
        if sid in seen:
            raise invalid(f"sections.{i}.id", "Two sections have the same id.")
        seen.add(sid)


def check_issue_content(
    *,
    sections: list[dict[str, Any]] | None = None,
    cover: dict[str, Any] | None = None,
    dek: str | None = None,
    summary: str | None = None,
) -> None:
    """What a moderator sends for an issue (only the parts sent): sizes, section ids and every link."""
    if sections is not None:
        check_sections(sections)
        check_links(sections, "sections")
    if cover is not None:
        if json_size(cover) > MAX_COVER_BYTES:
            raise invalid("cover", "The cover is too long.")
        check_links(cover, "cover")
    for field, text in (("dek", dek), ("summary", summary)):
        if text is not None:
            check_links(text, field)


def check_slug_free(db: Session, slug: str, issue_id: uuid.UUID | None = None) -> None:
    q = select(NewsletterIssue.id).where(NewsletterIssue.slug == slug)
    if issue_id is not None:
        q = q.where(NewsletterIssue.id != issue_id)
    if db.scalar(q) is not None:
        raise conflict("slug_taken", "Another issue already uses this address.")


def publish(db: Session, user: User, issue: NewsletterIssue, ip: str | None) -> int:
    """Publishes a draft and tells every reader who wants newsletter news, in one INSERT ... SELECT.
    Publishing a published issue changes nothing and notifies nobody. Returns the number of notifications."""
    if issue.status == IssueStatus.published:
        return 0
    issue.status = IssueStatus.published
    issue.published_at = utcnow()
    # preferences.newsletter_emails defaults to true: only an explicit false opts out
    wants_news = not_(User.preferences.contains({"newsletter_emails": False})) & not_(
        User.preferences.contains({"newsletterEmails": False})
    )
    readers = select(
        func.gen_random_uuid(),
        User.id,
        literal("new_issue"),
        literal(f"New issue of The DSBA Newsletter: {issue.title}"[:200]),
        literal(issue.dek or None),
        literal(f"/newsletter/{issue.slug}"),
        literal(user.id),
        literal({"issueId": str(issue.id), "slug": issue.slug}, JSONB),
    ).where(User.id != user.id, wants_news)
    columns = ["id", "user_id", "kind", "title", "body", "url", "actor_id", "data"]
    stmt = insert(Notification).from_select(columns, readers).execution_options(preserve_rowcount=True)
    # On the session's connection (same transaction): a CursorResult, whose rowcount counts the rows inserted.
    notified = max(0, db.connection().execute(stmt).rowcount)
    audit.record(
        db,
        user,
        "newsletter.publish",
        "newsletter_issue",
        issue.id,
        {"slug": issue.slug, "title": issue.title, "notified": notified},
        ip=ip,
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
    return reaction_counts(db, issue, user, only=section_id)[section_id]


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


def _strings(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        return [v for v in value if isinstance(v, str)]
    return []


def _get(obj: Any, key: str) -> Any:
    return obj.get(key) if isinstance(obj, dict) else None


def _block_strings(b: Any) -> list[str]:
    kind = _get(b, "type")
    if kind in ("p", "signoff"):
        return _strings(_get(b, "text"))
    if kind == "list":
        return _strings(_get(b, "items"))
    if kind == "steps":
        return [s for it in _get(b, "items") or [] for s in _strings(_get(it, "title")) + _strings(_get(it, "text"))]
    if kind == "qa":
        return [s for it in _get(b, "items") or [] for s in _strings(_get(it, "q")) + _strings(_get(it, "a"))]
    if kind == "figure":
        return _strings(_get(b, "caption"))
    return []


def _aside_strings(a: Any) -> list[str]:
    if not isinstance(a, dict):
        return []
    out: list[str] = []
    for key in ("kicker", "title", "text", "cite", "foot"):
        out += _strings(a.get(key))
    for it in a.get("items") or []:
        out += [f"{_get(it, 'value') or ''} {_get(it, 'label') or ''}".strip()] if isinstance(it, dict) else []
    return out


def section_text(section: Any) -> str:
    """The editorial copy of one section (live lists from other features are not part of it)."""
    parts = _strings(_get(section, "label")) + _strings(_get(section, "title"))
    parts += _strings(_get(_get(section, "figure"), "caption"))
    for b in (_get(section, "blocks") or []) + (_get(section, "after") or []):
        parts += _block_strings(b)
    for c in _get(section, "cohorts") or []:
        parts += _strings(_get(c, "title")) + _strings(_get(c, "paragraphs"))
    chart = _get(section, "chart")
    parts += _strings(_get(chart, "caption"))
    parts += [s for n in _get(chart, "notes") or [] for s in _strings(_get(n, "text"))]
    parts += _aside_strings(_get(section, "aside"))
    return " ".join(plain_markup(p) for p in parts if p)


def issue_text(issue: NewsletterIssue) -> list[str]:
    """[title, dek and summary] followed by each section's text: where search snippets come from."""
    head = plain_markup(f"{issue.title}. {issue.dek} {issue.summary}".strip())
    return [head, *(t for t in (section_text(s) for s in issue.sections) if t)]
