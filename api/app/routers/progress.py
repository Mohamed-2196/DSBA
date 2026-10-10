"""Lesson progress, per signed-in user. Owner: accounts agent."""

from __future__ import annotations

from fastapi import Path, Response, status

from app.core.security import DB, CurrentUser
from app.routers._base import router_for
from app.schemas.modules import LessonWatchedUpdate, Progress, ProgressImport, ResumeUpdate

router = router_for("progress")
LessonKey = Path(pattern=r"^[a-z0-9-]{1,64}:\d{1,3}:\d{1,3}$")


@router.get("/me/progress", response_model=Progress)
def get_progress(user: CurrentUser, db: DB) -> Progress:
    raise NotImplementedError


@router.put("/me/progress/lessons/{lesson_key}", response_model=Progress)
def set_watched(body: LessonWatchedUpdate, user: CurrentUser, db: DB, lesson_key: str = LessonKey) -> Progress:
    """Mark one lesson watched or not (404 when the module, chapter or video does not exist)."""
    raise NotImplementedError


@router.put("/me/progress/resume", response_model=Progress)
def set_resume(body: ResumeUpdate, user: CurrentUser, db: DB) -> Progress:
    """The lesson the student just opened in a module."""
    raise NotImplementedError


@router.delete("/me/progress/modules/{module_id}", status_code=status.HTTP_204_NO_CONTENT)
def reset_module(module_id: str, user: CurrentUser, db: DB) -> Response:
    raise NotImplementedError


@router.post("/me/progress/import", response_model=Progress)
def import_progress(body: ProgressImport, user: CurrentUser, db: DB) -> Progress:
    """Merge progress kept in the browser as a guest (unknown lessons are skipped, newest timestamps win)."""
    raise NotImplementedError
