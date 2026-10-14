"""The study board (R-4): each student's private cards in three fixed columns.

- A card's place in its column is `position`, a number between its neighbours', so a move writes one row. When two
  neighbours get too close to split, the column is numbered again.
- A card may point at a calendar event, a lesson, a module or a library item, once per board. Its title, address and
  (for an event) date are read from the hub every time the board loads, so a renamed or moved event shows as it is
  now.
- A lesson card moves to Done once the lesson is watched (`complete_lessons`, called when progress is saved).
- A revision plan (one per module) adds a card for each lesson not watched yet and a past paper every few days. Its
  cards that aren't done are spread over the days left to the exam each time the board is read, in board order
  (In progress first), so falling behind spreads the rest again and nothing is ever written to do it."""

from __future__ import annotations

import datetime as dt
import uuid
from collections.abc import Iterable, Sequence
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.access import Feature
from app.core.errors import conflict, invalid, not_found
from app.core.time import bahrain_today, utcnow
from app.models import BoardCard, BoardPlan, CalendarEvent, ItemStatus, LessonView, LibraryItem, Module, User
from app.schemas.board import (
    Board,
    BoardCardCreate,
    BoardCardMove,
    BoardCardUpdate,
    BoardColumn,
    BoardLink,
    BoardPlanCreate,
    BoardPlanMade,
)
from app.schemas.board import BoardCard as BoardCardOut
from app.schemas.board import BoardPlan as BoardPlanOut
from app.services import access, ratelimit
from app.services.content import apply_patch
from app.services.modules import (
    MODULE_UNKNOWN,
    lesson_name,
    lesson_path,
    student_lessons,
    visible_chapters,
    visible_lessons,
)

MAX_CARDS = 500
CREATE_LIMIT = 120
CREATE_WINDOW = timedelta(hours=1)
COLUMNS: tuple[BoardColumn, ...] = ("todo", "doing", "done")
CARD_GONE = "This card isn't on your board any more. Reload the board."
LINK_GONE = {
    "event": "This date isn't in the calendar any more.",
    "lesson": "This lesson doesn't exist.",
    "module": "This module doesn't exist.",
    "library_item": "This file isn't in the library.",
}
LinkKey = tuple[str, str]
PLAN_LIMIT = 20
PLAN_WINDOW = timedelta(hours=1)
PLAN_HORIZON_DAYS = 366
PAST_PAPER = "past-paper"


# ── reading ─────────────────────────────────────────────────────────────────────────────────


def _cards(db: Session, user_id: uuid.UUID, column: str | None = None) -> list[BoardCard]:
    q = select(BoardCard).where(BoardCard.user_id == user_id)
    if column is not None:
        q = q.where(BoardCard.column == column)
    return list(db.scalars(q.order_by(BoardCard.position, BoardCard.created_at)))


def link_key(card: BoardCard) -> LinkKey | None:
    """(type, id) of what the card points at: a lesson's id is `lesson_id`, anything else's `link_id`."""
    ident = card.lesson_id if card.link_type == "lesson" else card.link_id
    return (card.link_type, ident) if card.link_type and ident else None


def resolve_links(db: Session, user: User | None, keys: Iterable[LinkKey]) -> dict[LinkKey, BoardLink]:
    """What each (type, id) points at now. A thing that is gone, or in a feature switched off for `user`, has no
    title or address."""
    wanted: dict[str, set[str]] = {}
    for kind, ident in keys:
        wanted.setdefault(kind, set()).add(ident)
    found: dict[LinkKey, BoardLink] = {}

    if (ids := wanted.get("event")) and access.feature_on(db, user, Feature.calendar):
        for e in db.scalars(select(CalendarEvent).where(CalendarEvent.id.in_(ids))):
            found["event", e.id] = BoardLink(
                type="event",
                id=e.id,
                title=e.title,
                url=f"/calendar?event={e.id}",
                date=e.end_date or e.date,
                kind=None,
                module_id=e.module_id,
            )
    if ids := wanted.get("library_item"):
        uuids = [u for u in (_uuid(i) for i in ids) if u is not None]
        if uuids and access.feature_on(db, user, Feature.library):
            q = select(LibraryItem).where(LibraryItem.id.in_(uuids), LibraryItem.status == ItemStatus.published)
            for item in db.scalars(q):
                found["library_item", str(item.id)] = BoardLink(
                    type="library_item",
                    id=str(item.id),
                    title=item.title,
                    url=f"/library/{item.slug}",
                    date=None,
                    kind=item.kind,
                    module_id=item.module_id,
                )
    if module_ids := wanted.get("module"):
        for module in db.scalars(select(Module).where(Module.id.in_(module_ids), Module.hidden.is_(False))):
            found["module", module.id] = BoardLink(
                type="module",
                id=module.id,
                title=module.name,
                url=f"/modules/{module.id}",
                date=None,
                kind=None,
                module_id=module.id,
            )
    for lesson in student_lessons(db, wanted.get("lesson", ())).values():
        title = f"{lesson.chapter.module.short_name}: {lesson_name(lesson)}"
        found["lesson", lesson.id] = BoardLink(
            type="lesson",
            id=lesson.id,
            title=title,
            url=lesson_path(lesson),
            date=None,
            kind=None,
            module_id=lesson.module_id,
        )
    return found


def _uuid(raw: str) -> uuid.UUID | None:
    try:
        return uuid.UUID(raw)
    except ValueError:
        return None


def _out(
    card: BoardCard,
    links: dict[LinkKey, BoardLink],
    plans: dict[uuid.UUID, BoardPlan],
    plan_dates: dict[uuid.UUID, dt.date],
) -> BoardCardOut:
    link = None
    if (key := link_key(card)) is not None:
        link = links.get(key) or BoardLink.model_validate(
            {"type": key[0], "id": key[1], "title": None, "url": None, "date": None, "kind": None, "module_id": None}
        )
    plan = plans.get(card.plan_id) if card.plan_id is not None else None
    return BoardCardOut.model_validate(
        {
            "id": card.id,
            "column": card.column,
            "title": card.title,
            "note": card.note,
            "due_date": card.due_date,
            "link": link,
            "plan_module_id": plan.module_id if plan else None,
            "plan_date": plan_dates.get(card.id),
            "created_at": card.created_at,
            "done_at": card.done_at,
        }
    )


def _plans(db: Session, user_id: uuid.UUID) -> dict[uuid.UUID, BoardPlan]:
    q = select(BoardPlan).where(BoardPlan.user_id == user_id).order_by(BoardPlan.exam_date, BoardPlan.created_at)
    return {p.id: p for p in db.scalars(q)}


def spread(cards: Sequence[BoardCard], exam_date: dt.date, today: dt.date) -> dict[uuid.UUID, dt.date]:
    """The day each of a plan's cards still to do falls on: evenly over the days from today to the day before the
    exam, in the order given. None on the exam day or after it."""
    days = (exam_date - today).days
    if days <= 0 or not cards:
        return {}
    n = len(cards)
    return {c.id: today + timedelta(days=i * days // n) for i, c in enumerate(cards)}


def _plan_dates(
    cards: Sequence[BoardCard], plans: dict[uuid.UUID, BoardPlan], today: dt.date
) -> dict[uuid.UUID, dt.date]:
    out: dict[uuid.UUID, dt.date] = {}
    for plan_id, plan in plans.items():
        mine = [c for c in cards if c.plan_id == plan_id and c.column != "done"]
        mine.sort(key=lambda c: 0 if c.column == "doing" else 1)  # stable: In progress first, then To do in order
        out |= spread(mine, plan.exam_date, today)
    return out


def _plan_out(plan: BoardPlan, cards: Sequence[BoardCard], today: dt.date) -> BoardPlanOut:
    mine = [c for c in cards if c.plan_id == plan.id]
    done = sum(1 for c in mine if c.column == "done")
    module = plan.module
    return BoardPlanOut(
        module_id=plan.module_id,
        module_name=module.short_name or module.name,
        exam_date=plan.exam_date,
        paper_every=plan.paper_every,
        left=len(mine) - done,
        done=done,
        days_left=(plan.exam_date - today).days,
    )


def card_out(db: Session, user: User, card: BoardCard) -> BoardCardOut:
    """One card as the board shows it (its plan day counted among the plan's other cards)."""
    key = link_key(card)
    links = resolve_links(db, user, [key] if key else [])
    plans = _plans(db, user.id)
    dates: dict[uuid.UUID, dt.date] = {}
    if card.plan_id in plans:
        dates = _plan_dates(_cards(db, user.id), {card.plan_id: plans[card.plan_id]}, bahrain_today())
    return _out(card, links, plans, dates)


def board_of(db: Session, user: User) -> Board:
    """Every card, To do first, each column in its order, and the revision plans, nearest exam first."""
    cards = _cards(db, user.id)
    cards.sort(key=lambda c: COLUMNS.index(c.column))  # stable: keeps each column's order
    links = resolve_links(db, user, [k for c in cards if (k := link_key(c)) is not None])
    plans = _plans(db, user.id)
    today = bahrain_today()
    dates = _plan_dates(cards, plans, today)
    return Board(
        cards=[_out(c, links, plans, dates) for c in cards],
        plans=[_plan_out(p, cards, today) for p in plans.values()],
        limit=MAX_CARDS,
    )


def get_card(db: Session, user: User, card_id: uuid.UUID) -> BoardCard:
    """One of `user`'s cards. Anyone else's is 404, like a card that doesn't exist."""
    card = db.get(BoardCard, card_id)
    if card is None or card.user_id != user.id:
        raise not_found(CARD_GONE)
    return card


# ── places ──────────────────────────────────────────────────────────────────────────────────


def _renumber(cards: Sequence[BoardCard]) -> None:
    for i, c in enumerate(cards):
        c.position = float(i + 1)


def _place(db: Session, card: BoardCard, column: str, after: BoardCard | None) -> None:
    """Puts `card` in `column` right after `after`, or at the top. One row changes unless the column needs
    numbering again."""
    others = [c for c in _cards(db, card.user_id, column) if c.id != card.id]
    index = 0 if after is None else next(i for i, c in enumerate(others) if c.id == after.id) + 1
    before = others[index - 1].position if index > 0 else None
    following = others[index].position if index < len(others) else None
    if before is None:
        position = 1.0 if following is None else following - 1.0
    elif following is None:
        position = before + 1.0
    else:
        position = (before + following) / 2
        if not before < position < following:  # too close to split: number the column again
            _renumber(others)
            position = index + 0.5
    card.position = position
    if card.column != column:
        card.done_at = utcnow() if column == "done" else None
    card.column = column


def _end_of(db: Session, user_id: uuid.UUID, column: str) -> float:
    last = db.scalar(
        select(func.max(BoardCard.position)).where(BoardCard.user_id == user_id, BoardCard.column == column)
    )
    return 1.0 if last is None else last + 1.0


def _top_of(db: Session, user_id: uuid.UUID, column: str) -> float:
    first = db.scalar(
        select(func.min(BoardCard.position)).where(BoardCard.user_id == user_id, BoardCard.column == column)
    )
    return 1.0 if first is None else first - 1.0


# ── writing ─────────────────────────────────────────────────────────────────────────────────


def _canonical_link(db: Session, user: User, kind: str, raw: str) -> tuple[str, BoardLink]:
    """The link's stored id and what it points at, or 422 on link.id when there's nothing there for `user`."""
    ident = raw
    if kind == "library_item" and (u := _uuid(raw)) is not None:
        ident = str(u)
    link = resolve_links(db, user, [(kind, ident)]).get((kind, ident))
    if link is None:
        raise invalid("link.id", LINK_GONE[kind])
    return ident, link


def _watched(db: Session, user_id: uuid.UUID, lesson_id: str) -> bool:
    q = select(LessonView.lesson_id).where(LessonView.user_id == user_id, LessonView.lesson_id == lesson_id)
    return db.scalar(q) is not None


def create_card(db: Session, user: User, body: BoardCardCreate) -> BoardCard:
    """A card at the end of its column (a watched lesson goes to the top of Done). 409 board_full at MAX_CARDS,
    409 already_on_board for a second card for the same thing, 429 after CREATE_LIMIT new cards in an hour."""
    ratelimit.enforce(
        db,
        f"board:{user.id}",
        BoardCard.created_at,
        [BoardCard.user_id == user.id, BoardCard.plan_id.is_(None)],
        limit=CREATE_LIMIT,
        window=CREATE_WINDOW,
        message="You've added a lot of cards. Try again in {}.",
    )
    count = db.scalar(select(func.count()).select_from(BoardCard).where(BoardCard.user_id == user.id)) or 0
    if count >= MAX_CARDS:
        raise conflict("board_full", f"Your board holds {MAX_CARDS} cards. Delete some you've finished first.")
    column: str = body.column
    link_type = link_id = lesson_id = None
    title = body.title
    if body.link is not None:
        link_type = body.link.type
        ident, link = _canonical_link(db, user, link_type, body.link.id)
        same = BoardCard.lesson_id == ident if link_type == "lesson" else BoardCard.link_id == ident
        existing = db.scalar(
            select(BoardCard.id).where(BoardCard.user_id == user.id, BoardCard.link_type == link_type, same)
        )
        if existing is not None:
            raise conflict("already_on_board", "That's already on your board.")
        title = title or (link.title or "")[:200]
        if link_type == "lesson":
            lesson_id = ident
            if _watched(db, user.id, ident):
                column = "done"
        else:
            link_id = ident
    if not title:
        raise invalid("title", "Give the card a title.")
    now = utcnow()
    position = _top_of(db, user.id, column) if column == "done" else _end_of(db, user.id, column)
    card = BoardCard(
        user_id=user.id,
        column=column,
        position=position,
        title=title,
        note=body.note or None,
        due_date=body.due_date,
        link_type=link_type,
        link_id=link_id,
        lesson_id=lesson_id,
        created_at=now,
        updated_at=now,
        done_at=now if column == "done" else None,
    )
    db.add(card)
    db.flush()
    return card


def update_card(db: Session, card: BoardCard, body: BoardCardUpdate) -> None:
    if apply_patch(card, body, ("title", "note", "due_date"), clearable=("note", "due_date")):
        card.updated_at = utcnow()


def move_card(db: Session, user: User, card: BoardCard, body: BoardCardMove) -> None:
    """409 retry when `afterId` isn't in that column any more (the board changed in another tab)."""
    after = None
    if body.after_id is not None:
        after = db.get(BoardCard, body.after_id)
        if after is None or after.user_id != user.id or after.column != body.column or after.id == card.id:
            raise conflict("retry", "Your board changed in another tab. Reload it and try again.")
    _place(db, card, body.column, after)
    card.updated_at = utcnow()


def delete_card(db: Session, card: BoardCard) -> None:
    db.delete(card)


def complete_lessons(db: Session, user_id: uuid.UUID) -> None:
    """Moves the cards for lessons `user_id` has watched to the top of Done."""
    watched = select(LessonView.lesson_id).where(LessonView.user_id == user_id)
    cards = db.scalars(
        select(BoardCard)
        .where(
            BoardCard.user_id == user_id,
            BoardCard.lesson_id.in_(watched),
            BoardCard.column != "done",
        )
        .order_by(BoardCard.position)
    ).all()
    if not cards:
        return
    now = utcnow()
    top = _top_of(db, user_id, "done")
    for i, card in enumerate(reversed(cards)):
        card.column, card.position, card.done_at, card.updated_at = "done", top - i, now, now


# ── revision plans ──────────────────────────────────────────────────────────────────────────


def _interleave(lessons: list[str], papers: list[str]) -> list[tuple[str, str]]:
    """Lessons in order with the papers spread among them, each paper closing its share of the lessons."""
    items: list[tuple[str, str]] = [("lesson", i) for i in lessons]
    for j, paper in enumerate(papers):
        at = round((j + 1) * len(lessons) / len(papers)) + j
        items.insert(at, ("library_item", paper))
    return items


def make_plan(db: Session, user: User, body: BoardPlanCreate) -> BoardPlanMade:
    """Plans `body.moduleId` up to the exam: a card in To do for each lesson not watched and not on the board, in the
    module's order, and a past paper (newest sittings first, the oldest of them first) every `paperEvery` days among
    them. 422 on moduleId or examDate, 409 board_full when the cards wouldn't fit, 429 after PLAN_LIMIT plans in
    an hour."""
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

    on_board = db.execute(
        select(BoardCard.link_type, BoardCard.link_id, BoardCard.lesson_id).where(BoardCard.user_id == user.id)
    ).all()
    lessons_on = {lesson for _t, _l, lesson in on_board if lesson}
    items_on = {link for t, link, _ in on_board if t == "library_item" and link}
    watched = set(db.scalars(select(LessonView.lesson_id).where(LessonView.user_id == user.id)))
    lessons = [
        lesson.id
        for chapter in visible_chapters(module)
        for lesson in visible_lessons(chapter)
        if lesson.id not in watched and lesson.id not in lessons_on
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

    count = db.scalar(select(func.count()).select_from(BoardCard).where(BoardCard.user_id == user.id)) or 0
    items = _interleave(lessons, papers)
    if count + len(items) > MAX_CARDS:
        raise conflict(
            "board_full",
            f"This plan adds {len(items)} cards and your board holds {MAX_CARDS}. Delete some you've finished first.",
        )

    now = utcnow()
    plan = db.scalar(select(BoardPlan).where(BoardPlan.user_id == user.id, BoardPlan.module_id == module.id))
    if plan is None:
        plan = BoardPlan(user_id=user.id, module_id=module.id, created_at=now)
        db.add(plan)
    plan.exam_date, plan.paper_every, plan.updated_at = body.exam_date, body.paper_every, now
    db.flush()

    links = resolve_links(db, user, items)
    position = _end_of(db, user.id, "todo")
    added = 0
    for kind, ident in items:
        link = links.get((kind, ident))
        if link is None or not link.title:
            continue
        db.add(
            BoardCard(
                user_id=user.id,
                column="todo",
                position=position,
                title=link.title[:200],
                link_type=kind,
                link_id=None if kind == "lesson" else ident,
                lesson_id=ident if kind == "lesson" else None,
                plan_id=plan.id,
                created_at=now,
                updated_at=now,
            )
        )
        position += 1.0
        added += 1
    db.flush()
    return BoardPlanMade(plan=_plan_out(plan, _cards(db, user.id), today), added=added)


def delete_plan(db: Session, user: User, module_id: str) -> None:
    """Removes the module's plan and its cards still to do; the ones done stay on the board. 404 when there's no
    plan for the module."""
    plan = db.scalar(select(BoardPlan).where(BoardPlan.user_id == user.id, BoardPlan.module_id == module_id))
    if plan is None:
        raise not_found("There's no revision plan for this module on your board.")
    for card in db.scalars(select(BoardCard).where(BoardCard.plan_id == plan.id, BoardCard.column != "done")):
        db.delete(card)
    db.delete(plan)
