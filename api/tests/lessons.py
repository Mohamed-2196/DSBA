"""Builds a test module's chapters and lessons from plain dicts, the way modules.json lists them."""

from __future__ import annotations

from typing import Any

from app.models import Chapter, Lesson, Module
from app.services.modules import new_id


def chapters(module_id: str, spec: list[dict[str, Any]]) -> list[Chapter]:
    """[{title, hidden?, videos: [{kind, video_id?, url?, title?, channel?, unavailable?, hidden?}]}] -> chapters,
    each with a new id, and its lessons with theirs."""
    return [
        Chapter(
            id=new_id(),
            module_id=module_id,
            position=ci,
            title=c["title"],
            hidden=bool(c.get("hidden")),
            lessons=[
                Lesson(
                    id=new_id(),
                    module_id=module_id,
                    position=vi,
                    kind=v.get("kind", "youtube"),
                    video_id=v.get("video_id"),
                    url=v.get("url"),
                    title=v.get("title"),
                    channel=v.get("channel"),
                    unavailable=bool(v.get("unavailable")),
                    hidden=bool(v.get("hidden")),
                )
                for vi, v in enumerate(c.get("videos") or [])
            ],
        )
        for ci, c in enumerate(spec)
    ]


def lesson_id(module: Module, chapter: int, video: int) -> str:
    """The id of a module's lesson, by its place (counting from 0)."""
    return module.chapters[chapter].lessons[video].id
