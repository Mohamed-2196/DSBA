"""The module catalogue and lessons, and editing them (content managers). Owner: content agent."""

from __future__ import annotations

from typing import Annotated

from fastapi import Query, Request, Response, status

from app.core.access import Box, Feature
from app.core.pagination import YearParam
from app.core.security import DB, OptionalUser, client_ip, requires
from app.models import User
from app.routers._base import router_for
from app.schemas.grades import PaperChoice
from app.schemas.modules import (
    ModuleCreate,
    ModuleDetail,
    ModuleEdit,
    ModuleEditSummary,
    ModuleOrder,
    ModuleSave,
    ModuleSummary,
)
from app.services import access, grades
from app.services import module_editor as editor
from app.services import modules as svc

router = router_for("modules")


@router.get("/modules", response_model=list[ModuleSummary])
def list_modules(db: DB, user: OptionalUser, year: YearParam | None = None) -> list[ModuleSummary]:
    """Every module, in programme order, with its published library count (None while the library is off for you)."""
    return svc.list_modules(db, year, library=access.feature_on(db, user, Feature.library))


@router.get("/modules/choices", response_model=list[PaperChoice])
def paper_choices(db: DB) -> list[PaperChoice]:
    """The choices a student makes inside a year, from the grades calculator's rules: the Year 2 option and the
    electives, each with how many to pick and its options. A student's papers hold what they picked."""
    return grades.rules(db).choices()


@router.get("/modules/{module_id}", response_model=ModuleDetail)
def get_module(module_id: str, db: DB, user: OptionalUser) -> ModuleDetail:
    """The module with its chapters and lessons (each with its time stamps while they are on), and its shelves."""
    return svc.module_detail(
        db,
        module_id,
        library=access.feature_on(db, user, Feature.library),
        topics=access.feature_on(db, user, Feature.modules_time_stamps),
    )


# ── editing (content managers) ───────────────────────────────────────────────────────────────

Editor = Annotated[User, requires(Box.content_edit)]


@router.get("/content/modules", response_model=list[ModuleEditSummary])
def modules_for_editing(db: DB, _: Editor) -> list[ModuleEditSummary]:
    """Every module, hidden ones too, by year and then in programme order."""
    return editor.list_for_editing(db)


@router.post("/content/modules", response_model=ModuleEdit, status_code=status.HTTP_201_CREATED)
def create_module(body: ModuleCreate, request: Request, user: Editor, db: DB) -> ModuleEdit:
    """A new, empty module at the end of its year. Its `id` is its address, for good. Audited.

    Errors: slug_taken (409), invalid_input (422: a unit code another module has, a link that isn't https://)."""
    m = editor.create_module(db, user, body, client_ip(request))
    db.commit()
    return editor.edit_view(m)


@router.post("/content/modules/reorder", response_model=list[ModuleEditSummary])
def reorder_modules(body: ModuleOrder, request: Request, user: Editor, db: DB) -> list[ModuleEditSummary]:
    """One year's modules in a new order. Audited. Errors: module_changed (409: they aren't that year's modules)."""
    out = editor.reorder(db, user, body, client_ip(request))
    db.commit()
    return out


@router.get("/content/modules/{module_id}", response_model=ModuleEdit)
def module_for_editing(module_id: str, db: DB, _: Editor) -> ModuleEdit:
    """A module as the editor has it: hidden chapters and lessons too, each with its `id` and video link."""
    return editor.edit_view(editor.get_module(db, module_id))


@router.put("/content/modules/{module_id}", response_model=ModuleEdit)
def save_module(module_id: str, body: ModuleSave, request: Request, user: Editor, db: DB) -> ModuleEdit:
    """Saves the whole module. Chapters and lessons keep their ids, so what refers to a lesson (progress, notes,
    study-board cards) stays with it when it moves or is hidden. Audited, with what changed before and after.

    Errors: module_changed (409: someone saved it since `version`, or a chapter or lesson `id` that isn't the module's),
    content_in_use (409: removing a chapter that still has lessons, or a lesson with notes or cards: hide it),
    invalid_input (422: a video link the app can't embed, a unit code another module has, a link that isn't
    https://)."""
    m = editor.save_module(db, user, module_id, body, client_ip(request))
    db.commit()
    return editor.edit_view(m)


@router.delete("/content/modules/{module_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_module(module_id: str, request: Request, user: Editor, db: DB, version: int = Query(ge=1)) -> Response:
    """Removes a module nothing refers to. Audited.

    Errors: module_changed (409), content_in_use (409: it has lessons, files, threads, notes, cards, requests or
    calendar dates; hide it instead)."""
    editor.delete_module(db, user, module_id, version, client_ip(request))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
