"""Past questions by topic: students tag a past paper's question with one of its module's chapters ("Q3:
Elasticity", or "B1: Elasticity" on a paper that numbers each section from 1), and with up to three of the topics its
study guide lists for that chapter ("Price elasticity of demand"); each chapter lists the questions tagged with it,
topic by topic, any student flags a wrong tag, and the people who manage the library remove it.

Only a module's published past papers take tags, and only with that module's chapters. Who tagged what is kept for
moderation only: nobody else sees it."""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import date, timedelta
from typing import TypeVar

from sqlalchemy import Select, and_, delete, exists, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import conflict, forbidden, invalid, not_found
from app.models import (
    Chapter,
    ChapterTopic,
    ItemStatus,
    LibraryItem,
    LibraryText,
    PaperQuestion,
    PaperQuestionFlag,
    PaperQuestionTopic,
    TextStatus,
    User,
)
from app.schemas.library import PAST_PAPER, PaperQuestionCreate, PaperRef
from app.schemas.library import PaperQuestion as PaperQuestionOut
from app.schemas.modules import StudyTopic
from app.services import question_anchors, report_answers
from app.services.content import record
from app.services.exam_names import newest_sitting_first
from app.services.library import cover_path, covered, hidden_from, in_hidden_module, manages, sees_hidden_modules
from app.services.modules import require_module
from app.services.paper_text import PAGE_BREAK
from app.services.ratelimit import enforce

TAGS_PER_HOUR = 60
EPOCH = date(1970, 1, 1)
T = TypeVar("T")


def label(section: str | None, question: int) -> str:
    """How a question is named: 'B1' on a paper that numbers each section from 1, else 'Q3'."""
    return f"{section}{question}" if section else f"Q{question}"


def paper_ref(item: LibraryItem, covers: set[uuid.UUID]) -> PaperRef:
    return PaperRef.model_validate(
        {
            "id": item.id,
            "slug": item.slug,
            "title": item.title,
            "exam_year": item.exam_year,
            "exam_session": item.exam_session,
            "zone": item.zone,
            "cover_url": cover_path(item.id) if item.id in covers else None,
        }
    )


def topics_of(db: Session, tag_ids: Sequence[uuid.UUID]) -> dict[uuid.UUID, list[StudyTopic]]:
    """Each tag's study-guide topics, in the guide's order."""
    out: dict[uuid.UUID, list[StudyTopic]] = {}
    if not tag_ids:
        return out
    rows = db.execute(
        select(PaperQuestionTopic.question_id, ChapterTopic.id, ChapterTopic.title)
        .join(
            ChapterTopic,
            and_(
                ChapterTopic.chapter_id == PaperQuestionTopic.chapter_id,
                ChapterTopic.id == PaperQuestionTopic.topic_id,
            ),
        )
        .where(PaperQuestionTopic.question_id.in_(tag_ids))
        .order_by(ChapterTopic.position)
    ).tuples()
    for question_id, topic_id, title in rows:
        out.setdefault(question_id, []).append(StudyTopic(id=topic_id, title=title))
    return out


def set_topics(db: Session, tag: PaperQuestion, topic_ids: Sequence[str]) -> None:
    """The tag's topics made these: ids of its own chapter's topics (the caller checked them)."""
    db.execute(delete(PaperQuestionTopic).where(PaperQuestionTopic.question_id == tag.id))
    if topic_ids:
        db.execute(
            pg_insert(PaperQuestionTopic).on_conflict_do_nothing(),
            [{"question_id": tag.id, "chapter_id": tag.chapter_id, "topic_id": t} for t in topic_ids],
        )


def _chapter_topics(db: Session, chapter_id: str, topic_ids: Sequence[str]) -> list[str]:
    """`topic_ids` once each, in the order given; 422 when one isn't a topic of the chapter."""
    wanted = list(dict.fromkeys(topic_ids))
    if not wanted:
        return []
    known = set(
        db.scalars(select(ChapterTopic.id).where(ChapterTopic.chapter_id == chapter_id, ChapterTopic.id.in_(wanted)))
    )
    if len(known) != len(wanted):
        raise invalid("topicIds", "Pick topics of the chapter you chose.")
    return wanted


def to_out(db: Session, tags: Sequence[PaperQuestion], user: User | None) -> list[PaperQuestionOut]:
    """Tags as this person sees them, with their papers, chapters and topics, in one query per relation."""
    if not tags:
        return []
    topics = topics_of(db, [t.id for t in tags])
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
    covers = covered(db, list(items))
    answers = report_answers.answers_for(db, tags, items)
    out = []
    for t in tags:
        mine = user is not None and t.tagged_by == user.id
        out.append(
            PaperQuestionOut(
                id=t.id,
                paper=paper_ref(items[t.item_id], covers),
                chapter_id=t.chapter_id,
                chapter_title=chapters[t.chapter_id].title,
                topics=topics.get(t.id, []),
                section=t.section,
                question=t.question,
                page=t.page,
                anchor=t.anchor,
                flagged=t.id in flagged,
                flag_count=t.flag_count if moderator else None,
                is_mine=mine,
                can_remove=mine or moderator,
                created_at=t.created_at,
                answer=answers.get(t.id),
            )
        )
    return out


def _published_paper(db: Session, item_id: uuid.UUID, user: User | None) -> LibraryItem:
    item = db.get(LibraryItem, item_id)
    if item is None or item.status != ItemStatus.published or hidden_from(db, item, user):
        raise not_found("This file doesn't exist or isn't public yet.")
    if item.kind != PAST_PAPER or item.module_id is None:
        raise conflict("not_a_paper", "Only a module's past papers have questions to tag.")
    return item


def for_paper(db: Session, item_id: uuid.UUID, user: User | None) -> list[PaperQuestionOut]:
    """A published paper's tags, by question, then chapter order. Hidden chapters' tags only for staff."""
    item = _published_paper(db, item_id, user)
    shown = [] if sees_hidden_modules(user) else [Chapter.hidden.is_(False)]
    tags = db.scalars(
        select(PaperQuestion)
        .join(Chapter, Chapter.id == PaperQuestion.chapter_id)
        .where(PaperQuestion.item_id == item.id, *shown)
        .order_by(
            PaperQuestion.section.nulls_first(), PaperQuestion.question, Chapter.position, PaperQuestion.created_at
        )
    ).all()
    return to_out(db, tags, user)


def _tags(q: Select[tuple[T]], module_id: str | None, *, staff: bool) -> Select[tuple[T]]:
    """`q` over the tags on published papers (of `module_id`, when given). Hidden modules and chapters don't exist
    for anyone but `staff` (SEC-55)."""
    q = (
        q.join(LibraryItem, LibraryItem.id == PaperQuestion.item_id)
        .join(Chapter, Chapter.id == PaperQuestion.chapter_id)
        .where(LibraryItem.status == ItemStatus.published)
    )
    if not staff:
        q = q.where(Chapter.hidden.is_(False), ~in_hidden_module())
    if module_id is not None:
        q = q.where(LibraryItem.module_id == module_id)
    return q


def for_module(
    db: Session,
    module_id: str | None,
    user: User | None,
    *,
    flagged: bool = False,
    chapter_id: str | None = None,
    topic_id: str | None = None,
) -> list[PaperQuestionOut]:
    """A module's tags on published papers: chapter by chapter, the newest sitting first; of one chapter with
    `chapter_id`, and of one of its study-guide topics with `topic_id` too. `flagged`: only the tags someone flagged,
    the most flagged first, of one module or of all (people who manage the library)."""
    if module_id is None and not flagged:
        raise invalid("moduleId", "Choose a module.")
    staff = sees_hidden_modules(user)
    require_module(db, module_id, visible=not staff)
    q = _tags(select(PaperQuestion), module_id, staff=staff)
    if topic_id is not None and chapter_id is None:
        raise invalid("chapterId", "Choose the topic's chapter too.")
    if chapter_id is not None:
        chapter = db.get(Chapter, chapter_id)
        if chapter is None or chapter.module_id != module_id or (chapter.hidden and not staff):
            raise invalid("chapterId", "Pick one of this module's chapters.")
        q = q.where(PaperQuestion.chapter_id == chapter_id)
    if topic_id is not None:
        if db.get(ChapterTopic, (chapter_id, topic_id)) is None:
            raise invalid("topicId", "Pick one of this chapter's topics.")
        q = q.where(
            exists().where(PaperQuestionTopic.question_id == PaperQuestion.id, PaperQuestionTopic.topic_id == topic_id)
        )
    if flagged:
        if not manages(user):
            raise forbidden("Only people who manage the library can see flagged tags.")
        q = q.where(PaperQuestion.flag_count > 0).order_by(PaperQuestion.flag_count.desc(), Chapter.position)
    else:
        q = q.order_by(
            Chapter.position,
            *newest_sitting_first(LibraryItem.exam_year, LibraryItem.exam_session),
            LibraryItem.zone.nulls_last(),
            PaperQuestion.section.nulls_first(),
            PaperQuestion.question,
        )
    return to_out(db, db.scalars(q.order_by(PaperQuestion.id)).all(), user)


def tag(db: Session, user: User, item_id: uuid.UUID, body: PaperQuestionCreate) -> PaperQuestion:
    """Tag a question of a published past paper with a chapter of its module that students see (never a hidden one),
    and any of that chapter's study-guide topics. At most TAGS_PER_HOUR an hour."""
    item = _published_paper(db, item_id, user)
    chapter = db.get(Chapter, body.chapter_id)
    if chapter is None or chapter.module_id != item.module_id or chapter.hidden:
        raise invalid("chapterId", "Pick one of this module's chapters.")
    topic_ids = _chapter_topics(db, chapter.id, body.topic_ids)
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
        item_id=item.id,
        chapter_id=chapter.id,
        section=body.section,
        question=body.question,
        page=body.page,
        anchor=_anchor(db, item.id, body.page, body.question, body.section),
        tagged_by=user.id,
    )
    try:
        with db.begin_nested():
            db.add(row)
            db.flush()
    except IntegrityError:
        name = label(body.section, body.question)
        message = f"{name} is already tagged with {chapter.title}. Pick another chapter."
        raise conflict("already_tagged", message) from None
    set_topics(db, row, topic_ids)
    return row


def _anchor(db: Session, item_id: uuid.UUID, page: int | None, question: int, section: str | None) -> str | None:
    """Where the question starts on the page the student gave, from the paper's text (services/question_anchors.py)."""
    text = db.get(LibraryText, item_id)
    if page is None or text is None or text.status != TextStatus.done or not text.body or text.pages is None:
        return None
    pages = text.body.split(PAGE_BREAK)
    return question_anchors.find(pages[page - 1], question, section) if page <= len(pages) else None


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
        title = f"{label(row.section, row.question)} of {item.title if item else 'a paper'}"
        record(
            db,
            user,
            "library.question_remove",
            "library_item",
            row.item_id,
            title,
            ip,
            chapter=row.chapter_id,
            section=row.section,
            question=row.question,  # the seed doesn't bring back a removed tag (seed/loader.py)
        )
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
    title = f"{label(row.section, row.question)} of {item.title if item else 'a paper'}"
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


# ── a past question a day ────────────────────────────────────────────────────────────────────

# Fewer tags than this and Home shows no daily question: the same handful would come round too often.
DAILY_MIN_TAGS = 10


def daily(db: Session, module_id: str, user: User | None, day: date) -> PaperQuestionOut | None:
    """The module's past question for `day`: the same for everyone that day and a different one the next, going
    round the module's tags in the order of their ids. None below DAILY_MIN_TAGS tags."""
    ids = sorted(db.scalars(_tags(select(PaperQuestion.id), module_id, staff=sees_hidden_modules(user))).all(), key=str)
    if len(ids) < DAILY_MIN_TAGS:
        return None
    picked = db.get(PaperQuestion, ids[(day - EPOCH).days % len(ids)])
    return to_out(db, [picked], user)[0] if picked is not None else None
