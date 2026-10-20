"""What's in a recording: a student suggests a time in a lesson's video and what it covers there ("41:20 MLE of a
uniform"); it waits in Manage → Suggested videos, beside the suggested videos, until someone with content.edit
accepts it (put right if need be) or declines it with a reason. Accepted topics show beside the player, in order, and
take the video to their time.

- Only lessons students see, and only videos the player can take to a time: YouTube videos and class recordings,
  not playlists.
- One topic per time per lesson: a time already accepted or waiting (within DUPLICATE_WITHIN seconds) is refused.
- TOPICS_PER_DAY suggestions a day per student; MAX_TOPICS accepted topics per lesson.
- Accepting, declining and removing are audited, and the first two tell the student while the feature is on for
  them. Services leave the commit to the handler."""

from __future__ import annotations

import uuid
from collections.abc import Iterable, Sequence
from datetime import timedelta

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.orm import Session

from app.core.access import Feature
from app.core.errors import conflict, invalid, not_found
from app.core.time import utcnow
from app.models import Lesson, LessonTopic, Module, SuggestionStatus, User
from app.schemas.modules import LessonTopic as TopicShown
from app.schemas.suggestions import SuggestionDecline, TopicAccept, TopicCreate, TopicOut, TopicPage
from app.schemas.suggestions import SuggestionStatus as StatusKey
from app.services import access
from app.services.accounts import public_user
from app.services.content import record
from app.services.forum.text import clean_body, clean_title, has_text
from app.services.modules import lesson_name, lesson_path, student_lesson
from app.services.notify import notify
from app.services.ratelimit import enforce

TOPICS_PER_DAY = 20
MAX_TOPICS = 60  # accepted on one lesson: a three-hour class with a topic every three minutes
DUPLICATE_WITHIN = 10  # seconds: a time this close to one already there is the same moment
MINE_LIMIT = 50
SEEKABLE = ("youtube", "bbb")
CLOSED = "This time stamp was already accepted or declined."


def clock(seconds: int) -> str:
    """'41:20', or '1:02:05' past the hour."""
    h, rest = divmod(seconds, 3600)
    m, s = divmod(rest, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


# ── reading ─────────────────────────────────────────────────────────────────────────────────


def shown(db: Session, lesson_ids: Iterable[str]) -> dict[str, list[TopicShown]]:
    """The accepted topics of these lessons, by lesson, in time order."""
    ids = list(set(lesson_ids))
    if not ids:
        return {}
    rows = db.execute(
        select(LessonTopic.lesson_id, LessonTopic.id, LessonTopic.seconds, LessonTopic.label)
        .where(LessonTopic.lesson_id.in_(ids), LessonTopic.status == SuggestionStatus.accepted)
        .order_by(LessonTopic.lesson_id, LessonTopic.seconds, LessonTopic.created_at)
    ).tuples()
    out: dict[str, list[TopicShown]] = {}
    for lesson_id, topic_id, seconds, label in rows:
        out.setdefault(lesson_id, []).append(TopicShown(id=topic_id, seconds=seconds, label=label))
    return out


def get_topic(db: Session, topic_id: uuid.UUID, *, lock: bool = False) -> LessonTopic:
    t = db.get(LessonTopic, topic_id, with_for_update=lock or None)
    if t is None:
        raise not_found("This time stamp doesn't exist.")
    return t


def _outs(db: Session, rows: Sequence[LessonTopic]) -> list[TopicOut]:
    people_ids = {i for t in rows for i in (t.author_id, t.decided_by) if i is not None}
    people = {u.id: u for u in db.scalars(select(User).where(User.id.in_(people_ids)))} if people_ids else {}
    access.prefetch(db, people.values())
    lessons = {
        lesson.id: lesson for lesson in db.scalars(select(Lesson).where(Lesson.id.in_({t.lesson_id for t in rows})))
    }
    module_ids = {lesson.module_id for lesson in lessons.values()}
    modules = (
        dict(db.execute(select(Module.id, Module.name).where(Module.id.in_(module_ids))).tuples().all())
        if module_ids
        else {}
    )
    out: list[TopicOut] = []
    for t in rows:
        lesson = lessons[t.lesson_id]
        out.append(
            TopicOut(
                id=t.id,
                module_id=lesson.module_id,
                module_title=modules.get(lesson.module_id, ""),
                lesson_id=lesson.id,
                lesson_title=lesson_name(lesson),
                seconds=t.seconds,
                label=t.label,
                status=t.status.value,
                reply=t.reply,
                author=public_user(people.get(t.author_id)) if t.author_id else None,
                decided_by=public_user(people.get(t.decided_by)) if t.decided_by else None,
                decided_at=t.decided_at,
                created_at=t.created_at,
            )
        )
    return out


def topic_out(db: Session, t: LessonTopic) -> TopicOut:
    return _outs(db, [t])[0]


def mine(db: Session, user: User, lesson_id: str | None) -> list[TopicOut]:
    """The person's own suggestions, newest first (the latest MINE_LIMIT), for one lesson or all of them."""
    where: list[ColumnElement[bool]] = [LessonTopic.author_id == user.id]
    if lesson_id is not None:
        where.append(LessonTopic.lesson_id == lesson_id)
    rows = db.scalars(
        select(LessonTopic).where(*where).order_by(LessonTopic.created_at.desc(), LessonTopic.id).limit(MINE_LIMIT)
    ).all()
    return _outs(db, rows)


def queue(db: Session, status: StatusKey, limit: int, offset: int) -> TopicPage:
    """Waiting ones oldest first, a lesson's together; decided ones the latest decision first."""
    where = LessonTopic.status == SuggestionStatus(status)
    total = db.scalar(select(func.count()).select_from(LessonTopic).where(where)) or 0
    order = (
        [LessonTopic.created_at, LessonTopic.id]
        if status == "pending"
        else [LessonTopic.decided_at.desc(), LessonTopic.id]
    )
    rows = db.scalars(select(LessonTopic).where(where).order_by(*order).limit(limit).offset(offset)).all()
    return TopicPage(items=_outs(db, rows), total=total, limit=limit, offset=offset)


def pending_count(db: Session) -> int:
    """Time stamps waiting for review (Manage's count)."""
    return (
        db.scalar(select(func.count()).select_from(LessonTopic).where(LessonTopic.status == SuggestionStatus.pending))
        or 0
    )


# ── students ────────────────────────────────────────────────────────────────────────────────


def _near(lesson_id: str, seconds: int, *statuses: SuggestionStatus) -> ColumnElement[bool]:
    return (
        (LessonTopic.lesson_id == lesson_id)
        & LessonTopic.status.in_(statuses)
        & (func.abs(LessonTopic.seconds - seconds) < DUPLICATE_WITHIN)
    )


def create(db: Session, user: User, data: TopicCreate) -> LessonTopic:
    """A time stamp for a lesson students see, whose video the player can take to a time."""
    lesson = student_lesson(db, data.lesson_id)
    if lesson is None:
        raise invalid("lessonId", "This lesson isn't open to students.")
    if lesson.kind not in SEEKABLE:
        raise invalid("lessonId", "A playlist has no single timeline. Add time stamps to a video or a class recording.")
    label = clean_title(data.label)
    if not has_text(label):
        raise invalid("label", "Say what the video covers at this time.")
    taken = db.execute(
        select(LessonTopic.status, LessonTopic.seconds)
        .where(_near(lesson.id, data.seconds, SuggestionStatus.pending, SuggestionStatus.accepted))
        .order_by(LessonTopic.status)  # an accepted one first
        .limit(1)
    ).first()
    if taken is not None:
        status, at = taken
        if status == SuggestionStatus.accepted:
            raise conflict("already_suggested", f"This video already has a time stamp at {clock(at)}.")
        raise conflict("already_suggested", f"Someone already suggested a time stamp at {clock(at)}. It's waiting.")
    enforce(
        db,
        f"lesson-topics:{user.id}",
        LessonTopic.created_at,
        [LessonTopic.author_id == user.id],
        limit=TOPICS_PER_DAY,
        window=timedelta(days=1),
        message=f"You've suggested {TOPICS_PER_DAY} time stamps today. Try again in {{}}.",
    )
    t = LessonTopic(
        lesson_id=lesson.id,
        author_id=user.id,
        seconds=data.seconds,
        label=label,
        status=SuggestionStatus.pending,
        created_at=utcnow(),
    )
    db.add(t)
    db.flush()
    return t


# ── content managers ────────────────────────────────────────────────────────────────────────


def _tell(db: Session, t: LessonTopic, actor: User, title: str, body: str | None, url: str) -> None:
    """Notifies the student, while the feature is on for them."""
    if t.author_id is None:
        return
    author = db.get(User, t.author_id)
    if author is None or not access.feature_on(db, author, Feature.modules_time_stamps):
        return
    notify(
        db,
        author.id,
        "video_suggestion",
        title,
        body=body,
        url=url,
        actor=actor,
        data={"topicId": str(t.id), "status": t.status.value},
    )


def _open(t: LessonTopic) -> None:
    if t.status != SuggestionStatus.pending:
        raise conflict("suggestion_closed", CLOSED)


def _audit(db: Session, user: User, action: str, t: LessonTopic, ip: str | None, **data: object) -> Lesson:
    lesson = db.get(Lesson, t.lesson_id)
    assert lesson is not None  # a topic goes with its lesson
    module = db.get(Module, lesson.module_id)
    record(
        db,
        user,
        action,
        "lesson_topic",
        t.id,
        f"{clock(t.seconds)} {t.label}",
        ip,
        module=module.name if module else None,
        moduleId=lesson.module_id,
        lessonId=lesson.id,
        lesson=lesson_name(lesson),
        **data,
    )
    return lesson


def accept(db: Session, user: User, t: LessonTopic, data: TopicAccept, ip: str | None) -> None:
    """Shows it beside the player (with the time or the words put right). Audited; tells the student."""
    _open(t)
    seconds = t.seconds if data.seconds is None else data.seconds
    label = clean_title(data.label) if data.label is not None else t.label
    if not has_text(label):
        raise invalid("label", "Say what the video covers at this time.")
    clash = db.scalar(
        select(LessonTopic.seconds).where(
            _near(t.lesson_id, seconds, SuggestionStatus.accepted), LessonTopic.id != t.id
        )
    )
    if clash is not None:
        raise conflict("already_suggested", f"This video already has a time stamp at {clock(clash)}. Decline this one.")
    shown_now = (
        db.scalar(
            select(func.count())
            .select_from(LessonTopic)
            .where(LessonTopic.lesson_id == t.lesson_id, LessonTopic.status == SuggestionStatus.accepted)
        )
        or 0
    )
    if shown_now >= MAX_TOPICS:
        raise conflict("too_many_topics", f"This video has {MAX_TOPICS} time stamps, the most it can show.")
    t.seconds, t.label = seconds, label
    t.status = SuggestionStatus.accepted
    t.decided_by = user.id
    t.decided_at = utcnow()
    db.flush()
    lesson = _audit(db, user, "topic.accept", t, ip, seconds=seconds)
    _tell(
        db,
        t,
        user,
        f"Your time stamp is up: {clock(seconds)} {label}",
        None,
        f"{lesson_path(lesson)}?t={seconds}",
    )


def decline(db: Session, user: User, t: LessonTopic, data: SuggestionDecline, ip: str | None) -> None:
    """Declines it with a reason the student sees. Audited; tells the student."""
    _open(t)
    reply = clean_body(data.reply)
    if not has_text(reply):
        raise invalid("reply", "Say why it's declined: the student who suggested it will see it.")
    t.status = SuggestionStatus.declined
    t.reply = reply
    t.decided_by = user.id
    t.decided_at = utcnow()
    db.flush()
    lesson = _audit(db, user, "topic.decline", t, ip, reply=reply)
    _tell(db, t, user, f"Time stamp declined: {clock(t.seconds)} {t.label}", reply, lesson_path(lesson))


def remove(db: Session, user: User, t: LessonTopic, ip: str | None) -> None:
    """Takes an accepted topic off the video (it was wrong, or the video changed). Audited."""
    if t.status != SuggestionStatus.accepted:
        raise conflict("suggestion_closed", "Only a time stamp shown beside the video can be removed.")
    _audit(db, user, "topic.remove", t, ip)
    db.delete(t)
    db.flush()
