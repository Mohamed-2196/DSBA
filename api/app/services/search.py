"""Search: the text query every search box uses, plain-text snippets, and the site-wide search.

A query is full text on the generated `search_vector` columns ('simple' configuration): websearch_to_tsquery for
what was typed ("quoted phrases", -exclusions, or), with a prefix match on the last word, so results appear while
the word is still being typed ("distribution theo" finds "Distribution Theory"). Modules and calendar events have
no search vector: they match when every word starts a word of their name, title or code."""

from __future__ import annotations

import re
from datetime import datetime, time
from typing import Any

from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from app.models import (
    CalendarEvent,
    ForumThread,
    IssueStatus,
    ItemStatus,
    LibraryItem,
    Module,
    NewsletterIssue,
    PostStatus,
)
from app.schemas.misc import SearchHit, SearchResults, SearchType
from app.services import library as lib
from app.services.calendar import BAHRAIN, TYPE_LABELS, bahrain_today, cohort_label
from app.services.newsletter import issue_text

WORD_RE = re.compile(r"[^\W_]+")
SNIPPET_RADIUS = 80
ALL_TYPES: tuple[SearchType, ...] = ("thread", "library", "issue", "module", "event")

# What students type for modules (from the prototype's search palette).
MODULE_ALIASES: dict[str, tuple[str, ...]] = {
    "stats": ("statistic",),
    "stat": ("statistic",),
    "maths": ("mathemat",),
    "math": ("mathemat",),
    "metrics": ("econometric",),
    "ml": ("machine learning",),
    "ai": ("machine learning",),
    "coding": ("programming",),
    "python": ("programming",),
    "sql": ("programming",),
    "ba": ("business analytics",),
}
CATEGORY_LABELS = {
    "year-1": "Year 1",
    "year-2": "Year 2",
    "year-3": "Year 3",
    "study-groups": "Study groups",
    "general": "General",
}


# ── the query ────────────────────────────────────────────────────────────────────────────────


def words(q: str) -> list[str]:
    """Lower-cased words of a query: letters and digits only, so they are safe in LIKE, regex and tsquery."""
    return [w.lower() for w in WORD_RE.findall(q)]


def text_query(q: str) -> ColumnElement[Any] | None:
    """websearch_to_tsquery('simple', q), with the last word matched as a prefix. None when q has no words.

    The last word stays exact when it closes a "quoted phrase" or is an -exclusion."""
    q = q.strip()
    found = list(WORD_RE.finditer(q))
    if not found:
        return None
    last = found[-1]
    head, tail = q[: last.start()], q[last.end() :]
    in_phrase = '"' in tail or head.count('"') % 2 == 1
    negated = head.endswith("-") and (len(head) == 1 or head[-2].isspace())
    if in_phrase or negated:
        return func.websearch_to_tsquery("simple", q)
    # The word holds only letters and digits: no tsquery syntax can get through.
    prefix = func.to_tsquery("simple", f"{last.group(0).lower()}:*")
    if not WORD_RE.search(head):
        return prefix
    return func.websearch_to_tsquery("simple", head).op("&&")(prefix)


def _starts_word(column: Any, word: str) -> ColumnElement[bool]:
    """column has a word starting with `word` (case-insensitive; `word` is letters and digits only)."""
    pattern = r"\m" + word.replace(" ", r"\s+")
    return func.coalesce(column, "").op("~*")(pattern)


# ── plain text and snippets ──────────────────────────────────────────────────────────────────

_MD_RULES: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"```[^\n]*\n?"), " "),  # code fences (the code itself stays)
    (re.compile(r"!\[([^\]]*)\]\([^)]*\)"), r"\1"),  # images -> alt text
    (re.compile(r"\[([^\]]+)\]\([^)]*\)"), r"\1"),  # links -> their text
    (re.compile(r"<[^>]{0,200}>"), " "),  # stray tags
    (re.compile(r"^\s{0,3}(?:#{1,6}|>|[-*+]|\d{1,3}[.)])\s+", re.M), ""),  # headings, quotes, list markers
    (re.compile(r"(\*\*|__|~~|==|`)"), ""),  # emphasis and code markers
    (re.compile(r"(?<![\w*])\*(?=\S)([^*\n]+)(?<=\S)\*(?![\w*])"), r"\1"),  # *italic*
)


def plain_text(markdown: str) -> str:
    """Markdown (forum posts, newsletter copy) as one line of plain text."""
    s = markdown or ""
    for rx, repl in _MD_RULES:
        s = rx.sub(repl, s)
    return re.sub(r"\s+", " ", s).strip()


def snippet(text: str | None, terms: list[str], radius: int = SNIPPET_RADIUS) -> str | None:
    """About 2 x radius characters of plain text around the first match of any term, cut at word boundaries."""
    t = re.sub(r"\s+", " ", text or "").strip()
    if not t:
        return None
    low = t.lower()
    hits = [i for i in (low.find(term) for term in terms) if i >= 0]
    if not hits:
        if len(t) <= radius * 2:
            return t
        cut = t[: radius * 2]
        return cut[: cut.rfind(" ")].rstrip(" ,.;:") + "…" if " " in cut else cut + "…"
    i = min(hits)
    start, end = max(0, i - radius), min(len(t), i + radius)
    if start > 0:
        space = t.find(" ", start, i)
        start = space + 1 if space >= 0 else start
    if end < len(t):
        space = t.rfind(" ", i, end)
        end = space if space > i else end
    return f"{'…' if start > 0 else ''}{t[start:end].strip()}{'…' if end < len(t) else ''}"


# ── the site-wide search ─────────────────────────────────────────────────────────────────────


def _threads(db: Session, tsq: ColumnElement[Any], terms: list[str], limit: int) -> list[SearchHit]:
    rank = func.ts_rank(ForumThread.search_vector, tsq)
    rows = db.execute(
        select(
            ForumThread.id,
            ForumThread.slug,
            ForumThread.title,
            ForumThread.body,
            ForumThread.category,
            ForumThread.reply_count,
            ForumThread.last_activity_at,
            Module.unit_code,
        )
        .outerjoin(Module, Module.id == ForumThread.module_id)
        .where(ForumThread.status == PostStatus.visible, ForumThread.search_vector.bool_op("@@")(tsq))
        .order_by(rank.desc(), ForumThread.last_activity_at.desc())
        .limit(limit)
    ).all()
    hits = []
    for r in rows:
        replies = f"{r.reply_count} {'reply' if r.reply_count == 1 else 'replies'}"
        where = r.unit_code or CATEGORY_LABELS.get(r.category)
        hits.append(
            SearchHit(
                type="thread",
                id=str(r.id),
                title=r.title,
                snippet=snippet(plain_text(r.body), terms),
                url=f"/forum/{r.slug}",
                meta=" · ".join(p for p in (where, replies) if p),
                date=r.last_activity_at,
            )
        )
    return hits


def _library(db: Session, tsq: ColumnElement[Any], terms: list[str], limit: int) -> list[SearchHit]:
    doc = lib.search_document()
    rows = db.execute(
        select(LibraryItem, Module.unit_code, Module.short_name)
        .outerjoin(Module, Module.id == LibraryItem.module_id)
        .where(LibraryItem.status == ItemStatus.published, doc.bool_op("@@")(tsq))
        .order_by(func.ts_rank(doc, tsq).desc(), LibraryItem.published_at.desc().nulls_last())
        .limit(limit)
    ).all()
    hits = []
    for item, code, short in rows:
        about = item.description or (f"By {item.author_name}" if item.author_name else None) or item.file_name
        hits.append(
            SearchHit(
                type="library",
                id=str(item.id),
                title=item.title,
                snippet=snippet(about, terms),
                url=f"/library/{item.slug}",
                meta=" · ".join(p for p in (code or short, lib.kind_label(item.kind)) if p),
                date=item.published_at,
            )
        )
    return hits


def _issues(db: Session, tsq: ColumnElement[Any], terms: list[str], limit: int) -> list[SearchHit]:
    issues = db.scalars(
        select(NewsletterIssue)
        .where(NewsletterIssue.status == IssueStatus.published, NewsletterIssue.search_vector.bool_op("@@")(tsq))
        .order_by(func.ts_rank(NewsletterIssue.search_vector, tsq).desc(), NewsletterIssue.date.desc())
        .limit(limit)
    ).all()
    hits = []
    for issue in issues:
        parts = issue_text(issue)
        source = next((p for p in parts if any(t in p.lower() for t in terms)), parts[0] if parts else "")
        hits.append(
            SearchHit(
                type="issue",
                id=str(issue.id),
                title=issue.title,
                snippet=snippet(source, terms),
                url=f"/newsletter/{issue.slug}",
                meta=f"Issue {issue.number:02d} · {issue.date.day} {issue.date:%b %Y}",
                date=issue.published_at,
            )
        )
    return hits


def _module_word(word: str) -> ColumnElement[bool]:
    options = [word, *MODULE_ALIASES.get(word, ())]
    return or_(
        Module.unit_code.ilike(f"%{word}%"),
        *(_starts_word(Module.name, w) for w in options),
        *(_starts_word(Module.short_name, w) for w in options),
    )


def _modules(db: Session, terms: list[str], limit: int) -> list[SearchHit]:
    mods = db.scalars(
        select(Module).where(and_(*(_module_word(t) for t in terms))).order_by(Module.position, Module.id).limit(limit)
    ).all()
    return [
        SearchHit(
            type="module",
            id=m.id,
            title=m.name,
            snippet=snippet(m.description, [], radius=70),
            url=f"/modules/{m.id}",
            meta=" · ".join(p for p in (m.unit_code, f"Year {m.year}") if p),
            date=None,
        )
        for m in mods
    ]


def _event_word(word: str) -> ColumnElement[bool]:
    return or_(
        _starts_word(CalendarEvent.title, word),
        CalendarEvent.unit_code.ilike(f"%{word}%"),
        _starts_word(Module.name, word),
        _starts_word(Module.short_name, word),
    )


def _events(db: Session, terms: list[str], limit: int) -> list[SearchHit]:
    today = bahrain_today()
    upcoming = func.coalesce(CalendarEvent.end_date, CalendarEvent.date) >= today
    rows = db.scalars(
        select(CalendarEvent)
        .outerjoin(Module, Module.id == CalendarEvent.module_id)
        .where(and_(*(_event_word(t) for t in terms)))
        # what is still ahead first (soonest first), then the past (latest first)
        .order_by(
            upcoming.desc(),
            case((upcoming, CalendarEvent.date), else_=None).asc(),
            CalendarEvent.date.desc(),
            CalendarEvent.id,
        )
        .limit(limit)
    ).all()
    hits = []
    for e in rows:
        details = ", ".join(p for p in (e.time, e.place) if p) or None
        if e.sample:
            details = f"{details}. " if details else ""
            details += "Sample date, not confirmed yet."
        hits.append(
            SearchHit(
                type="event",
                id=e.id,
                title=e.title,
                snippet=details,
                url=f"/calendar?date={e.date.isoformat()}&event={e.id}",
                meta=f"{TYPE_LABELS.get(e.type, 'Event')} · {cohort_label(e.year)}",
                date=datetime.combine(e.date, time(0), tzinfo=BAHRAIN),
            )
        )
    return hits


def run_search(db: Session, q: str, types: list[SearchType] | None, limit: int) -> SearchResults:
    want = set(types or ALL_TYPES)
    terms = words(q)
    tsq = text_query(q)
    results = SearchResults(query=q, threads=[], library=[], issues=[], modules=[], events=[])
    if not terms or tsq is None:
        return results
    if "thread" in want:
        results.threads = _threads(db, tsq, terms, limit)
    if "library" in want:
        results.library = _library(db, tsq, terms, limit)
    if "issue" in want:
        results.issues = _issues(db, tsq, terms, limit)
    if "module" in want:
        results.modules = _modules(db, terms, limit)
    if "event" in want:
        results.events = _events(db, terms, limit)
    return results
