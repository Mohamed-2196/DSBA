"""Lesson progress, per signed-in user. Owner: accounts agent."""

from __future__ import annotations

from fastapi import Path, Response, status

from app.core.security import DB, CurrentUser
from app.core.time import utcnow
from app.routers._base import router_for
from app.schemas.modules import LessonWatchedUpdate, Progress, ProgressImport, ResumeUpdate
from app.services import accounts

router = router_for("progress")
LessonKey = Path(pattern=r"^[a-z0-9-]{1,64}:\d{1,3}:\d{1,3}$")


@router.get("/me/progress", response_model=Progress)
def get_progress(user: CurrentUser, db: DB) -> Progress:
    return accounts.progress_of(db, user.id)


@router.put("/me/progress/lessons/{lesson_key}", response_model=Progress)
def set_watched(body: LessonWatchedUpdate, user: CurrentUser, db: DB, lesson_key: str = LessonKey) -> Progress:
    """Mark one lesson watched or not (404 when the module, chapter or video does not exist)."""
    accounts.set_watched(db, user.id, lesson_key, body.watched)
    db.commit()
    return accounts.progress_of(db, user.id)


@router.put("/me/progress/resume", response_model=Progress)
def set_resume(body: ResumeUpdate, user: CurrentUser, db: DB) -> Progress:
    """The lesson the student just opened in a module (404 when it does not exist)."""
    accounts.require_lesson(db, body.module_id, body.chapter, body.video)
    accounts.set_resume(db, user.id, body.module_id, body.chapter, body.video, utcnow())
    db.commit()
    return accounts.progress_of(db, user.id)


@router.delete("/me/progress/modules/{module_id}", status_code=status.HTTP_204_NO_CONTENT)
def reset_module(module_id: str, user: CurrentUser, db: DB) -> Response:
    """Forget the watched lessons and the last lesson of one module."""
    accounts.reset_module(db, user.id, module_id)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/me/progress/import", response_model=Progress)
def import_progress(body: ProgressImport, user: CurrentUser, db: DB) -> Progress:
    """Merge progress kept in the browser as a guest (unknown lessons are skipped, newest timestamps win)."""
    accounts.import_progress(db, user.id, body)
    db.commit()
    return accounts.progress_of(db, user.id)
