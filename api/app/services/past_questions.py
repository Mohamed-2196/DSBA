"""Past questions by topic: students tag a past paper's question with one of its module's chapters ("Q3:
Elasticity"), each chapter lists the questions tagged with it, any student flags a wrong tag, and the people who
manage the library remove it.

Only a module's published past papers take tags, and only with that module's chapters. Who tagged what is kept for
moderation only: nobody else sees it."""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import timedelta

from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import conflict, forbidden, invalid, not_found
from app.models import Chapter, ItemStatus, LibraryItem, PaperQuestion, PaperQuestionFlag, User
from app.schemas.library import PaperQuestion as PaperQuestionOut
from app.schemas.library import PaperQuestionCreate, PaperRef
from app.services.content import record
from app.services.library import manages
from app.services.modules import require_module
from app.services.ratelimit import enforce

TAGS_PER_HOUR = 60
PAPER_KIND = "past-paper"


def _paper(item: LibraryItem) -> PaperRef:
    return PaperRef.model_validate(
        {
            "id": item.id,
            "slug": item.slug,
            "title": item.title,
            "exam_year": item.exam_year,
            "exam_session": item.exam_session,
            "zone": item.zone,
        }
    )


def to_out(db: Session, tags: Sequence[PaperQuestion], user: User | None) -> list[PaperQuestionOut]:
    """Tags as this person sees them, with their papers and chapters, in one query per relation."""
    if not tags:
        return []
    items = {i.id: i for i in db.scalars(select(LibraryItem).where(LibraryItem.id.in_({t.item_id for t in tags})))}
    chapters = {c.id: c for c in db.scalars(select(Chapter).where(Chapter.id.in_({t.chapter_id for t in tags})))}
    flagged: set[uuid.UUID] = set()
    if user is not None:
        flagged = set(
            db.scalars(
                select(PaperQuestionFlag.question_id).where(
                    PaperQuestionFlag.user_id == user.id, PaperQuestionFlag.question_id.in_([t.id for t in tags])
                )
            )
        )
    moderator = manages(user)
    out = []
    for t in tags:
        mine = user is not None and t.tagged_by == user.id
        out.append(
            PaperQuestionOut(
                id=t.id,
                paper=_paper(items[t.item_id]),
                chapter_id=t.chapter_id,
                chapter_title=chapters[t.chapter_id].title,
                question=t.question,
                page=t.page,
                flagged=t.id in flagged,
                flag_count=t.flag_count if moderator else None,
                is_mine=mine,
                can_remove=mine or moderator,
                created_at=t.created_at,
            )
        )
    return out


def _published_paper(db: Session, item_id: uuid.UUID) -> LibraryItem:
    item = db.get(LibraryItem, item_id)
    if item is None or item.status != ItemStatus.published:
        raise not_found("This file doesn't exist or isn't public yet.")
    if item.kind != PAPER_KIND or item.module_id is None:
        raise conflict("not_a_paper", "Only a module's past papers have questions to tag.")
    return item


def for_paper(db: Session, item_id: uuid.UUID, user: User | None) -> list[PaperQuestionOut]:
    """A published paper's tags, by question, then chapter order."""
    item = _published_paper(db, item_id)
    tags = db.scalars(
        select(PaperQuestion)
        .join(Chapter, Chapter.id == PaperQuestion.chapter_id)
        .where(PaperQuestion.item_id == item.id)
        .order_by(PaperQuestion.question, Chapter.position, PaperQuestion.created_at)
    ).all()
    return to_out(db, tags, user)


def for_module(
    db: Session, module_id: str | None, user: User | None, *, flagged: bool = False
) -> list[PaperQuestionOut]:
    """A module's tags on published papers: chapter by chapter, the newest sitting first. `flagged`: only the tags
    someone flagged, the most flagged first, of one module or of all (people who manage the library)."""
    if module_id is None and not flagged:
        raise invalid("moduleId", "Choose a module.")
    require_module(db, module_id)
    q = (
        select(PaperQuestion)
        .join(LibraryItem, LibraryItem.id == PaperQuestion.item_id)
        .join(Chapter, Chapter.id == PaperQuestion.chapter_id)
        .where(LibraryItem.status == ItemStatus.published)
    )
    if module_id is not None:
        q = q.where(LibraryItem.module_id == module_id)
    if flagged:
        if not manages(user):
            raise forbidden("Only people who manage the library can see flagged tags.")
        q = q.where(PaperQuestion.flag_count > 0).order_by(PaperQuestion.flag_count.desc(), Chapter.position)
    else:
        q = q.order_by(
            Chapter.position,
            LibraryItem.exam_year.desc().nulls_last(),
            LibraryItem.exam_session.desc().nulls_last(),  # the October resits before May: newer
            LibraryItem.zone.nulls_last(),
            PaperQuestion.question,
        )
    return to_out(db, db.scalars(q.order_by(PaperQuestion.id)).all(), user)


def tag(db: Session, user: User, item_id: uuid.UUID, body: PaperQuestionCreate) -> PaperQuestion:
    """Tag a question of a published past paper with a chapter of its module. At most TAGS_PER_HOUR an hour."""
    item = _published_paper(db, item_id)
    chapter = db.get(Chapter, body.chapter_id)
    if chapter is None or chapter.module_id != item.module_id:
        raise invalid("chapterId", "Pick one of this module's chapters.")
    enforce(
        db,
        f"paper-questions:{user.id}",
        PaperQuestion.created_at,
        [PaperQuestion.tagged_by == user.id],
        limit=TAGS_PER_HOUR,
        window=timedelta(hours=1),
        message="You've tagged a lot of questions. Try again in {}.",
    )
    row = PaperQuestion(
        item_id=item.id, chapter_id=chapter.id, question=body.question, page=body.page, tagged_by=user.id
    )
    try:
        with db.begin_nested():
            db.add(row)
            db.flush()
    except IntegrityError:
        raise conflict("already_tagged", f"Question {body.question} is already tagged with {chapter.title}.") from None
    return row


def get(db: Session, question_id: uuid.UUID) -> PaperQuestion:
    row = db.get(PaperQuestion, question_id)
    item = db.get(LibraryItem, row.item_id) if row is not None else None
    if row is None or item is None or item.status != ItemStatus.published:
        raise not_found("This tag doesn't exist.")
    return row


def remove(db: Session, user: User, row: PaperQuestion, ip: str | None) -> None:
    """Whoever tagged it, or people who manage the library (audited)."""
    mine = row.tagged_by == user.id
    if not (mine or manages(user)):
        raise forbidden("Only the student who tagged it or a student rep can remove this tag.")
    if not mine:
        item = db.get(LibraryItem, row.item_id)
        title = f"Q{row.question} of {item.title if item else 'a paper'}"
        record(db, user, "library.question_remove", "library_item", row.item_id, title, ip, chapter=row.chapter_id)
    db.delete(row)


def keep(db: Session, user: User, row: PaperQuestion, ip: str | None) -> None:
    """People who manage the library: the tag is right. Its flags go (audited)."""
    if not manages(user):
        raise forbidden("Only people who manage the library can do this.")
    if row.flag_count == 0:
        return
    db.execute(delete(PaperQuestionFlag).where(PaperQuestionFlag.question_id == row.id))
    row.flag_count = 0
    item = db.get(LibraryItem, row.item_id)
    title = f"Q{row.question} of {item.title if item else 'a paper'}"
    record(db, user, "library.question_keep", "library_item", row.item_id, title, ip, chapter=row.chapter_id)


def set_flag(db: Session, user: User, row: PaperQuestion, on: bool) -> None:
    """Say a tag is wrong, or take it back. Saying it twice changes nothing."""
    if on:
        added = db.execute(
            pg_insert(PaperQuestionFlag)
            .values(question_id=row.id, user_id=user.id)
            .on_conflict_do_nothing()
            .returning(PaperQuestionFlag.user_id)
        ).first()
        if added is not None:
            db.execute(
                update(PaperQuestion).where(PaperQuestion.id == row.id).values(flag_count=PaperQuestion.flag_count + 1)
            )
    else:
        gone = db.execute(
            delete(PaperQuestionFlag)
            .where(PaperQuestionFlag.question_id == row.id, PaperQuestionFlag.user_id == user.id)
            .returning(PaperQuestionFlag.user_id)
        ).first()
        if gone is not None:
            db.execute(
                update(PaperQuestion)
                .where(PaperQuestion.id == row.id)
                .values(flag_count=func.greatest(PaperQuestion.flag_count - 1, 0))
            )
    db.refresh(row)
