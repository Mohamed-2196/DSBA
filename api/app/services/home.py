"""Home's first screen in one answer: the site settings, the papers' choices, the guides while Results day's card is
due, the student's dates and next exam, the day's past question for it, and the desk shelf's numbers. Each part follows
the same rules as the endpoint it stands in for (switches, hidden modules, years); what is personal is the asker's own.

The web app works some of them out too, for its own pages (getExamSession and papersFor in
web/src/features): keep the two in step."""

from __future__ import annotations

import datetime as dt
from collections.abc import Collection, Sequence
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.access import Feature
from app.core.time import bahrain_today, utcnow
from app.models import ItemStatus, LibraryItem, Module, User
from app.schemas.calendar import CalendarEventOut
from app.schemas.guides import GuidesDoc
from app.schemas.home import HomeOut, HomeShelf
from app.schemas.library import PaperQuestion
from app.services import access, grades, my_calendar, notes, past_questions, site
from app.services import calendar as programme
from app.services.library import duplicate, in_hidden_module, sees_hidden_modules

# How far ahead Home reads the calendar: Up next counts down to exams within EXAM_HORIZON, and My modules shows each
# module's next exam within DATES_AHEAD.
DATES_AHEAD = timedelta(days=183)
EXAM_HORIZON = 120
EXAM_TYPES = frozenset({"exam", "mock"})
# Up next leaves these to the calendar page: programme events and careers dates are no countdown.
NOT_COUNTED = frozenset({"event", "careers"})
# The six weeks before an exam the daily question shows for.
DAILY_WINDOW = 42
NEW_FILE_DAYS = 7


def home(db: Session, user: User | None, year: int, picks: Collection[str]) -> HomeOut:
    """Home for `user` (None: a guest) looking at `year`. A guest's `picks` are the papers this browser keeps; an
    account's own papers count instead."""
    today = bahrain_today()
    on = set(access.features_on(db, user))
    catalogue = list(db.scalars(select(Module).where(Module.hidden.is_(False))))
    dates = _dates(db, user, year, picks, catalogue, today) if Feature.calendar in on else []
    exam = next_exam(dates, today)
    guides = site.guides(db)
    results = results_event(db, today, guides) if Feature.calendar in on else None
    return HomeOut(
        site=site.site(db),
        choices=grades.rules(db).choices(),
        guides=guides if results else None,
        results_day=results,
        dates=dates,
        next_exam=exam,
        daily_question=_daily_question(db, user, exam, today, on),
        shelf=HomeShelf(
            new_files=new_files(db, user, year) if Feature.library in on else None,
            notes=notes.count_notes(db, user) if user is not None and Feature.notes in on else None,
        ),
    )


def _dates(
    db: Session, user: User | None, year: int, picks: Collection[str], catalogue: Sequence[Module], today: dt.date
) -> list[CalendarEventOut]:
    """The dates from today to DATES_AHEAD that count for the student (my_calendar.counts_for), less the hidden
    modules'."""
    choices = grades.choice_ids(db)
    if user is not None:
        papers = my_calendar.papers_for(year, user.year, user.papers or [], catalogue, choices)
        prefs = my_calendar.get_prefs(db, user)
    else:
        papers = my_calendar.papers_for(year, year, picks, catalogue, choices)
        prefs = None
    visible = {m.id for m in catalogue}
    events = db.scalars(programme.events_query(start=today, end=today + DATES_AHEAD))
    return [
        CalendarEventOut.model_validate(e)
        for e in events
        if (e.module_id is None or e.module_id in visible) and my_calendar.counts_for(e, year, papers, prefs)
    ]


def next_exam(dates: Sequence[CalendarEventOut], today: dt.date) -> CalendarEventOut | None:
    """The first confirmed exam or mock from today to EXAM_HORIZON days ahead, when it is an exam (a mock coming first
    leads Up next instead): the web app's getExamSession."""
    for e in dates:
        days = (e.date - today).days
        if e.type in EXAM_TYPES and not e.sample and 0 <= days <= EXAM_HORIZON:
            return e if e.type == "exam" else None
    return None


def _daily_question(
    db: Session, user: User | None, exam: CalendarEventOut | None, today: dt.date, on: set[Feature]
) -> PaperQuestion | None:
    wanted = {Feature.library, Feature.library_questions, Feature.library_daily_question}
    if exam is None or exam.module_id is None or not wanted <= on or (exam.date - today).days > DAILY_WINDOW:
        return None
    module = db.get(Module, exam.module_id)
    if module is None or module.hidden:
        return None
    return past_questions.daily(db, module.id, user, today)


def results_event(db: Session, today: dt.date, guides: GuidesDoc) -> str | None:
    """The latest results date (an event whose title holds the guide's words) in the guide's weeks up to today: the
    one Results day's card is for."""
    guide = guides.results_day
    want = guide.event_title.strip().lower()
    if not want:
        return None
    since = today - timedelta(days=guide.weeks * 7 - 1)
    found = [
        e
        for e in db.scalars(programme.events_query(start=since, end=today, type_="event"))
        if since <= e.date <= today and want in e.title.lower()
    ]
    return max(found, key=lambda e: e.date).id if found else None


def new_files(db: Session, user: User | None, year: int) -> int:
    """Files students shared in the year's library in the last NEW_FILE_DAYS days, as the library lists them."""
    since = utcnow() - timedelta(days=NEW_FILE_DAYS)
    q = (
        select(func.count())
        .select_from(LibraryItem)
        .where(
            LibraryItem.status == ItemStatus.published,
            ~duplicate(),
            LibraryItem.year == year,
            LibraryItem.uploaded_by.is_not(None),
            LibraryItem.published_at > since,
        )
    )
    if not sees_hidden_modules(user):
        q = q.where(~in_hidden_module())
    return db.scalar(q) or 0
