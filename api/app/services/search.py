"""Search: the text query every search box uses, plain-text snippets, and the site-wide search.

A query is full text on the generated `search_vector` columns ('simple' configuration): websearch_to_tsquery for
what was typed ("quoted phrases", -exclusions, or), with a prefix match on the last word, so results appear while
the word is still being typed ("distribution theo" finds "Distribution Theory"). Modules and calendar events have
no search vector: they match when every word starts a word of their name, title or code; so do chapters and
lessons. Library files match inside their text too (app/services/paper_text.py).

Ranking, in every group: for a signed-in student, what belongs to them first (the papers they sit, then their year;
a guest's order is the same for everyone), then whole-word matches above prefix matches ("exam" before "Example"),
then each group's own order. A query that finds nothing is tried once more with its misspelt words corrected
(search_spelling.py); the results say which query they are for."""

from __future__ import annotations

import re
from datetime import datetime, time
from typing import Any

from sqlalchemy import and_, case, func, literal, or_, select
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
    PaperQuestion,
    PostStatus,
    User,
)
from app.schemas.library import EXAM_KINDS
from app.schemas.misc import SearchHit, SearchResults, SearchType
from app.services import access, paper_text, search_spelling, site
from app.services import library as lib
from app.services.calendar import TYPE_LABELS, cohort_label, year_clause
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


def exact_query(q: str) -> ColumnElement[Any]:
    """websearch_to_tsquery('simple', q): every word whole, none as a prefix."""
    return func.websearch_to_tsquery("simple", q.strip())


def _starts_word(column: Any, word: str) -> ColumnElement[bool]:
    """column has a word starting with `word` (case-insensitive; `word` is letters and digits only)."""
    pattern = r"\m" + word.replace(" ", r"\s+")
    return func.coalesce(column, "").op("~*")(pattern)


def _has_word(column: Any, word: str) -> ColumnElement[bool]:
    """column has `word` as a whole word (case-insensitive; `word` is letters and digits only)."""
    return func.coalesce(column, "").op("~*")(r"\m" + word + r"\M")


def _whole_words_first(*columns: Any, terms: list[str]) -> ColumnElement[Any]:
    """Ordering: rows where every term is a whole word of one of `columns` first ("exam" before "Example")."""
    return and_(*(or_(*(_has_word(c, t) for c in columns)) for t in terms)).desc()


def mine_first(viewer: User | None, module_id: Any, year: Any) -> list[Any]:
    """Ordering for a signed-in student: rows of the papers they sit, then of their year, then the rest. Nothing for
    guests and people without a year or papers, so their order stays the same for everyone."""
    if viewer is None or (viewer.year is None and not viewer.papers):
        return []
    whens: list[tuple[ColumnElement[bool], int]] = []
    if viewer.papers:
        whens.append((module_id.in_(viewer.papers), 0))
    if viewer.year is not None:
        whens.append((year == viewer.year, 1))
    return [case(*whens, else_=2)]


# ── the site-wide search ─────────────────────────────────────────────────────────────────────


def _threads(
    db: Session, tsq: ColumnElement[Any], exact: ColumnElement[Any], terms: list[str], limit: int, viewer: User | None
) -> list[SearchHit]:
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
        .order_by(
            # the thread's cohort: its category's year, else its module's (forum.queries.year_expr)
            *mine_first(viewer, ForumThread.module_id, func.coalesce(ForumCategory.year, Module.year)),
            ForumThread.search_vector.bool_op("@@")(exact).desc(),
            rank.desc(),
            ForumThread.last_activity_at.desc(),
        )
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
    """The kind, then the module unless the title (library.exam_title) already leads with it."""
    if item.exam_year is not None and item.kind in EXAM_KINDS:
        return [lib.kind_label(item.kind)]
    return [lib.kind_label(item.kind), module or ""]


def _library(
    db: Session, tsq: ColumnElement[Any], exact: ColumnElement[Any], terms: list[str], limit: int, viewer: User | None
) -> list[SearchHit]:
    """Files whose title, description, author or module match first (the viewer's papers and year first among
    them, whole words before prefixes); then those that match only inside (their snippet and page come from the
    text). A second copy of a file is left out (library.duplicate)."""
    doc = lib.search_document()
    in_doc = doc.bool_op("@@")(tsq)
    rows = db.execute(
        select(LibraryItem, Module.unit_code, Module.short_name)
        .outerjoin(Module, Module.id == LibraryItem.module_id)
        .where(
            LibraryItem.status == ItemStatus.published,
            ~lib.duplicate(),
            ~lib.in_hidden_module(),
            or_(in_doc, paper_text.content_match(tsq)),
        )
        .order_by(
            in_doc.desc(),
            *mine_first(viewer, LibraryItem.module_id, LibraryItem.year),
            doc.bool_op("@@")(exact).desc(),
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
                title=lib.exam_title(item, code or short),
                snippet=found.snippet if found else snippet(about, terms),
                url=f"/library/{item.slug}" + (f"?page={found.page}" if found and found.page else ""),
                meta=" · ".join(p for p in meta if p),
                date=item.published_at,
                page=found.page if found else None,
            )
        )
    return hits


def _issues(
    db: Session, tsq: ColumnElement[Any], exact: ColumnElement[Any], terms: list[str], limit: int
) -> list[SearchHit]:
    issues = db.scalars(
        select(NewsletterIssue)
        .where(NewsletterIssue.status == IssueStatus.published, NewsletterIssue.search_vector.bool_op("@@")(tsq))
        .order_by(
            NewsletterIssue.search_vector.bool_op("@@")(exact).desc(),
            func.ts_rank(NewsletterIssue.search_vector, tsq).desc(),
            NewsletterIssue.date.desc(),
        )
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


def nicknames(db: Session) -> dict[str, tuple[str, ...]]:
    """What students type for modules, and the start of a word of the names it finds ('stats': 'statistic'): Site
    settings' search nicknames."""
    found: dict[str, tuple[str, ...]] = {}
    for n in site.site(db).search_nicknames:
        found[n.word] = (*found.get(n.word, ()), n.finds)
    return found


def _module_word(word: str, aliases: dict[str, tuple[str, ...]]) -> ColumnElement[bool]:
    options = [word, *aliases.get(word, ())]
    return or_(
        Module.unit_code.ilike(f"%{word}%"),
        *(_starts_word(Module.name, w) for w in options),
        *(_starts_word(Module.short_name, w) for w in options),
    )


def _modules(db: Session, terms: list[str], limit: int, viewer: User | None) -> list[SearchHit]:
    aliases = nicknames(db)
    mods = db.scalars(
        select(Module)
        .where(Module.hidden.is_(False), *(_module_word(t, aliases) for t in terms))
        .order_by(*mine_first(viewer, Module.id, Module.year), Module.position, Module.id)
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


def _keyword_text() -> ColumnElement[str]:
    """A chapter's words for search as one text ('mle maximum likelihood cramer rao')."""
    return func.array_to_string(Chapter.keywords, " ")


def _matched_words(keywords: list[str], terms: list[str]) -> list[str]:
    """The chapter's words for search that a term starts a word of: why the chapter was found."""
    return [k for k in keywords if any(w.startswith(t) for t in terms for w in k.split())]


def _lessons(db: Session, terms: list[str], limit: int, viewer: User | None) -> list[SearchHit]:
    """Chapters whose title or words for search (a content manager's 'mle', 'cramer rao') have every word, opening
    their first lesson, with how many past questions are tagged with them; then videos whose title (with their
    chapter's) has every word. YouTube titles are noisy, so chapters rank first. Within each, the viewer's modules
    first, then whole words before prefixes."""
    yours = mine_first(viewer, Module.id, Module.year)
    first = (
        select(Lesson.id)
        .where(Lesson.chapter_id == Chapter.id, Lesson.hidden.is_(False))
        .order_by(Lesson.position, Lesson.id)
        .limit(1)
        .correlate(Chapter)
        .scalar_subquery()
    )
    keywords = _keyword_text()
    chapter_has_all = and_(*(or_(_starts_word(Chapter.title, t), _starts_word(keywords, t)) for t in terms))
    questions_on = access.feature_on(db, viewer, Feature.library) and access.feature_on(
        db, viewer, Feature.library_questions
    )
    questions = (
        select(func.count(PaperQuestion.id))
        .join(LibraryItem, LibraryItem.id == PaperQuestion.item_id)
        .where(PaperQuestion.chapter_id == Chapter.id, LibraryItem.status == ItemStatus.published)
        .correlate(Chapter)
        .scalar_subquery()
        if questions_on
        else literal(0)
    )
    chapters = db.execute(
        select(
            Chapter.id,
            Chapter.title,
            Chapter.keywords,
            Module.id.label("module_id"),
            Module.unit_code,
            Module.short_name,
            first.label("lesson_id"),
            questions.label("questions"),
        )
        .join(Module, Module.id == Chapter.module_id)
        .where(Module.hidden.is_(False), Chapter.hidden.is_(False), chapter_has_all, first.is_not(None))
        .order_by(
            *yours,
            _whole_words_first(Chapter.title, keywords, terms=terms),
            Module.year,
            Module.position,
            Chapter.position,
            Chapter.id,
        )
        .limit(limit)
    ).all()
    hits = []
    for c in chapters:
        also = _matched_words(c.keywords, terms)
        asked = f"{c.questions} past {'question' if c.questions == 1 else 'questions'}" if c.questions else None
        hits.append(
            SearchHit(
                type="lesson",
                id=c.id,
                title=c.title,
                snippet=f"Also: {', '.join(also)}" if also else None,
                url=f"/modules/{c.module_id}/lessons/{c.lesson_id}",
                meta=" · ".join(p for p in (c.unit_code or c.short_name, "Chapter", asked) if p),
                date=None,
                page=None,
            )
        )
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
        .order_by(
            *yours,
            _whole_words_first(Lesson.title, Chapter.title, terms=terms),
            Module.year,
            Module.position,
            Chapter.position,
            Lesson.position,
            Lesson.id,
        )
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


# Words that ask for a date, and the calendar types they name ("exam" finds every exam, whatever its title).
DATE_TYPES: dict[str, tuple[str, ...]] = {
    "exam": ("exam", "mock"),
    "exams": ("exam", "mock"),
    "final": ("exam",),
    "finals": ("exam",),
    "mock": ("mock",),
    "mocks": ("mock",),
    "deadline": ("deadline",),
    "deadlines": ("deadline",),
    "due": ("deadline",),
    "revision": ("revision",),
    "break": ("break",),
    "holiday": ("break",),
    "holidays": ("break",),
}
# Words that ask for the resits ("resit" finds every resit, whatever its title).
RESIT_WORDS = frozenset(["resit", "resits", "retake", "retakes"])
# A question about a date ("when is my exam", "what date is the ST2134 exam"): words that say nothing about which.
DATE_FILLER = frozenset(
    [
        "when",
        "whens",
        "is",
        "are",
        "my",
        "the",
        "next",
        "what",
        "whats",
        "date",
        "dates",
        "day",
        "do",
        "i",
        "have",
        "a",
        "an",
        "of",
        "for",
        "on",
        "s",
        "will",
        "be",
        "it",
    ]
)


def date_terms(terms: list[str]) -> list[str] | None:
    """The words that pick dates out of a query that asks for one (a word naming a type of date, or "when"/"date"):
    the query less its filler ("when is my exam" → ["exam"]). None when the query doesn't ask for a date."""
    if not any(t in DATE_TYPES or t in RESIT_WORDS or t in {"when", "whens", "date", "dates"} for t in terms):
        return None
    return [t for t in terms if t not in DATE_FILLER]


def _event_word(word: str) -> ColumnElement[bool]:
    found = or_(
        _starts_word(CalendarEvent.title, word),
        CalendarEvent.unit_code.ilike(f"%{word}%"),
        _starts_word(Module.name, word),
        _starts_word(Module.short_name, word),
    )
    if word in RESIT_WORDS:
        return or_(found, CalendarEvent.resit)
    types = DATE_TYPES.get(word)
    return or_(found, CalendarEvent.type.in_(types)) if types else found


def _dates_mine_first(viewer: User | None) -> list[Any]:
    """mine_first for dates: the main sittings and dates of the papers they sit and the resits of the modules they
    are resitting, then their year's (calendar.for_year), then the rest."""
    if viewer is None or (viewer.year is None and not viewer.papers and not viewer.resits):
        return []
    whens: list[tuple[ColumnElement[bool], int]] = []
    if viewer.papers:
        whens.append((and_(~CalendarEvent.resit, CalendarEvent.module_id.in_(viewer.papers)), 0))
    if viewer.resits:
        whens.append((and_(CalendarEvent.resit, CalendarEvent.module_id.in_(viewer.resits)), 0))
    if viewer.year is not None:
        whens.append((year_clause(viewer.year), 1))
    return [case(*whens, else_=2)]


def _events(db: Session, terms: list[str], limit: int, viewer: User | None) -> list[SearchHit]:
    """Dates whose title, code or module has every word. A query that asks for a date ("when is my exam", "ST2134
    exam") leaves out its filler and finds dates by their type too ("exam" finds every exam)."""
    picked = date_terms(terms)
    terms = terms if picked is None else picked
    if not terms:
        return []
    today = bahrain_today()
    upcoming = func.coalesce(CalendarEvent.end_date, CalendarEvent.date) >= today
    rows = db.scalars(
        select(CalendarEvent)
        .outerjoin(Module, Module.id == CalendarEvent.module_id)
        .where(and_(*(_event_word(t) for t in terms)))
        # the viewer's dates first; then what is still ahead (soonest first), then the past (latest first)
        .order_by(
            *_dates_mine_first(viewer),
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
                meta=f"Resit · {cohort_label(e.year)} module"
                if e.resit
                else f"{TYPE_LABELS.get(e.type, 'Event')} · {cohort_label(e.year)}",
                date=datetime.combine(e.date, time(0), tzinfo=BAHRAIN),
                page=None,
            )
        )
    return hits


def _found_nothing(r: SearchResults) -> bool:
    return not (r.threads or r.library or r.issues or r.modules or r.lessons or r.events)


def _search(db: Session, q: str, want: set[SearchType], limit: int, viewer: User | None) -> SearchResults:
    terms = words(q)
    tsq = text_query(q)
    results = SearchResults(
        query=q, corrected=None, threads=[], library=[], issues=[], modules=[], lessons=[], events=[]
    )
    if not terms or tsq is None:
        return results
    exact = exact_query(q)
    if "thread" in want:
        results.threads = _threads(db, tsq, exact, terms, limit, viewer)
    if "library" in want:
        results.library = _library(db, tsq, exact, terms, limit, viewer)
    if "issue" in want:
        results.issues = _issues(db, tsq, exact, terms, limit)
    if "module" in want:
        results.modules = _modules(db, terms, limit, viewer)
    if "lesson" in want:
        results.lessons = _lessons(db, terms, limit, viewer)
    if "event" in want:
        results.events = _events(db, terms, limit, viewer)
    return results


def run_search(db: Session, q: str, types: list[SearchType] | None, limit: int, viewer: User | None) -> SearchResults:
    """The results for `q`; when it finds nothing, the results for `q` with its misspelt words corrected, with
    `corrected` saying what was searched for instead (still `query`: what was typed)."""
    want = {
        t for t in (types or ALL_TYPES) if t not in TYPE_FEATURES or access.feature_on(db, viewer, TYPE_FEATURES[t])
    }
    results = _search(db, q, want, limit, viewer)
    if not _found_nothing(results) or not words(q):
        return results
    fixed = search_spelling.corrected_query(q, search_spelling.corrections(db, words(q)))
    if fixed == q:
        return results
    second = _search(db, fixed, want, limit, viewer)
    if _found_nothing(second):
        return results
    second.query = q
    second.corrected = fixed
    return second
