"""One error shape for every failure: {"error": {"code", "message", "fields"?, "retryAfter"?}}.

Raise ApiError (or one of the helpers) from handlers and services; never return ad-hoc error dicts."""

from __future__ import annotations

import logging
import re
from collections.abc import Callable, Mapping, Sequence
from typing import Any, get_args
from urllib.parse import unquote

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic_core.core_schema import ErrorType
from sqlalchemy.exc import DataError
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.types import ASGIApp, Receive, Scope, Send

from app.core.headers import ERROR_HEADERS
from app.core.logs import redact_path
from app.schemas.common import ErrorCode

log = logging.getLogger("dsba.errors")
_CONTROL_CHARACTERS = re.compile(r"[\x00-\x1f\x7f]")


class ApiError(Exception):
    def __init__(
        self,
        status: int,
        code: ErrorCode,
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


def feature_off() -> ApiError:
    """404 feature_off: the feature is switched off for this person (an admin's choice on the Access screen)."""
    return ApiError(404, "feature_off", "This part of the hub is switched off right now.")


def conflict(code: ErrorCode, message: str) -> ApiError:
    return ApiError(409, code, message)


def invalid(field: str, message: str, code: ErrorCode = "invalid_input") -> ApiError:
    return ApiError(422, code, message, fields={field: message})


def rate_limited(retry_after: int, message: str = "Too many requests. Try again later.") -> ApiError:
    return ApiError(429, "rate_limited", message, retry_after=max(1, int(retry_after)))


def _body(code: ErrorCode, message: str, **extra: Any) -> dict[str, Any]:
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


_WORD = re.compile(r"[A-Z]?[a-z0-9]+|[A-Z]+(?![a-z])")
_WORDS = {"url": "link"}


def field_label(loc: Sequence[object]) -> str:
    """A field's name as a sentence starts it: ('body', 'displayName') -> 'Display name', 'module_id' -> 'Module',
    'roleIds' -> 'Roles'. An item of a list is 'Each of the options'; the whole request is 'The request'."""
    parts = list(loc[1:] if loc and str(loc[0]) in _LOCATIONS else loc)
    names = [p for p in parts if isinstance(p, str)]
    if not names:
        return "The request"
    words = [_WORDS.get(w.lower(), w.lower()) for w in _WORD.findall(names[-1])] or ["this field"]
    if len(words) > 1 and words[-1] in ("id", "ids"):
        last = words.pop()
        if last == "ids" and not words[-1].endswith("s"):
            words[-1] += "s"
    label = " ".join(words)
    if isinstance(parts[-1], int):
        return f"Each of the {label}"
    return label[0].upper() + label[1:]


def _entries(n: object) -> str:
    return f"{n} entry" if n == 1 else f"{n} entries"


def _string_too_short(label: str, ctx: Mapping[str, Any]) -> str:
    n = ctx.get("min_length", 1)
    return f"{label} can't be empty. Fill it in." if n == 1 else f"{label} must be at least {n} characters."


def _too_short(label: str, ctx: Mapping[str, Any]) -> str:
    return f"{label} needs at least {_entries(ctx.get('min_length'))}."


def _too_long(label: str, ctx: Mapping[str, Any]) -> str:
    return f"{label} can have {_entries(ctx.get('max_length'))} at most. Remove some."


def _url_scheme(label: str, ctx: Mapping[str, Any]) -> str:
    schemes = str(ctx.get("expected_schemes", "https")).replace("'", "")
    return f"{label} must be a web address starting with {schemes}."


def _value_error(label: str, ctx: Mapping[str, Any], msg: str) -> str:
    if isinstance(ctx.get("error"), Exception):  # our own validators' ValueError: written for people
        return str(ctx["error"])
    if msg.startswith("value is not a valid email address"):
        return f"{label} must be an email address, like name@example.com."
    return _fallback(label)


def _shown(value: object) -> object:
    """A constraint as people write it: 0, not 0.0."""
    return int(value) if isinstance(value, float) and value.is_integer() else value


def _fallback(label: str) -> str:
    return f"{label} isn't valid. Check it and try again."


# A message: a template filled with the field's label and the error's context ({max_length}), or a function of them.
_Say = str | Callable[[str, Mapping[str, Any]], str]
_NUMBER = "{label} must be a number."
_WHOLE = "{label} must be a whole number."
_MISSING = "{label} is missing. Fill it in."
_DATE = "{label} must be a date, like 2026-09-14."
_DATETIME = "{label} must be a date and time, like 2026-09-14 09:30."
_LINK = "{label} must be a full web address, like https://example.com."
_CHOICE = "{label} isn't one of the choices. Pick one from the list."
_SHAPE = "{label} isn't in the shape this takes. Reload the page and try again."
_ID = "{label} isn't a valid id. Reload the page and try again."

_MESSAGES: dict[str, _Say] = {
    "missing": _MISSING,
    "missing_argument": _MISSING,
    "missing_keyword_only_argument": _MISSING,
    "missing_positional_only_argument": _MISSING,
    "string_too_short": _string_too_short,
    "string_too_long": "{label} must be {max_length} characters or fewer.",
    "bytes_too_short": "{label} is too short.",
    "bytes_too_long": "{label} is too long.",
    "too_short": _too_short,
    "too_long": _too_long,
    "string_type": "{label} must be text.",
    "string_pattern_mismatch": "{label} isn't in the right format. Check it and try again.",
    "string_unicode": "{label} has characters it can't have. Remove them.",
    "string_not_ascii": "{label} has characters it can't have. Remove them.",
    "int_parsing": _WHOLE,
    "int_parsing_size": "{label} is too big a number.",
    "int_type": _WHOLE,
    "int_from_float": _WHOLE,
    "float_parsing": _NUMBER,
    "float_type": _NUMBER,
    "decimal_parsing": _NUMBER,
    "decimal_type": _NUMBER,
    "finite_number": _NUMBER,
    "greater_than": "{label} must be more than {gt}.",
    "greater_than_equal": "{label} must be {ge} or more.",
    "less_than": "{label} must be less than {lt}.",
    "less_than_equal": "{label} must be {le} or less.",
    "multiple_of": "{label} must be a multiple of {multiple_of}.",
    "bool_parsing": "{label} must be true or false.",
    "bool_type": "{label} must be true or false.",
    "literal_error": _CHOICE,
    "enum": _CHOICE,
    "union_tag_invalid": _CHOICE,
    "union_tag_not_found": _MISSING,
    "url_parsing": _LINK,
    "url_syntax_violation": _LINK,
    "url_type": _LINK,
    "url_scheme": _url_scheme,
    "url_too_long": "{label} must be {max_length} characters or fewer.",
    "uuid_parsing": _ID,
    "uuid_type": _ID,
    "uuid_version": _ID,
    "date_parsing": _DATE,
    "date_type": _DATE,
    "date_from_datetime_parsing": _DATE,
    "date_from_datetime_inexact": _DATE,
    "datetime_parsing": _DATETIME,
    "datetime_type": _DATETIME,
    "datetime_from_date_parsing": _DATETIME,
    "datetime_object_invalid": _DATETIME,
    "time_parsing": "{label} must be a time, like 14:30.",
    "time_type": "{label} must be a time, like 14:30.",
    "time_delta_parsing": "{label} must be a length of time.",
    "time_delta_type": "{label} must be a length of time.",
    "date_future": "{label} must be in the future.",
    "datetime_future": "{label} must be in the future.",
    "date_past": "{label} must be in the past.",
    "datetime_past": "{label} must be in the past.",
    "timezone_aware": "{label} needs a time zone.",
    "timezone_naive": "{label} can't have a time zone.",
    "json_invalid": "The request isn't valid JSON. Reload the page and try again.",
    "json_type": _SHAPE,
    "dict_type": _SHAPE,
    "model_type": _SHAPE,
    "model_attributes_type": _SHAPE,
    "dataclass_type": _SHAPE,
    "mapping_type": _SHAPE,
    "list_type": _SHAPE,
    "tuple_type": _SHAPE,
    "set_type": _SHAPE,
    "frozen_set_type": _SHAPE,
    "iterable_type": _SHAPE,
    "none_required": "{label} must be left empty.",
    "extra_forbidden": "{label} isn't something this takes. Leave it out.",
}
_PYDANTIC_TYPES = frozenset(get_args(ErrorType))


def plain_message(error: Mapping[str, Any]) -> str:
    """A validation error in the hub's words: what is wrong with which field, and what to do. Pydantic's own
    wording ("String should have at least 1 character") never reaches people. Errors our validators raise come
    through as written (a ValueError's text, or a PydanticCustomError of our own type); a Pydantic type without a
    message here gets a plain fallback."""
    kind = str(error.get("type", ""))
    label = field_label(error.get("loc", ()))
    ctx = {k: _shown(v) for k, v in (error.get("ctx") or {}).items()}
    msg = str(error.get("msg", ""))
    if kind == "value_error":
        return _value_error(label, ctx, msg)
    say = _MESSAGES.get(kind)
    if callable(say):
        return say(label, ctx)
    if say is not None:
        try:
            return say.format_map({**ctx, "label": label})
        except (KeyError, IndexError, ValueError):  # a context without the constraint: say it without
            return _fallback(label)
    if kind not in _PYDANTIC_TYPES and msg:
        return msg
    return _fallback(label)


def validation_error(errors: Sequence[Mapping[str, Any]]) -> ApiError:
    """422 invalid_input with a plain message per field (the first error on a field wins). One field: its message
    is the whole message too, for screens that show only that. An address whose id can't be one (/requests/nope) is
    404 not_found: nothing is there, which the page says in its own words (student test ST-77)."""
    if errors and all(
        str(e.get("type", "")).startswith("uuid_") and tuple(e.get("loc", ()))[:1] == ("path",) for e in errors
    ):
        return not_found("We couldn't find that. Check the link.")
    fields: dict[str, str] = {}
    for e in errors:
        fields.setdefault(field_name(e.get("loc", ())), plain_message(e))
    messages = list(fields.values())
    if len(messages) == 1:
        message = messages[0]
    elif messages:
        message = f"Some fields need a look. {messages[0]}"
    else:
        message = "Something in the request isn't valid. Reload the page and try again."
    return ApiError(422, "invalid_input", message, fields=fields or None)


_STATUS_CODES: dict[int, ErrorCode] = {
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
        err = validation_error(exc.errors())
        return JSONResponse(_body(err.code, err.message, fields=err.fields), status_code=err.status)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = _STATUS_CODES.get(exc.status_code, "error")
        return JSONResponse(_body(code, str(exc.detail)), status_code=exc.status_code)

    @app.exception_handler(DataError)
    async def _data(request: Request, exc: DataError) -> JSONResponse:
        # A value the database can't store (a NUL byte in text, a number out of range) that got past validation.
        # Logged without the SQL and its parameters, which may hold personal data.
        log.warning(
            "the database refused a value on %s %s (%s)",
            request.method,
            redact_path(request.url.path),
            type(exc.orig).__name__,
        )
        return JSONResponse(_body("invalid_input", "Some fields are not valid."), status_code=422)

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        log.exception("unhandled error on %s %s", request.method, redact_path(request.url.path), exc_info=exc)
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
