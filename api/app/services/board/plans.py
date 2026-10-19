"""Revision plans (one per module): cards in the board's first column for the module's past papers and the lessons
not watched yet, as many as fit the days to the exam. Their cards that aren't done fall on days whenever they are
read (cards.plan_dates, with the rules of schedule.py): a paper a day in the last week, papers every few days before
it, and lessons around them, with a cap on each day's load."""

from __future__ import annotations

from collections import Counter
from datetime import timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.access import Feature
from app.core.errors import invalid, not_found
from app.core.time import bahrain_today, utcnow
from app.models import (
    BoardCard,
    BoardColumn,
    BoardPlan,
    ItemStatus,
    Lesson,
    LessonView,
    LibraryItem,
    Module,
    PaperQuestion,
    PaperScore,
    User,
)
from app.schemas.board import BoardPlanCreate, BoardPlanMade
from app.schemas.library import PAST_PAPER
from app.services import access, ratelimit
from app.services.accounts import tracks_progress
from app.services.board.boards import main_board
from app.services.board.cards import check_room, plan_out
from app.services.board.common import cards_in, columns_of, end_position, get_board
from app.services.board.schedule import PlanKind, days_for, lesson_room, papers_wanted
from app.services.exam_names import newest_sitting_first, sitting_label, zone_label
from app.services.modules import MODULE_UNKNOWN, lesson_name, visible_chapters, visible_lessons

PLAN_LIMIT = 20
PLAN_WINDOW = timedelta(hours=1)
PLAN_HORIZON_DAYS = 366
# A paper card's steps: sit it as the exam, then mark it.
PAPER_STEPS = ("Sit it against the clock with Time me", "Mark it with the examiners' report")


def module_tag(module: Module) -> str:
    """'ST2134', or the module's short name when it has no unit code."""
    return module.unit_code or module.short_name


def paper_title(module: Module, item: LibraryItem) -> str:
    """'ST2134 past paper · May 2025 · zone A' (the file's title when it has no exam year)."""
    if item.exam_year is None:
        return item.title
    parts = [f"{module_tag(module)} past paper", sitting_label(item.exam_year, item.exam_session)]
    if item.zone:
        parts.append(zone_label(item.zone))
    return " · ".join(parts)


def lesson_title(module: Module, lesson: Lesson) -> str:
    """'ST2134 · Point estimation: class of 17 Sep 2025', or the module and the video's own title."""
    return f"{module_tag(module)} · {lesson_name(lesson)}"


def by_priority(lessons: list[Lesson], focus: set[str], asked: Counter[str]) -> list[Lesson]:
    """Lessons in the order to keep them when not all fit: the chapters the student finds hard first, then the
    chapters past papers ask most about, then the module's order."""
    order = {lesson.id: i for i, lesson in enumerate(lessons)}
    return sorted(lessons, key=lambda x: (x.chapter_id not in focus, -asked[x.chapter_id], order[x.id]))


def _asked(db: Session, module_id: str) -> Counter[str]:
    """How many tagged past-paper questions each of the module's chapters has."""
    q = (
        select(PaperQuestion.chapter_id, func.count())
        .join(LibraryItem, LibraryItem.id == PaperQuestion.item_id)
        .where(LibraryItem.module_id == module_id, LibraryItem.status == ItemStatus.published)
        .group_by(PaperQuestion.chapter_id)
    )
    return Counter(dict(db.execute(q).tuples().all()))


def _papers(db: Session, user: User, module: Module, skip: set[str], wanted: int) -> list[LibraryItem]:
    """The module's newest `wanted` past papers not in `skip` and not scored by the student, the oldest first."""
    if wanted <= 0 or not access.feature_on(db, user, Feature.library):
        return []
    scored = {str(i) for i in db.scalars(select(PaperScore.item_id).where(PaperScore.user_id == user.id))}
    q = (
        select(LibraryItem)
        .where(
            LibraryItem.module_id == module.id,
            LibraryItem.kind == PAST_PAPER,
            LibraryItem.status == ItemStatus.published,
        )
        .order_by(
            *newest_sitting_first(LibraryItem.exam_year, LibraryItem.exam_session),
            LibraryItem.zone,
            LibraryItem.title,
        )
    )
    fresh = [i for i in db.scalars(q) if str(i.id) not in skip and str(i.id) not in scored]
    return list(reversed(fresh[:wanted]))


def _card(thing: LibraryItem | Lesson, module: Module) -> dict[str, Any]:
    """What a plan's card says and links to."""
    if isinstance(thing, LibraryItem):
        return {
            "title": paper_title(module, thing)[:200],
            "checklist": [{"id": f"step{n}", "text": text, "done": False} for n, text in enumerate(PAPER_STEPS)],
            "link_type": "library_item",
            "link_id": str(thing.id),
            "lesson_id": None,
        }
    return {
        "title": lesson_title(module, thing)[:200],
        "checklist": [],
        "link_type": "lesson",
        "link_id": None,
        "lesson_id": thing.id,
    }


def make_plan(db: Session, user: User, body: BoardPlanCreate) -> BoardPlanMade:
    """Plans `body.moduleId` up to the exam on the plan's board (a new plan: `boardId`, else the student's first
    board). Past papers not on that board and not scored yet (the newest sittings, the oldest of them first): one
    every `paperEvery` days, and one a day in the last week. Lessons not watched and not on that board, in the
    module's order, as many as fit beside the papers (schedule.py); when not all fit, the chapters in `focusChapters`
    and then the ones past papers ask most about come first, and `leftOut` says how many didn't fit. 422 on moduleId
    or examDate, 404 for a board that isn't the student's, 409 board_full when the cards wouldn't fit, 429 after
    PLAN_LIMIT plans in an hour."""
    module = db.get(Module, body.module_id)
    if module is None or module.hidden:
        raise invalid("moduleId", MODULE_UNKNOWN)
    today = bahrain_today()
    if body.exam_date <= today:
        raise invalid("examDate", "Pick an exam date after today.")
    if (body.exam_date - today).days > PLAN_HORIZON_DAYS:
        raise invalid("examDate", "Pick an exam date within a year.")
    ratelimit.enforce(
        db,
        f"board-plan:{user.id}",
        BoardPlan.updated_at,
        [BoardPlan.user_id == user.id],
        limit=PLAN_LIMIT,
        window=PLAN_WINDOW,
        message="You've planned a lot. Try again in {}.",
    )
    plan = db.scalar(select(BoardPlan).where(BoardPlan.user_id == user.id, BoardPlan.module_id == module.id))
    if plan is not None:
        board = get_board(db, user, plan.board_id)
    elif body.board_id is not None:
        board = get_board(db, user, body.board_id)
    else:
        board = main_board(db, user)
    first = columns_of(db, [board.id])[0]
    days = (body.exam_date - today).days

    on_board = db.execute(
        select(BoardCard.link_type, BoardCard.link_id, BoardCard.lesson_id).where(BoardCard.board_id == board.id)
    ).all()
    lessons_on = {lesson for _t, _l, lesson in on_board if lesson}
    items_on = {link for t, link, _ in on_board if t == "library_item" and link}
    # Planning again: the plan's cards still to do keep their share of the days.
    still = Counter(
        db.scalars(
            select(BoardCard.link_type)
            .join(BoardColumn, BoardColumn.id == BoardCard.column_id)
            .where(BoardCard.plan_id == plan.id, BoardColumn.done.is_(False))
        )
        if plan is not None
        else []
    )
    planned_papers, planned_lessons = still["library_item"], still["lesson"]
    papers = _papers(db, user, module, items_on, papers_wanted(days, body.paper_every) - planned_papers)

    seen = (
        set(db.scalars(select(LessonView.lesson_id).where(LessonView.user_id == user.id)))
        if tracks_progress(user)
        else set()
    )
    unwatched = [
        lesson
        for chapter in visible_chapters(module)
        for lesson in visible_lessons(chapter)
        if lesson.id not in seen and lesson.id not in lessons_on
    ]
    room = max(0, lesson_room(planned_papers + len(papers), days) - planned_lessons)
    lessons = unwatched
    if len(unwatched) > room:
        lessons = by_priority(unwatched, set(body.focus_chapters), _asked(db, module.id))[:room]

    # The cards in the order of their days, so the board's column reads like the plan.
    items: list[tuple[PlanKind, LibraryItem | Lesson]] = [("paper", p) for p in papers]
    items += [("lesson", lesson) for lesson in lessons]
    on_day = days_for([k for k, _ in items], days)
    order = sorted(range(len(items)), key=lambda i: (on_day[i] is None, on_day[i] or 0, items[i][0] == "paper"))
    check_room(db, user, len(items), f"This plan adds {len(items)} cards and your boards hold")

    now = utcnow()
    if plan is None:
        plan = BoardPlan(user_id=user.id, board_id=board.id, module_id=module.id, created_at=now)
        db.add(plan)
    plan.exam_date, plan.paper_every, plan.updated_at = body.exam_date, body.paper_every, now
    db.flush()

    position = end_position(cards_in(db, first.id))
    for i in order:
        db.add(
            BoardCard(
                user_id=user.id,
                board_id=board.id,
                column_id=first.id,
                position=position,
                plan_id=plan.id,
                created_at=now,
                updated_at=now,
                done_at=now if first.done else None,
                **_card(items[i][1], module),
            )
        )
        position += 1.0
    db.flush()
    rows = list(
        db.execute(
            select(BoardCard, BoardColumn)
            .join(BoardColumn, BoardColumn.id == BoardCard.column_id)
            .where(BoardCard.plan_id == plan.id)
        ).tuples()
    )
    return BoardPlanMade(plan=plan_out(plan, rows, today), added=len(items), left_out=len(unwatched) - len(lessons))


def delete_plan(db: Session, user: User, module_id: str) -> None:
    """Removes the module's plan and its cards still to do; the ones done stay on the board. 404 when there's no
    plan for the module."""
    plan = db.scalar(select(BoardPlan).where(BoardPlan.user_id == user.id, BoardPlan.module_id == module_id))
    if plan is None:
        raise not_found("There's no revision plan for this module on your boards.")
    for card in db.scalars(select(BoardCard).where(BoardCard.plan_id == plan.id, BoardCard.done_at.is_(None))):
        db.delete(card)
    db.delete(plan)
