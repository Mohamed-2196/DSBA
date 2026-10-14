from __future__ import annotations

from typing import Generic, Literal, TypeVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

T = TypeVar("T")

Year = Literal[1, 2, 3]
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
    "progress_off",  # 409: lesson progress is kept only once the person turns it on
    # forum and reports
    "thread_locked",  # 409: a student rep locked the thread
    "post_unavailable",  # 409: the post (or file) was deleted, hidden or removed
    "already_used",  # 409: a picture already belongs to another post
    "already_reported",  # 409
    "report_closed",  # 409
    # requests
    "own_request",  # 409: "me too" on your own request
    "request_closed",  # 409: a done or declined request takes no more me-toos
    "already_asked",  # 409: the same paper asked for again, or a date someone already asked about
    "nothing_found",  # 409: no file was found for the request to confirm
    # library, uploads, newsletter, calendar
    "slug_taken",  # 409: a rep chose an address another issue has
    "not_published",  # 409: reactions and votes wait for the issue to be published
    "already_voted",  # 409: one vote per poll
    "poll_closed",  # 409: the poll takes no more votes
    "poll_has_votes",  # 409: a poll's answers can't change once it has votes
    "unsupported_type",  # 422: a file type the library or the forum doesn't take
    "too_large",  # 422
    "not_uploaded",  # 409: the file never reached the bucket
    "mismatch",  # 422: the file isn't what its name says
    "no_preview",  # 404/409: this file has no preview
    "file_gone",  # 409: the file was deleted after it was rejected
    "too_many_pending",  # 409: ten files already wait for review
    "not_a_paper",  # 409: only a module's published past papers take question tags
    "already_tagged",  # 409: this question already has this chapter
    # access: roles and feature switches (R-1, R-10)
    "feature_off",  # 404: the feature is switched off for this person (admins see every feature)
    "last_admin",  # 409: the hub needs at least one active admin
    "role_locked",  # 409: the Admin role can't change, and a built-in role can't be deleted
    "role_changed",  # 409: another admin changed the role since it was loaded: load it again
    "role_in_use",  # 409: a feature switch is on for this role: change the switch before deleting the role
    # modules and lessons (R-9)
    "module_changed",  # 409: another editor saved the module since it was loaded: load it again
    "content_in_use",  # 409: notes, cards, files or threads refer to it: hide it instead
    # suggested videos (IDEA-15)
    "already_a_lesson",  # 409: the module already has this video as a lesson
    "already_suggested",  # 409: this video already waits for review for the module
    "suggestion_closed",  # 409: the suggestion was already accepted or declined
    # notes (R-5)
    "note_changed",  # 409: the note was saved elsewhere (another tab) since this version: load it, or save over it
    "too_many_notes",  # 409: the most notes one student may keep
    "notes_full",  # 409: the student's notes hold as much text as they may
    # the study board (R-4)
    "board_full",  # 409: the board holds as many cards as it may
    "already_on_board",  # 409: this event, lesson, module or file already has a card
    # Mini Noora's AI answers (R-6)
    "noora_unavailable",  # 503: no AI right now (not set up, or Claude failed): she answers from her script
    "noora_budget_reached",  # 503: the hub's monthly AI budget is spent: she answers from her script
    "noora_busy",  # 503: too many answers are streaming hub-wide right now: she answers from her script
    "noora_daily_limit",  # 429: the student's questions for today are used up (retryAfter: Bahrain midnight)
    # Daily puzzles
    "unknown_word",  # 422: a guess the game doesn't know as a word
    "already_tried",  # 409: the same guess (word, group or line) again
    "game_over",  # 409: the play is finished: no more moves
    "not_out_yet",  # 404: a day whose puzzles aren't out yet, or before the first one
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
    badge: str | None  # their roles' badge ("Student rep", "Admin"...), or None


class Ok(ApiModel):
    ok: bool = True
