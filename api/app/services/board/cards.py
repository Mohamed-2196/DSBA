"""Cards: what a board shows of each, adding, changing, moving and deleting them, the agenda across boards, and
lessons that finish their cards.

- A card's place in its column is `position`, a number between its neighbours', so a move writes one row.
- A card may point at a calendar event, a lesson, a module or a library item, once per board. Its title, address and
  (for an event) date are read from the hub every time the board loads, so a renamed or moved event shows as it is
  now.
- A lesson card moves to its board's first done column once the lesson is watched (`complete_lessons`).
- A revision plan's cards that aren't done are spread over the days left to the exam each time they are read, in
  board order (the columns nearest done first), so falling behind spreads the rest again and nothing is ever written
  to do it."""

from __future__ import annotations

import datetime as dt
import uuid
from collections.abc import Iterable, Sequence
from datetime import timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.errors import conflict, invalid
from app.core.time import bahrain_today, utcnow
from app.models import (
    Board,
    BoardCard,
    BoardCardLabel,
    BoardColumn,
    BoardComment,
    BoardLabel,
    BoardPlan,
    LessonView,
    Upload,
    UploadPurpose,
    UploadStatus,
    User,
)
from app.schemas.board import (
    Agenda,
    AgendaCard,
    BoardCardCreate,
    BoardCardMove,
    BoardCardUpdate,
    BoardDetail,
    BoardLink,
    BoardLinkState,
)
from app.schemas.board import BoardCard as BoardCardOut
from app.schemas.board import BoardPlan as BoardPlanOut
from app.services import ratelimit
from app.services.board.boards import active_boards, card_count, main_board, summaries
from app.services.board.common import (
    MAX_CARDS,
    cards_in,
    columns_of,
    end_position,
    get_board,
    get_column,
    gone_link,
    link_key,
    parse_uuid,
    position_after,
    resolve_links,
    top_position,
)
from app.services.board.reminders import schedule
from app.services.content import apply_patch
from app.services.uploads import IMAGE_CONTENT_TYPES

CREATE_LIMIT = 120
CREATE_WINDOW = timedelta(hours=1)
AGENDA_DAYS = 7
LINK_GONE = {
    "event": "This date isn't in the calendar any more.",
    "lesson": "This lesson doesn't exist.",
    "module": "This module doesn't exist.",
    "library_item": "This file isn't in the library.",
}


def file_url(upload_id: uuid.UUID) -> str:
    return f"/api/v1/board-files/{upload_id}"


# ── what a card shows ───────────────────────────────────────────────────────────────────────


def spread(cards: Sequence[BoardCard], exam_date: dt.date, today: dt.date) -> dict[uuid.UUID, dt.date]:
    """The day each of a plan's cards still to do falls on: evenly over the days from today to the day before the
    exam, in the order given. None on the exam day or after it."""
    days = (exam_date - today).days
    if days <= 0 or not cards:
        return {}
    n = len(cards)
    return {c.id: today + timedelta(days=i * days // n) for i, c in enumerate(cards)}


def _plans(db: Session, user_id: uuid.UUID) -> dict[uuid.UUID, BoardPlan]:
    q = select(BoardPlan).where(BoardPlan.user_id == user_id).order_by(BoardPlan.exam_date, BoardPlan.created_at)
    return {p.id: p for p in db.scalars(q)}


def _plan_cards(db: Session, user_id: uuid.UUID) -> list[tuple[BoardCard, BoardColumn]]:
    """Every card a plan added, with its column, in board order (each column's cards in order)."""
    q = (
        select(BoardCard, BoardColumn)
        .join(BoardColumn, BoardColumn.id == BoardCard.column_id)
        .where(BoardCard.user_id == user_id, BoardCard.plan_id.is_not(None))
        .order_by(BoardColumn.position, BoardCard.position, BoardCard.created_at)
    )
    return list(db.execute(q).tuples())


def plan_dates(
    rows: Sequence[tuple[BoardCard, BoardColumn]], plans: dict[uuid.UUID, BoardPlan], today: dt.date
) -> dict[uuid.UUID, dt.date]:
    """Each plan's cards not done, spread to its exam: the columns nearest done first, each in its order."""
    out: dict[uuid.UUID, dt.date] = {}
    for plan_id, plan in plans.items():
        mine = [(card, col) for card, col in rows if card.plan_id == plan_id and not col.done]
        mine.sort(key=lambda r: -r[1].position)  # stable: keeps each column's order
        out |= spread([card for card, _ in mine], plan.exam_date, today)
    return out


def plan_out(plan: BoardPlan, rows: Sequence[tuple[BoardCard, BoardColumn]], today: dt.date) -> BoardPlanOut:
    mine = [col for card, col in rows if card.plan_id == plan.id]
    done = sum(1 for col in mine if col.done)
    module = plan.module
    return BoardPlanOut(
        module_id=plan.module_id,
        module_name=module.short_name or module.name,
        board_id=plan.board_id,
        exam_date=plan.exam_date,
        paper_every=plan.paper_every,
        left=len(mine) - done,
        done=done,
        days_left=(plan.exam_date - today).days,
    )


class CardContext:
    """Everything the cards of one read need besides themselves, loaded in a few queries."""

    def __init__(self, db: Session, user: User, cards: Sequence[BoardCard]) -> None:
        ids = [c.id for c in cards]
        self.links = resolve_links(db, user, [k for c in cards if (k := link_key(c)) is not None])
        self.plans = _plans(db, user.id)
        self.plan_rows = _plan_cards(db, user.id) if self.plans else []
        self.plan_dates = plan_dates(self.plan_rows, self.plans, bahrain_today())
        self.labels: dict[uuid.UUID, list[uuid.UUID]] = {}
        self.files: dict[uuid.UUID, list[tuple[uuid.UUID, str]]] = {}
        self.comments: dict[uuid.UUID, int] = {}
        if not ids:
            return
        q_labels = (
            select(BoardCardLabel.card_id, BoardCardLabel.label_id)
            .join(BoardLabel, BoardLabel.id == BoardCardLabel.label_id)
            .where(BoardCardLabel.card_id.in_(ids))
            .order_by(BoardLabel.name)
        )
        for card_id, label_id in db.execute(q_labels).tuples():
            self.labels.setdefault(card_id, []).append(label_id)
        q_files = (
            select(Upload.card_id, Upload.id, Upload.content_type)
            .where(Upload.card_id.in_(ids), Upload.purpose == UploadPurpose.board)
            .order_by(Upload.completed_at)
        )
        for file_card, upload_id, content_type in db.execute(q_files).tuples():
            if file_card is not None:
                self.files.setdefault(file_card, []).append((upload_id, content_type))
        q_comments = (
            select(BoardComment.card_id, func.count())
            .where(BoardComment.card_id.in_(ids))
            .group_by(BoardComment.card_id)
        )
        self.comments = dict(db.execute(q_comments).tuples().all())

    def out(self, card: BoardCard) -> BoardCardOut:
        link = None
        if (key := link_key(card)) is not None:
            link = self.links.get(key) or gone_link(key)
        plan = self.plans.get(card.plan_id) if card.plan_id is not None else None
        files = self.files.get(card.id, [])
        cover = next((i for i, t in files if i == card.cover_id and t in IMAGE_CONTENT_TYPES), None)
        return BoardCardOut.model_validate(
            {
                "id": card.id,
                "board_id": card.board_id,
                "column_id": card.column_id,
                "title": card.title,
                "description": card.description,
                "due_date": card.due_date,
                "due_time": card.due_time,
                "remind_before": card.remind_before,
                "priority": card.priority,
                "label_ids": self.labels.get(card.id, []),
                "checklist": card.checklist,
                "link": link,
                "plan_module_id": plan.module_id if plan else None,
                "plan_date": self.plan_dates.get(card.id),
                "cover_url": file_url(cover) if cover else None,
                "attachment_count": len(files),
                "comment_count": self.comments.get(card.id, 0),
                "created_at": card.created_at,
                "done_at": card.done_at,
            }
        )


def card_out(db: Session, user: User, card: BoardCard) -> BoardCardOut:
    return CardContext(db, user, [card]).out(card)


def board_detail(db: Session, user: User, board: Board) -> BoardDetail:
    """The board's cards, column by column, each in order, and its revision plans, nearest exam first."""
    columns = columns_of(db, [board.id])
    order = {c.id: i for i, c in enumerate(columns)}
    cards = list(
        db.scalars(
            select(BoardCard).where(BoardCard.board_id == board.id).order_by(BoardCard.position, BoardCard.created_at)
        )
    )
    cards.sort(key=lambda c: order.get(c.column_id, len(order)))  # stable: keeps each column's order
    ctx = CardContext(db, user, cards)
    today = bahrain_today()
    return BoardDetail(
        board=summaries(db, [board])[0],
        cards=[ctx.out(c) for c in cards],
        plans=[plan_out(p, ctx.plan_rows, today) for p in ctx.plans.values() if p.board_id == board.id],
    )


# ── writing ─────────────────────────────────────────────────────────────────────────────────


def _canonical_link(db: Session, user: User, kind: str, raw: str) -> tuple[str, BoardLink]:
    """The link's stored id and what it points at, or 422 on link.id when there's nothing there for `user`."""
    ident = raw
    if kind == "library_item" and (u := parse_uuid(raw)) is not None:
        ident = str(u)
    link = resolve_links(db, user, [(kind, ident)]).get((kind, ident))
    if link is None:
        raise invalid("link.id", LINK_GONE[kind])
    return ident, link


def watched(db: Session, user_id: uuid.UUID, lesson_id: str) -> bool:
    q = select(LessonView.lesson_id).where(LessonView.user_id == user_id, LessonView.lesson_id == lesson_id)
    return db.scalar(q) is not None


def first_done(db: Session, board_id: uuid.UUID) -> BoardColumn | None:
    return next((c for c in columns_of(db, [board_id]) if c.done), None)


def check_room(db: Session, user: User, adding: int = 1, what: str | None = None) -> None:
    """409 board_full when `adding` more cards would pass MAX_CARDS."""
    if card_count(db, user.id) + adding > MAX_CARDS:
        lead = what or "Your boards hold"
        raise conflict("board_full", f"{lead} {MAX_CARDS} cards. Delete some you've finished first.")


def _set_labels(db: Session, user: User, card: BoardCard, label_ids: Iterable[uuid.UUID]) -> None:
    wanted = set(label_ids)
    if wanted:
        mine = set(db.scalars(select(BoardLabel.id).where(BoardLabel.user_id == user.id, BoardLabel.id.in_(wanted))))
        if mine != wanted:
            raise invalid("labelIds", "One of these labels isn't there any more. Reload the board.")
    db.execute(delete(BoardCardLabel).where(BoardCardLabel.card_id == card.id))
    for label_id in wanted:
        db.add(BoardCardLabel(card_id=card.id, label_id=label_id))


def _target(db: Session, user: User, body: BoardCardCreate) -> tuple[Board, BoardColumn]:
    if body.column_id is not None:
        column, board = get_column(db, user, body.column_id)
        return board, column
    board = get_board(db, user, body.board_id) if body.board_id is not None else main_board(db, user)
    return board, columns_of(db, [board.id])[0]


def create_card(db: Session, user: User, body: BoardCardCreate) -> BoardCard:
    """A card at the end of its column (a watched lesson goes to the top of the board's first done column). 409
    board_full at MAX_CARDS, 409 already_on_board for a second card for the same thing on a board, 429 after
    CREATE_LIMIT new cards in an hour."""
    ratelimit.enforce(
        db,
        f"board:{user.id}",
        BoardCard.created_at,
        [BoardCard.user_id == user.id, BoardCard.plan_id.is_(None)],
        limit=CREATE_LIMIT,
        window=CREATE_WINDOW,
        message="You've added a lot of cards. Try again in {}.",
    )
    check_room(db, user)
    board, column = _target(db, user, body)
    link_type = link_id = lesson_id = None
    title = body.title
    if body.link is not None:
        link_type = body.link.type
        ident, link = _canonical_link(db, user, link_type, body.link.id)
        same = BoardCard.lesson_id == ident if link_type == "lesson" else BoardCard.link_id == ident
        existing = db.scalar(
            select(BoardCard.id).where(BoardCard.board_id == board.id, BoardCard.link_type == link_type, same)
        )
        if existing is not None:
            raise conflict("already_on_board", "That's already on this board.")
        title = title or (link.title or "")[:200]
        if link_type == "lesson":
            lesson_id = ident
            if watched(db, user.id, ident) and (done := first_done(db, board.id)) is not None:
                column = done
        else:
            link_id = ident
    if not title:
        raise invalid("title", "Give the card a title.")
    now = utcnow()
    others = cards_in(db, column.id)
    card = BoardCard(
        user_id=user.id,
        board_id=board.id,
        column_id=column.id,
        position=top_position(others) if column.done else end_position(others),
        title=title,
        description=body.description or None,
        due_date=body.due_date,
        due_time=body.due_time if body.due_date else None,
        priority=body.priority,
        checklist=[],
        link_type=link_type,
        link_id=link_id,
        lesson_id=lesson_id,
        created_at=now,
        updated_at=now,
        done_at=now if column.done else None,
    )
    db.add(card)
    db.flush()
    _set_labels(db, user, card, body.label_ids)
    return card


def _check_cover(db: Session, card: BoardCard, cover_id: uuid.UUID) -> None:
    q = select(Upload.content_type).where(
        Upload.id == cover_id,
        Upload.card_id == card.id,
        Upload.purpose == UploadPurpose.board,
        Upload.status == UploadStatus.attached,
    )
    if db.scalar(q) not in IMAGE_CONTENT_TYPES:
        raise invalid("coverId", "Choose one of the card's pictures.")


def update_card(db: Session, user: User, card: BoardCard, body: BoardCardUpdate) -> None:
    """Fields that are not sent stay; null clears. A due time needs a due date; clearing the date clears the
    time."""
    sent = body.model_fields_set
    if "cover_id" in sent and body.cover_id is not None:
        _check_cover(db, card, body.cover_id)
    if "checklist" in sent and body.checklist is not None:
        ids = [i.id for i in body.checklist]
        if len(set(ids)) != len(ids):
            raise invalid("checklist", "Two to-dos have the same id. Reload the card and try again.")
    changed = apply_patch(
        card,
        body,
        ("title", "description", "due_date", "due_time", "remind_before", "priority", "checklist", "cover_id"),
        clearable=("description", "due_date", "due_time", "remind_before", "cover_id"),
    )
    if card.due_date is None and card.due_time is not None:
        card.due_time = None
    if "label_ids" in sent and body.label_ids is not None:
        _set_labels(db, user, card, body.label_ids)
        changed.append("label_ids")
    if changed:
        card.updated_at = utcnow()
        schedule(card)


def move_card(db: Session, user: User, card: BoardCard, body: BoardCardMove) -> None:
    """Into `columnId`, right after `afterId` or at the top; to another board too, unless that board already has
    a card for the same hub thing (409 already_on_board). 409 retry when `afterId` isn't in that column any more
    (the board changed in another tab)."""
    column, board = get_column(db, user, body.column_id)
    if board.id != card.board_id:
        key = link_key(card)
        if key is not None:
            same = BoardCard.lesson_id == key[1] if key[0] == "lesson" else BoardCard.link_id == key[1]
            q = select(BoardCard.id).where(BoardCard.board_id == board.id, BoardCard.link_type == key[0], same)
            if db.scalar(q) is not None:
                raise conflict("already_on_board", "That board already has a card for this.")
        if card.plan_id is not None:  # a plan's cards stay on its board
            card.plan_id = None
        card.board_id = board.id
    others = [c for c in cards_in(db, column.id) if c.id != card.id]
    card.position = position_after(others, body.after_id)
    was_done = card.done_at is not None
    if column.done != was_done:
        card.done_at = utcnow() if column.done else None
    card.column_id = column.id
    card.updated_at = utcnow()
    schedule(card)


def delete_card(db: Session, card: BoardCard) -> None:
    """The card, its labels and comments. Its files lose their card, and the sweep deletes them from the bucket."""
    db.delete(card)


def complete_lessons(db: Session, user_id: uuid.UUID) -> None:
    """Moves the cards for lessons `user_id` has watched to the top of their board's first done column (a board
    without one keeps them where they are)."""
    seen = select(LessonView.lesson_id).where(LessonView.user_id == user_id)
    cards = db.scalars(
        select(BoardCard)
        .where(BoardCard.user_id == user_id, BoardCard.lesson_id.in_(seen), BoardCard.done_at.is_(None))
        .order_by(BoardCard.position)
    ).all()
    if not cards:
        return
    now = utcnow()
    done_columns: dict[uuid.UUID, BoardColumn | None] = {}
    for card in reversed(cards):
        if card.board_id not in done_columns:
            done_columns[card.board_id] = first_done(db, card.board_id)
        done = done_columns[card.board_id]
        if done is None:
            continue
        card.column_id, card.position = done.id, top_position(cards_in(db, done.id))
        card.done_at = card.updated_at = now
        card.remind_at = None
        db.flush()


# ── across boards ───────────────────────────────────────────────────────────────────────────


def agenda(db: Session, user: User, days: int = AGENDA_DAYS) -> Agenda:
    """The cards not done on the active boards that are due within `days` from today, or overdue: by day, then
    time (cards without one last that day), then board."""
    today = bahrain_today()
    until = today + timedelta(days=days)
    boards = {b.id: (i, b) for i, b in enumerate(active_boards(db, user.id))}
    if not boards:
        return Agenda(today=today, until=until, cards=[])
    q = (
        select(BoardCard)
        .join(BoardColumn, BoardColumn.id == BoardCard.column_id)
        .where(BoardCard.board_id.in_(boards), BoardColumn.done.is_(False))
        .order_by(BoardColumn.position, BoardCard.position)
    )
    cards = list(db.scalars(q))
    ctx = CardContext(db, user, cards)
    found: list[tuple[tuple[dt.date, dt.time, int], AgendaCard]] = []
    for card in cards:
        out = ctx.out(card)
        due = out.due_date or out.plan_date or (out.link.date if out.link else None)
        if due is None or due > until:
            continue
        rank, board = boards[card.board_id]
        found.append(
            (
                (due, out.due_time or dt.time.max, rank),
                AgendaCard.model_validate(
                    {
                        **out.model_dump(),
                        "board_name": board.name,
                        "board_emoji": board.emoji,
                        "board_color": board.color,
                        "due": due,
                    }
                ),
            )
        )
    found.sort(key=lambda r: r[0])
    return Agenda(today=today, until=until, cards=[c for _, c in found])


def link_states(db: Session, user: User) -> list[BoardLinkState]:
    """Every hub thing on the student's boards (archived ones too), and whether its card is done."""
    q = select(BoardCard).where(BoardCard.user_id == user.id, BoardCard.link_type.is_not(None))
    out = []
    for card in db.scalars(q.order_by(BoardCard.created_at)):
        key = link_key(card)
        if key is None:
            continue
        out.append(
            BoardLinkState.model_validate(
                {
                    "type": key[0],
                    "id": key[1],
                    "card_id": card.id,
                    "board_id": card.board_id,
                    "done": card.done_at is not None,
                }
            )
        )
    return out
