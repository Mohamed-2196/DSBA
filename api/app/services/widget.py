"""A student's widget feed: what a home-screen widget shows at a glance, as JSON at a private address that a widget app
on their own phone reads without a session (routers/feeds.py). The address is kept like the private calendar feed's
(my_calendar.feed_token), with its own secret, and works while the calendar is on for the student.

The parts follow the Hub's own pages: their dates as Home counts them (home.dates_for), and the lesson to pick up as
Home's Continue learning works it out (the web app's computeResumePoint and chapterPosition): keep them in step."""

from __future__ import annotations

import datetime as dt
from collections.abc import Sequence
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.time import bahrain_today, utcnow
from app.models import Chapter, Lesson, LessonResume, LessonView, Module, PersonalEvent, User
from app.schemas.calendar import CalendarEventOut, WidgetEvent, WidgetExam, WidgetFeed, WidgetLesson
from app.services import accounts, home, my_calendar
from app.services.modules import visible_chapters, visible_lessons

MAX_EVENTS = 8  # more than a widget has room for
NOTHING_TODAY = "Nothing on today."


def widget_feed(db: Session, token: str) -> WidgetFeed:
    """The widget feed `token` opens. 404 not_found for an address that doesn't work."""
    user, _ = my_calendar.owner_of_feed(db, token, "widget")
    today = bahrain_today()
    base = get_settings().web_base_url.rstrip("/")
    catalogue = list(db.scalars(select(Module).where(Module.hidden.is_(False))))
    dates = home.dates_for(db, user, user.year, (), catalogue, today) if user.year is not None else []
    events = [*_programme_today(dates, today, base), *_own_today(my_calendar.list_events(db, user), today, base)]
    events = events[:MAX_EVENTS]
    return WidgetFeed(
        today=today,
        updated_at=utcnow(),
        url=f"{base}/",
        next_exam=_next_exam(dates, today, base),
        today_events=events,
        today_text="\n".join(e.text for e in events) or NOTHING_TODAY,
        carry_on=_carry_on(db, user, base) if accounts.tracks_progress(user) else None,
    )


def days_text(title: str, days: int) -> str:
    if days == 0:
        return f"{title} today"
    if days == 1:
        return f"{title} tomorrow"
    return f"{title} in {days} days"


def _next_exam(dates: Sequence[CalendarEventOut], today: dt.date, base: str) -> WidgetExam | None:
    """The first confirmed exam or mock from today to Home's EXAM_HORIZON days ahead."""
    for e in dates:
        days = (e.date - today).days
        if e.type in home.EXAM_TYPES and not e.sample and 0 <= days <= home.EXAM_HORIZON:
            return WidgetExam(
                title=e.title, date=e.date, days_left=days, text=days_text(e.title, days), url=_event_url(base, e)
            )
    return None


def _event_url(base: str, e: CalendarEventOut) -> str:
    return f"{base}/calendar?date={e.date.isoformat()}&event={e.id}"


def _line(time: str | None, title: str) -> str:
    return f"{time} {title}" if time else title


def _programme_today(dates: Sequence[CalendarEventOut], today: dt.date, base: str) -> list[WidgetEvent]:
    """The programme dates on today (several-day ones included), in the calendar's order."""
    return [
        WidgetEvent(title=e.title, time=e.time, text=_line(e.time, e.title), url=_event_url(base, e))
        for e in dates
        if e.date <= today <= (e.end_date or e.date)
    ]


def _own_today(events: Sequence[PersonalEvent], today: dt.date, base: str) -> list[WidgetEvent]:
    """The student's own events on today (an occurrence that started earlier and runs over today included): all-day
    ones first, then by time."""
    out: list[tuple[dt.time | None, WidgetEvent]] = []
    for e in events:
        span = (e.end_date - e.date).days if e.end_date else 0
        day = next(my_calendar.occurrence_days(e, today - timedelta(days=span), today), None)
        if day is None:
            continue
        time = e.start_time.strftime("%H:%M") if e.start_time else None
        url = f"{base}{my_calendar.occurrence_url(e, day)}"
        out.append((e.start_time, WidgetEvent(title=e.title, time=time, text=_line(time, e.title), url=url)))
    out.sort(key=lambda x: (x[0] is not None, x[0] or dt.time(), x[1].title))
    return [w for _, w in out]


def _position(c: int, lesson: Lesson, v: int, count: int) -> str:
    """'Chapter 2, video 1 of 13' / 'Chapter 13, playlist' / 'Chapter 4' (one video): the web app's chapterPosition."""
    if lesson.kind == "youtube-playlist":
        return f"Chapter {c + 1}, playlist"
    return f"Chapter {c + 1}, video {v + 1} of {count}" if count > 1 else f"Chapter {c + 1}"


def _resume_at(m: Module, last_lesson: str, watched: set[str]) -> tuple[int, Chapter, int, Lesson] | None:
    """Where to pick `m` up: the last lesson opened while it isn't watched, else the next one not watched after it
    (then from the start); None when every lesson is watched. The web app's computeResumePoint."""
    lessons = [
        (c, chapter, v, lesson)
        for c, chapter in enumerate(visible_chapters(m))
        for v, lesson in enumerate(visible_lessons(chapter))
    ]
    i = next((n for n, x in enumerate(lessons) if x[3].id == last_lesson), None)
    if i is not None and lessons[i][3].id not in watched:
        return lessons[i]
    order = lessons[i + 1 :] + lessons[:i] if i is not None else lessons
    return next((x for x in order if x[3].id not in watched), None)


def _carry_on(db: Session, user: User, base: str) -> WidgetLesson | None:
    """The lesson to pick up in the module opened last that still has one."""
    watched = set(db.scalars(select(LessonView.lesson_id).where(LessonView.user_id == user.id)))
    for row in db.scalars(
        select(LessonResume).where(LessonResume.user_id == user.id).order_by(LessonResume.opened_at.desc()).limit(5)
    ):
        m = db.get(Module, row.module_id)
        if m is None or m.hidden:
            continue
        at = _resume_at(m, row.lesson_id, watched)
        if at is None:
            continue
        c, chapter, v, lesson = at
        name = m.unit_code or m.short_name
        return WidgetLesson(
            module=name,
            chapter=chapter.title,
            position=_position(c, lesson, v, len(visible_lessons(chapter))),
            text=f"{name}: {chapter.title}",
            url=f"{base}/modules/{m.id}/lessons/{lesson.id}",
        )
    return None
