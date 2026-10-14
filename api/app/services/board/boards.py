"""Boards, their columns and the student's labels.

- A board starts from a template's columns. Its columns can be added, renamed, reordered, marked done or deleted
  (its cards move to another column first). A board keeps at least one column.
- Cards in a column marked done count as done: they get `done_at`, leave the agenda and stop reminding.
- An archived board keeps its cards but leaves the board tabs, the agenda and the add-to-board buttons."""

from __future__ import annotations

import uuid
from datetime import timedelta

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.core.errors import conflict, invalid, not_found
from app.core.time import utcnow
from app.models import Board, BoardCard, BoardColumn, BoardLabel, Upload, UploadPurpose, UploadStatus, User
from app.schemas.board import (
    AfterId,
    BoardCreate,
    Boards,
    BoardSummary,
    BoardTemplate,
    BoardUpdate,
    BoardUsage,
    ColumnCreate,
    ColumnUpdate,
    LabelCreate,
    LabelUpdate,
)
from app.schemas.board import BoardColumn as BoardColumnOut
from app.schemas.board import (
    BoardLabel as BoardLabelOut,
)
from app.services import ratelimit
from app.services.board.common import (
    MAX_BOARDS,
    MAX_CARDS,
    MAX_COLUMNS,
    MAX_LABELS,
    MAX_STORAGE_BYTES,
    cards_in,
    columns_of,
    end_position,
    position_after,
    top_position,
)
from app.services.board.reminders import schedule
from app.services.content import apply_patch

BOARD_LIMIT = 30  # new boards an hour
BOARD_WINDOW = timedelta(hours=1)

# Each template's columns: (name, cards there count as done).
TEMPLATES: dict[BoardTemplate, tuple[tuple[str, bool], ...]] = {
    "study": (("To do", False), ("In progress", False), ("Done", True)),
    "revision": (("To revise", False), ("Revising", False), ("Revised", True)),
    "assignment": (("Research", False), ("Draft", False), ("Review", False), ("Submitted", True)),
    "weekly": (
        ("Monday", False),
        ("Tuesday", False),
        ("Wednesday", False),
        ("Thursday", False),
        ("Friday", False),
        ("Saturday", False),
        ("Sunday", False),
        ("Done", True),
    ),
    "personal": (("Today", False), ("This week", False), ("Later", False), ("Done", True)),
    "blank": (("To do", False), ("Done", True)),
}
MAIN_BOARD_NAME = "Study"


# ── reading ─────────────────────────────────────────────────────────────────────────────────


def boards_query(user_id: uuid.UUID) -> Select[tuple[Board]]:
    """The student's boards: active ones in order, then the archived ones, last archived first."""
    return (
        select(Board)
        .where(Board.user_id == user_id)
        .order_by(Board.archived_at.is_not(None), Board.archived_at.desc(), Board.position, Board.created_at)
    )


def summaries(db: Session, boards: list[Board]) -> list[BoardSummary]:
    columns = columns_of(db, [b.id for b in boards])
    counts: dict[tuple[uuid.UUID, bool], int] = {}
    if boards:
        q = (
            select(BoardCard.board_id, BoardColumn.done, func.count())
            .join(BoardColumn, BoardColumn.id == BoardCard.column_id)
            .where(BoardCard.board_id.in_([b.id for b in boards]))
            .group_by(BoardCard.board_id, BoardColumn.done)
        )
        counts = {(board_id, done): n for board_id, done, n in db.execute(q).tuples()}
    return [
        BoardSummary.model_validate(
            {
                "id": b.id,
                "name": b.name,
                "emoji": b.emoji,
                "color": b.color,
                "template": b.template,
                "archived": b.archived_at is not None,
                "columns": [BoardColumnOut(id=c.id, name=c.name, done=c.done) for c in columns if c.board_id == b.id],
                "open": counts.get((b.id, False), 0),
                "done": counts.get((b.id, True), 0),
            }
        )
        for b in boards
    ]


def card_count(db: Session, user_id: uuid.UUID) -> int:
    return db.scalar(select(func.count()).select_from(BoardCard).where(BoardCard.user_id == user_id)) or 0


def storage_used(db: Session, user_id: uuid.UUID) -> int:
    """The bytes of the student's board files: on a card, or uploaded and not attached yet. Files whose card is gone
    wait for the sweep and no longer count."""
    q = select(func.coalesce(func.sum(Upload.size_bytes), 0)).where(
        Upload.user_id == user_id,
        Upload.purpose == UploadPurpose.board,
        (Upload.status != UploadStatus.attached) | Upload.card_id.is_not(None),
    )
    return int(db.scalar(q) or 0)


def overview(db: Session, user: User) -> Boards:
    boards = list(db.scalars(boards_query(user.id)))
    labels = db.scalars(select(BoardLabel).where(BoardLabel.user_id == user.id).order_by(BoardLabel.name))
    return Boards(
        boards=summaries(db, boards),
        labels=[BoardLabelOut.model_validate({"id": x.id, "name": x.name, "color": x.color}) for x in labels],
        usage=BoardUsage(
            boards=len(boards),
            max_boards=MAX_BOARDS,
            cards=card_count(db, user.id),
            max_cards=MAX_CARDS,
            storage_bytes=storage_used(db, user.id),
            max_storage_bytes=MAX_STORAGE_BYTES,
        ),
    )


def active_boards(db: Session, user_id: uuid.UUID) -> list[Board]:
    q = select(Board).where(Board.user_id == user_id, Board.archived_at.is_(None))
    return list(db.scalars(q.order_by(Board.position, Board.created_at)))


# ── boards ──────────────────────────────────────────────────────────────────────────────────


def create_board(db: Session, user: User, body: BoardCreate) -> Board:
    """A board after the active ones, with its template's columns. 409 boards_full at MAX_BOARDS; 429 after
    BOARD_LIMIT new boards in an hour."""
    ratelimit.enforce(
        db,
        f"boards:{user.id}",
        Board.created_at,
        [Board.user_id == user.id],
        limit=BOARD_LIMIT,
        window=BOARD_WINDOW,
        message="You've made a lot of boards. Try again in {}.",
    )
    count = db.scalar(select(func.count()).select_from(Board).where(Board.user_id == user.id)) or 0
    if count >= MAX_BOARDS:
        raise conflict(
            "boards_full", f"You have {MAX_BOARDS} boards, the most you can keep. Delete one you no longer need."
        )
    now = utcnow()
    board = Board(
        user_id=user.id,
        name=body.name,
        emoji=body.emoji or None,
        color=body.color,
        template=body.template,
        position=end_position(active_boards(db, user.id)),
        created_at=now,
        updated_at=now,
    )
    db.add(board)
    db.flush()
    for i, (name, done) in enumerate(TEMPLATES[body.template]):
        db.add(BoardColumn(board_id=board.id, name=name, done=done, position=float(i + 1), created_at=now))
    db.flush()
    return board


def main_board(db: Session, user: User) -> Board:
    """The student's first active board: where cards from the hub and revision plans go unless a board is named.
    One is made from the Study template when there is none."""
    boards = active_boards(db, user.id)
    if boards:
        return boards[0]
    board = create_board(db, user, BoardCreate(name=MAIN_BOARD_NAME, template="study", color="cobalt"))
    board.position = top_position(boards)
    return board


def update_board(db: Session, user: User, board: Board, body: BoardUpdate) -> None:
    changed = apply_patch(board, body, ("name", "emoji", "color"), clearable=("emoji",))
    if body.archived is not None and body.archived != (board.archived_at is not None):
        if body.archived:
            board.archived_at = utcnow()
        else:  # back after the active boards
            board.archived_at = None
            board.position = end_position([b for b in active_boards(db, user.id) if b.id != board.id])
        changed.append("archived")
    if changed:
        board.updated_at = utcnow()


def place_board(db: Session, user: User, board: Board, body: AfterId) -> None:
    """Among the active boards, right after `afterId` or first. 409 retry when `afterId` isn't an active board."""
    if board.archived_at is not None:
        raise conflict("retry", "Bring the board back from the archive before you move it.")
    others = [b for b in active_boards(db, user.id) if b.id != board.id]
    board.position = position_after(others, body.after_id)
    board.updated_at = utcnow()


def delete_board(db: Session, board: Board) -> None:
    """The board, its columns, cards, comments and plans. Its cards' files lose their card, and the sweep deletes
    them from the bucket."""
    db.delete(board)


# ── columns ─────────────────────────────────────────────────────────────────────────────────


def _columns(db: Session, board: Board) -> list[BoardColumn]:
    return columns_of(db, [board.id])


def add_column(db: Session, board: Board, body: ColumnCreate) -> BoardColumn:
    columns = _columns(db, board)
    if len(columns) >= MAX_COLUMNS:
        raise conflict("limit_reached", f"A board holds {MAX_COLUMNS} columns. Delete one you don't use first.")
    column = BoardColumn(board_id=board.id, name=body.name, done=body.done, position=end_position(columns))
    db.add(column)
    db.flush()
    return column


def update_column(db: Session, column: BoardColumn, body: ColumnUpdate) -> None:
    """Marking a column done finishes its cards now; unmarking it opens them again."""
    apply_patch(column, body, ("name",))
    if body.done is not None and body.done != column.done:
        column.done = body.done
        now = utcnow()
        for card in cards_in(db, column.id):
            card.done_at = now if column.done else None
            card.updated_at = now
            if column.done:
                card.remind_at = None
            else:
                schedule(card, now)


def place_column(db: Session, board: Board, column: BoardColumn, body: AfterId) -> None:
    others = [c for c in _columns(db, board) if c.id != column.id]
    column.position = position_after(others, body.after_id)


def delete_column(db: Session, board: Board, column: BoardColumn, move_to: uuid.UUID | None) -> None:
    """Deletes the column. Its cards go to the end of `move_to` first; a column with cards needs one. A board
    keeps at least one column. 422 on moveTo when it isn't another column of the board; 409 limit_reached for the
    last column."""
    columns = _columns(db, board)
    if len(columns) <= 1:
        raise conflict("limit_reached", "A board needs at least one column.")
    cards = cards_in(db, column.id)
    if cards:
        target = next((c for c in columns if c.id == move_to and c.id != column.id), None)
        if target is None:
            raise invalid("moveTo", "Choose the column its cards move to.")
        position = end_position(cards_in(db, target.id))
        now = utcnow()
        for card in cards:
            card.column_id = target.id
            card.position = position
            position += 1.0
            if target.done != column.done:
                card.done_at = now if target.done else None
            card.updated_at = now
            schedule(card, now)
        db.flush()
    db.delete(column)


# ── labels ──────────────────────────────────────────────────────────────────────────────────


def _label(db: Session, user: User, label_id: uuid.UUID) -> BoardLabel:
    label = db.get(BoardLabel, label_id)
    if label is None or label.user_id != user.id:
        raise not_found("This label isn't there any more. Reload the page.")
    return label


def _name_taken(db: Session, user: User, name: str, but: uuid.UUID | None = None) -> bool:
    q = select(BoardLabel.id).where(BoardLabel.user_id == user.id, func.lower(BoardLabel.name) == name.lower())
    if but is not None:
        q = q.where(BoardLabel.id != but)
    return db.scalar(q) is not None


def create_label(db: Session, user: User, body: LabelCreate) -> BoardLabel:
    count = db.scalar(select(func.count()).select_from(BoardLabel).where(BoardLabel.user_id == user.id)) or 0
    if count >= MAX_LABELS:
        raise conflict("limit_reached", f"You can keep {MAX_LABELS} labels. Delete one you don't use first.")
    if _name_taken(db, user, body.name):
        raise invalid("name", "You already have a label with this name.")
    label = BoardLabel(user_id=user.id, name=body.name, color=body.color)
    db.add(label)
    db.flush()
    return label


def update_label(db: Session, user: User, label_id: uuid.UUID, body: LabelUpdate) -> BoardLabel:
    label = _label(db, user, label_id)
    if body.name is not None and _name_taken(db, user, body.name, but=label.id):
        raise invalid("name", "You already have a label with this name.")
    apply_patch(label, body, ("name", "color"))
    return label


def delete_label(db: Session, user: User, label_id: uuid.UUID) -> None:
    """The label goes from every card."""
    db.delete(_label(db, user, label_id))


def label_out(label: BoardLabel) -> BoardLabelOut:
    return BoardLabelOut.model_validate({"id": label.id, "name": label.name, "color": label.color})
