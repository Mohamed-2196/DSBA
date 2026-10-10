"""The FastAPI application."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.core.errors import ControlCharactersMiddleware, install_error_handlers
from app.core.headers import SecurityHeadersMiddleware
from app.core.security import CSRFMiddleware, ForwardedSchemeMiddleware
from app.routers import api_router
from app.routers.health import VERSION
from app.services.storage import get_storage

log = logging.getLogger("dsba")


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    s = get_settings()
    if s.s3_create_bucket:  # development only (refused in production, where `app.cli setup-bucket` does it once)
        try:
            get_storage().ensure_bucket(s.web_origins)
        except Exception:
            log.exception("could not prepare the bucket %s; uploads will fail until it exists", s.s3_bucket)
    yield


def create_app() -> FastAPI:
    s = get_settings()  # in production: refuses to start with unsafe settings (app.config.ConfigError)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    # The interactive docs and the schema are for development: the web app's types come from api/openapi.json in
    # the repository, never from the running API.
    docs = not s.is_production
    app = FastAPI(
        title="DSBA Hub API",
        version=VERSION,
        lifespan=lifespan,
        openapi_url="/api/v1/openapi.json" if docs else None,
        docs_url="/api/v1/docs" if docs else None,
        redoc_url=None,
    )
    install_error_handlers(app)
    # Each middleware wraps the ones added before it: the scheme is set first, and the security headers reach every
    # answer, CORS preflights, CSRF refusals and bad addresses included.
    app.add_middleware(ControlCharactersMiddleware)
    app.add_middleware(CSRFMiddleware)
    # Only needed when the web app is served from another origin than the API (normally both sit behind one).
    app.add_middleware(
        CORSMiddleware,
        allow_origins=s.web_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Content-Type", "X-CSRF-Token"],
    )
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(ForwardedSchemeMiddleware)
    app.include_router(api_router)
    return app


app = create_app()
