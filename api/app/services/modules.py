"""The module catalogue as students see it: summaries with their library counts, the lessons students see, and the one
rule for "a module id from a request". Hidden modules, chapters and lessons are left out."""

from __future__ import annotations

import re
import secrets
from collections.abc import Iterable
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import invalid, not_found
from app.models import Chapter, Lesson, Module
from app.schemas.modules import Chapter as ChapterOut
from app.schemas.modules import LessonTopic, ModuleDetail, ModuleSummary, Video

MODULE_UNKNOWN = "Pick a module from the list."
ID_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"


def link_of(kind: str, video_id: str | None, url: str | None) -> str:
    """The link for a stored video: module_editor.parse_video() reads it back."""
    ident = video_id or ""
    if kind == "bbb":
        return url or ""
    if kind == "youtube-playlist":
        return f"https://www.youtube.com/playlist?list={ident}"
    return ident if ident.startswith("https://") else f"https://www.youtube.com/watch?v={ident}"


def require_module(
    db: Session, module_id: str | None, field: str = "moduleId", *, visible: bool = False
) -> Module | None:
    """The module a request names, None when it names none, or 422 on `field` when there is no such module
    (code quality review CQ-6: one rule and one message for every area). `visible`: for what students write, a hidden
    module is no module, as it is 404 to them."""
    if module_id is None:
        return None
    module = db.get(Module, module_id)
    if module is None or (visible and module.hidden):
        raise invalid(field, MODULE_UNKNOWN)
    return module


def unknown_modules(db: Session, ids: Iterable[str]) -> list[str]:
    """The ids, among `ids`, that name no module (in the order given, once each)."""
    wanted = list(dict.fromkeys(ids))
    if not wanted:
        return []
    known = set(db.scalars(select(Module.id).where(Module.id.in_(wanted))))
    return [i for i in wanted if i not in known]


def new_id() -> str:
    """A new chapter or lesson id: 8 characters, lowercase letters and digits that can't be mistaken for one another.
    It is the thing's address for good, so it never says where the thing is."""
    return "".join(secrets.choice(ID_ALPHABET) for _ in range(8))


def visible_chapters(m: Module) -> list[Chapter]:
    """The chapters students see, in order (each one's visible lessons: visible_lessons())."""
    return [c for c in m.chapters if not c.hidden]


def visible_lessons(chapter: Chapter) -> list[Lesson]:
    return [lesson for lesson in chapter.lessons if not lesson.hidden]


def student_lesson(db: Session, lesson_id: str) -> Lesson | None:
    """A lesson students see (it, its chapter and its module aren't hidden), or None."""
    lesson = db.get(Lesson, lesson_id)
    if lesson is None or lesson.hidden or lesson.chapter.hidden or lesson.chapter.module.hidden:
        return None
    return lesson


def student_lessons(db: Session, ids: Iterable[str]) -> dict[str, Lesson]:
    """The lessons students see among `ids`, by id."""
    wanted = list(set(ids))
    if not wanted:
        return {}
    q = (
        select(Lesson)
        .join(Chapter, Lesson.chapter_id == Chapter.id)
        .join(Module, Lesson.module_id == Module.id)
        .where(Lesson.id.in_(wanted), Lesson.hidden.is_(False), Chapter.hidden.is_(False), Module.hidden.is_(False))
    )
    return {lesson.id: lesson for lesson in db.scalars(q)}


_RECORDED_AT = re.compile(r"-(\d{13})$")  # a class recording's address ends with when it was made, in milliseconds
_MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
_BAHRAIN = timezone(timedelta(hours=3))  # where the classes are held


def recorded_on(lesson: Lesson) -> str | None:
    """'17 Sep 2025': the day a class recording was made (as the web app's lessons.ts reads it), or None."""
    found = _RECORDED_AT.search(lesson.url or "") if lesson.kind == "bbb" else None
    if found is None:
        return None
    day = datetime.fromtimestamp(int(found.group(1)) / 1000, tz=_BAHRAIN)
    return f"{day.day} {_MONTHS[day.month - 1]} {day.year}"


def lesson_name(lesson: Lesson) -> str:
    """What a lesson is called: its title; 'Chapter title: class of 17 Sep 2025' for a class recording; 'Chapter
    title, video 3' for a video without a title."""
    if lesson.title:
        return lesson.title
    if day := recorded_on(lesson):
        return f"{lesson.chapter.title}: class of {day}"
    siblings = visible_lessons(lesson.chapter) if not lesson.hidden else lesson.chapter.lessons
    return f"{lesson.chapter.title}, video {siblings.index(lesson) + 1}"


def lesson_path(lesson: Lesson) -> str:
    return f"/modules/{lesson.module_id}/lessons/{lesson.id}"


def video_out(lesson: Lesson, topics: list[LessonTopic] | None = None) -> Video:
    return Video(
        id=lesson.id,
        kind=lesson.kind,
        video_id=lesson.video_id,
        url=lesson.url,
        title=lesson.title,
        channel=lesson.channel,
        unavailable=lesson.unavailable,
        topics=topics or [],
    )


def chapters_out(m: Module, topics: dict[str, list[LessonTopic]] | None = None) -> list[ChapterOut]:
    """The chapters and lessons students see, each lesson with its `topics` (by lesson id) when given."""
    shown = topics or {}
    return [
        ChapterOut(
            id=c.id,
            title=c.title,
            audio_url=c.audio_url,
            videos=[video_out(v, shown.get(v.id)) for v in visible_lessons(c)],
        )
        for c in visible_chapters(m)
    ]


def _summary(m: Module, library_count: int | None) -> dict[str, Any]:
    chapters = visible_chapters(m)
    return {
        "id": m.id,
        "unit_code": m.unit_code,
        "name": m.name,
        "short_name": m.short_name,
        "year": m.year,
        "description": m.description,
        "icon": m.icon,
        "art": m.art,
        "chapter_count": len(chapters),
        "lesson_count": sum(len(visible_lessons(c)) for c in chapters),
        "library_count": library_count,
    }


def list_modules(db: Session, year: int | None, *, library: bool) -> list[ModuleSummary]:
    """`library`: whether the library is on for the viewer. Without it, the library counts are None."""
    q = select(Module).where(Module.hidden.is_(False)).order_by(Module.position, Module.id)
    if year is not None:
        q = q.where(Module.year == year)
    from app.services.library import module_counts  # library -> modules (require_module)

    counts = module_counts(db) if library else {}
    return [ModuleSummary.model_validate(_summary(m, counts.get(m.id, 0) if library else None)) for m in db.scalars(q)]


def module_detail(db: Session, module_id: str, *, library: bool, topics: bool = False) -> ModuleDetail:
    """`library`: as for list_modules(). `topics`: whether time stamps are on for the viewer (each lesson's topics)."""
    m = db.get(Module, module_id)
    if m is None or m.hidden:
        raise not_found("This module doesn't exist.")
    from app.services.lesson_topics import shown  # lesson_topics -> modules (student_lesson)
    from app.services.library import module_counts, module_shelves  # library -> modules (require_module)

    count = module_counts(db, m.id).get(m.id, 0) if library else None
    shelves = module_shelves(db, m.id) if library else []
    lesson_topics = shown(db, (v.id for c in m.chapters for v in c.lessons)) if topics else None
    return ModuleDetail.model_validate(
        {**_summary(m, count), "shelves": shelves, "chapters": chapters_out(m, lesson_topics)}
    )
