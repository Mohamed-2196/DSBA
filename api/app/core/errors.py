"""One error shape for every failure: {"error": {"code", "message", "fields"?, "retryAfter"?}}.

Raise ApiError (or one of the helpers) from handlers and services; never return ad-hoc error dicts."""

from __future__ import annotations

import logging
import re
from collections.abc import Sequence
from typing import Any
from urllib.parse import unquote

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import DataError
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.types import ASGIApp, Receive, Scope, Send

from app.core.headers import ERROR_HEADERS

log = logging.getLogger("dsba.errors")
_CONTROL_CHARACTERS = re.compile(r"[\x00-\x1f\x7f]")


class ApiError(Exception):
    def __init__(
        self,
        status: int,
        code: str,
        message: str,
        *,
        fields: dict[str, str] | None = None,
        retry_after: int | None = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.fields = fields
        self.retry_after = retry_after


def not_found(what: str = "Not found") -> ApiError:
    return ApiError(404, "not_found", what)


def unauthenticated(message: str = "Sign in to do this.") -> ApiError:
    return ApiError(401, "unauthenticated", message)


def forbidden(message: str = "You can't do this.") -> ApiError:
    return ApiError(403, "forbidden", message)


def conflict(code: str, message: str) -> ApiError:
    return ApiError(409, code, message)


def invalid(field: str, message: str, code: str = "invalid_input") -> ApiError:
    return ApiError(422, code, message, fields={field: message})


def rate_limited(retry_after: int, message: str = "Too many requests. Try again later.") -> ApiError:
    return ApiError(429, "rate_limited", message, retry_after=max(1, int(retry_after)))


def _body(code: str, message: str, **extra: Any) -> dict[str, Any]:
    err: dict[str, Any] = {"code": code, "message": message}
    err.update({k: v for k, v in extra.items() if v is not None})
    return {"error": err}


_LOCATIONS = frozenset({"body", "query", "path", "header", "cookie"})


def field_name(loc: Sequence[object]) -> str:
    """A validation error's location as the client names the field: ('body', 'sections', 0, 'href') ->
    'sections.0.href'. Only the first segment says where the value came from: a field called 'body' (a reply's
    text) keeps its name. The whole body or request: 'request'."""
    parts = [str(p) for p in loc]
    if parts and parts[0] in _LOCATIONS:
        parts = parts[1:]
    return ".".join(parts) or "request"


_STATUS_CODES = {
    400: "bad_request",
    401: "unauthenticated",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
}


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError) -> JSONResponse:
        headers = {"Retry-After": str(exc.retry_after)} if exc.retry_after else None
        return JSONResponse(
            _body(exc.code, exc.message, fields=exc.fields, retryAfter=exc.retry_after),
            status_code=exc.status,
            headers=headers,
        )

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        fields: dict[str, str] = {}
        for e in exc.errors():
            fields[field_name(e.get("loc", ()))] = str(e.get("msg", "Invalid value"))
        return JSONResponse(_body("invalid_input", "Some fields are not valid.", fields=fields), status_code=422)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = _STATUS_CODES.get(exc.status_code, "error")
        return JSONResponse(_body(code, str(exc.detail)), status_code=exc.status_code)

    @app.exception_handler(NotImplementedError)
    async def _todo(_: Request, __: NotImplementedError) -> JSONResponse:
        return JSONResponse(_body("not_implemented", "This endpoint is not built yet."), status_code=501)

    @app.exception_handler(DataError)
    async def _data(request: Request, exc: DataError) -> JSONResponse:
        # A value the database can't store (a NUL byte in text, a number out of range) that got past validation.
        # Logged without the SQL and its parameters, which may hold personal data.
        log.warning(
            "the database refused a value on %s %s (%s)", request.method, request.url.path, type(exc.orig).__name__
        )
        return JSONResponse(_body("invalid_input", "Some fields are not valid."), status_code=422)

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        log.exception("unhandled error on %s %s", request.method, request.url.path, exc_info=exc)
        # Made outside the security headers middleware (Starlette's error middleware wraps it): add them here.
        return JSONResponse(
            _body("internal", "Something went wrong on our side."), status_code=500, headers=ERROR_HEADERS
        )


class ControlCharactersMiddleware:
    """400 bad_request for a path or query string holding control characters (NUL above all: PostgreSQL refuses it
    in text, so it would end as a 500 with a traceback in the log). No route takes them (security review SEC-5)."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            query = unquote(scope.get("query_string", b"").decode("latin-1"))
            if _CONTROL_CHARACTERS.search(scope.get("path", "")) or _CONTROL_CHARACTERS.search(query):
                body = _body("bad_request", "This address has characters it can't have.")
                await JSONResponse(body, status_code=400)(scope, receive, send)
                return
        await self.app(scope, receive, send)
