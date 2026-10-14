"""Card reminders. A card with a due date and `remind_before` gets `remind_at`: that many minutes before it is due
(its time in Bahrain, or 09:00 when it has none). The mail worker calls send_due() on each pass: every reminder that
has come becomes a notification in the hub, and `remind_at` empties. A card that is done, or whose moment has
already passed when it is set, has none."""

from __future__ import annotations

import datetime as dt
import logging
from collections.abc import Callable
from contextlib import AbstractContextManager
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.access import Feature
from app.core.time import BAHRAIN, utcnow
from app.models import BoardCard, User
from app.services import access
from app.services.notify import notify

log = logging.getLogger(__name__)

DEFAULT_TIME = dt.time(9, 0)
BATCH = 200


def due_moment(card: BoardCard) -> datetime | None:
    if card.due_date is None:
        return None
    return datetime.combine(card.due_date, card.due_time or DEFAULT_TIME, tzinfo=BAHRAIN)


def schedule(card: BoardCard, now: datetime | None = None) -> None:
    """Sets `remind_at` from the card's due date, time and `remind_before`."""
    due = due_moment(card)
    if due is None or card.remind_before is None or card.done_at is not None:
        card.remind_at = None
        return
    at = due - timedelta(minutes=card.remind_before)
    card.remind_at = at if at > (now or utcnow()) else None


def _when(card: BoardCard) -> str:
    due = due_moment(card)
    if due is None:
        return "soon"
    today = utcnow().astimezone(BAHRAIN).date()
    day = (
        "today"
        if card.due_date == today
        else "tomorrow"
        if card.due_date == today + timedelta(days=1)
        else due.strftime("%a %-d %b")
    )
    return f"{day} at {card.due_time.strftime('%H:%M')}" if card.due_time else day


def remind(db: Session, now: datetime | None = None) -> int:
    """Turns the reminders that have come into notifications (none for a card done or with the boards switched off
    for its student). -> how many reminders came. The caller commits."""
    now = now or utcnow()
    cards = db.scalars(
        select(BoardCard)
        .where(BoardCard.remind_at.is_not(None), BoardCard.remind_at <= now)
        .order_by(BoardCard.remind_at)
        .limit(BATCH)
        .with_for_update(skip_locked=True)
    ).all()
    for card in cards:
        card.remind_at = None
        user = db.get(User, card.user_id)
        if user is None or card.done_at is not None or not access.feature_on(db, user, Feature.board):
            continue
        notify(
            db,
            card.user_id,
            "board_reminder",
            f"Due {_when(card)}: {card.title}",
            url=f"/board?b={card.board_id}&card={card.id}",
        )
    return len(cards)


def send_due(sessions: Callable[[], AbstractContextManager[Session]]) -> int:
    """For the mail worker: sends every reminder that has come."""
    total = 0
    while True:
        with sessions() as db:
            n = remind(db)
            db.commit()
        total += n
        if n < BATCH:
            break
    if total:
        log.info("sent %d board reminder(s)", total)
    return total
