"""Revision plans (one per module): a card in the board's first column for each lesson not watched yet and a past
paper every few days. Their cards that aren't done are spread over the days left to the exam whenever they are read
(cards.plan_dates)."""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.access import Feature
from app.core.errors import invalid, not_found
from app.core.time import bahrain_today, utcnow
from app.models import BoardCard, BoardColumn, BoardPlan, ItemStatus, LessonView, LibraryItem, Module, User
from app.schemas.board import BoardPlanCreate, BoardPlanMade
from app.services import access, ratelimit
from app.services.board.boards import main_board
from app.services.board.cards import check_room, plan_out
from app.services.board.common import cards_in, columns_of, end_position, get_board, resolve_links
from app.services.modules import MODULE_UNKNOWN, visible_chapters, visible_lessons

PLAN_LIMIT = 20
PLAN_WINDOW = timedelta(hours=1)
PLAN_HORIZON_DAYS = 366
PAST_PAPER = "past-paper"


def _interleave(lessons: list[str], papers: list[str]) -> list[tuple[str, str]]:
    """Lessons in order with the papers spread among them, each paper closing its share of the lessons."""
    items: list[tuple[str, str]] = [("lesson", i) for i in lessons]
    for j, paper in enumerate(papers):
        at = round((j + 1) * len(lessons) / len(papers)) + j
        items.insert(at, ("library_item", paper))
    return items


def make_plan(db: Session, user: User, body: BoardPlanCreate) -> BoardPlanMade:
    """Plans `body.moduleId` up to the exam on the plan's board (a new plan: `boardId`, else the student's first
    board): a card in its first column for each lesson not watched and not on that board, in the module's order, and
    a past paper (newest sittings first, the oldest of them first) every `paperEvery` days among them. 422 on
    moduleId or examDate, 404 for a board that isn't the student's, 409 board_full when the cards wouldn't fit, 429
    after PLAN_LIMIT plans in an hour."""
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

    on_board = db.execute(
        select(BoardCard.link_type, BoardCard.link_id, BoardCard.lesson_id).where(BoardCard.board_id == board.id)
    ).all()
    lessons_on = {lesson for _t, _l, lesson in on_board if lesson}
    items_on = {link for t, link, _ in on_board if t == "library_item" and link}
    seen = set(db.scalars(select(LessonView.lesson_id).where(LessonView.user_id == user.id)))
    lessons = [
        lesson.id
        for chapter in visible_chapters(module)
        for lesson in visible_lessons(chapter)
        if lesson.id not in seen and lesson.id not in lessons_on
    ]
    days = (body.exam_date - today).days
    papers: list[str] = []
    if access.feature_on(db, user, Feature.library) and days >= body.paper_every:
        q = (
            select(LibraryItem.id)
            .where(
                LibraryItem.module_id == module.id,
                LibraryItem.kind == PAST_PAPER,
                LibraryItem.status == ItemStatus.published,
            )
            .order_by(LibraryItem.exam_year.desc().nulls_last(), LibraryItem.zone, LibraryItem.title)
        )
        fresh = [str(i) for i in db.scalars(q) if str(i) not in items_on]
        papers = list(reversed(fresh[: days // body.paper_every]))

    items = _interleave(lessons, papers)
    check_room(db, user, len(items), f"This plan adds {len(items)} cards and your boards hold")

    now = utcnow()
    if plan is None:
        plan = BoardPlan(user_id=user.id, board_id=board.id, module_id=module.id, created_at=now)
        db.add(plan)
    plan.exam_date, plan.paper_every, plan.updated_at = body.exam_date, body.paper_every, now
    db.flush()

    links = resolve_links(db, user, items)
    position = end_position(cards_in(db, first.id))
    added = 0
    for kind, ident in items:
        link = links.get((kind, ident))
        if link is None or not link.title:
            continue
        db.add(
            BoardCard(
                user_id=user.id,
                board_id=board.id,
                column_id=first.id,
                position=position,
                title=link.title[:200],
                checklist=[],
                link_type=kind,
                link_id=None if kind == "lesson" else ident,
                lesson_id=ident if kind == "lesson" else None,
                plan_id=plan.id,
                created_at=now,
                updated_at=now,
                done_at=now if first.done else None,
            )
        )
        position += 1.0
        added += 1
    db.flush()
    rows = list(
        db.execute(
            select(BoardCard, BoardColumn)
            .join(BoardColumn, BoardColumn.id == BoardCard.column_id)
            .where(BoardCard.plan_id == plan.id)
        ).tuples()
    )
    return BoardPlanMade(plan=plan_out(plan, rows, today), added=added)


def delete_plan(db: Session, user: User, module_id: str) -> None:
    """Removes the module's plan and its cards still to do; the ones done stay on the board. 404 when there's no
    plan for the module."""
    plan = db.scalar(select(BoardPlan).where(BoardPlan.user_id == user.id, BoardPlan.module_id == module_id))
    if plan is None:
        raise not_found("There's no revision plan for this module on your boards.")
    for card in db.scalars(select(BoardCard).where(BoardCard.plan_id == plan.id, BoardCard.done_at.is_(None))):
        db.delete(card)
    db.delete(plan)
