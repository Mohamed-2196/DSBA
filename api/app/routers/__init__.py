"""Every router, mounted under /api/v1 by app.main."""

from fastapi import APIRouter

from app.routers import (
    access,
    admin,
    auth,
    board,
    bugs,
    calendar,
    content,
    features,
    forum,
    health,
    library,
    me,
    modules,
    newsletter,
    noora,
    notes,
    notifications,
    progress,
    reports,
    requests,
    seniors,
    suggestions,
    summary,
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
    requests,
    newsletter,
    notes,
    calendar,
    content,
    seniors,
    features,
    board,
    noora,
    summary,
    suggestions,
    bugs,
):
    api_router.include_router(module.router)
