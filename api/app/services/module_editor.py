"""Content managers edit the module catalogue (R-9): add, edit, reorder, hide and remove modules, chapters and lessons.

- A save sends the whole module with the `version` it loaded; a stale version gets 409 module_changed.
- Chapters and lessons carry their `origin` (where they were), so a save that moves, hides or removes lessons moves
  what refers to them (watched lessons, where students left off, notes and study-board cards) to the new lesson keys
  (app/services/modules.py `in_key_order`).
- Removing a lesson with notes or cards, a chapter that still has lessons, or a module that anything refers to is
  refused (409 content_in_use): hiding it is the way to take it out of students' views.
- Every write is audited with what changed, before and after. Services leave the commit to the handler."""

from __future__ import annotations

import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import Any
from urllib.parse import parse_qs, urlsplit

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.errors import ApiError, conflict, invalid, not_found
from app.core.links import is_https
from app.models import (
    BoardCard,
    CalendarEvent,
    ForumThread,
    LessonResume,
    LessonView,
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
from app.services.accounts import lesson_key, parse_lesson_key
from app.services.content import record
from app.services.modules import in_key_order

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


def parse_video(url: str) -> dict[str, str] | None:
    """A stored video ({kind, id} or {kind, url}) from a link the app can embed, or None."""
    if not is_https(url):
        return None
    parts = urlsplit(url)
    host = (parts.hostname or "").lower()
    if host == RECORDING_HOST:
        return {"kind": "bbb", "url": url}
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
            return {"kind": "youtube-playlist", "id": playlist} if _PLAYLIST_ID.fullmatch(playlist) else None
    return {"kind": "youtube", "id": video} if video and _VIDEO_ID.fullmatch(video) else None


def video_link(video: dict[str, Any]) -> str:
    """The link an editor sees for a stored video (parse_video() reads it back)."""
    kind, ident = video.get("kind"), str(video.get("id") or "")
    if kind == "bbb":
        return str(video.get("url") or "")
    if kind == "youtube-playlist":
        return f"https://www.youtube.com/playlist?list={ident}"
    return ident if ident.startswith("https://") else f"https://www.youtube.com/watch?v={ident}"


# ── reading ──────────────────────────────────────────────────────────────────────────────────


def _videos(chapter: object) -> list[dict[str, Any]]:
    videos = chapter.get("videos") if isinstance(chapter, dict) else None
    return [v for v in videos if isinstance(v, dict)] if isinstance(videos, list) else []


def _chapters(m: Module) -> list[dict[str, Any]]:
    return [c for c in m.chapters if isinstance(c, dict)] if isinstance(m.chapters, list) else []


def _summary(m: Module) -> dict[str, Any]:
    chapters = _chapters(m)
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
        "chapter_count": len(chapters),
        "lesson_count": sum(len(_videos(c)) for c in chapters),
        "updated_at": m.updated_at,
    }


def edit_view(m: Module) -> ModuleEdit:
    chapters = [
        ChapterOut(
            title=str(c.get("title") or ""),
            hidden=bool(c.get("hidden")),
            origin=ci,
            lessons=[
                LessonOut.model_validate(
                    {
                        "kind": v.get("kind", "youtube"),
                        "url": video_link(v),
                        "title": v.get("title"),
                        "channel": v.get("channel"),
                        "hidden": bool(v.get("hidden")),
                        "origin": {"chapter": ci, "video": vi},
                    }
                )
                for vi, v in enumerate(_videos(c))
            ],
        )
        for ci, c in enumerate(_chapters(m))
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


def _snapshot(m: Module) -> dict[str, Any]:
    return {f: getattr(m, f) for f in EDITED}


def _audit_change(before: dict[str, Any], after: dict[str, Any]) -> dict[str, Any]:
    changed = [f for f in EDITED if before[f] != after[f]]
    return {"before": {f: before[f] for f in changed}, "after": {f: after[f] for f in changed}}


# ── create ───────────────────────────────────────────────────────────────────────────────────


def create_module(db: Session, user: User, body: ModuleCreate, ip: str | None) -> Module:
    """An empty module at the end of its year. Its id is its address, and never changes."""
    if db.get(Module, body.id) is not None:
        raise conflict("slug_taken", "Another module has this address. Choose another one.")
    last = db.scalar(select(func.max(Module.position)))
    m = Module(id=body.id, position=(last if last is not None else -1) + 1, chapters=[], **_fields(db, body))
    db.add(m)
    db.flush()
    record(db, user, "module.create", "module", m.id, m.name, ip, after=_snapshot(m))
    return m


# ── save: fields, chapters and lessons ───────────────────────────────────────────────────────

Position = tuple[int, int]  # (chapter, video)


def _new_chapters(
    old: Sequence[dict[str, Any]], body: ModuleSave
) -> tuple[list[dict[str, Any]], dict[Position, Position]]:
    """The chapters to store, and where each kept lesson came from: {new stored position: old stored position}."""
    seen_chapters: set[int] = set()
    seen_lessons: set[Position] = set()
    chapters: list[dict[str, Any]] = []
    moved: dict[Position, Position] = {}
    for ci, ch in enumerate(body.chapters):
        before: dict[str, Any] = {}
        if ch.origin is not None:
            if ch.origin >= len(old) or ch.origin in seen_chapters:
                raise conflict("module_changed", CHANGED)
            seen_chapters.add(ch.origin)
            before = old[ch.origin]
        videos: list[dict[str, Any]] = []
        for vi, lesson in enumerate(ch.lessons):
            parsed = parse_video(lesson.url)
            if parsed is None:
                raise invalid(f"chapters.{ci}.lessons.{vi}.url", VIDEO_RULE)
            video: dict[str, Any] = dict(parsed)
            if lesson.origin is not None:
                o = (lesson.origin.chapter, lesson.origin.video)
                if o[0] >= len(old) or o[1] >= len(_videos(old[o[0]])) or o in seen_lessons:
                    raise conflict("module_changed", CHANGED)
                seen_lessons.add(o)
                moved[ci, vi] = o
                was = _videos(old[o[0]])[o[1]]
                if was.get("unavailable") and parse_video(video_link(was)) == parsed:
                    video["unavailable"] = True  # still the video YouTube took down
            video.update({k: v for k, v in (("title", lesson.title), ("channel", lesson.channel)) if v})
            if lesson.hidden:
                video["hidden"] = True
            videos.append(video)
        chapter: dict[str, Any] = {"title": ch.title}
        if before.get("audioUrl"):
            chapter["audioUrl"] = before["audioUrl"]
        if ch.hidden:
            chapter["hidden"] = True
        chapter["videos"] = videos
        chapters.append(chapter)
    return chapters, moved


def _keys(chapters: Sequence[dict[str, Any]]) -> dict[Position, Position]:
    """{stored position: lesson key position}."""
    return {
        (c, v): (kc, kv) for kc, (c, videos) in enumerate(in_key_order(list(chapters))) for kv, v in enumerate(videos)
    }


@dataclass
class _Remap:
    module_id: str
    keys: dict[Position, Position]  # old key position -> new key position, for every lesson kept
    removed: set[Position]  # old key positions of the lessons removed

    def key(self, old: str) -> str | None:
        """The new lesson key for an old one; None when the lesson is gone."""
        parsed = parse_lesson_key(old)
        if parsed is None or parsed[0] != self.module_id or (parsed[1], parsed[2]) not in self.keys:
            return None
        return lesson_key(self.module_id, *self.keys[parsed[1], parsed[2]])

    @property
    def moves(self) -> bool:
        return bool(self.removed) or any(a != b for a, b in self.keys.items())


def _lesson_cards(db: Session, module_id: str) -> list[BoardCard]:
    q = select(BoardCard).where(
        BoardCard.link_type == "lesson", BoardCard.link_id.startswith(f"{module_id}:", autoescape=True)
    )
    return list(db.scalars(q))


def _refuse_removals(
    db: Session,
    m: Module,
    old: Sequence[dict[str, Any]],
    remap: _Remap,
    body: ModuleSave,
    old_keys: dict[Position, Position],
) -> None:
    """Removing a chapter that still has lessons, or a lesson with notes or study-board cards, is refused."""
    kept_chapters = {ch.origin for ch in body.chapters if ch.origin is not None}
    gone = {key: pos for pos, key in old_keys.items() if key in remap.removed}
    for ci, chapter in enumerate(old):
        if ci not in kept_chapters and any(pos[0] == ci for pos in gone.values()):
            raise conflict(
                "content_in_use",
                f"“{chapter.get('title') or 'This chapter'}” still has lessons. Hide the chapter instead, or move or "
                "remove its lessons and save first.",
            )
    if not gone:
        return
    notes = db.execute(
        select(Note.chapter, Note.video, func.count())
        .where(Note.module_id == m.id, Note.chapter.is_not(None))
        .group_by(Note.chapter, Note.video)
    ).all()
    uses: dict[Position, int] = {(int(c), int(v)): int(n) for c, v, n in notes}
    for card in _lesson_cards(db, m.id):
        parsed = parse_lesson_key(card.link_id or "")
        if parsed is not None:
            uses[parsed[1], parsed[2]] = uses.get((parsed[1], parsed[2]), 0) + 1
    for key, (c, v) in sorted(gone.items()):
        if uses.get(key):
            title = _videos(old[c])[v].get("title") or f"Lesson {v + 1} of “{old[c].get('title') or 'its chapter'}”"
            raise conflict(
                "content_in_use",
                f"“{title}” has students' notes or study-board cards. Hide the lesson instead of removing it.",
            )


def _move_references(db: Session, remap: _Remap) -> None:
    """Watched lessons, where students left off, notes and study-board cards follow their lessons to the new keys.
    Watched lessons and resume points of removed lessons go."""
    mid = remap.module_id
    views = db.execute(
        select(LessonView.user_id, LessonView.lesson_key, LessonView.watched_at).where(LessonView.module_id == mid)
    ).all()
    changed = [(user_id, key, remap.key(key), at) for user_id, key, at in views]
    changed = [row for row in changed if row[2] != row[1]]
    if changed:
        old_keys = {key for _, key, _, _ in changed}
        db.execute(
            delete(LessonView)
            .where(LessonView.module_id == mid, LessonView.lesson_key.in_(old_keys))
            .execution_options(synchronize_session=False)
        )
        db.add_all(
            LessonView(user_id=user_id, lesson_key=new, module_id=mid, watched_at=at)
            for user_id, _, new, at in changed
            if new is not None
        )
    for resume in db.scalars(select(LessonResume).where(LessonResume.module_id == mid)):
        moved = remap.keys.get((resume.chapter, resume.video))
        if moved is None:
            db.delete(resume)
        else:
            resume.chapter, resume.video = moved
    for note in db.scalars(select(Note).where(Note.module_id == mid, Note.chapter.is_not(None))):
        if (
            note.chapter is not None
            and note.video is not None
            and (moved := remap.keys.get((note.chapter, note.video)))
        ):
            note.chapter, note.video = moved
    # Two steps, so two cards that swap keys never hold the same one at once (one card per lesson per board).
    cards = [(card, remap.key(card.link_id or "")) for card in _lesson_cards(db, mid)]
    cards = [(card, new) for card, new in cards if new is not None and new != card.link_id]
    for card, new in cards:
        card.link_id = f"~{new}"
    db.flush()
    for card, new in cards:
        card.link_id = new
    db.flush()


def save_module(db: Session, user: User, module_id: str, body: ModuleSave, ip: str | None) -> Module:
    """Saves the whole module, if nobody saved it since `body.version` (409 module_changed)."""
    m = get_module(db, module_id, lock=True)
    if m.version != body.version:
        raise conflict("module_changed", CHANGED)
    fields = _fields(db, body, module_id=m.id)
    old = _chapters(m)
    chapters, moved = _new_chapters(old, body)
    old_keys, new_keys = _keys(old), _keys(chapters)
    remap = _Remap(
        module_id=m.id,
        keys={old_keys[was]: new_keys[now] for now, was in moved.items()},
        removed={key for pos, key in old_keys.items() if pos not in set(moved.values())},
    )
    _refuse_removals(db, m, old, remap, body, old_keys)
    before = _snapshot(m)
    for name, value in {**fields, "hidden": body.hidden, "chapters": chapters}.items():
        setattr(m, name, value)
    after = _snapshot(m)
    if after == before:
        return m
    if remap.moves:
        _move_references(db, remap)
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
    """What still refers to the module, in words ("12 lessons", "3 library items")."""
    lessons = sum(len(_videos(c)) for c in _chapters(m))
    cards = int(
        db.scalar(
            select(func.count()).where(
                ((BoardCard.link_type == "module") & (BoardCard.link_id == m.id))
                | ((BoardCard.link_type == "lesson") & BoardCard.link_id.startswith(f"{m.id}:", autoescape=True))
            )
        )
        or 0
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
