"""One error shape for every failure: {"error": {"code", "message", "fields"?, "retryAfter"?}}.

Raise ApiError (or one of the helpers) from handlers and services; never return ad-hoc error dicts."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger("dsba.errors")


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
            loc = [str(p) for p in e.get("loc", ()) if p not in ("body", "query", "path")]
            fields[".".join(loc) or "request"] = str(e.get("msg", "Invalid value"))
        return JSONResponse(_body("invalid_input", "Some fields are not valid.", fields=fields), status_code=422)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = _STATUS_CODES.get(exc.status_code, "error")
        return JSONResponse(_body(code, str(exc.detail)), status_code=exc.status_code)

    @app.exception_handler(NotImplementedError)
    async def _todo(_: Request, __: NotImplementedError) -> JSONResponse:
        return JSONResponse(_body("not_implemented", "This endpoint is not built yet."), status_code=501)

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        log.exception("unhandled error on %s %s", request.method, request.url.path, exc_info=exc)
        return JSONResponse(_body("internal", "Something went wrong on our side."), status_code=500)
