"""Every router, mounted under /api/v1 by app.main."""

from fastapi import APIRouter

from app.routers import (
    access,
    admin,
    auth,
    board,
    calendar,
    content,
    features,
    forum,
    health,
    library,
    me,
    modules,
    newsletter,
    notes,
    notifications,
    progress,
    reports,
    uploads,
)

api_router = APIRouter(prefix="/api/v1")
for module in (
    health,
    auth,
    me,
    progress,
    notifications,
    admin,
    access,
    modules,
    library,
    uploads,
    forum,
    reports,
    newsletter,
    notes,
    calendar,
    content,
    features,
    board,
):
    api_router.include_router(module.router)
