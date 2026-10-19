"""Each student's practice scores on past papers: theirs alone, out of 100, saved when they mark a paper done on the
board. A score stays when the paper's card goes, and goes with the account or the paper (the foreign keys cascade)."""

from __future__ import annotations

import uuid

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.access import Feature
from app.core.errors import not_found
from app.models import ItemStatus, LibraryItem, PaperScore, User
from app.schemas.board import PaperScore as PaperScoreOut
from app.schemas.library import PAST_PAPER
from app.services import access

NO_PAPER = "This past paper isn't in the library."


def _out(row: PaperScore) -> PaperScoreOut:
    return PaperScoreOut(item_id=row.item_id, score=row.score, updated_at=row.updated_at)


def scores_of(db: Session, user_id: uuid.UUID) -> list[PaperScoreOut]:
    """The student's scores, the newest first."""
    q = select(PaperScore).where(PaperScore.user_id == user_id).order_by(PaperScore.updated_at.desc())
    return [_out(row) for row in db.scalars(q)]


def save_score(db: Session, user: User, item_id: uuid.UUID, score: float) -> PaperScoreOut:
    """Sets the student's score on a published past paper, replacing the one before. 404 for anything else, and
    while the library is off for them."""
    item = db.get(LibraryItem, item_id)
    if item is None or item.status != ItemStatus.published or item.kind != PAST_PAPER:
        raise not_found(NO_PAPER)
    if not access.feature_on(db, user, Feature.library):
        raise not_found(NO_PAPER)
    saved = db.scalars(
        insert(PaperScore)
        .values(user_id=user.id, item_id=item.id, score=score)
        .on_conflict_do_update(
            index_elements=[PaperScore.user_id, PaperScore.item_id],
            set_={"score": score, "updated_at": func.now()},
        )
        .returning(PaperScore),
        execution_options={"populate_existing": True},
    ).one()
    return _out(saved)


def forget_score(db: Session, user: User, item_id: uuid.UUID) -> None:
    """Removes the student's score on a paper; nothing happens when there is none."""
    db.execute(delete(PaperScore).where(PaperScore.user_id == user.id, PaperScore.item_id == item_id))
