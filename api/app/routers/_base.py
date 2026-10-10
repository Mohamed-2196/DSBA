from __future__ import annotations

from fastapi import APIRouter

from app.schemas.common import ErrorResponse

# Every route documents the error shape (see app/core/errors.py).
ERRORS = {code: {"model": ErrorResponse} for code in (400, 401, 403, 404, 409, 422, 429)}


def router_for(tag: str) -> APIRouter:
    return APIRouter(tags=[tag], responses=ERRORS)  # type: ignore[arg-type]
