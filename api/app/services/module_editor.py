"""Content managers edit the module catalogue (R-9): add, edit, reorder, hide and remove modules, chapters and lessons.

- A save sends the whole module with the `version` it loaded; a stale version gets 409 module_changed.
- Chapters and lessons carry their `id`, which never changes: what refers to a lesson (watched lessons, where
  students left off, notes and study-board cards) points at its id, so moving one only changes its `position`.
- Removing a lesson with notes or cards, a chapter that still has lessons, or a module that anything refers to is
  refused (409 content_in_use): hiding it is the way to take it out of students' views.
- Every write is audited with what changed, before and after. Services leave the commit to the handler."""

from __future__ import annotations

import re
from collections.abc import Iterable
from typing import Any, NamedTuple
from urllib.parse import parse_qs, urlsplit

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import ApiError, conflict, invalid, not_found
from app.core.links import is_https
from app.models import (
    BoardCard,
    CalendarEvent,
    Chapter,
    ForumThread,
    Lesson,
    LibraryItem,
    Module,
    Note,
    StudentRequest,
    User,
)
from app.schemas.modules import (
    ChapterOut,
    LessonOut,
    ModuleCreate,
    ModuleEdit,
    ModuleEditSummary,
    ModuleFields,
    ModuleOrder,
    ModuleSave,
    ResourcesIn,
)
from app.services.content import record
from app.services.modules import new_id

CHANGED = "Someone else saved this module while you were editing. Load it again."
YOUTUBE_HOSTS = frozenset(
    {"youtube.com", "www.youtube.com", "m.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"}
)
RECORDING_HOST = "vc.bibf.com"  # class recordings (BigBlueButton): the app embeds this host only
VIDEO_RULE = "Paste a YouTube video or playlist link, or a class recording link from vc.bibf.com."
_VIDEO_ID = re.compile(r"[A-Za-z0-9_-]{6,20}")
_PLAYLIST_ID = re.compile(r"[A-Za-z0-9_-]{10,64}")
RESOURCE_FIELDS = ("materials", "exercises", "vle", "older_exams", "cheat_sheet")
EDITED = ("unit_code", "name", "short_name", "year", "description", "icon", "resources", "hidden", "chapters")

# ── videos ───────────────────────────────────────────────────────────────────────────────────


class Video(NamedTuple):
    """A lesson's video as stored: a YouTube video or playlist by id, or a class recording by its link."""

    kind: str
    video_id: str | None = None
    url: str | None = None


def parse_video(url: str) -> Video | None:
    """The stored video for a link the app can embed, or None."""
    if not is_https(url):
        return None
    parts = urlsplit(url)
    host = (parts.hostname or "").lower()
    if host == RECORDING_HOST:
        return Video("bbb", url=url)
    query = parse_qs(parts.query)
    segments = [s for s in parts.path.split("/") if s]
    video: str | None = None
    if host == "youtu.be" and segments:
        video = segments[0]
    elif host in YOUTUBE_HOSTS:
        if segments == ["watch"]:
            video = (query.get("v") or [""])[0]
        elif len(segments) == 2 and segments[0] in ("embed", "shorts", "live") and segments[1] != "videoseries":
            video = segments[1]
        elif segments in (["playlist"], ["embed", "videoseries"]):
            playlist = (query.get("list") or [""])[0]
            return Video("youtube-playlist", video_id=playlist) if _PLAYLIST_ID.fullmatch(playlist) else None
    return Video("youtube", video_id=video) if video and _VIDEO_ID.fullmatch(video) else None


def video_link(lesson: Lesson) -> str:
    """The link an editor sees for a lesson's video (parse_video() reads it back)."""
    return link_of(lesson.kind, lesson.video_id, lesson.url)


def link_of(kind: str, video_id: str | None, url: str | None) -> str:
    """The link for a stored video: parse_video() reads it back."""
    ident = video_id or ""
    if kind == "bbb":
        return url or ""
    if kind == "youtube-playlist":
        return f"https://www.youtube.com/playlist?list={ident}"
    return ident if ident.startswith("https://") else f"https://www.youtube.com/watch?v={ident}"


def add_lesson(db: Session, m: Module, chapter: Chapter, video: Video, title: str) -> Lesson:
    """A new lesson at the end of `chapter`, shown to students; the module's version moves on, so an editor with it
    open reloads before saving."""
    lesson = Lesson(
        id=new_id(),
        module_id=m.id,
        position=len(chapter.lessons),
        kind=video.kind,
        video_id=video.video_id,
        url=video.url,
        title=title,
        unavailable=False,
        hidden=False,
    )
    chapter.lessons.append(lesson)
    m.version += 1
    db.flush()
    return lesson


# ── reading ──────────────────────────────────────────────────────────────────────────────────


def _summary(m: Module) -> dict[str, Any]:
    return {
        "id": m.id,
        "unit_code": m.unit_code,
        "name": m.name,
        "short_name": m.short_name,
        "year": m.year,
        "icon": m.icon,
        "hidden": m.hidden,
        "position": m.position,
        "version": m.version,
        "chapter_count": len(m.chapters),
        "lesson_count": sum(len(c.lessons) for c in m.chapters),
        "updated_at": m.updated_at,
    }


def edit_view(m: Module) -> ModuleEdit:
    chapters = [
        ChapterOut(
            id=c.id,
            title=c.title,
            hidden=c.hidden,
            lessons=[
                LessonOut.model_validate(
                    {
                        "id": v.id,
                        "kind": v.kind,
                        "url": video_link(v),
                        "title": v.title,
                        "channel": v.channel,
                        "hidden": v.hidden,
                    }
                )
                for v in c.lessons
            ],
        )
        for c in m.chapters
    ]
    return ModuleEdit.model_validate(
        {**_summary(m), "description": m.description, "resources": m.resources, "chapters": chapters}
    )


def list_for_editing(db: Session) -> list[ModuleEditSummary]:
    """Every module, hidden ones too, by year and then in programme order."""
    q = select(Module).order_by(Module.year, Module.position, Module.id)
    return [ModuleEditSummary.model_validate(_summary(m)) for m in db.scalars(q)]


def get_module(db: Session, module_id: str, *, lock: bool = False) -> Module:
    m = db.get(Module, module_id, with_for_update=lock)
    if m is None:
        raise not_found("This module doesn't exist.")
    return m


# ── checks ───────────────────────────────────────────────────────────────────────────────────


def _resources(r: ResourcesIn) -> dict[str, Any]:
    """Stored as the seed has them (camelCase), without the empty ones. Each link must be https://."""
    out: dict[str, Any] = {}
    for field in RESOURCE_FIELDS:
        value = getattr(r, field)
        if not value:
            continue
        if not is_https(value):
            raise invalid(f"resources.{field}", "Use an https:// link.")
        out[ResourcesIn.model_fields[field].alias or field] = value
    if r.exercises_note:
        out["exercisesNote"] = r.exercises_note
    return out


def _check_unit_code(db: Session, code: str | None, *, other_than: str | None = None) -> None:
    if code is None:
        return
    q = select(Module.id).where(Module.unit_code == code)
    if other_than is not None:
        q = q.where(Module.id != other_than)
    if db.scalar(q.limit(1)) is not None:
        raise invalid("unitCode", "Another module has this unit code.")


def _fields(db: Session, body: ModuleFields, *, module_id: str | None = None) -> dict[str, Any]:
    _check_unit_code(db, body.unit_code, other_than=module_id)
    return {
        "unit_code": body.unit_code,
        "name": body.name,
        "short_name": body.short_name,
        "year": body.year,
        "description": body.description,
        "icon": body.icon,
        "resources": _resources(body.resources),
    }


def _chapters_snapshot(m: Module) -> list[dict[str, Any]]:
    return [
        {
            "id": c.id,
            "title": c.title,
            "hidden": c.hidden,
            "lessons": [
                {
                    "id": v.id,
                    "kind": v.kind,
                    "videoId": v.video_id,
                    "url": v.url,
                    "title": v.title,
                    "channel": v.channel,
                    "hidden": v.hidden,
                }
                for v in c.lessons
            ],
        }
        for c in m.chapters
    ]


def _snapshot(m: Module) -> dict[str, Any]:
    return {f: _chapters_snapshot(m) if f == "chapters" else getattr(m, f) for f in EDITED}


def _audit_change(before: dict[str, Any], after: dict[str, Any]) -> dict[str, Any]:
    changed = [f for f in EDITED if before[f] != after[f]]
    return {"before": {f: before[f] for f in changed}, "after": {f: after[f] for f in changed}}


# ── create ───────────────────────────────────────────────────────────────────────────────────


def create_module(db: Session, user: User, body: ModuleCreate, ip: str | None) -> Module:
    """An empty module at the end of its year. Its id is its address, and never changes."""
    if db.get(Module, body.id) is not None:
        raise conflict("slug_taken", "Another module has this address. Choose another one.")
    last = db.scalar(select(func.max(Module.position)))
    m = Module(id=body.id, position=(last if last is not None else -1) + 1, **_fields(db, body))
    db.add(m)
    db.flush()
    record(db, user, "module.create", "module", m.id, m.name, ip, after=_snapshot(m))
    return m


# ── save: fields, chapters and lessons ───────────────────────────────────────────────────────


def _removed_lessons(m: Module, body: ModuleSave) -> set[str]:
    """The ids of the lessons `body` leaves out. The ids it has are the module's own, once each (409 module_changed
    otherwise: the editor loaded another version)."""
    chapters = {c.id for c in m.chapters}
    lessons = {v.id for c in m.chapters for v in c.lessons}
    seen: set[str] = set()
    for ch in body.chapters:
        for ident, known in [(ch.id, chapters), *((item.id, lessons) for item in ch.lessons)]:
            if ident is None:
                continue
            if ident not in known or ident in seen:
                raise conflict("module_changed", CHANGED)
            seen.add(ident)
    return lessons - seen


def _refuse_removals(db: Session, m: Module, body: ModuleSave, removed: set[str]) -> None:
    """Removing a chapter that still has lessons, or a lesson with notes or study-board cards, is refused."""
    if not removed:
        return
    kept_chapters = {ch.id for ch in body.chapters if ch.id is not None}
    for chapter in m.chapters:
        if chapter.id not in kept_chapters and any(v.id in removed for v in chapter.lessons):
            raise conflict(
                "content_in_use",
                f"“{chapter.title or 'This chapter'}” still has lessons. Hide the chapter instead, or move or "
                "remove its lessons and save first.",
            )
    used = set(db.scalars(select(Note.lesson_id).where(Note.lesson_id.in_(removed)))) | set(
        db.scalars(select(BoardCard.lesson_id).where(BoardCard.lesson_id.in_(removed)))
    )
    for chapter in m.chapters:
        for i, lesson in enumerate(chapter.lessons):
            if lesson.id in used:
                title = lesson.title or f"Lesson {i + 1} of “{chapter.title or 'its chapter'}”"
                raise conflict(
                    "content_in_use",
                    f"“{title}” has students' notes or study-board cards. Hide the lesson instead of removing it.",
                )


def _place_chapters(m: Module, body: ModuleSave) -> None:
    """Sets the module's chapters and lessons as `body` has them. Moving one changes its `position` (and a lesson's
    chapter); what `body` leaves out is deleted."""
    old_chapters = {c.id: c for c in m.chapters}
    old_lessons = {v.id: v for c in m.chapters for v in c.lessons}
    placed: list[tuple[Chapter, list[Lesson]]] = []
    for ci, ch in enumerate(body.chapters):
        chapter = old_chapters[ch.id] if ch.id is not None else Chapter(id=new_id(), module_id=m.id)
        chapter.title, chapter.hidden, chapter.position = ch.title, ch.hidden, ci
        lessons: list[Lesson] = []
        for vi, item in enumerate(ch.lessons):
            parsed = parse_video(item.url)
            if parsed is None:
                raise invalid(f"chapters.{ci}.lessons.{vi}.url", VIDEO_RULE)
            if item.id is not None:
                lesson = old_lessons[item.id]
                # still the video YouTube took down: it stays marked
                lesson.unavailable = lesson.unavailable and parse_video(video_link(lesson)) == parsed
            else:
                lesson = Lesson(id=new_id(), module_id=m.id, unavailable=False)
            lesson.kind, lesson.video_id, lesson.url = parsed
            lesson.title, lesson.channel = item.title or None, item.channel or None
            lesson.hidden, lesson.position = item.hidden, vi
            lessons.append(lesson)
        placed.append((chapter, lessons))
    for chapter, lessons in placed:
        chapter.lessons = lessons
    m.chapters = [chapter for chapter, _ in placed]


def save_module(db: Session, user: User, module_id: str, body: ModuleSave, ip: str | None) -> Module:
    """Saves the whole module, if nobody saved it since `body.version` (409 module_changed). Lessons left out go,
    with who watched them and where students left off in them."""
    m = get_module(db, module_id, lock=True)
    if m.version != body.version:
        raise conflict("module_changed", CHANGED)
    fields = _fields(db, body, module_id=m.id)
    removed = _removed_lessons(m, body)
    _refuse_removals(db, m, body, removed)
    before = _snapshot(m)
    with db.no_autoflush:
        for name, value in {**fields, "hidden": body.hidden}.items():
            setattr(m, name, value)
        _place_chapters(m, body)
    db.flush()
    after = _snapshot(m)
    if after == before:
        return m
    m.version += 1
    db.flush()
    record(db, user, "module.update", "module", m.id, m.name, ip, **_audit_change(before, after))
    return m


# ── order ────────────────────────────────────────────────────────────────────────────────────


def reorder(db: Session, user: User, body: ModuleOrder, ip: str | None) -> list[ModuleEditSummary]:
    """One year's modules in a new order. They take the places that year's modules already held, so the years keep
    their order among themselves. A module's version doesn't change: its place isn't part of the editor."""
    mods = list(
        db.scalars(
            select(Module).where(Module.year == body.year).order_by(Module.position, Module.id).with_for_update()
        )
    )
    if sorted(body.ids) != sorted(m.id for m in mods) or len(set(body.ids)) != len(body.ids):
        raise conflict("module_changed", "The modules changed while you were ordering them. Load them again.")
    before = [m.id for m in mods]
    if before != body.ids:
        places = sorted(m.position for m in mods)
        by_id = {m.id: m for m in mods}
        for place, mid in zip(places, body.ids, strict=True):
            by_id[mid].position = place
        db.flush()
        record(
            db,
            user,
            "module.reorder",
            "module",
            None,
            f"Year {body.year}",
            ip,
            year=body.year,
            before=before,
            after=body.ids,
        )
    return list_for_editing(db)


# ── remove ───────────────────────────────────────────────────────────────────────────────────


def _count(db: Session, column: Any, value: str) -> int:
    return int(db.scalar(select(func.count()).where(column == value)) or 0)


def _plural(n: int, one: str, many: str) -> str:
    return f"{n} {one if n == 1 else many}"


def uses_of(db: Session, m: Module) -> list[str]:
    """What still refers to the module, in words ("12 lessons", "3 library items"). Cards for its lessons go with
    the lessons."""
    lessons = sum(len(c.lessons) for c in m.chapters)
    cards = int(
        db.scalar(select(func.count()).where((BoardCard.link_type == "module") & (BoardCard.link_id == m.id))) or 0
    )
    counts = (
        (lessons, "lesson", "lessons"),
        (_count(db, LibraryItem.module_id, m.id), "library item", "library items"),
        (_count(db, ForumThread.module_id, m.id), "forum thread", "forum threads"),
        (_count(db, Note.module_id, m.id), "student's note", "students' notes"),
        (cards, "study-board card", "study-board cards"),
        (_count(db, StudentRequest.module_id, m.id), "request", "requests"),
        (_count(db, CalendarEvent.module_id, m.id), "calendar date", "calendar dates"),
    )
    return [_plural(n, one, many) for n, one, many in counts if n]


def _list_words(parts: Iterable[str]) -> str:
    items = list(parts)
    return items[0] if len(items) == 1 else f"{', '.join(items[:-1])} and {items[-1]}"


def delete_module(db: Session, user: User, module_id: str, version: int, ip: str | None) -> None:
    """Removes a module nothing refers to. One with lessons, files, threads, notes, cards, requests or dates is
    refused (409 content_in_use): hide it instead."""
    m = get_module(db, module_id, lock=True)
    if m.version != version:
        raise conflict("module_changed", CHANGED)
    uses = uses_of(db, m)
    if uses:
        raise ApiError(
            409,
            "content_in_use",
            f"“{m.name}” has {_list_words(uses)}. Hide it instead, so students don't see it.",
        )
    record(db, user, "module.delete", "module", m.id, m.name, ip, before=_snapshot(m))
    db.delete(m)
    db.flush()
