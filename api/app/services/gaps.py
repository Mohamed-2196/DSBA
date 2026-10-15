"""What's missing, for the people who fill it: the gaps a rep with an hour could close, by module.

- Library (library.manage): sittings with a past paper and no examiners' report (or a report and no paper), papers
  with no text (scans), and modules with no cheat sheet.
- Lessons (content.edit): modules with no lessons, chapters with none, and videos gone from YouTube.
- Calendar (calendar.manage): dates still "Not confirmed" in the next 30 days, and confirmed exams in the next 90
  days without a time or a place.
- Requests (requests.manage): the open requests with the most "me too".

Only what students see counts: hidden modules, chapters and lessons are left out. Each list is capped, the most
useful first. Nothing here is personal: searches that found nothing aren't logged, so they aren't a gap."""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.core.access import Box, Feature
from app.core.errors import forbidden
from app.core.time import bahrain_today
from app.models import (
    CalendarEvent,
    Chapter,
    ItemSource,
    ItemStatus,
    Lesson,
    LibraryItem,
    LibraryText,
    Module,
    RequestStatus,
    StudentRequest,
    TextStatus,
    User,
)
from app.schemas.gaps import (
    CalendarGaps,
    EventGap,
    GapModule,
    Gaps,
    LessonGap,
    LibraryGaps,
    RequestGap,
    ScanGap,
    SittingGap,
)
from app.schemas.library import EXAM_KINDS, EXAMINERS_REPORT, PAST_PAPER
from app.services import access

GAP_BOXES = (Box.library_manage, Box.content_edit, Box.calendar_manage, Box.requests_manage)
LIST_MAX = 50
REQUESTS_MAX = 10
UNCONFIRMED_DAYS = 30
EXAM_DAYS = 90


def _modules(db: Session) -> dict[str, GapModule]:
    """The modules students see, by id, in the programme's order."""
    rows = db.scalars(
        select(Module).where(Module.hidden.is_(False)).order_by(Module.year, Module.position, Module.name)
    ).all()
    return {m.id: GapModule(id=m.id, name=m.name, unit_code=m.unit_code, year=m.year) for m in rows}


def _sittings(db: Session, modules: dict[str, GapModule]) -> list[SittingGap]:
    """Sittings (exam_names.sitting_key: exam year and session) with a paper but no examiners' report, or the other
    way round. Zones are left out on purpose: one report usually covers every zone of a sitting, so a rep looks for
    it per sitting, not per zone."""
    papers = func.bool_or(LibraryItem.kind == PAST_PAPER)
    reports = func.bool_or(LibraryItem.kind == EXAMINERS_REPORT)
    rows = db.execute(
        select(LibraryItem.module_id, LibraryItem.exam_year, LibraryItem.exam_session, papers, reports)
        .where(
            LibraryItem.status == ItemStatus.published,
            LibraryItem.source == ItemSource.file,
            LibraryItem.module_id.in_(modules),
            LibraryItem.exam_year.is_not(None),
            LibraryItem.kind.in_((PAST_PAPER, EXAMINERS_REPORT)),
        )
        .group_by(LibraryItem.module_id, LibraryItem.exam_year, LibraryItem.exam_session)
        .having(papers.is_distinct_from(reports))
        .order_by(LibraryItem.exam_year.desc(), LibraryItem.exam_session, LibraryItem.module_id)
        .limit(LIST_MAX)
    ).all()
    return [
        SittingGap(
            module=modules[module_id],
            exam_year=year,
            session=session,
            missing="report" if has_paper else "paper",
        )
        for module_id, year, session, has_paper, _ in rows
        if module_id is not None and year is not None
    ]


def _scans(db: Session, modules: dict[str, GapModule]) -> list[ScanGap]:
    rows = db.execute(
        select(LibraryItem, LibraryText.status)
        .join(LibraryText, LibraryText.item_id == LibraryItem.id)
        .where(
            LibraryItem.status == ItemStatus.published,
            LibraryItem.kind.in_(EXAM_KINDS),
            LibraryText.status.in_((TextStatus.empty, TextStatus.failed)),
        )
        .order_by(LibraryItem.exam_year.desc().nulls_last(), func.lower(LibraryItem.title), LibraryItem.id)
        .limit(LIST_MAX)
    ).all()
    return [
        ScanGap(
            id=item.id,
            slug=item.slug,
            title=item.title,
            kind=item.kind,
            module=modules.get(item.module_id) if item.module_id else None,
            text="empty" if status == TextStatus.empty else "failed",
        )
        for item, status in rows
    ]


def _no_cheat_sheet(db: Session, modules: dict[str, GapModule]) -> list[GapModule]:
    covered = set(
        db.scalars(
            select(LibraryItem.module_id).where(
                LibraryItem.status == ItemStatus.published,
                LibraryItem.kind == "cheat-sheet",
                LibraryItem.module_id.is_not(None),
            )
        )
    )
    return [m for module_id, m in modules.items() if module_id not in covered]


def library_gaps(db: Session, modules: dict[str, GapModule]) -> LibraryGaps:
    return LibraryGaps(
        sittings=_sittings(db, modules), scans=_scans(db, modules), no_cheat_sheet=_no_cheat_sheet(db, modules)
    )


def lesson_gaps(db: Session, modules: dict[str, GapModule]) -> list[LessonGap]:
    """Per module students see: its visible chapters, those with no visible lesson, its visible lessons and the
    videos among them gone from YouTube. Only the modules with something missing."""
    visible = and_(Lesson.chapter_id == Chapter.id, Lesson.hidden.is_(False))
    per_chapter = (
        select(
            Chapter.module_id.label("module_id"),
            func.count(Lesson.id).label("lessons"),
            func.count(Lesson.id).filter(Lesson.unavailable.is_(True)).label("unavailable"),
        )
        .outerjoin(Lesson, visible)
        .where(Chapter.hidden.is_(False), Chapter.module_id.in_(modules))
        .group_by(Chapter.id)
        .subquery()
    )
    rows = db.execute(
        select(
            per_chapter.c.module_id,
            func.count(),
            func.count().filter(per_chapter.c.lessons == 0),
            func.sum(per_chapter.c.lessons),
            func.sum(per_chapter.c.unavailable),
        ).group_by(per_chapter.c.module_id)
    ).all()
    counts = {module_id: (int(c), int(e), int(n or 0), int(u or 0)) for module_id, c, e, n, u in rows}
    out = []
    for module_id, m in modules.items():
        chapters, empty, lessons, unavailable = counts.get(module_id, (0, 0, 0, 0))
        if lessons == 0 or empty or unavailable:
            out.append(
                LessonGap(module=m, chapters=chapters, empty_chapters=empty, lessons=lessons, unavailable=unavailable)
            )
    return out


def _event(e: CalendarEvent) -> EventGap:
    return EventGap(
        id=e.id,
        title=e.title,
        date=e.date,
        module_id=e.module_id,
        sample=e.sample,
        no_time=not (e.time or "").strip(),
        no_place=not (e.place or "").strip(),
    )


def calendar_gaps(db: Session) -> CalendarGaps:
    today = bahrain_today()
    unconfirmed = db.scalars(
        select(CalendarEvent)
        .where(
            CalendarEvent.sample.is_(True),
            CalendarEvent.date >= today,
            CalendarEvent.date <= today + timedelta(days=UNCONFIRMED_DAYS),
        )
        .order_by(CalendarEvent.date, CalendarEvent.title)
        .limit(LIST_MAX)
    ).all()
    no_details = db.scalars(
        select(CalendarEvent)
        .where(
            CalendarEvent.sample.is_(False),
            CalendarEvent.type == "exam",
            CalendarEvent.date >= today,
            CalendarEvent.date <= today + timedelta(days=EXAM_DAYS),
            (func.coalesce(func.trim(CalendarEvent.time), "") == "")
            | (func.coalesce(func.trim(CalendarEvent.place), "") == ""),
        )
        .order_by(CalendarEvent.date, CalendarEvent.title)
        .limit(LIST_MAX)
    ).all()
    return CalendarGaps(unconfirmed=[_event(e) for e in unconfirmed], exam_details=[_event(e) for e in no_details])


def request_gaps(db: Session, modules: dict[str, GapModule]) -> list[RequestGap]:
    rows = db.scalars(
        select(StudentRequest)
        .where(
            StudentRequest.removed_at.is_(None),
            StudentRequest.status.in_((RequestStatus.open, RequestStatus.planned)),
        )
        .order_by(StudentRequest.me_too_count.desc(), StudentRequest.created_at, StudentRequest.id)
        .limit(REQUESTS_MAX)
    ).all()
    return [
        RequestGap(
            id=r.id,
            title=r.title,
            kind=r.kind,
            status=r.status.value,
            me_too_count=r.me_too_count,
            module_title=modules[r.module_id].name if r.module_id in modules else None,
        )
        for r in rows
    ]


def gaps(db: Session, user: User) -> Gaps:
    """The parts of the Gaps screen the person's boxes give them, each while its feature is on for them. 403 for
    someone who holds none of the boxes."""
    held = {box for box in GAP_BOXES if access.can(user, box)}
    if not held:
        raise forbidden("Only people who look after the library, modules, calendar or requests can see the gaps.")

    def on(box: Box, feature: Feature | None) -> bool:
        return box in held and (feature is None or access.feature_on(db, user, feature))

    modules = _modules(db)
    return Gaps(
        library=library_gaps(db, modules) if on(Box.library_manage, Feature.library) else None,
        lessons=lesson_gaps(db, modules) if on(Box.content_edit, None) else None,
        calendar=calendar_gaps(db) if on(Box.calendar_manage, Feature.calendar) else None,
        requests=request_gaps(db, modules) if on(Box.requests_manage, Feature.requests) else None,
    )
