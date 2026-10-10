"""The forum's rules and queries, and reports. Owner: community agent.

The routers (app/routers/forum.py, app/routers/reports.py) stay thin: they check who is asking, call these
functions (which only add to the session) and commit once.

Who sees what, in one place:
- visible threads and replies are public;
- hidden ones (a moderator's call, kept for the record) exist only for moderators: everyone else gets a 404;
- deleted ones (by their author, or a moderator) lose their text in the database but keep their place: a deleted
  thread stays listed with its title while it has visible replies, and a deleted reply keeps its spot with body ''.
"""

from __future__ import annotations

import ipaddress
import re
import secrets
import unicodedata
import uuid
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, replace
from datetime import datetime, timedelta, timezone, tzinfo
from typing import Any, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import (
    ColumnElement,
    DateTime,
    Row,
    Select,
    String,
    and_,
    case,
    delete,
    exists,
    extract,
    false,
    func,
    literal,
    or_,
    select,
    update,
)
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import InstrumentedAttribute, Session, defer
from sqlalchemy.orm.attributes import set_committed_value

from app.core.errors import ApiError, conflict, forbidden, invalid, not_found, rate_limited
from app.core.security import is_admin, is_moderator
from app.core.text import slugify, unique_slug
from app.core.time import utcnow
from app.models import (
    AuditEntry,
    ForumReply,
    ForumThread,
    ItemStatus,
    LibraryItem,
    Module,
    PostStatus,
    ReplyVote,
    Report,
    ReportStatus,
    ThreadVote,
    Upload,
    UploadPurpose,
    UploadStatus,
    User,
    UserStatus,
)
from app.schemas.common import UserPublic
from app.schemas.forum import (
    Contributor,
    ForumMeta,
    ForumStats,
    Reply,
    ReplyCreate,
    ThreadCreate,
    ThreadDetail,
    ThreadModeration,
    ThreadPage,
    ThreadSummary,
    ThreadUpdate,
    VoteResult,
)
from app.schemas.moderation import ReportCreate, ReportOut, ReportPage, ReportResolve
from app.services.audit import record
from app.services.notify import notify

# ── taxonomy (from the prototype's web/src/features/forum/data/taxonomy.js) ─────────────────────────────


@dataclass(frozen=True, slots=True)
class CategoryDef:
    id: str
    label: str
    short: str
    year: int | None
    blurb: str


@dataclass(frozen=True, slots=True)
class TagDef:
    id: str
    label: str


# Every thread lives in exactly one category, so category counts add up to the total.
CATEGORIES: tuple[CategoryDef, ...] = (
    CategoryDef("year-1", "Year 1", "Year 1", 1, "Maths, statistics, economics and business"),
    CategoryDef("year-2", "Year 2", "Year 2", 2, "Distribution theory, inference, programming and more"),
    CategoryDef("year-3", "Year 3", "Year 3", 3, "Machine learning, asset pricing and more"),
    CategoryDef("study-groups", "Study groups", "Study group", None, "Find people to revise with"),
    CategoryDef("general", "General", "General", None, "Exams, campus and everything else"),
)
CATEGORY_BY_ID = {c.id: c for c in CATEGORIES}
# Categories without a cohort: their threads without a module are forum-wide (every year sees them).
FORUM_WIDE_CATEGORIES = tuple(c.id for c in CATEGORIES if c.year is None)

TAGS: tuple[TagDef, ...] = (
    TagDef("exam-prep", "Exam prep"),
    TagDef("past-papers", "Past papers"),
    TagDef("coursework", "Coursework"),
    TagDef("formula-sheet", "Formula sheets"),
    TagDef("r", "R"),
    TagDef("python", "Python"),
    TagDef("excel", "Excel"),
    TagDef("exams", "Exam rules"),
    TagDef("calculators", "Calculators"),
    TagDef("module-choice", "Module choice"),
    TagDef("campus", "Campus"),
    TagDef("lost-and-found", "Lost and found"),
)
TAG_BY_ID = {t.id: t for t in TAGS}
MAX_TAGS = 3

# Limits
THREADS_PER_HOUR = 10
REPLIES_PER_HOUR = 60
REPORTS_PER_HOUR = 20
RATE_WINDOW = timedelta(hours=1)
MAX_IMAGES_PER_POST = 20
EXCERPT_LENGTH = 200
TOP_CONTRIBUTORS = 5
CONTRIBUTOR_WINDOW = timedelta(days=7)
# Slugs the web app or the API already use under /forum/ and /forum/threads/.
RESERVED_SLUGS = frozenset({"new", "hot"})

Sort = Literal["hot", "new", "top"]


def category_for_year(year: int | None) -> str | None:
    """'year-2' for 2, None otherwise."""
    return f"year-{year}" if year in (1, 2, 3) else None


def forum_meta() -> ForumMeta:
    return ForumMeta.model_validate(
        {
            "categories": [
                {"id": c.id, "label": c.label, "short": c.short, "year": c.year, "blurb": c.blurb} for c in CATEGORIES
            ],
            "tags": [{"id": t.id, "label": t.label} for t in TAGS],
            "max_tags": MAX_TAGS,
        }
    )


def _bahrain() -> tzinfo:
    try:
        return ZoneInfo("Asia/Bahrain")
    except ZoneInfoNotFoundError:  # no tz database in the image: Bahrain is UTC+3 all year
        return timezone(timedelta(hours=3), "Asia/Bahrain")


# ── text: cleaning input, and plain text from the forum's small markdown (web/.../forum/lib/markdown.js) ───

_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_SPACES = re.compile(r"\s+")


def clean_title(value: str) -> str:
    """One line: control characters dropped, runs of whitespace collapsed."""
    return _SPACES.sub(" ", _CONTROL_CHARS.sub("", value)).strip()


def clean_body(value: str) -> str:
    """Markdown as typed, with \\n line ends and without control characters (Postgres can't store NUL)."""
    return _CONTROL_CHARS.sub("", value.replace("\r\n", "\n").replace("\r", "\n")).strip()


def has_text(value: str) -> bool:
    """Something would show: a letter, a digit, punctuation or a symbol (an emoji counts)."""
    return any(unicodedata.category(ch)[0] in "LNPS" for ch in value)


_FENCE = re.compile(r"^\s*```")
_UL = re.compile(r"^\s*[-*]\s+")
_OL = re.compile(r"^\s*\d+[.)]\s+")
_QUOTE = re.compile(r"^\s*>\s?")
_HEADING = re.compile(r"(?m)^[ \t]*#{1,6}[ \t]+")
_IMAGE_LINE = re.compile(r"^\s*!\[([^\]\n]*)\]\(([^\s)]+)\)\s*$")
_IMAGE = re.compile(r"!\[([^\]\n]*)\]\(([^\s)]*)\)")
_CODE_SPAN = re.compile(r"`[^`\n]+`")
# Inline tokens, leftmost first: code, image, bold, italic, link. Underscores are not italic (R_f, β_i).
_INLINE = re.compile(
    r"(`[^`\n]+`)"
    r"|(!\[([^\]\n]*)\]\([^\s)]*\))"
    r"|(\*\*[^*\n]+?\*\*)"
    r"|(\*[^*\s][^*\n]*?\*)"
    r"|(\[[^\]\n]+\]\((?:/[^\s)]*|https?://[^\s)]+|mailto:[^\s)]+)\))"
)
_MEDIA_SRC = re.compile(r"/api/v1/media/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
# As app/services/uploads.py MEDIA_PATH_RE (what /media serves): lower-case ids, nothing path-like after.
_MEDIA_REF = re.compile(r"/api/v1/media/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?![0-9a-zA-Z/])")
_EXCERPT_TAIL = re.compile(r"[\s,.;:!?(–\-،؛؟]+$")  # noqa: RUF001 - the Arabic comma and question mark are meant


@dataclass(frozen=True, slots=True)
class _Block:
    kind: Literal["p", "list", "quote", "code", "image"]
    texts: tuple[str, ...] = ()
    alt: str = ""
    src: str = ""


def _block_start(line: str) -> bool:
    return any(rx.match(line) for rx in (_FENCE, _UL, _OL, _QUOTE, _IMAGE_LINE))


def parse_blocks(src: str) -> list[_Block]:
    """Paragraphs, lists, quotes, fenced code and images on a line of their own (as the web app parses them)."""
    lines = src.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    blocks: list[_Block] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            continue
        if _FENCE.match(line):
            buf: list[str] = []
            i += 1
            while i < len(lines) and not _FENCE.match(lines[i]):
                buf.append(lines[i])
                i += 1
            i += 1  # the closing fence (or the end)
            blocks.append(_Block("code", ("\n".join(buf),)))
            continue
        if _UL.match(line) or _OL.match(line):
            rx = _OL if _OL.match(line) else _UL
            items: list[str] = []
            while i < len(lines) and rx.match(lines[i]):
                items.append(rx.sub("", lines[i], count=1))
                i += 1
            blocks.append(_Block("list", tuple(items)))
            continue
        if _QUOTE.match(line):
            buf = []
            while i < len(lines) and _QUOTE.match(lines[i]):
                buf.append(_QUOTE.sub("", lines[i], count=1))
                i += 1
            blocks.append(_Block("quote", ("\n".join(buf),)))
            continue
        image = _IMAGE_LINE.match(line)
        if image:
            blocks.append(_Block("image", alt=image.group(1).strip(), src=image.group(2)))
            i += 1
            continue
        buf = [line]
        i += 1
        while i < len(lines) and lines[i].strip() and not _block_start(lines[i]):
            buf.append(lines[i])
            i += 1
        blocks.append(_Block("p", ("\n".join(buf),)))
    return blocks


def _inline_plain(text: str, image_alt: bool) -> str:
    text = _HEADING.sub("", text)
    out: list[str] = []
    last = 0
    for m in _INLINE.finditer(text):
        out.append(text[last : m.start()])
        tok = m.group(0)
        if m.group(1):  # `code`
            out.append(tok[1:-1])
        elif m.group(2):  # ![alt](src)
            out.append(m.group(3) if image_alt else "")
        elif m.group(4):  # **bold**
            out.append(tok[2:-2])
        elif m.group(5):  # *italic*
            out.append(tok[1:-1])
        else:  # [text](href)
            out.append(tok[1 : tok.index("](")])
        last = m.end()
    out.append(text[last:])
    return "".join(out)


def to_plain_text(src: str, *, code_as: str | None = None, image_alt: bool = False) -> str:
    """Markdown stripped, whitespace collapsed. `code_as` replaces code blocks; images leave nothing (or their alt)."""
    parts: list[str] = []
    for b in parse_blocks(src):
        if b.kind == "code":
            parts.append(code_as if code_as is not None else b.texts[0])
        elif b.kind == "image":
            parts.append(b.alt if image_alt else "")
        else:
            parts.extend(_inline_plain(t, image_alt) for t in b.texts)
    return _SPACES.sub(" ", " ".join(parts)).strip()


def _graphemes(text: str) -> list[str]:
    """User-perceived characters (close enough): a letter with its marks, an emoji sequence, a flag."""
    out: list[str] = []
    glue = False
    for ch in text:
        cp = ord(ch)
        regional = 0x1F1E6 <= cp <= 0x1F1FF
        joins = bool(out) and (
            glue
            or unicodedata.category(ch) in ("Mn", "Mc", "Me")
            or cp == 0x200D
            or 0xFE00 <= cp <= 0xFE0F
            or 0x1F3FB <= cp <= 0x1F3FF
            or 0xE0020 <= cp <= 0xE007F
            or (regional and len(out[-1]) == 1 and 0x1F1E6 <= ord(out[-1]) <= 0x1F1FF)
        )
        if joins:
            out[-1] += ch
        else:
            out.append(ch)
        glue = cp == 0x200D
    return out


def excerpt(src: str, max_len: int = EXCERPT_LENGTH) -> str:
    """The first ~max_len characters of the plain text, cut at a word (never inside a letter or an emoji)."""
    plain = re.sub(r":\s*…\s*", ": … ", to_plain_text(src, code_as="…")).strip()
    units = _graphemes(plain)
    if len(units) <= max_len:
        return plain
    cut = "".join(units[:max_len])
    space = cut.rfind(" ")
    head = cut[:space] if space > len(cut) * 0.6 else cut
    return _EXCERPT_TAIL.sub("", head) + "…"


def allowed_image_src(src: str) -> bool:
    """Pictures the web app shows: exactly an uploaded forum image, /api/v1/media/<uuid> (no query, no other host).
    Pictures from other sites are never loaded: they would log every reader's IP (security review, finding 11)."""
    return _MEDIA_SRC.fullmatch(src) is not None


def first_image(src: str) -> dict[str, str] | None:
    """The first picture in a post that the web app would show: {src, alt}, or None."""
    for b in parse_blocks(src):
        if b.kind == "code":
            continue
        found = (
            [(b.alt, b.src)]
            if b.kind == "image"
            else [(m.group(1), m.group(2)) for t in b.texts for m in _IMAGE.finditer(_CODE_SPAN.sub("", t))]
        )
        for alt, image_src in found:
            if allowed_image_src(image_src):
                return {"src": image_src, "alt": alt.strip()[:300]}
    return None


def media_ids(text: str) -> list[uuid.UUID]:
    """Forum images a body refers to (/api/v1/media/<id>), in order, without repeats."""
    return list(dict.fromkeys(uuid.UUID(x) for x in _MEDIA_REF.findall(text)))


# ── people ──────────────────────────────────────────────────────────────────────────────────────────


def user_public(u: User | None) -> UserPublic | None:
    if u is None:
        return None
    return UserPublic.model_validate(
        {
            "id": u.id,
            "display_name": u.display_name or "Student",
            "year": u.year if u.year in (1, 2, 3) else None,
            "role": u.role.value,
        }
    )


def _users(db: Session, ids: Iterable[uuid.UUID | None]) -> dict[uuid.UUID, User]:
    wanted = {i for i in ids if i is not None}
    if not wanted:
        return {}
    return {u.id: u for u in db.scalars(select(User).where(User.id.in_(wanted)))}


# ── visibility and lookups ───────────────────────────────────────────────────────────────────────────

_THREAD_OPTS = (defer(ForumThread.search_vector),)
_REPLY_OPTS = (defer(ForumReply.search_vector),)


def moderates(user: User | None) -> bool:
    """Acts as a student rep: a moderator or admin whose account isn't suspended. Sees hidden posts and may act on
    other people's posts; a suspended rep is a student like any other (security review, finding 4)."""
    return user is not None and is_moderator(user) and user.status == UserStatus.active


def can_see_thread(t: ForumThread, viewer: User | None) -> bool:
    if t.status == PostStatus.visible or moderates(viewer):
        return True
    return t.status == PostStatus.deleted and t.reply_count > 0


def can_see_reply(r: ForumReply, viewer: User | None) -> bool:
    return r.status != PostStatus.hidden or moderates(viewer)


def _listed(viewer: User | None) -> ColumnElement[bool]:
    """Threads a list shows: visible ones, deleted ones that still have replies, and hidden ones for moderators."""
    conds = [
        ForumThread.status == PostStatus.visible,
        and_(ForumThread.status == PostStatus.deleted, ForumThread.reply_count > 0),
    ]
    if moderates(viewer):
        conds.append(ForumThread.status == PostStatus.hidden)
    return or_(*conds)


def get_thread(db: Session, thread_id: uuid.UUID) -> ForumThread | None:
    return db.get(ForumThread, thread_id, options=_THREAD_OPTS)


def thread_for(db: Session, thread_id: uuid.UUID, viewer: User | None) -> ForumThread:
    """The thread, or a 404 when it doesn't exist or the viewer may not see it."""
    t = get_thread(db, thread_id)
    if t is None or not can_see_thread(t, viewer):
        raise not_found("This thread doesn't exist or was removed.")
    return t


def thread_by_slug(db: Session, slug: str, viewer: User | None) -> ForumThread:
    if _CONTROL_CHARS.search(slug):  # never a slug, and Postgres refuses NUL
        raise not_found("This thread doesn't exist or was removed.")
    t = db.scalar(select(ForumThread).where(ForumThread.slug == slug).options(*_THREAD_OPTS))
    if t is None:  # an id works too
        try:
            t = get_thread(db, uuid.UUID(slug))
        except ValueError:
            t = None
    if t is None or not can_see_thread(t, viewer):
        raise not_found("This thread doesn't exist or was removed.")
    return t


def reply_for(db: Session, reply_id: uuid.UUID, viewer: User | None) -> tuple[ForumReply, ForumThread]:
    """The reply and its thread, or a 404 when the viewer may not see them."""
    r = db.get(ForumReply, reply_id, options=_REPLY_OPTS)
    t = get_thread(db, r.thread_id) if r is not None else None
    if r is None or t is None or not can_see_thread(t, viewer) or not can_see_reply(r, viewer):
        raise not_found("This reply doesn't exist or was removed.")
    return r, t


def _unavailable(status: PostStatus) -> ApiError:
    message = "This post was deleted." if status == PostStatus.deleted else "This post is hidden."
    return conflict("post_unavailable", message)


def require_moderator(user: User) -> None:
    """For the moderation endpoints: `Moderator` checks the role only (until core/security.py checks the status)."""
    if not moderates(user):
        raise forbidden("Your account is suspended. Contact a student rep.")


def _valid_ip(ip: str | None) -> str | None:
    """The address for the audit log's INET column, or None when it isn't one: a bad value must never turn a
    moderation action into a 500 (security review, finding 1)."""
    try:
        return str(ipaddress.ip_address(ip)) if ip else None
    except ValueError:
        return None


def _audit(db: Session, actor: User, action: str, kind: str, target_id: object, ip: str | None, **data: Any) -> None:
    """An audit row with a snapshot of who acted (the account may be deleted later) and what they acted on."""
    record(db, actor, action, kind, target_id, {"actorName": actor.display_name, **data}, _valid_ip(ip))


# ── SQL pieces ──────────────────────────────────────────────────────────────────────────────────────


def _year_expr() -> ColumnElement[Any]:
    """The thread's cohort: its category's year, else its module's (needs the outer join to modules)."""
    whens = [(ForumThread.category == c.id, literal(c.year)) for c in CATEGORIES if c.year is not None]
    return case(*whens, else_=Module.year)


def _year_condition(year: int) -> ColumnElement[bool]:
    """That cohort's threads (its category, or a module of that year) plus the forum-wide ones."""
    return or_(
        ForumThread.category == f"year-{year}",
        Module.year == year,
        and_(ForumThread.category.in_(FORUM_WIDE_CATEGORIES), ForumThread.module_id.is_(None)),
    )


def _hot_expr(now: datetime) -> ColumnElement[Any]:
    """(votes + 1.5 * replies) / (age in hours + 2)^1.5, as the prototype ranks threads."""
    hours = func.greatest(extract("epoch", literal(now, DateTime(timezone=True)) - ForumThread.created_at) / 3600, 0)
    return (ForumThread.vote_count + 1.5 * ForumThread.reply_count) / func.power(hours + 2, 1.5)


def _order(sort: Sort, now: datetime, *, pinned_first: bool) -> list[Any]:
    order: list[Any] = [ForumThread.pinned.desc()] if pinned_first else []
    if sort == "new":
        order.append(ForumThread.created_at.desc())
    elif sort == "top":
        order += [ForumThread.vote_count.desc(), ForumThread.created_at.desc()]
    else:
        order += [_hot_expr(now).desc(), ForumThread.created_at.desc()]
    order.append(ForumThread.id.desc())
    return order


def _has_tag(tag: str) -> ColumnElement[bool]:
    return literal(tag, String) == ForumThread.tags.any_()


# ── search ──────────────────────────────────────────────────────────────────────────────────────────

_STOP_WORDS = (
    "a an and are as at be but by can could do does for from get got has have how i if in into is it its me my of on "
    "or our should so than that the their them then there these this to was we were what when where which who why "
    "will with would you your any anyone someone just about vs"
)
_STOP = frozenset(_STOP_WORDS.split())
_MAX_TERMS = 8
# Quotes or a "-word" mean the person wrote a web-search style query: Postgres parses it as it is.
_WEBSEARCH_SYNTAX = re.compile(r'"|(?:^|\s)-[^\W_]')


def _tokens(text: str) -> list[str]:
    """Words: runs of letters (with their marks) and digits, lower-cased."""
    words: list[str] = []
    cur: list[str] = []
    for ch in text.lower():
        if unicodedata.category(ch)[0] in "LMN":
            cur.append(ch)
        elif cur:
            words.append("".join(cur))
            cur = []
    if cur:
        words.append("".join(cur))
    return [w for w in words if any(unicodedata.category(c)[0] in "LN" for c in w)]


def search_terms(q: str) -> list[str]:
    """The words of a query worth matching: no repeats, stop words dropped (unless that leaves nothing)."""
    words = list(dict.fromkeys(_tokens(q)))
    kept = [w for w in words if w not in _STOP] or words
    return kept[:_MAX_TERMS]


def _words_of(*texts: str) -> frozenset[str]:
    return frozenset(w for t in texts for w in _tokens(t))


_TAG_WORDS = {t.id: _words_of(t.id, t.label) for t in TAGS}
_CATEGORY_WORDS = {c.id: _words_of(c.id, c.label, c.short) for c in CATEGORIES}


def _named(words_by_id: dict[str, frozenset[str]], term: str, prefix: bool) -> list[str]:
    return [i for i, words in words_by_id.items() if any(w == term or (prefix and w.startswith(term)) for w in words)]


def _module_vector() -> ColumnElement[Any]:
    return func.to_tsvector("simple", func.concat_ws(" ", Module.unit_code, Module.name, Module.short_name))


def _matches_anywhere(
    tsq: ColumnElement[Any], tag_ids: Sequence[str] = (), category_ids: Sequence[str] = ()
) -> ColumnElement[bool]:
    """The query matches the thread (title and body), one of its visible replies, its module, a tag or the category."""
    conds: list[ColumnElement[bool]] = [
        ForumThread.search_vector.bool_op("@@")(tsq),
        ForumThread.module_id.in_(select(Module.id).where(_module_vector().bool_op("@@")(tsq))),
        exists().where(
            ForumReply.thread_id == ForumThread.id,
            ForumReply.status == PostStatus.visible,
            ForumReply.search_vector.bool_op("@@")(tsq),
        ),
    ]
    conds += [_has_tag(t) for t in tag_ids]
    if category_ids:
        conds.append(ForumThread.category.in_(category_ids))
    return or_(*conds)


def search_condition(q: str) -> ColumnElement[bool] | None:
    """Every word must match somewhere in the thread, its replies, its module, its tags or its category.
    Words of two letters or more match as prefixes (search as you type; the 'simple' config doesn't stem).
    A query with quotes or "-word" is handed to websearch_to_tsquery as it is. None: nothing to search for."""
    q = q.strip()
    if _WEBSEARCH_SYNTAX.search(q):
        return _matches_anywhere(func.websearch_to_tsquery("simple", q)) if _tokens(q) else None
    terms = search_terms(q)
    if not terms:
        return None
    conds: list[ColumnElement[bool]] = []
    for term in terms:
        prefix = len(term) >= 2
        tsq = func.to_tsquery("simple", f"{term}:*" if prefix else term)
        conds.append(_matches_anywhere(tsq, _named(_TAG_WORDS, term, prefix), _named(_CATEGORY_WORDS, term, prefix)))
    return and_(*conds)


# ── responses ───────────────────────────────────────────────────────────────────────────────────────


def _summary_dict(
    t: ForumThread, author: User | None, year: int | None, voted: bool, viewer: User | None
) -> dict[str, Any]:
    deleted = t.status == PostStatus.deleted
    return {
        "id": t.id,
        "slug": t.slug,
        "title": t.title,
        "excerpt": "" if deleted else excerpt(t.body),
        "category": t.category,
        "module_id": t.module_id,
        "year": year,
        "tags": list(t.tags or []),
        "author": user_public(author),
        "author_year": t.author_year if t.author_year in (1, 2, 3) else None,
        "created_at": t.created_at,
        "last_activity_at": t.last_activity_at,
        "vote_count": t.vote_count,
        "reply_count": t.reply_count,
        "voted": voted,
        "answered": t.accepted_reply_id is not None,
        "pinned": t.pinned,
        "locked": t.locked,
        "status": t.status.value,
        "image": None if deleted else first_image(t.body),
        "is_mine": viewer is not None and t.author_id == viewer.id,
    }


def _summary_select(viewer: User | None) -> Select[Any]:
    voted: ColumnElement[bool] = (
        exists().where(ThreadVote.thread_id == ForumThread.id, ThreadVote.user_id == viewer.id)
        if viewer is not None
        else false()
    )
    return (
        select(ForumThread, User, _year_expr().label("year"), voted.label("voted"))
        .outerjoin(Module, Module.id == ForumThread.module_id)
        .outerjoin(User, User.id == ForumThread.author_id)
        .options(*_THREAD_OPTS)
    )


def _summaries(rows: Sequence[Row[Any]], viewer: User | None) -> list[ThreadSummary]:
    return [
        ThreadSummary.model_validate(_summary_dict(t, author, year, bool(voted), viewer))
        for t, author, year, voted in rows
    ]


def _reply_dict(r: ForumReply, author: User | None, t: ForumThread, viewer: User | None, voted: bool) -> dict[str, Any]:
    mine = viewer is not None and r.author_id == viewer.id
    deleted = r.status == PostStatus.deleted
    return {
        "id": r.id,
        "thread_id": r.thread_id,
        "parent_id": r.parent_id,
        "author": user_public(author),
        "author_year": r.author_year if r.author_year in (1, 2, 3) else None,
        "body": "" if deleted else r.body,
        "created_at": r.created_at,
        "edited_at": r.edited_at,
        "vote_count": r.vote_count,
        "voted": voted,
        "status": r.status.value,
        "accepted": t.accepted_reply_id == r.id,
        "is_mine": mine,
        "can_edit": (mine or moderates(viewer)) and not deleted,
    }


def reply_out(db: Session, r: ForumReply, t: ForumThread, viewer: User | None) -> Reply:
    author = db.get(User, r.author_id) if r.author_id else None
    voted = viewer is not None and bool(
        db.scalar(select(exists().where(ReplyVote.reply_id == r.id, ReplyVote.user_id == viewer.id)))
    )
    return Reply.model_validate(_reply_dict(r, author, t, viewer, voted))


def _thread_year(db: Session, t: ForumThread) -> int | None:
    cat = CATEGORY_BY_ID.get(t.category)
    if cat is not None and cat.year is not None:
        return cat.year
    return db.scalar(select(Module.year).where(Module.id == t.module_id)) if t.module_id else None


def thread_detail(db: Session, t: ForumThread, viewer: User | None) -> ThreadDetail:
    """The thread with its replies, oldest first (hidden replies only for moderators; deleted ones keep their place)."""
    mod = moderates(viewer)
    mine = viewer is not None and t.author_id == viewer.id
    author = db.get(User, t.author_id) if t.author_id else None
    voted = viewer is not None and bool(
        db.scalar(select(exists().where(ThreadVote.thread_id == t.id, ThreadVote.user_id == viewer.id)))
    )
    statuses = [PostStatus.visible, PostStatus.deleted] + ([PostStatus.hidden] if mod else [])
    rows = db.execute(
        select(ForumReply, User)
        .outerjoin(User, User.id == ForumReply.author_id)
        .where(ForumReply.thread_id == t.id, ForumReply.status.in_(statuses))
        .options(*_REPLY_OPTS)
        .order_by(ForumReply.created_at, ForumReply.id)
    ).all()
    my_votes: set[uuid.UUID] = set()
    if viewer is not None and rows:
        my_votes = set(
            db.scalars(
                select(ReplyVote.reply_id)
                .join(ForumReply, ForumReply.id == ReplyVote.reply_id)
                .where(ReplyVote.user_id == viewer.id, ForumReply.thread_id == t.id)
            )
        )
    data = _summary_dict(t, author, _thread_year(db, t), voted, viewer)
    data.update(
        body="" if t.status == PostStatus.deleted else t.body,
        edited_at=t.edited_at,
        accepted_reply_id=t.accepted_reply_id,
        replies=[_reply_dict(r, a, t, viewer, r.id in my_votes) for r, a in rows],
        can_edit=(mine or mod) and t.status != PostStatus.deleted,
        can_accept=(mine or mod) and t.status == PostStatus.visible,
        can_moderate=mod,
    )
    return ThreadDetail.model_validate(data)


# ── reading ─────────────────────────────────────────────────────────────────────────────────────────


@dataclass(frozen=True, slots=True)
class ThreadFilters:
    q: str | None = None
    category: str | None = None
    module_id: str | None = None
    tag: str | None = None
    year: int | None = None
    unanswered: bool = False  # no visible replies yet
    author_id: uuid.UUID | None = None  # "mine"


def _param(value: str | None) -> str | None:
    """A query-string value without control characters (Postgres refuses NUL; none of them can match anyway)."""
    return _CONTROL_CHARS.sub("", value) if value else value


def list_threads(db: Session, viewer: User | None, f: ThreadFilters, sort: Sort, limit: int, offset: int) -> ThreadPage:
    f = replace(f, q=_param(f.q), module_id=_param(f.module_id), tag=_param(f.tag))
    conds = [_listed(viewer)]
    search = search_condition(f.q) if f.q else None
    if search is not None:
        conds.append(search)
    if f.category:
        conds.append(ForumThread.category == f.category)
    if f.module_id:
        conds.append(ForumThread.module_id == f.module_id)
    if f.tag:
        conds.append(_has_tag(f.tag))
    if f.year is not None:
        conds.append(_year_condition(f.year))
    if f.unanswered:
        conds.append(ForumThread.reply_count == 0)
    if f.author_id is not None:
        conds.append(ForumThread.author_id == f.author_id)
    total = db.scalar(
        select(func.count())
        .select_from(ForumThread)
        .outerjoin(Module, Module.id == ForumThread.module_id)
        .where(*conds)
    )
    order = _order(sort, utcnow(), pinned_first=search is None)
    rows = db.execute(_summary_select(viewer).where(*conds).order_by(*order).limit(limit).offset(offset)).all()
    return ThreadPage(items=_summaries(rows, viewer), total=total or 0, limit=limit, offset=offset)


def hot_threads(db: Session, viewer: User | None, n: int, year: int | None) -> list[ThreadSummary]:
    """The hottest visible threads, pinned ones left out; with `year`, that cohort's plus the forum-wide ones."""
    conds = [ForumThread.status == PostStatus.visible, ForumThread.pinned.is_(False)]
    if year is not None:
        conds.append(_year_condition(year))
    order = _order("hot", utcnow(), pinned_first=False)
    rows = db.execute(_summary_select(viewer).where(*conds).order_by(*order).limit(n)).all()
    return _summaries(rows, viewer)


def related_threads(db: Session, viewer: User | None, t: ForumThread, n: int) -> list[ThreadSummary]:
    """Same module first, then shared tags and category (the prototype's relatedThreads): a score of at least 3."""
    now = utcnow()
    year = _thread_year(db, t)
    score: ColumnElement[Any] = case((ForumThread.category == t.category, 2), else_=0) + func.least(2, _hot_expr(now))
    if t.module_id:
        score = score + case((ForumThread.module_id == t.module_id, 6), else_=0)
    if year is not None:
        score = score + case((_year_expr() == year, 1), else_=0)
    for tag in t.tags or []:
        score = score + case((_has_tag(tag), 2), else_=0)
    rows = db.execute(
        _summary_select(viewer)
        .where(
            ForumThread.id != t.id,
            ForumThread.status == PostStatus.visible,
            ForumThread.pinned.is_(False),
            score >= 3,
        )
        .order_by(score.desc(), ForumThread.created_at.desc(), ForumThread.id.desc())
        .limit(n)
    ).all()
    return _summaries(rows, viewer)


def forum_stats(db: Session) -> ForumStats:
    """Counts over the threads a guest's list shows, replies since midnight in Bahrain, and the week's top helpers."""
    now = utcnow()
    listed = _listed(None)
    by_category = {c.id: 0 for c in CATEGORIES}
    no_replies_by_category = {c.id: 0 for c in CATEGORIES}
    for category, n, unanswered in db.execute(
        select(ForumThread.category, func.count(), func.count().filter(ForumThread.reply_count == 0))
        .where(listed)
        .group_by(ForumThread.category)
    ):
        by_category[category] = n
        no_replies_by_category[category] = unanswered
    tagged = select(ForumThread.category, func.unnest(ForumThread.tags).label("tag")).where(listed).subquery()
    by_tag: dict[str, int] = {}
    tags_by_category: dict[str, dict[str, int]] = {c.id: {} for c in CATEGORIES}
    for category, tag_id, n in db.execute(
        select(tagged.c.category, tagged.c.tag, func.count()).group_by(tagged.c.category, tagged.c.tag)
    ):
        tags_by_category.setdefault(category, {})[tag_id] = n
        by_tag[tag_id] = by_tag.get(tag_id, 0) + n
    midnight = now.astimezone(_bahrain()).replace(hour=0, minute=0, second=0, microsecond=0)
    replies_today = db.scalar(
        select(func.count())
        .select_from(ForumReply)
        .join(ForumThread, ForumThread.id == ForumReply.thread_id)
        .where(
            ForumReply.status == PostStatus.visible,
            ForumThread.status != PostStatus.hidden,
            ForumReply.created_at >= midnight,
        )
    )
    return ForumStats.model_validate(
        {
            "total": sum(by_category.values()),
            "by_category": by_category,
            "replies_today": replies_today or 0,
            "no_replies": sum(no_replies_by_category.values()),
            "top_contributors": _top_contributors(db, now),
            "by_tag": by_tag,
            "no_replies_by_category": no_replies_by_category,
            "tags_by_category": tags_by_category,
        }
    )


def _top_contributors(db: Session, now: datetime) -> list[Contributor]:
    """Replies of the last 7 days: votes from other people on them + 10 per accepted answer. Deleted accounts and
    hidden or deleted replies don't count."""
    since = now - CONTRIBUTOR_WINDOW
    recent = and_(
        ForumReply.created_at >= since,
        ForumReply.status == PostStatus.visible,
        ForumReply.author_id.is_not(None),
        ForumThread.status != PostStatus.hidden,
    )
    others = (
        select(ReplyVote.reply_id, func.count().label("n"))
        .join(ForumReply, ForumReply.id == ReplyVote.reply_id)
        .where(ReplyVote.user_id != ForumReply.author_id, ForumReply.created_at >= since)
        .group_by(ReplyVote.reply_id)
        .subquery()
    )
    per_author = (
        select(
            ForumReply.author_id.label("author_id"),
            func.count(ForumReply.id).label("replies"),
            func.coalesce(func.sum(others.c.n), 0).label("votes"),
            func.count(ForumReply.id).filter(ForumThread.accepted_reply_id == ForumReply.id).label("accepted"),
        )
        .join(ForumThread, ForumThread.id == ForumReply.thread_id)
        .outerjoin(others, others.c.reply_id == ForumReply.id)
        .where(recent)
        .group_by(ForumReply.author_id)
        .subquery()
    )
    score = per_author.c.votes + 10 * per_author.c.accepted
    rows = db.execute(
        select(User, per_author.c.replies, per_author.c.votes, per_author.c.accepted, score)
        .join(per_author, per_author.c.author_id == User.id)
        .order_by(score.desc(), per_author.c.replies.desc(), User.display_name, User.id)
        .limit(TOP_CONTRIBUTORS)
    ).all()
    return [
        Contributor.model_validate(
            {"user": user_public(u), "replies": n, "votes": int(v), "accepted": a, "score": int(s)}
        )
        for u, n, v, a, s in rows
    ]


# ── writing: shared rules ───────────────────────────────────────────────────────────────────────────


def check_rate(
    db: Session,
    created: InstrumentedAttribute[datetime],
    owner: InstrumentedAttribute[uuid.UUID | None],
    owner_id: uuid.UUID,
    limit: int,
    message: str,
) -> None:
    """429 when `owner_id` made `limit` rows in the last hour. Retry-After: when the oldest of them ages out."""
    now = utcnow()
    nth = db.scalar(
        select(created)
        .where(owner == owner_id, created > now - RATE_WINDOW)
        .order_by(created.desc())
        .offset(limit - 1)
        .limit(1)
    )
    if nth is not None:
        raise rate_limited(int((nth + RATE_WINDOW - now).total_seconds()) + 1, message)


def _valid_title(value: str) -> str:
    title = clean_title(value)
    if len(title) < 5:
        raise invalid("title", "Make the title a little longer (at least 5 characters).")
    if not any(unicodedata.category(c)[0] in "LN" for c in title):
        raise invalid("title", "Write the title in words.")
    return title


def _valid_body(value: str, field: str = "body", *, required: bool = False) -> str:
    body = clean_body(value)
    if required and not has_text(body):
        raise invalid(field, "Write something first.")
    if len(media_ids(body)) > MAX_IMAGES_PER_POST:
        raise invalid(field, f"A post can show up to {MAX_IMAGES_PER_POST} pictures.")
    return body


def _valid_tags(tags: Sequence[str]) -> list[str]:
    unique = list(dict.fromkeys(tags))
    if len(unique) > MAX_TAGS:
        raise invalid("tags", f"Pick up to {MAX_TAGS} tags.")
    if any(t not in TAG_BY_ID for t in unique):
        raise invalid("tags", "Pick tags from the list.")
    return unique


def _module(db: Session, module_id: str | None) -> Module | None:
    if not module_id:
        return None
    m = None if _CONTROL_CHARS.search(module_id) or len(module_id) > 64 else db.get(Module, module_id)
    if m is None:
        raise invalid("moduleId", "Pick a module from the list.")
    return m


def _thread_slug(db: Session, title: str, attempt: int) -> str:
    base = slugify(title) or "thread"
    if base in RESERVED_SLUGS:
        base = f"{base}-thread"
    if attempt:  # someone took it between our check and our insert
        base = f"{base}-{secrets.token_hex(3)}"
    return unique_slug(db, ForumThread.slug, base, fallback="thread")


def _bump_thread(db: Session, t: ForumThread, *, replies: int = 0, activity: datetime | None = None) -> None:
    """reply_count (+/-) and last_activity_at, in SQL, then mirrored on the loaded object."""
    values: dict[str, Any] = {}
    if replies:
        values["reply_count"] = func.greatest(ForumThread.reply_count + replies, 0)
    if activity is not None:
        values["last_activity_at"] = activity
    if not values:
        return
    row = db.execute(
        update(ForumThread)
        .where(ForumThread.id == t.id)
        .values(**values)
        .returning(ForumThread.reply_count, ForumThread.last_activity_at)
        .execution_options(synchronize_session=False)
    ).one()
    set_committed_value(t, "reply_count", row.reply_count)
    set_committed_value(t, "last_activity_at", row.last_activity_at)


def attach_images(db: Session, owner_id: uuid.UUID | None, body: str) -> None:
    """Forum images the post shows that its author uploaded become 'attached' (so the daily sweep keeps them)."""
    ids = media_ids(body)
    if not ids or owner_id is None:
        return
    db.execute(
        update(Upload)
        .where(
            Upload.id.in_(ids),
            Upload.user_id == owner_id,
            Upload.purpose == UploadPurpose.forum_image,
            Upload.status == UploadStatus.uploaded,
        )
        .values(status=UploadStatus.attached)
        .execution_options(synchronize_session="fetch")
    )


def release_images(db: Session, ids: Iterable[uuid.UUID]) -> None:
    """Images a post no longer shows go back to 'uploaded' (the daily sweep deletes them), unless another post shows
    them too. Call after the post's new body is in the session."""
    ids = list(ids)[:MAX_IMAGES_PER_POST]
    if not ids:
        return
    db.flush()
    for image_id in ids:
        pattern = f"%/api/v1/media/{image_id}%"
        in_use = db.scalar(
            select(exists().where(ForumThread.body.ilike(pattern)) | exists().where(ForumReply.body.ilike(pattern)))
        )
        if not in_use:
            db.execute(
                update(Upload)
                .where(
                    Upload.id == image_id,
                    Upload.purpose == UploadPurpose.forum_image,
                    Upload.status == UploadStatus.attached,
                )
                .values(status=UploadStatus.uploaded)
                .execution_options(synchronize_session="fetch")
            )


def _status_before_hide(db: Session, kind: Literal["thread", "reply"], target_id: uuid.UUID) -> PostStatus:
    """What unhiding restores: 'deleted' when the post was already deleted by its author when it was hidden."""
    data = db.scalar(
        select(AuditEntry.data)
        .where(
            AuditEntry.action == f"forum.{kind}.hide",
            AuditEntry.target_type == kind,
            AuditEntry.target_id == str(target_id),
        )
        .order_by(AuditEntry.id.desc())
        .limit(1)
    )
    return PostStatus.deleted if data and data.get("from") == PostStatus.deleted.value else PostStatus.visible


def _place(category: str | None, module: Module | None, *, module_wins: bool) -> tuple[str, Module | None]:
    """Where a thread lives. A year category that disagrees with the module's year follows the module when the module
    was the person's choice, and drops the module when the category was (as the prototype's composer does)."""
    if category is None:
        return (category_for_year(module.year) if module else None) or "general", module
    cat = CATEGORY_BY_ID[category]
    if module is not None and cat.year is not None and cat.year != module.year:
        if module_wins:
            return category_for_year(module.year) or category, module
        return category, None
    return category, module


# ── writing: threads ────────────────────────────────────────────────────────────────────────────────


def create_thread(db: Session, user: User, data: ThreadCreate) -> ForumThread:
    """A new thread, upvoted by its author. Its forum images are attached."""
    title = _valid_title(data.title)
    body = _valid_body(data.body)
    category, module = _place(data.category, _module(db, data.module_id), module_wins=True)
    tags = _valid_tags(data.tags)
    check_rate(
        db,
        ForumThread.created_at,
        ForumThread.author_id,
        user.id,
        THREADS_PER_HOUR,
        f"You've started {THREADS_PER_HOUR} threads in the last hour. Try again later.",
    )
    now = utcnow()
    t = ForumThread(
        title=title,
        body=body,
        category=category,
        module_id=module.id if module else None,
        tags=tags,
        author_id=user.id,
        author_year=user.year,
        status=PostStatus.visible,
        pinned=False,
        locked=False,
        vote_count=1,
        reply_count=0,
        created_at=now,
        last_activity_at=now,
    )
    for attempt in range(3):
        t.slug = _thread_slug(db, title, attempt)
        try:
            with db.begin_nested():
                db.add(t)
            break
        except IntegrityError:  # the slug was taken in the meantime
            continue
    else:
        raise conflict("busy", "Something went wrong. Try again.")
    db.add(ThreadVote(user_id=user.id, thread_id=t.id))
    attach_images(db, user.id, body)
    return t


def update_thread(db: Session, user: User, t: ForumThread, data: ThreadUpdate, ip: str | None) -> None:
    """The author or a moderator edits the thread (its slug stays, so links keep working)."""
    mine = t.author_id == user.id
    if not (mine or moderates(user)):
        raise forbidden("You can only edit your own threads.")
    if t.status == PostStatus.deleted:
        raise _unavailable(t.status)
    given = data.model_fields_set
    changed: list[str] = []
    old_body = t.body
    if "title" in given and data.title is not None:
        title = _valid_title(data.title)
        if title != t.title:
            t.title = title
            changed.append("title")
    if "body" in given and data.body is not None:
        body = _valid_body(data.body)
        if body != t.body:
            t.body = body
            changed.append("body")
    if "module_id" in given or ("category" in given and data.category is not None):
        module = _module(db, data.module_id) if "module_id" in given else _module(db, t.module_id)
        category = data.category if "category" in given and data.category is not None else t.category
        category, module = _place(category, module, module_wins="module_id" in given)
        module_id = module.id if module else None
        if category != t.category:
            t.category = category
            changed.append("category")
        if module_id != t.module_id:
            t.module_id = module_id
            changed.append("module_id")
    if "tags" in given and data.tags is not None:
        tags = _valid_tags(data.tags)
        if tags != list(t.tags or []):
            t.tags = tags
            changed.append("tags")
    if not changed:
        return
    t.edited_at = utcnow()
    if "body" in changed:
        attach_images(db, t.author_id, t.body)
        release_images(db, set(media_ids(old_body)) - set(media_ids(t.body)))
    if not mine:
        _audit(db, user, "forum.thread.edit", "thread", t.id, ip, title=t.title, fields=changed)


def delete_thread(db: Session, user: User, thread_id: uuid.UUID, ip: str | None) -> None:
    """The author or a moderator deletes the thread: its text goes, its title and replies stay. Idempotent."""
    t = get_thread(db, thread_id)
    if t is None or (t.status == PostStatus.hidden and not moderates(user)):
        raise not_found("This thread doesn't exist or was removed.")
    mine = t.author_id == user.id
    if not (mine or moderates(user)):
        if not can_see_thread(t, user):
            raise not_found("This thread doesn't exist or was removed.")
        raise forbidden("You can only delete your own threads.")
    if t.status == PostStatus.deleted:
        return
    old_body = t.body
    t.status = PostStatus.deleted
    t.body = ""  # the text really goes: search and excerpts can't find it any more
    t.pinned = False
    release_images(db, media_ids(old_body))
    if not mine:
        _audit(db, user, "forum.thread.delete", "thread", t.id, ip, title=t.title)


def vote(
    db: Session, user: User, target: ForumThread | ForumReply, up: bool, thread: ForumThread | None = None
) -> VoteResult:
    """Upvote, or take the vote back. Idempotent; the counter moves in SQL in the same transaction.
    Deleted and hidden posts (and replies in a hidden thread) take no votes."""
    if target.status != PostStatus.visible:
        raise _unavailable(target.status)
    if thread is not None and thread.status == PostStatus.hidden:
        raise _unavailable(thread.status)
    if isinstance(target, ForumThread):
        if up:
            changed = db.execute(
                pg_insert(ThreadVote)
                .values(user_id=user.id, thread_id=target.id)
                .on_conflict_do_nothing()
                .returning(ThreadVote.thread_id)
            ).first()
        else:
            changed = db.execute(
                delete(ThreadVote)
                .where(ThreadVote.user_id == user.id, ThreadVote.thread_id == target.id)
                .returning(ThreadVote.thread_id)
            ).first()
        model: type[ForumThread] | type[ForumReply] = ForumThread
    else:
        if up:
            changed = db.execute(
                pg_insert(ReplyVote)
                .values(user_id=user.id, reply_id=target.id)
                .on_conflict_do_nothing()
                .returning(ReplyVote.reply_id)
            ).first()
        else:
            changed = db.execute(
                delete(ReplyVote)
                .where(ReplyVote.user_id == user.id, ReplyVote.reply_id == target.id)
                .returning(ReplyVote.reply_id)
            ).first()
        model = ForumReply
    if changed is not None:
        delta = 1 if up else -1
        count = db.execute(
            update(model)
            .where(model.id == target.id)
            .values(vote_count=func.greatest(model.vote_count + delta, 0))
            .returning(model.vote_count)
            .execution_options(synchronize_session=False)
        ).scalar_one()
    else:  # nothing to change: report the count as it is now
        count = db.scalar(select(model.vote_count).where(model.id == target.id)) or 0
    set_committed_value(target, "vote_count", count)
    return VoteResult(vote_count=count, voted=up)


def accept_answer(db: Session, user: User, t: ForumThread, reply_id: uuid.UUID | None, ip: str | None) -> None:
    """The thread's author (or a moderator) marks a direct reply by someone else as the answer, or clears it."""
    mine = t.author_id == user.id
    if not (mine or moderates(user)):
        raise forbidden("Only the person who asked can accept an answer.")
    if t.status != PostStatus.visible:
        raise _unavailable(t.status)
    if reply_id is None:
        if t.accepted_reply_id is not None:
            t.accepted_reply_id = None
            if not mine:
                _audit(db, user, "forum.thread.accept", "thread", t.id, ip, title=t.title, replyId=None)
        return
    r = db.get(ForumReply, reply_id, options=_REPLY_OPTS)
    if r is None or r.thread_id != t.id or not can_see_reply(r, user):
        raise not_found("This reply doesn't exist or was removed.")
    if r.status != PostStatus.visible:
        raise invalid("replyId", "Pick a reply that's still showing.")
    if r.parent_id is not None:
        raise invalid("replyId", "Only a direct reply to the question can be the answer.")
    if t.author_id is not None and r.author_id == t.author_id:
        raise invalid("replyId", "You can't accept your own reply.")
    if t.accepted_reply_id == r.id:
        return
    t.accepted_reply_id = r.id
    if r.author_id is not None:
        notify(
            db,
            r.author_id,
            "answer_accepted",
            "Your reply was accepted as the answer",
            body=f"“{t.title}”",
            url=f"/forum/{t.slug}",
            actor=user,
            data={"threadId": str(t.id), "replyId": str(r.id)},
        )
    if not mine:
        _audit(db, user, "forum.thread.accept", "thread", t.id, ip, title=t.title, replyId=str(r.id))


def moderate_thread(db: Session, user: User, t: ForumThread, data: ThreadModeration, ip: str | None) -> None:
    """Pin, lock or hide (a moderator). Each change is audited as forum.thread.<action>."""
    require_moderator(user)
    info: dict[str, Any] = {"title": t.title, "slug": t.slug}
    if data.pinned is not None and data.pinned != t.pinned:
        t.pinned = data.pinned
        _audit(db, user, f"forum.thread.{'pin' if data.pinned else 'unpin'}", "thread", t.id, ip, **info)
    if data.locked is not None and data.locked != t.locked:
        t.locked = data.locked
        _audit(db, user, f"forum.thread.{'lock' if data.locked else 'unlock'}", "thread", t.id, ip, **info)
    if data.status == "hidden" and t.status != PostStatus.hidden:
        _audit(db, user, "forum.thread.hide", "thread", t.id, ip, **info, **{"from": t.status.value})
        t.status = PostStatus.hidden
    elif data.status == "visible" and t.status == PostStatus.hidden:
        t.status = _status_before_hide(db, "thread", t.id)
        _audit(db, user, "forum.thread.unhide", "thread", t.id, ip, **info, to=t.status.value)
    elif data.status == "visible" and t.status == PostStatus.deleted:
        raise _unavailable(t.status)


# ── writing: replies ────────────────────────────────────────────────────────────────────────────────


def _set_reply_status(db: Session, r: ForumReply, t: ForumThread, new: PostStatus) -> None:
    """Keeps the thread's reply_count = its visible replies, and drops the accepted answer when it stops showing."""
    old = r.status
    if old == new:
        return
    r.status = new
    delta = int(new == PostStatus.visible) - int(old == PostStatus.visible)
    if delta:
        _bump_thread(db, t, replies=delta)
    if new != PostStatus.visible and t.accepted_reply_id == r.id:
        t.accepted_reply_id = None


def create_reply(db: Session, user: User, t: ForumThread, data: ReplyCreate) -> ForumReply:
    """A reply (to the thread, or to one of its top-level replies). Notifies the thread's author and the parent
    reply's author. Moderators may still reply to a locked thread."""
    if t.status != PostStatus.visible:
        what = "was deleted" if t.status == PostStatus.deleted else "is hidden"
        raise conflict("thread_locked", f"This thread {what}, so it can't take new replies.")
    if t.locked and not moderates(user):
        raise conflict("thread_locked", "This thread is locked, so it can't take new replies.")
    body = _valid_body(data.body, required=True)
    parent: ForumReply | None = None
    if data.parent_id is not None:
        parent = db.get(ForumReply, data.parent_id, options=_REPLY_OPTS)
        if parent is None or parent.thread_id != t.id or not can_see_reply(parent, user):
            raise not_found("The reply you're answering doesn't exist or was removed.")
        if parent.status != PostStatus.visible:
            raise invalid("parentId", "You can't reply to a deleted or hidden reply.")
        if parent.parent_id is not None:
            raise invalid("parentId", "Reply to the first reply in that conversation instead.")
    check_rate(
        db,
        ForumReply.created_at,
        ForumReply.author_id,
        user.id,
        REPLIES_PER_HOUR,
        f"You've posted {REPLIES_PER_HOUR} replies in the last hour. Try again later.",
    )
    now = utcnow()
    r = ForumReply(
        thread_id=t.id,
        parent_id=parent.id if parent else None,
        author_id=user.id,
        author_year=user.year,
        body=body,
        status=PostStatus.visible,
        vote_count=0,
        created_at=now,
    )
    db.add(r)
    db.flush()
    _bump_thread(db, t, replies=1, activity=now)
    attach_images(db, user.id, body)
    name = user.display_name or "Someone"
    url = f"/forum/{t.slug}"
    info = {"threadId": str(t.id), "replyId": str(r.id)}
    quoted = f"“{t.title}”"
    parent_author = parent.author_id if parent else None
    if parent_author is not None:
        notify(db, parent_author, "reply_reply", f"{name} replied to you", body=quoted, url=url, actor=user, data=info)
    if t.author_id is not None and t.author_id != parent_author:  # one notification each, the closer one wins
        notify(
            db,
            t.author_id,
            "thread_reply",
            f"{name} replied to your thread",
            body=quoted,
            url=url,
            actor=user,
            data=info,
        )
    return r


def update_reply(db: Session, user: User, r: ForumReply, t: ForumThread, body: str, ip: str | None) -> None:
    mine = r.author_id == user.id
    if not (mine or moderates(user)):
        raise forbidden("You can only edit your own replies.")
    if r.status == PostStatus.deleted:
        raise _unavailable(r.status)
    new_body = _valid_body(body, required=True)
    if new_body == r.body:
        return
    old_body = r.body
    r.body = new_body
    r.edited_at = utcnow()
    attach_images(db, r.author_id, new_body)
    release_images(db, set(media_ids(old_body)) - set(media_ids(new_body)))
    if not mine:
        _audit(db, user, "forum.reply.edit", "reply", r.id, ip, title=t.title, threadId=str(t.id))


def delete_reply(db: Session, user: User, r: ForumReply, t: ForumThread, ip: str | None) -> None:
    """The author or a moderator deletes a reply: it keeps its place with no text. Idempotent."""
    mine = r.author_id == user.id
    if not (mine or moderates(user)):
        raise forbidden("You can only delete your own replies.")
    if r.status == PostStatus.deleted:
        return
    old_body = r.body
    _set_reply_status(db, r, t, PostStatus.deleted)
    r.body = ""
    release_images(db, media_ids(old_body))
    if not mine:
        _audit(db, user, "forum.reply.delete", "reply", r.id, ip, title=t.title, threadId=str(t.id))


def moderate_reply(db: Session, user: User, r: ForumReply, t: ForumThread, status: str, ip: str | None) -> None:
    """Hide a reply, or show it again (a hidden reply that was deleted before goes back to deleted). Audited."""
    require_moderator(user)
    info = {"title": t.title, "threadId": str(t.id)}
    if status == "hidden" and r.status != PostStatus.hidden:
        _audit(db, user, "forum.reply.hide", "reply", r.id, ip, **info, **{"from": r.status.value})
        _set_reply_status(db, r, t, PostStatus.hidden)
    elif status == "visible" and r.status == PostStatus.hidden:
        restored = _status_before_hide(db, "reply", r.id)
        _set_reply_status(db, r, t, restored)
        _audit(db, user, "forum.reply.unhide", "reply", r.id, ip, **info, to=restored.value)
    elif status == "visible" and r.status == PostStatus.deleted:
        raise _unavailable(r.status)


# ── reports ─────────────────────────────────────────────────────────────────────────────────────────


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
        for t in db.scalars(select(ForumThread).where(ForumThread.id.in_(ids["thread"])).options(*_THREAD_OPTS)):
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
            .options(*_REPLY_OPTS, *_THREAD_OPTS)
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
        r = db.get(ForumReply, target_id, options=_REPLY_OPTS)
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
        raise conflict("already_reported", "You've already reported this. A student rep will look at it soon.")
    check_rate(
        db,
        Report.created_at,
        Report.reporter_id,
        user.id,
        REPORTS_PER_HOUR,
        "You've sent a lot of reports in the last hour. Try again later.",
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
    except IntegrityError:  # the same report, sent twice at once
        raise conflict(
            "already_reported", "You've already reported this. A student rep will look at it soon."
        ) from None
    return report


def _report_outs(db: Session, reports: Sequence[Report], viewer: User) -> list[ReportOut]:
    """Reports for the moderators' queue. Who reported is shown to admins only: student reps are classmates
    (security review, finding 22)."""
    show_reporter = is_admin(viewer)
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
                    "target_author": user_public(people.get(target.author_id)) if target and target.author_id else None,
                    "reason": r.reason,
                    "note": r.note,
                    "status": r.status.value,
                    "reporter": user_public(people.get(r.reporter_id)) if show_reporter and r.reporter_id else None,
                    "created_at": r.created_at,
                    "resolved_by": user_public(people.get(r.resolved_by)) if r.resolved_by else None,
                    "resolved_at": r.resolved_at,
                    "resolution_note": r.resolution_note,
                }
            )
        )
    return out


def list_reports(db: Session, user: User, status: str, limit: int, offset: int) -> ReportPage:
    """Open reports oldest first (a queue); closed ones most recently closed first."""
    require_moderator(user)
    st = ReportStatus(status)
    total = db.scalar(select(func.count()).select_from(Report).where(Report.status == st)) or 0
    order: list[Any] = (
        [Report.created_at.asc(), Report.id]
        if st == ReportStatus.open
        else [Report.resolved_at.desc().nulls_last(), Report.created_at.desc(), Report.id]
    )
    reports = db.scalars(select(Report).where(Report.status == st).order_by(*order).limit(limit).offset(offset)).all()
    return ReportPage(items=_report_outs(db, reports, user), total=total, limit=limit, offset=offset)


_TARGET_WORDS = {"thread": "the thread", "reply": "a reply in", "library_item": "the library file"}


def resolve_report(db: Session, user: User, report_id: uuid.UUID, data: ReportResolve, ip: str | None) -> ReportOut:
    """Close a report (resolved: a moderator acted; dismissed: left as it is). Tells the reporter. Audited."""
    require_moderator(user)
    report = db.get(Report, report_id)
    if report is None:
        raise not_found("This report doesn't exist.")
    if report.status != ReportStatus.open:
        raise conflict("report_closed", "This report was already closed.")
    note = clean_body(data.note) if data.note else ""
    report.status = ReportStatus(data.status)
    report.resolved_by = user.id
    report.resolved_at = utcnow()
    report.resolution_note = note or None
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
    _audit(
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
