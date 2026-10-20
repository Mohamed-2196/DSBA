"""The Sunday summary: one plain-text email a week for each year that opted in, and the same text for reps
to paste into their year's group.

- What it holds, for one year and one week (Sunday to Saturday, in Bahrain): the exams, mocks and deadlines of the
  week, files published in the year's modules over the last seven days, questions of the year nobody has answered
  yet, and the newsletter issue of the last seven days. A section whose feature is off for the reader is left out.
- Who gets it: accounts with a year that switched "Sunday summary" on, among those the summary
  feature is on for. It is opt-in.
- When: the mail worker calls send_due() every few minutes; it queues the week's emails on Sunday from the words'
  send time (Bahrain). `python -m app.cli weekly-summary` does the same on any day. A person gets at most one a week
  (weekly_summaries), whoever runs it and however often. Someone at the hourly email cap is left for a
  later run; an empty week sends nothing.
- Its words (the subject line, the headings, the line before the closing link, and the send time) are a document that
  holders of summary.share edit in Manage → Sunday summary (WORDS, starting from app/seed/data/summary.json).
- Links are the Hub's own, with ?from=summary; titles people typed are quoted with their links taken out.
  The email ends with the link to the switches, which are behind sign-in: no token in any link."""

from __future__ import annotations

import datetime as dt
import logging
from collections.abc import Callable
from contextlib import AbstractContextManager
from dataclasses import dataclass, field

from sqlalchemy import and_, func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.access import Feature
from app.core.text import clip
from app.core.time import BAHRAIN, utcnow
from app.models import (
    CalendarEvent,
    ForumCategory,
    ForumThread,
    IssueStatus,
    ItemStatus,
    LibraryItem,
    Module,
    NewsletterIssue,
    PostStatus,
    User,
    WeeklySummarySent,
)
from app.schemas.summary import SummaryEditable, SummaryPreview, SummaryWords
from app.services import access, documents
from app.services.calendar import NOTICE_TYPES, year_clause
from app.services.calendar import summary as event_name
from app.services.notify import inbox_full, switch_footer, unlink
from app.services.outbox import WEEKLY_SUMMARY, queue, wanted_by

log = logging.getLogger("dsba.summary")

SWITCH = "email_weekly_summary"
LOOK_BACK = dt.timedelta(days=7)  # new files and questions, the newsletter
MAX_ITEMS = 6  # per section
TITLE_MAX = 90
FROM = "from=summary"
WORDS: documents.Kind[SummaryWords] = documents.Kind(
    key="summary",
    model=SummaryWords,
    seed="summary",
    title="Sunday summary",
    action="summary.words",
    changed="summary_changed",
    changed_message="Someone saved the Sunday summary's words after you opened them. Load them again, then make your "
    "changes.",
)


def words(db: Session) -> SummaryWords:
    return documents.current(db, WORDS)


def editable(db: Session) -> SummaryEditable:
    return SummaryEditable.model_validate(documents.editable(db, WORDS), from_attributes=True)


def save_words(db: Session, user: User, data: SummaryWords, version: int, ip: str | None) -> SummaryEditable:
    """Saves the words (409 summary_changed when someone saved them since `version`), audited with what changed."""
    return SummaryEditable.model_validate(documents.save(db, user, WORDS, data, version, ip), from_attributes=True)


def week_of(day: dt.date) -> dt.date:
    """The Sunday that starts `day`'s week."""
    return day - dt.timedelta(days=(day.weekday() + 1) % 7)


@dataclass
class Section:
    heading: str
    lines: list[str] = field(default_factory=list)


@dataclass
class Summary:
    year: int
    week_of: dt.date
    sections: list[Section]
    words: SummaryWords

    @property
    def subject(self) -> str:
        return self.words.subject.replace("{year}", str(self.year)).replace("{week}", _span(self.week_of))

    @property
    def empty(self) -> bool:
        return not any(s.lines for s in self.sections)

    def text(self) -> str:
        """The plain text without the email's footer: what reps paste into their group."""
        base = get_settings().web_base_url.rstrip("/")
        out = [self.subject, ""]
        for s in self.sections:
            if s.lines:
                out += [s.heading, *s.lines, ""]
        out.append(f"{self.words.closing} {base}/?{FROM}")
        return "\n".join(out) + "\n"

    def email(self) -> str:
        return self.text() + "\n" + "\n".join(switch_footer(SWITCH)) + "\n"


def _span(sunday: dt.date) -> str:
    saturday = sunday + dt.timedelta(days=6)
    if sunday.month == saturday.month:
        return f"{sunday.day} to {saturday.day} {saturday:%B}"
    return f"{sunday.day} {sunday:%B} to {saturday.day} {saturday:%B}"


def _link(path: str) -> str:
    base = get_settings().web_base_url.rstrip("/")
    return f"{base}{path}{'&' if '?' in path else '?'}{FROM}"


def _title(text: str) -> str:
    return clip(unlink(text), TITLE_MAX)


def _since(sunday: dt.date) -> dt.datetime:
    return dt.datetime.combine(sunday, dt.time(), tzinfo=BAHRAIN) - LOOK_BACK


def build(
    db: Session, year: int, sunday: dt.date, features: frozenset[Feature], told: SummaryWords | None = None
) -> Summary:
    """Year `year`'s summary for the week starting `sunday`, with the sections of `features` only, in the saved words
    (or `told`, a draft of them)."""
    said = told or words(db)
    headings = said.headings
    since = _since(sunday)
    sections: list[Section] = []
    if Feature.calendar in features:
        saturday = sunday + dt.timedelta(days=6)
        events = db.scalars(
            select(CalendarEvent)
            .where(
                CalendarEvent.type.in_(NOTICE_TYPES),
                CalendarEvent.date <= saturday,
                func.coalesce(CalendarEvent.end_date, CalendarEvent.date) >= sunday,
                year_clause(year),  # the year's main sittings and the year before's resits
            )
            .order_by(CalendarEvent.date, CalendarEvent.id)
            .limit(MAX_ITEMS)
        ).all()
        lines = []
        for e in events:
            extra = ", ".join(p for p in (e.time, e.place) if p)
            when = f"{e.date:%a} {e.date.day} {e.date:%b}"
            unconfirmed = " (not confirmed yet)" if e.sample else ""
            lines.append(f"- {when}: {_title(event_name(e))}{f' ({unlink(extra)})' if extra else ''}{unconfirmed}")
            lines.append(f"  {_link(f'/calendar?date={e.date.isoformat()}&event={e.id}')}")
        sections.append(Section(headings.calendar, lines))
    year_modules = select(Module.id).where(Module.year == year, Module.hidden.is_(False))
    if Feature.library in features:
        items = db.scalars(
            select(LibraryItem)
            .where(
                LibraryItem.status == ItemStatus.published,
                LibraryItem.published_at >= since,
                or_(
                    LibraryItem.module_id.in_(year_modules),
                    and_(LibraryItem.module_id.is_(None), LibraryItem.year == year),
                ),
            )
            .order_by(LibraryItem.published_at.desc(), LibraryItem.id)
            .limit(MAX_ITEMS)
        ).all()
        lines = []
        for i in items:
            lines += [f"- {_title(i.title)}", f"  {_link(f'/library/{i.slug}')}"]
        sections.append(Section(headings.library, lines))
    if Feature.forum in features:
        threads = db.scalars(
            select(ForumThread)
            .where(
                ForumThread.status == PostStatus.visible,
                ForumThread.deleted_at.is_(None),
                ForumThread.locked.is_(False),
                ForumThread.reply_count == 0,
                ForumThread.created_at >= since,
                or_(
                    ForumThread.category.in_(select(ForumCategory.id).where(ForumCategory.year == year)),
                    ForumThread.module_id.in_(year_modules),
                ),
            )
            .order_by(ForumThread.created_at.desc(), ForumThread.id)
            .limit(MAX_ITEMS)
        ).all()
        lines = []
        for t in threads:
            lines += [f"- {_title(t.title)}", f"  {_link(f'/forum/{t.slug}')}"]
        sections.append(Section(headings.forum, lines))
    if Feature.newsletter in features:
        issue = db.scalars(
            select(NewsletterIssue)
            .where(NewsletterIssue.status == IssueStatus.published, NewsletterIssue.published_at >= since)
            .order_by(NewsletterIssue.published_at.desc())
            .limit(1)
        ).first()
        lines = (
            [f"- Issue {issue.number}: {_title(issue.title)}", f"  {_link(f'/newsletter/{issue.slug}')}"]
            if issue
            else []
        )
        sections.append(Section(headings.newsletter, lines))
    return Summary(year, sunday, sections, said)


def _features_for(db: Session, user: User | None) -> frozenset[Feature]:
    """The summary's sections a reader may see: the features on for them."""
    return frozenset(access.features_on(db, user))


def preview(db: Session, user: User, year: int, today: dt.date, told: SummaryWords | None = None) -> SummaryPreview:
    """This week's summary for `year`, without the email's footer, with the sections of the features on for the
    person asking, and how many people in that year have it switched on. `told`: a draft of the words."""
    sunday = week_of(today)
    s = build(db, year, sunday, _features_for(db, user), told)
    readers = _recipients(db, year)
    return SummaryPreview(
        year=year, week_of=sunday, subject=s.subject, text=s.text(), empty=s.empty, subscribers=len(readers)
    )


def _recipients(db: Session, year: int) -> list[User]:
    audience = access.audience(db, Feature.summary)
    if audience is None:
        return []
    return list(db.scalars(select(User).where(User.year == year, wanted_by(SWITCH), audience).order_by(User.id)))


def send_week(db: Session, today: dt.date) -> int:
    """Queues this week's summary for everyone who wants it and hasn't had it this week (the caller commits).
    -> how many were queued."""
    sunday = week_of(today)
    said = words(db)
    queued = 0
    for year in (1, 2, 3):
        for user in _recipients(db, year):
            if inbox_full(db, user.id):
                continue
            s = build(db, year, sunday, _features_for(db, user), said)
            if s.empty:
                continue
            claimed = db.scalar(
                insert(WeeklySummarySent)
                .values(user_id=user.id, week_of=sunday)
                .on_conflict_do_nothing()
                .returning(WeeklySummarySent.user_id)
            )
            if claimed is None:
                continue  # had it this week
            queue(db, to=user.email, subject=s.subject, body=s.email(), kind=WEEKLY_SUMMARY, user_id=user.id)
            queued += 1
    return queued


def due(now: dt.datetime, send_at: dt.time) -> bool:
    """Whether it's time for the week's summary: Sunday from `send_at`, in Bahrain."""
    local = now.astimezone(BAHRAIN)
    return local.weekday() == 6 and local.time() >= send_at


def send_due(sessions: Callable[[], AbstractContextManager[Session]], now: dt.datetime | None = None) -> int:
    """The mail worker's weekly step: on Sunday from the words' send time, queues the week's summaries. -> how many."""
    now = now or utcnow()
    if now.astimezone(BAHRAIN).weekday() != 6:
        return 0
    with sessions() as db:
        if not due(now, words(db).send_time()):
            return 0
        queued = send_week(db, now.astimezone(BAHRAIN).date())
        db.commit()
    if queued:
        log.info("queued %d Sunday summar%s", queued, "y" if queued == 1 else "ies")
    return queued
