from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends

from app.core.security import CurrentSession, requires_admin
from app.models import User
from app.schemas.common import ErrorResponse
from app.services import sessions

# Every route documents the error shape (see app/core/errors.py).
ERRORS: dict[int | str, dict[str, Any]] = {
    code: {"model": ErrorResponse} for code in (400, 401, 403, 404, 409, 422, 429)
}


def router_for(tag: str, *dependencies: Any) -> APIRouter:
    """A router for one area. `dependencies` run before every one of its routes, e.g. needs_feature(Feature.forum)."""
    return APIRouter(tags=[tag], responses=ERRORS, dependencies=list(dependencies))


def _stepped_up_admin(user: Annotated[User, requires_admin()], sess: CurrentSession) -> User:
    sessions.require_step_up(sess)
    return user


# An active admin whose session started, or stepped up, in the last ten minutes: for the admin-only changes, so a
# stolen admin session can't keep itself in (security review AD-1). 403 forbidden, then 403 step_up_required.
SteppedUpAdmin = Annotated[User, Depends(_stepped_up_admin)]
