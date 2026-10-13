"""The study board (R-4): each student's private cards in three fixed columns.

- A card's place in its column is `position`, a number between its neighbours', so a move writes one row. When two
  neighbours get too close to split, the column is numbered again.
- A card may point at a calendar event, a lesson, a module or a library item, once per board. Its title, address and
  (for an event) date are read from the hub every time the board loads, so a renamed or moved event shows as it is
  now.
- A lesson card moves to Done once the lesson is watched (`complete_lessons`, called when progress is saved)."""

from __future__ import annotations

import uuid
from collections.abc import Iterable, Sequence
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.access import Feature
from app.core.errors import conflict, invalid, not_found
from app.core.time import utcnow
from app.models import BoardCard, CalendarEvent, ItemStatus, LessonView, LibraryItem, Module, User
from app.schemas.board import Board, BoardCardCreate, BoardCardMove, BoardCardUpdate, BoardColumn, BoardLink
from app.schemas.board import BoardCard as BoardCardOut
from app.services import access, ratelimit
from app.services.accounts import lesson_key, parse_lesson_key
from app.services.content import apply_patch
from app.services.modules import visible_chapters

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


# ── reading ─────────────────────────────────────────────────────────────────────────────────


def _cards(db: Session, user_id: uuid.UUID, column: str | None = None) -> list[BoardCard]:
    q = select(BoardCard).where(BoardCard.user_id == user_id)
    if column is not None:
        q = q.where(BoardCard.column == column)
    return list(db.scalars(q.order_by(BoardCard.position, BoardCard.created_at)))


def _lesson(module: Module, chapter: int, video: int) -> tuple[str, str] | None:
    """(the lesson's title, its address), or None when the module has no such lesson."""
    chapters = visible_chapters(module.chapters)
    if module.hidden or not 0 <= chapter < len(chapters):
        return None
    videos = chapters[chapter]["videos"]
    if not 0 <= video < len(videos):
        return None
    entry = videos[video] if isinstance(videos[video], dict) else {}
    name = entry.get("title") or f"{chapters[chapter].get('title') or f'Chapter {chapter + 1}'}, lesson {video + 1}"
    return f"{module.short_name}: {name}", f"/modules/{module.id}?tab=lessons&chapter={chapter}&video={video}"


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
                type="event", id=e.id, title=e.title, url=f"/calendar?event={e.id}", date=e.end_date or e.date
            )
    if ids := wanted.get("library_item"):
        uuids = [u for u in (_uuid(i) for i in ids) if u is not None]
        if uuids and access.feature_on(db, user, Feature.library):
            q = select(LibraryItem).where(LibraryItem.id.in_(uuids), LibraryItem.status == ItemStatus.published)
            for item in db.scalars(q):
                found["library_item", str(item.id)] = BoardLink(
                    type="library_item", id=str(item.id), title=item.title, url=f"/library/{item.slug}", date=None
                )
    lessons = {k: p for k in wanted.get("lesson", ()) if (p := parse_lesson_key(k)) is not None}
    module_ids = wanted.get("module", set()) | {m for m, _, _ in lessons.values()}
    if module_ids:
        modules = {m.id: m for m in db.scalars(select(Module).where(Module.id.in_(module_ids)))}
        for mid in wanted.get("module", ()):
            if (module := modules.get(mid)) is not None and not module.hidden:
                found["module", mid] = BoardLink(
                    type="module", id=mid, title=module.name, url=f"/modules/{mid}", date=None
                )
        for key, (mid, chapter, video) in lessons.items():
            if (module := modules.get(mid)) is not None and (lesson := _lesson(module, chapter, video)) is not None:
                found["lesson", key] = BoardLink(type="lesson", id=key, title=lesson[0], url=lesson[1], date=None)
    return found


def _uuid(raw: str) -> uuid.UUID | None:
    try:
        return uuid.UUID(raw)
    except ValueError:
        return None


def _out(card: BoardCard, links: dict[LinkKey, BoardLink]) -> BoardCardOut:
    link = None
    if card.link_type is not None and card.link_id is not None:
        key = (card.link_type, card.link_id)
        link = links.get(key) or BoardLink.model_validate(
            {"type": card.link_type, "id": card.link_id, "title": None, "url": None, "date": None}
        )
    return BoardCardOut.model_validate(
        {
            "id": card.id,
            "column": card.column,
            "title": card.title,
            "note": card.note,
            "due_date": card.due_date,
            "link": link,
            "created_at": card.created_at,
            "done_at": card.done_at,
        }
    )


def card_out(db: Session, user: User, card: BoardCard) -> BoardCardOut:
    keys = [(card.link_type, card.link_id)] if card.link_type and card.link_id else []
    return _out(card, resolve_links(db, user, keys))


def board_of(db: Session, user: User) -> Board:
    """Every card, To do first, each column in its order."""
    cards = _cards(db, user.id)
    cards.sort(key=lambda c: COLUMNS.index(c.column))  # stable: keeps each column's order
    links = resolve_links(db, user, [(c.link_type, c.link_id) for c in cards if c.link_type and c.link_id])
    return Board(cards=[_out(c, links) for c in cards], limit=MAX_CARDS)


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
    if kind == "lesson" and (parsed := parse_lesson_key(raw)) is not None:
        ident = lesson_key(*parsed)
    elif kind == "library_item" and (u := _uuid(raw)) is not None:
        ident = str(u)
    link = resolve_links(db, user, [(kind, ident)]).get((kind, ident))
    if link is None:
        raise invalid("link.id", LINK_GONE[kind])
    return ident, link


def _watched(db: Session, user_id: uuid.UUID, key: str) -> bool:
    q = select(LessonView.lesson_key).where(LessonView.user_id == user_id, LessonView.lesson_key == key)
    return db.scalar(q) is not None


def create_card(db: Session, user: User, body: BoardCardCreate) -> BoardCard:
    """A card at the end of its column (a watched lesson goes to the top of Done). 409 board_full at MAX_CARDS,
    409 already_on_board for a second card for the same thing, 429 after CREATE_LIMIT new cards in an hour."""
    ratelimit.enforce(
        db,
        f"board:{user.id}",
        BoardCard.created_at,
        [BoardCard.user_id == user.id],
        limit=CREATE_LIMIT,
        window=CREATE_WINDOW,
        message="You've added a lot of cards. Try again in {}.",
    )
    count = db.scalar(select(func.count()).select_from(BoardCard).where(BoardCard.user_id == user.id)) or 0
    if count >= MAX_CARDS:
        raise conflict("board_full", f"Your board holds {MAX_CARDS} cards. Delete some you've finished first.")
    column: str = body.column
    link_type = link_id = None
    title = body.title
    if body.link is not None:
        link_type = body.link.type
        link_id, link = _canonical_link(db, user, link_type, body.link.id)
        existing = db.scalar(
            select(BoardCard.id).where(
                BoardCard.user_id == user.id, BoardCard.link_type == link_type, BoardCard.link_id == link_id
            )
        )
        if existing is not None:
            raise conflict("already_on_board", "That's already on your board.")
        title = title or (link.title or "")[:200]
        if link_type == "lesson" and _watched(db, user.id, link_id):
            column = "done"
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
    watched = select(LessonView.lesson_key).where(LessonView.user_id == user_id)
    cards = db.scalars(
        select(BoardCard)
        .where(
            BoardCard.user_id == user_id,
            BoardCard.link_type == "lesson",
            BoardCard.link_id.in_(watched),
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
