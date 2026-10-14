"""Suggested videos (IDEA-15): a student suggests a video for a module's chapter, with a title and a line on why;
it waits in Manage → Suggested videos until someone with content.edit accepts it or declines it.

- The link must be one the module editor takes (module_editor.parse_video): a YouTube video or playlist, or a class
  recording on vc.bibf.com. A video the module already has as a lesson, or one already waiting, is refused.
- Five suggestions a day per student.
- Accepting adds the lesson at the end of the chapter (the suggested one, another, or a new one) and moves the
  module's version on, so an editor with the module open reloads before saving. Declining needs a reason.
- Both are audited, and tell the student while the feature is on for them. Services leave the commit to the
  handler."""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import timedelta

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.orm import Session

from app.core.access import Feature
from app.core.errors import conflict, invalid, not_found
from app.core.time import utcnow
from app.models import Chapter, Lesson, Module, SuggestionStatus, User, VideoSuggestion
from app.schemas.suggestions import (
    SuggestionAccept,
    SuggestionCreate,
    SuggestionDecline,
    SuggestionOut,
    SuggestionPage,
)
from app.schemas.suggestions import SuggestionStatus as StatusKey
from app.services import access
from app.services.accounts import public_user
from app.services.content import record
from app.services.forum.text import clean_body, clean_title, has_text
from app.services.module_editor import VIDEO_RULE, get_module, link_of, parse_video
from app.services.modules import MODULE_UNKNOWN, new_id
from app.services.notify import notify
from app.services.ratelimit import enforce

SUGGESTIONS_PER_DAY = 5
MINE_LIMIT = 50
CHAPTER_UNKNOWN = "Pick one of the module's chapters."
CLOSED = "This suggestion was already accepted or declined."

# ── reading ─────────────────────────────────────────────────────────────────────────────────


def get_suggestion(db: Session, suggestion_id: uuid.UUID, *, lock: bool = False) -> VideoSuggestion:
    s = db.get(VideoSuggestion, suggestion_id, with_for_update=lock or None)
    if s is None:
        raise not_found("This suggestion doesn't exist.")
    return s


def _outs(db: Session, rows: Sequence[VideoSuggestion]) -> list[SuggestionOut]:
    people_ids = {i for s in rows for i in (s.author_id, s.decided_by) if i is not None}
    people = {u.id: u for u in db.scalars(select(User).where(User.id.in_(people_ids)))} if people_ids else {}
    access.prefetch(db, people.values())
    module_ids = {s.module_id for s in rows}
    modules = (
        dict(db.execute(select(Module.id, Module.name).where(Module.id.in_(module_ids))).tuples().all())
        if module_ids
        else {}
    )
    chapter_ids = {s.chapter_id for s in rows if s.chapter_id}
    chapters = (
        dict(db.execute(select(Chapter.id, Chapter.title).where(Chapter.id.in_(chapter_ids))).tuples().all())
        if chapter_ids
        else {}
    )
    return [
        SuggestionOut.model_validate(
            {
                "id": s.id,
                "module_id": s.module_id,
                "module_title": modules.get(s.module_id, ""),
                "chapter_id": s.chapter_id,
                "chapter_title": chapters.get(s.chapter_id) if s.chapter_id else None,
                "kind": s.kind,
                "url": link_of(s.kind, s.video_id, s.url),
                "title": s.title,
                "reason": s.reason,
                "status": s.status.value,
                "reply": s.reply,
                "lesson_id": s.lesson_id,
                "author": public_user(people.get(s.author_id)) if s.author_id else None,
                "decided_by": public_user(people.get(s.decided_by)) if s.decided_by else None,
                "decided_at": s.decided_at,
                "created_at": s.created_at,
            }
        )
        for s in rows
    ]


def suggestion_out(db: Session, s: VideoSuggestion) -> SuggestionOut:
    return _outs(db, [s])[0]


def mine(db: Session, user: User, module_id: str | None) -> list[SuggestionOut]:
    """The person's own suggestions, newest first (the latest MINE_LIMIT), for one module or all of them."""
    where: list[ColumnElement[bool]] = [VideoSuggestion.author_id == user.id]
    if module_id is not None:
        where.append(VideoSuggestion.module_id == module_id)
    rows = db.scalars(
        select(VideoSuggestion)
        .where(*where)
        .order_by(VideoSuggestion.created_at.desc(), VideoSuggestion.id)
        .limit(MINE_LIMIT)
    ).all()
    return _outs(db, rows)


def queue(db: Session, status: StatusKey, limit: int, offset: int) -> SuggestionPage:
    """Pending suggestions oldest first (first come, first reviewed); decided ones the latest decision first."""
    where = VideoSuggestion.status == SuggestionStatus(status)
    total = db.scalar(select(func.count()).select_from(VideoSuggestion).where(where)) or 0
    order = (
        [VideoSuggestion.created_at, VideoSuggestion.id]
        if status == "pending"
        else [VideoSuggestion.decided_at.desc(), VideoSuggestion.id]
    )
    rows = db.scalars(select(VideoSuggestion).where(where).order_by(*order).limit(limit).offset(offset)).all()
    return SuggestionPage(items=_outs(db, rows), total=total, limit=limit, offset=offset)


def pending_count(db: Session) -> int:
    """Suggestions waiting for review (Manage's count)."""
    return (
        db.scalar(
            select(func.count()).select_from(VideoSuggestion).where(VideoSuggestion.status == SuggestionStatus.pending)
        )
        or 0
    )


# ── students ────────────────────────────────────────────────────────────────────────────────


def _same_video(model: type[Lesson] | type[VideoSuggestion], video: dict[str, str]) -> ColumnElement[bool]:
    if video["kind"] == "bbb":
        return (model.kind == "bbb") & (model.url == video["url"])
    return (model.kind == video["kind"]) & (model.video_id == video["video_id"])


def _refuse_duplicates(db: Session, module_id: str, video: dict[str, str]) -> None:
    lesson = db.scalar(select(Lesson.id).where(Lesson.module_id == module_id, _same_video(Lesson, video)).limit(1))
    if lesson is not None:
        raise conflict("already_a_lesson", "This video is already a lesson in this module.")
    waiting = db.scalar(
        select(VideoSuggestion.id)
        .where(
            VideoSuggestion.module_id == module_id,
            VideoSuggestion.status == SuggestionStatus.pending,
            _same_video(VideoSuggestion, video),
        )
        .limit(1)
    )
    if waiting is not None:
        raise conflict("already_suggested", "Someone already suggested this video. It's waiting for review.")


def create(db: Session, user: User, data: SuggestionCreate) -> VideoSuggestion:
    """A suggestion for a module students can see, and one of its chapters students can see (or none)."""
    module = db.get(Module, data.module_id)
    if module is None or module.hidden:
        raise invalid("moduleId", MODULE_UNKNOWN)
    if data.chapter_id is not None and not any(c.id == data.chapter_id and not c.hidden for c in module.chapters):
        raise invalid("chapterId", CHAPTER_UNKNOWN)
    video = parse_video(data.url)
    if video is None:
        raise invalid("url", VIDEO_RULE)
    title = clean_title(data.title)
    if not has_text(title):
        raise invalid("title", "Give the video a title.")
    reason = clean_title(data.reason)
    _refuse_duplicates(db, module.id, video)
    enforce(
        db,
        f"video-suggestions:{user.id}",
        VideoSuggestion.created_at,
        [VideoSuggestion.author_id == user.id],
        limit=SUGGESTIONS_PER_DAY,
        window=timedelta(days=1),
        message=f"You've suggested {SUGGESTIONS_PER_DAY} videos today. Try again in {{}}.",
    )
    s = VideoSuggestion(
        author_id=user.id,
        module_id=module.id,
        chapter_id=data.chapter_id,
        kind=video["kind"],
        video_id=video.get("video_id"),
        url=video.get("url"),
        title=title,
        reason=reason if has_text(reason) else "",
        status=SuggestionStatus.pending,
        created_at=utcnow(),
    )
    db.add(s)
    db.flush()
    return s


# ── content managers ────────────────────────────────────────────────────────────────────────


def _tell(db: Session, s: VideoSuggestion, actor: User, title: str, body: str | None, url: str) -> None:
    """Notifies the student, while the feature is on for them."""
    if s.author_id is None:
        return
    author = db.get(User, s.author_id)
    if author is None or not access.feature_on(db, author, Feature.video_suggestions):
        return
    notify(
        db,
        author.id,
        "video_suggestion",
        title,
        body=body,
        url=url,
        actor=actor,
        data={"suggestionId": str(s.id), "status": s.status.value},
    )


def _open(s: VideoSuggestion) -> None:
    if s.status != SuggestionStatus.pending:
        raise conflict("suggestion_closed", CLOSED)


def accept(db: Session, user: User, s: VideoSuggestion, data: SuggestionAccept, ip: str | None) -> Lesson:
    """Adds the video as a lesson at the end of its chapter, and moves the module's version on. Audited."""
    _open(s)
    m = get_module(db, s.module_id, lock=True)
    if data.new_chapter is not None:
        chapter = Chapter(id=new_id(), module_id=m.id, title=data.new_chapter, position=len(m.chapters))
        m.chapters.append(chapter)
    else:
        chapter_id = data.chapter_id or s.chapter_id
        found = next((c for c in m.chapters if c.id == chapter_id), None)
        if found is None:
            raise invalid("chapterId", "Pick a chapter for the lesson, or name a new one.")
        chapter = found
    video = {"kind": s.kind, "url": s.url or "", "video_id": s.video_id or ""}
    if db.scalar(select(Lesson.id).where(Lesson.module_id == m.id, _same_video(Lesson, video)).limit(1)):
        raise conflict("already_a_lesson", "This video is already a lesson in this module. Decline the suggestion.")
    title = data.title or s.title
    lesson = Lesson(
        id=new_id(),
        module_id=m.id,
        position=len(chapter.lessons),
        kind=s.kind,
        video_id=s.video_id,
        url=s.url,
        title=title,
        unavailable=False,
        hidden=False,
    )
    chapter.lessons.append(lesson)
    m.version += 1
    db.flush()
    s.status = SuggestionStatus.accepted
    s.lesson_id = lesson.id
    s.chapter_id = chapter.id
    s.decided_by = user.id
    s.decided_at = utcnow()
    db.flush()
    record(
        db,
        user,
        "suggestion.accept",
        "video_suggestion",
        s.id,
        title,
        ip,
        module=m.name,
        moduleId=m.id,
        chapter=chapter.title,
        lessonId=lesson.id,
    )
    _tell(db, s, user, f"Your video is now a lesson: {title}", None, f"/modules/{m.id}/lessons/{lesson.id}")
    return lesson


def decline(db: Session, user: User, s: VideoSuggestion, data: SuggestionDecline, ip: str | None) -> None:
    """Declines it with a reason the student sees. Audited."""
    _open(s)
    reply = clean_body(data.reply)
    if not has_text(reply):
        raise invalid("reply", "Say why it's declined: the student who suggested it will see it.")
    s.status = SuggestionStatus.declined
    s.reply = reply
    s.decided_by = user.id
    s.decided_at = utcnow()
    db.flush()
    module = db.get(Module, s.module_id)
    record(
        db,
        user,
        "suggestion.decline",
        "video_suggestion",
        s.id,
        s.title,
        ip,
        module=module.name if module else None,
        moduleId=s.module_id,
        reply=reply,
    )
    _tell(db, s, user, f"Video suggestion declined: {s.title}", reply, f"/modules/{s.module_id}")
