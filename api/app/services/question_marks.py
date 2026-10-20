"""Practising a chapter: each student's done, stuck or skipped on the past questions tagged with it. Theirs alone,
kept by the question (paper, section, number), so one mark counts in every chapter the question is tagged with and
stays when its tags change. In the account's export; gone with the account or the paper."""

from __future__ import annotations

import uuid
from datetime import timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.errors import not_found
from app.models import ItemStatus, LibraryItem, PaperQuestion, QuestionMark, User
from app.schemas.library import PAST_PAPER, QuestionMarkSave
from app.schemas.library import QuestionMark as QuestionMarkOut
from app.services.modules import require_module
from app.services.ratelimit import enforce

MARKS_PER_HOUR = 300  # a fast student marks a question a minute; this only stops a script
NO_QUESTION = "This question isn't tagged on a past paper in the library."


def _out(row: QuestionMark) -> QuestionMarkOut:
    return QuestionMarkOut(
        item_id=row.item_id, section=row.section, question=row.question, mark=row.mark, updated_at=row.updated_at
    )


def marks_of(db: Session, user_id: uuid.UUID, module_id: str | None = None) -> list[QuestionMarkOut]:
    """The student's marks (on one module's papers), the newest first."""
    q = select(QuestionMark).where(QuestionMark.user_id == user_id)
    if module_id is not None:
        require_module(db, module_id)
        q = q.join(LibraryItem, LibraryItem.id == QuestionMark.item_id).where(LibraryItem.module_id == module_id)
    return [_out(row) for row in db.scalars(q.order_by(QuestionMark.updated_at.desc(), QuestionMark.id))]


def _tagged(db: Session, item_id: uuid.UUID, section: str | None, question: int) -> None:
    """404 unless the question is tagged on a published past paper."""
    item = db.get(LibraryItem, item_id)
    if item is None or item.status != ItemStatus.published or item.kind != PAST_PAPER:
        raise not_found(NO_QUESTION)
    tagged = db.scalar(
        select(PaperQuestion.id)
        .where(
            PaperQuestion.item_id == item_id,
            PaperQuestion.section.is_not_distinct_from(section),
            PaperQuestion.question == question,
        )
        .limit(1)
    )
    if tagged is None:
        raise not_found(NO_QUESTION)


def save(db: Session, user: User, body: QuestionMarkSave) -> QuestionMarkOut:
    """Marks a tagged question done, stuck or skipped, in place of the mark before. At most MARKS_PER_HOUR an hour."""
    _tagged(db, body.item_id, body.section, body.question)
    enforce(
        db,
        f"question-marks:{user.id}",
        QuestionMark.updated_at,
        [QuestionMark.user_id == user.id],
        limit=MARKS_PER_HOUR,
        window=timedelta(hours=1),
        message="You've marked a lot of questions in the last hour. Try again in {}.",
    )
    row = db.scalars(
        insert(QuestionMark)
        .values(user_id=user.id, item_id=body.item_id, section=body.section, question=body.question, mark=body.mark)
        .on_conflict_do_update(
            index_elements=[QuestionMark.user_id, QuestionMark.item_id, QuestionMark.section, QuestionMark.question],
            set_={"mark": body.mark, "updated_at": func.now()},
        )
        .returning(QuestionMark),
        execution_options={"populate_existing": True},
    ).one()
    return _out(row)


def forget(db: Session, user: User, item_id: uuid.UUID, section: str | None, question: int) -> None:
    """Takes the student's mark off a question; without one, nothing happens."""
    db.execute(
        delete(QuestionMark).where(
            QuestionMark.user_id == user.id,
            QuestionMark.item_id == item_id,
            QuestionMark.section.is_not_distinct_from(section),
            QuestionMark.question == question,
        )
    )
