from __future__ import annotations

from typing import Generic, Literal, TypeVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

T = TypeVar("T")

Year = Literal[1, 2, 3]
Role = Literal["student", "moderator", "admin"]
UserStatus = Literal["active", "suspended"]
PostStatus = Literal["visible", "hidden", "deleted"]


class ApiModel(BaseModel):
    """Base for every API model: camelCase on the wire, snake_case in Python, built from ORM objects."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


class Page(ApiModel, Generic[T]):
    items: list[T]
    total: int
    limit: int
    offset: int


# Every error code the API answers with (code quality review CQ-10): the web app branches on them, and a typo in
# either one is a type error. One code per condition. Messages are for people; codes are for code.
ErrorCode = Literal[
    # any endpoint
    "invalid_input",  # 422: fields says which (a body, query or path value that doesn't fit)
    "bad_request",  # 400: a request no browser sends (control characters in the URL, a broken body)
    "unauthenticated",  # 401: sign in first
    "forbidden",  # 403: not for this account (a role, a suspended account, a profile to finish)
    "not_found",  # 404: missing, or not for this viewer (hidden, pending, someone else's)
    "method_not_allowed",  # 405
    "csrf_failed",  # 403: the CSRF header doesn't match the cookie; the web app retries once
    "rate_limited",  # 429: retryAfter says when
    "retry",  # 409: two writes collided (a slug or an id taken at the same moment): try again
    "internal",  # 500
    "not_implemented",  # 501
    "error",  # any other status
    # accounts and sign-in
    "invalid_identifier",  # 422: not an email address or a phone number
    "sms_unavailable",  # 422: a number we don't text; 429: texts paused
    "delivery_failed",  # 503: the code could not be sent
    "invalid_code",  # 422: wrong code (tries left in the message)
    "code_expired",  # 410: expired, used, retired or unknown
    "too_many_attempts",  # 429: five wrong tries for this code
    "invalid_display_name",  # 422
    "identifier_taken",  # 409: another account uses this address
    "identifier_unchanged",  # 409: already this account's
    "last_identifier",  # 409: an account keeps at least one way to sign in
    "step_up_required",  # 403: confirm it's you first (POST /me/step-up)
    "cannot_change_self",  # 409: an admin changing their own account
    "storage_unavailable",  # 503: files could not be deleted; nothing changed
    # forum and reports
    "thread_locked",  # 409: a student rep locked the thread
    "post_unavailable",  # 409: the post (or file) was deleted, hidden or removed
    "already_used",  # 409: a picture already belongs to another post
    "already_reported",  # 409
    "report_closed",  # 409
    # library, uploads, newsletter, calendar
    "slug_taken",  # 409: a rep chose an address another issue has
    "not_published",  # 409: reactions wait for the issue to be published
    "unsupported_type",  # 422: a file type the library or the forum doesn't take
    "too_large",  # 422
    "not_uploaded",  # 409: the file never reached the bucket
    "mismatch",  # 422: the file isn't what its name says
    "no_preview",  # 404/409: this file has no preview
    "file_gone",  # 409: the file was deleted after it was rejected
    "too_many_pending",  # 409: ten files already wait for review
]


class ErrorDetail(ApiModel):
    code: ErrorCode
    message: str
    fields: dict[str, str] | None = None
    retry_after: int | None = None


class ErrorResponse(ApiModel):
    error: ErrorDetail


class UserPublic(ApiModel):
    """How a person appears next to their posts and uploads."""

    id: UUID
    display_name: str
    year: Year | None
    role: Role


class Ok(ApiModel):
    ok: bool = True
