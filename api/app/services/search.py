"""Search: the text query every search box uses, plain-text snippets, and the site-wide search.

A query is full text on the generated `search_vector` columns ('simple' configuration): websearch_to_tsquery for
what was typed ("quoted phrases", -exclusions, or), with a prefix match on the last word, so results appear while
the word is still being typed ("distribution theo" finds "Distribution Theory"). Modules and calendar events have
no search vector: they match when every word starts a word of their name, title or code; so do chapters and
lessons. Library files match inside their text too (app/services/paper_text.py)."""

from __future__ import annotations

import re
from datetime import datetime, time
from typing import Any

from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from app.core.access import Feature
from app.core.text import snippet
from app.core.time import BAHRAIN, bahrain_today
from app.models import (
    CalendarEvent,
    Chapter,
    ForumCategory,
    ForumThread,
    IssueStatus,
    ItemStatus,
    Lesson,
    LibraryItem,
    Module,
    NewsletterIssue,
    PostStatus,
    User,
)
from app.schemas.misc import SearchHit, SearchResults, SearchType
from app.services import access, paper_text
from app.services import library as lib
from app.services.calendar import TYPE_LABELS, cohort_label
from app.services.exam_names import zone_label
from app.services.forum.text import to_plain_text  # a post reads the same in search as in the forum (CQ-6)
from app.services.newsletter import issue_text

WORD_RE = re.compile(r"[^\W_]+")
ALL_TYPES: tuple[SearchType, ...] = ("thread", "library", "issue", "module", "lesson", "event")
# The feature each type of result belongs to (modules belong to none: the hub itself).
TYPE_FEATURES: dict[SearchType, Feature] = {
    "thread": Feature.forum,
    "library": Feature.library,
    "issue": Feature.newsletter,
    "event": Feature.calendar,
}

# What students type for modules: other names that find them.
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


# ── the site-wide search ─────────────────────────────────────────────────────────────────────


def _threads(db: Session, tsq: ColumnElement[Any], terms: list[str], limit: int) -> list[SearchHit]:
    rank = func.ts_rank(ForumThread.search_vector, tsq)
    rows = db.execute(
        select(
            ForumThread.id,
            ForumThread.slug,
            ForumThread.title,
            ForumThread.body,
            ForumCategory.label.label("category"),
            ForumThread.reply_count,
            ForumThread.last_activity_at,
            Module.unit_code,
        )
        .join(ForumCategory, ForumCategory.id == ForumThread.category)
        .outerjoin(Module, Module.id == ForumThread.module_id)
        .where(ForumThread.status == PostStatus.visible, ForumThread.search_vector.bool_op("@@")(tsq))
        .order_by(rank.desc(), ForumThread.last_activity_at.desc())
        .limit(limit)
    ).all()
    hits = []
    for r in rows:
        replies = f"{r.reply_count} {'reply' if r.reply_count == 1 else 'replies'}"
        where = r.unit_code or r.category
        hits.append(
            SearchHit(
                type="thread",
                id=str(r.id),
                title=r.title,
                snippet=snippet(to_plain_text(r.body, image_alt=True), terms),
                url=f"/forum/{r.slug}",
                meta=" · ".join(p for p in (where, replies) if p),
                date=r.last_activity_at,
                page=None,
            )
        )
    return hits


def _library_meta(item: LibraryItem, module: str | None) -> list[str]:
    """What tells two files apart, first: 'May 2021 examiners\u2019 report', 'zone A', then the module
    ('ST2133'); for other files their kind and module."""
    if item.exam_year is not None:
        when = f"{(item.exam_session or '').capitalize()} {item.exam_year}".strip()
        meta = [f"{when} {lib.kind_label(item.kind).lower()}"]
        if item.zone:
            meta.append(zone_label(item.zone))
        return [*meta, module or ""]
    return [lib.kind_label(item.kind), module or ""]


def _library(
    db: Session, tsq: ColumnElement[Any], terms: list[str], limit: int, viewer: User | None
) -> list[SearchHit]:
    """Files whose title, description, author or module match first (the viewer's year first among them); then
    those that match only inside (their snippet and page come from the text). A second copy of a file is left out
    (library.duplicate)."""
    doc = lib.search_document()
    in_doc = doc.bool_op("@@")(tsq)
    rows = db.execute(
        select(LibraryItem, Module.unit_code, Module.short_name)
        .outerjoin(Module, Module.id == LibraryItem.module_id)
        .where(LibraryItem.status == ItemStatus.published, ~lib.duplicate(), or_(in_doc, paper_text.content_match(tsq)))
        .order_by(
            in_doc.desc(),
            *lib.your_year_first(viewer),
            func.ts_rank(doc, tsq).desc(),
            LibraryItem.published_at.desc().nulls_last(),
        )
        .limit(limit)
    ).all()
    inside = paper_text.matches(db, [item.id for item, _, _ in rows if not lib.says(item, terms)], terms)
    hits = []
    for item, code, short in rows:
        about = item.description or (f"By {item.author_name}" if item.author_name else None) or item.file_name
        found = inside.get(item.id)
        meta = _library_meta(item, code or short)
        if found and found.page:
            meta.append(f"Page {found.page}")
        hits.append(
            SearchHit(
                type="library",
                id=str(item.id),
                title=item.title,
                snippet=found.snippet if found else snippet(about, terms),
                url=f"/library/{item.slug}" + (f"?page={found.page}" if found and found.page else ""),
                meta=" · ".join(p for p in meta if p),
                date=item.published_at,
                page=found.page if found else None,
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
                page=None,
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
        select(Module)
        .where(Module.hidden.is_(False), *(_module_word(t) for t in terms))
        .order_by(Module.position, Module.id)
        .limit(limit)
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
            page=None,
        )
        for m in mods
    ]


def _lessons(db: Session, terms: list[str], limit: int) -> list[SearchHit]:
    """Chapters whose title has every word, opening their first lesson; then videos whose title (with their
    chapter's) has every word. YouTube titles are noisy, so chapters rank first."""
    first = (
        select(Lesson.id)
        .where(Lesson.chapter_id == Chapter.id, Lesson.hidden.is_(False))
        .order_by(Lesson.position, Lesson.id)
        .limit(1)
        .correlate(Chapter)
        .scalar_subquery()
    )
    chapter_has_all = and_(*(_starts_word(Chapter.title, t) for t in terms))
    chapters = db.execute(
        select(
            Chapter.id,
            Chapter.title,
            Module.id.label("module_id"),
            Module.unit_code,
            Module.short_name,
            first.label("lesson_id"),
        )
        .join(Module, Module.id == Chapter.module_id)
        .where(Module.hidden.is_(False), Chapter.hidden.is_(False), chapter_has_all, first.is_not(None))
        .order_by(Module.year, Module.position, Chapter.position, Chapter.id)
        .limit(limit)
    ).all()
    hits = [
        SearchHit(
            type="lesson",
            id=c.id,
            title=c.title,
            snippet=None,
            url=f"/modules/{c.module_id}/lessons/{c.lesson_id}",
            meta=" · ".join(p for p in (c.unit_code or c.short_name, "Chapter") if p),
            date=None,
            page=None,
        )
        for c in chapters
    ]
    room = limit - len(hits)
    if room <= 0:
        return hits
    word_in_either = (or_(_starts_word(Lesson.title, t), _starts_word(Chapter.title, t)) for t in terms)
    videos = db.execute(
        select(Lesson, Chapter.title, Module.id, Module.unit_code, Module.short_name)
        .join(Chapter, Chapter.id == Lesson.chapter_id)
        .join(Module, Module.id == Lesson.module_id)
        .where(Module.hidden.is_(False), Chapter.hidden.is_(False), Lesson.hidden.is_(False))
        .where(Lesson.title.is_not(None), *word_in_either, ~chapter_has_all)
        .order_by(Module.year, Module.position, Chapter.position, Lesson.position, Lesson.id)
        .limit(room)
    ).all()
    for lesson, chapter, module_id, code, short in videos:
        hits.append(
            SearchHit(
                type="lesson",
                id=lesson.id,
                title=lesson.title or chapter,
                snippet=chapter,
                url=f"/modules/{module_id}/lessons/{lesson.id}",
                meta=" · ".join(p for p in (code or short, "Video") if p),
                date=None,
                page=None,
            )
        )
    return hits


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
            details += "Not confirmed yet."
        hits.append(
            SearchHit(
                type="event",
                id=e.id,
                title=e.title,
                snippet=details,
                url=f"/calendar?date={e.date.isoformat()}&event={e.id}",
                meta=f"{TYPE_LABELS.get(e.type, 'Event')} · {cohort_label(e.year)}",
                date=datetime.combine(e.date, time(0), tzinfo=BAHRAIN),
                page=None,
            )
        )
    return hits


def run_search(db: Session, q: str, types: list[SearchType] | None, limit: int, viewer: User | None) -> SearchResults:
    want = {
        t for t in (types or ALL_TYPES) if t not in TYPE_FEATURES or access.feature_on(db, viewer, TYPE_FEATURES[t])
    }
    terms = words(q)
    tsq = text_query(q)
    results = SearchResults(query=q, threads=[], library=[], issues=[], modules=[], lessons=[], events=[])
    if not terms or tsq is None:
        return results
    if "thread" in want:
        results.threads = _threads(db, tsq, terms, limit)
    if "library" in want:
        results.library = _library(db, tsq, terms, limit, viewer)
    if "issue" in want:
        results.issues = _issues(db, tsq, terms, limit)
    if "module" in want:
        results.modules = _modules(db, terms, limit)
    if "lesson" in want:
        results.lessons = _lessons(db, terms, limit)
    if "event" in want:
        results.events = _events(db, terms, limit)
    return results
