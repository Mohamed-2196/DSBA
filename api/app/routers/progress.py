"""Lesson progress, per signed-in user. Owner: accounts agent."""

from __future__ import annotations

from fastapi import Path, Response, status

from app.core.security import DB, CurrentUser
from app.core.time import utcnow
from app.routers._base import router_for
from app.schemas.modules import ChapterStudiedUpdate, LessonWatchedUpdate, Progress, ProgressImport, ResumeUpdate
from app.services import accounts, board

router = router_for("progress")
LessonIdPath = Path(pattern=r"^[a-z0-9]{1,16}$")
ChapterIdPath = Path(pattern=r"^[a-z0-9]{1,16}$")


@router.get("/me/progress", response_model=Progress)
def get_progress(user: CurrentUser, db: DB) -> Progress:
    """Empty while the person keeps no progress: what they saved before is kept hidden until they turn it on."""
    return accounts.progress_of(db, user)


@router.put("/me/progress/lessons/{lesson_id}", response_model=Progress)
def set_watched(body: LessonWatchedUpdate, user: CurrentUser, db: DB, lesson_id: str = LessonIdPath) -> Progress:
    """Mark one lesson watched or not (404 when there is no such lesson). A study-board card for a watched lesson
    moves to Done.

    Errors: progress_off (409: the person doesn't keep their lesson progress)."""
    accounts.require_tracking(user)
    accounts.set_watched(db, user.id, lesson_id, body.watched)
    if body.watched:
        board.complete_lessons(db, user.id)
    db.commit()
    return accounts.progress_of(db, user)


@router.put("/me/progress/chapters/{chapter_id}", response_model=Progress)
def set_studied(body: ChapterStudiedUpdate, user: CurrentUser, db: DB, chapter_id: str = ChapterIdPath) -> Progress:
    """Tick a chapter as studied, or undo it (404 when there is no such chapter). The lessons watched stay as they
    are; a ticked chapter's lessons count as done, and their study-board cards move to Done (and stay there when the
    tick is undone).

    Errors: progress_off (409: the person doesn't keep their lesson progress)."""
    accounts.require_tracking(user)
    accounts.set_studied(db, user.id, chapter_id, body.studied)
    if body.studied:
        board.complete_lessons(db, user.id)
    db.commit()
    return accounts.progress_of(db, user)


@router.put("/me/progress/resume", response_model=Progress)
def set_resume(body: ResumeUpdate, user: CurrentUser, db: DB) -> Progress:
    """The lesson the student just opened in its module (404 when it does not exist).

    Errors: progress_off (409: the person doesn't keep their lesson progress)."""
    accounts.require_tracking(user)
    accounts.set_resume(db, user.id, accounts.require_lesson(db, body.lesson_id), utcnow())
    db.commit()
    return accounts.progress_of(db, user)


@router.delete("/me/progress/modules/{module_id}", status_code=status.HTTP_204_NO_CONTENT)
def reset_module(module_id: str, user: CurrentUser, db: DB) -> Response:
    """Forget the watched lessons, the last lesson and the chapters ticked as studied of one module."""
    accounts.reset_module(db, user.id, module_id)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/me/progress/import", response_model=Progress)
def import_progress(body: ProgressImport, user: CurrentUser, db: DB) -> Progress:
    """Merge progress kept in the browser as a guest (unknown lessons are skipped, newest timestamps win).

    Errors: progress_off (409: the person doesn't keep their lesson progress)."""
    accounts.require_tracking(user)
    accounts.import_progress(db, user.id, body)
    board.complete_lessons(db, user.id)
    db.commit()
    return accounts.progress_of(db, user)
