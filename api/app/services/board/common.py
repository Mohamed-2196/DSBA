"""What every part of the boards service shares: the limits, loading the student's own rows (anyone else's is 404,
like a row that doesn't exist), places in an ordered list, and what a card's hub link points at now."""

from __future__ import annotations

import uuid
from collections.abc import Iterable, Sequence
from typing import Protocol, TypeVar

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.access import Feature
from app.core.errors import conflict, not_found
from app.core.time import bahrain_today
from app.models import (
    Board,
    BoardCard,
    BoardColumn,
    CalendarEvent,
    ItemStatus,
    LibraryItem,
    Module,
    PersonalEvent,
    User,
)
from app.schemas.board import BoardLink
from app.services import access, library, my_calendar
from app.services.modules import lesson_name, lesson_path, student_lessons

MAX_BOARDS = 20
MAX_COLUMNS = 12
MAX_CARDS = 1000  # over every board
MAX_LABELS = 40
MAX_ATTACHMENTS = 10  # per card
MAX_COMMENTS = 100  # per card
MAX_STORAGE_BYTES = 200 * 1024 * 1024  # the files on one student's cards
MAX_TEXT_BYTES = 10 * 1024 * 1024  # the text on one student's cards: titles, descriptions, checklists, comments

BOARD_GONE = "This board isn't there any more. Reload the page."
COLUMN_GONE = "This column isn't on the board any more. Reload the board."
CARD_GONE = "This card isn't on your boards any more. Reload the board."
CHANGED = "Your board changed in another tab. Reload it and try again."

LinkKey = tuple[str, str]


# ── the student's own rows ─────────────────────────────────────────────────────────────────


def get_board(db: Session, user: User, board_id: uuid.UUID) -> Board:
    board = db.get(Board, board_id)
    if board is None or board.user_id != user.id:
        raise not_found(BOARD_GONE)
    return board


def get_column(db: Session, user: User, column_id: uuid.UUID) -> tuple[BoardColumn, Board]:
    column = db.get(BoardColumn, column_id)
    board = db.get(Board, column.board_id) if column is not None else None
    if column is None or board is None or board.user_id != user.id:
        raise not_found(COLUMN_GONE)
    return column, board


def column_on(db: Session, user: User, board_id: uuid.UUID, column_id: uuid.UUID) -> tuple[BoardColumn, Board]:
    """A column of the student's board `board_id`."""
    column, board = get_column(db, user, column_id)
    if board.id != board_id:
        raise not_found(COLUMN_GONE)
    return column, board


def get_card(db: Session, user: User, card_id: uuid.UUID) -> BoardCard:
    card = db.get(BoardCard, card_id)
    if card is None or card.user_id != user.id:
        raise not_found(CARD_GONE)
    return card


def columns_of(db: Session, board_ids: Iterable[uuid.UUID]) -> list[BoardColumn]:
    """The boards' columns, each board's in order."""
    ids = list(board_ids)
    if not ids:
        return []
    q = select(BoardColumn).where(BoardColumn.board_id.in_(ids)).order_by(BoardColumn.position, BoardColumn.created_at)
    return list(db.scalars(q))


def cards_in(db: Session, column_id: uuid.UUID) -> list[BoardCard]:
    q = select(BoardCard).where(BoardCard.column_id == column_id).order_by(BoardCard.position, BoardCard.created_at)
    return list(db.scalars(q))


# ── places ──────────────────────────────────────────────────────────────────────────────────


class Placed(Protocol):
    id: uuid.UUID
    position: float


P = TypeVar("P", bound=Placed)


def position_after(others: Sequence[P], after_id: uuid.UUID | None) -> float:
    """The position right after `after_id` among `others` (in order, without the row being placed), or first with
    None: halfway between the neighbours, so only the placed row changes, unless they are too close to split; then
    `others` are numbered again. 409 retry when `after_id` isn't among them (the list changed in another tab)."""
    if after_id is None:
        index = 0
    else:
        found = next((i for i, o in enumerate(others) if o.id == after_id), None)
        if found is None:
            raise conflict("retry", CHANGED)
        index = found + 1
    before = others[index - 1].position if index > 0 else None
    following = others[index].position if index < len(others) else None
    if before is None:
        return 1.0 if following is None else following - 1.0
    if following is None:
        return before + 1.0
    position = (before + following) / 2
    if before < position < following:
        return position
    for i, o in enumerate(others):  # too close to split: number them again
        o.position = float(i + 1)
    return index + 0.5


def end_position(others: Sequence[P]) -> float:
    return max((o.position for o in others), default=0.0) + 1.0


def top_position(others: Sequence[P]) -> float:
    return min((o.position for o in others), default=2.0) - 1.0


# ── hub links ───────────────────────────────────────────────────────────────────────────────


def link_key(card: BoardCard) -> LinkKey | None:
    """(type, id) of what the card points at: a lesson's id is `lesson_id`, anything else's `link_id`."""
    ident = card.lesson_id if card.link_type == "lesson" else card.link_id
    return (card.link_type, ident) if card.link_type and ident else None


def parse_uuid(raw: str) -> uuid.UUID | None:
    try:
        return uuid.UUID(raw)
    except ValueError:
        return None


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
    if (ids := wanted.get("my_event")) and user is not None and access.feature_on(db, user, Feature.calendar):
        uuids = [u for u in (parse_uuid(i) for i in ids) if u is not None]
        today = bahrain_today()
        own = select(PersonalEvent).where(PersonalEvent.id.in_(uuids), PersonalEvent.user_id == user.id)
        for p in db.scalars(own) if uuids else ():
            day = my_calendar.next_day(p, today) or my_calendar.last_repeat(p)
            found["my_event", str(p.id)] = BoardLink(
                type="my_event",
                id=str(p.id),
                title=p.title,
                url=f"/calendar?event=mine-{p.id}",
                date=day + (p.end_date - p.date) if p.end_date else day,
                kind=None,
                module_id=None,
            )
    if ids := wanted.get("library_item"):
        uuids = [u for u in (parse_uuid(i) for i in ids) if u is not None]
        if uuids and access.feature_on(db, user, Feature.library):
            q = select(LibraryItem).where(LibraryItem.id.in_(uuids), LibraryItem.status == ItemStatus.published)
            items = list(db.scalars(q))
            item_modules = {i.module_id for i in items if i.module_id}
            tags = {
                m.id: m.unit_code or m.short_name
                for m in (db.scalars(select(Module).where(Module.id.in_(item_modules))) if item_modules else ())
            }
            for item in items:
                found["library_item", str(item.id)] = BoardLink(
                    type="library_item",
                    id=str(item.id),
                    title=library.exam_title(item, tags.get(item.module_id or "")),
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
        found["lesson", lesson.id] = BoardLink(
            type="lesson",
            id=lesson.id,
            title=f"{lesson.chapter.module.unit_code or lesson.chapter.module.short_name} · {lesson_name(lesson)}",
            url=lesson_path(lesson),
            date=None,
            kind=None,
            module_id=lesson.module_id,
        )
    return found


def gone_link(key: LinkKey) -> BoardLink:
    return BoardLink.model_validate(
        {"type": key[0], "id": key[1], "title": None, "url": None, "date": None, "kind": None, "module_id": None}
    )
