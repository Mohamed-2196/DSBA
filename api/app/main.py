"""The FastAPI application."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.core.errors import install_error_handlers
from app.core.security import CSRFMiddleware
from app.routers import api_router
from app.routers.health import VERSION
from app.services.storage import get_storage

log = logging.getLogger("dsba")


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    s = get_settings()
    if s.s3_create_bucket:
        try:
            get_storage().ensure_bucket(s.web_origins)
        except Exception:
            log.exception("could not prepare the bucket %s; uploads will fail until it exists", s.s3_bucket)
    yield


def create_app() -> FastAPI:
    s = get_settings()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    app = FastAPI(
        title="DSBA Hub API",
        version=VERSION,
        lifespan=lifespan,
        openapi_url="/api/v1/openapi.json",
        docs_url="/api/v1/docs",
        redoc_url=None,
    )
    install_error_handlers(app)
    app.add_middleware(CSRFMiddleware)
    # Only needed when the web app is served from another origin than the API (normally both sit behind one).
    app.add_middleware(
        CORSMiddleware,
        allow_origins=s.web_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Content-Type", "X-CSRF-Token"],
    )

    @app.middleware("http")
    async def security_headers(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        if request.url.path.startswith("/api/") and not request.url.path.startswith("/api/v1/docs"):
            response.headers.setdefault("Cache-Control", "no-store")
            response.headers.setdefault("X-Frame-Options", "DENY")
        return response

    app.include_router(api_router)
    return app


app = create_app()
