"""Every router, mounted under /api/v1 by app.main."""

from fastapi import APIRouter

from app.routers import (
    admin,
    auth,
    calendar,
    content,
    forum,
    health,
    library,
    me,
    modules,
    newsletter,
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
    modules,
    library,
    uploads,
    forum,
    reports,
    newsletter,
    calendar,
    content,
):
    api_router.include_router(module.router)
