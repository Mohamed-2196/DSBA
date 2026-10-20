from __future__ import annotations

import re
from typing import Generic, Literal, TypeVar
from uuid import UUID

from pydantic import AfterValidator, BaseModel, ConfigDict
from pydantic.alias_generators import to_camel
from pydantic_core import PydanticCustomError

T = TypeVar("T")

Year = Literal[1, 2, 3]
UserStatus = Literal["active", "suspended"]
PostStatus = Literal["visible", "hidden", "deleted"]


class ApiModel(BaseModel):
    """Base for every API model: camelCase on the wire, snake_case in Python, built from ORM objects."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


_PLACEHOLDER = re.compile(r"\{([^{}]*)\}")


def placeholders(allowed: tuple[str, ...]) -> AfterValidator:
    """Copy whose {curly brackets} hold only these names ('{module}'), which the hub fills in when it shows it."""

    def check(value: str) -> str:
        for name in _PLACEHOLDER.findall(value):
            if name not in allowed:
                shown = " and ".join(f"{{{a}}}" for a in allowed)
                raise PydanticCustomError("placeholder", "Use only {shown} between curly brackets.", {"shown": shown})
        return value

    return AfterValidator(check)


class Page(ApiModel, Generic[T]):
    items: list[T]
    total: int
    limit: int
    offset: int


# Every error code the API answers with: the web app branches on them, and a typo in
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
    "error",  # any other status
    # accounts and sign-in
    "invalid_email",  # 422: not an email address
    "weak_password",  # 422: too short, too common, or the email address itself
    "invalid_credentials",  # 422: this email and password don't match (the same for an unknown address)
    "wrong_password",  # 422: the current password is wrong (signed in: changing it, confirming it's you)
    "email_taken",  # 409: an account already uses this email address
    "reset_link_invalid",  # 410: the reset link expired, was used, or never existed
    "account_not_confirmed",  # 409: staff roles need an email address Google confirmed
    "invalid_display_name",  # 422
    "step_up_required",  # 403: confirm it's you first (POST /me/step-up, or Google again)
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
    "number_taken",  # 409: a published issue already has this number (fields.number says the next free one)
    "empty_issue",  # 409: an issue with no stories can't be published
    "not_published",  # 409: reactions and votes wait for the issue to be published
    "already_voted",  # 409: one vote per poll
    "poll_closed",  # 409: the poll takes no more votes
    "poll_has_votes",  # 409: a poll's answers can't change once it has votes
    "unsupported_type",  # 422: a file type the library or the forum doesn't take
    "too_large",  # 422 (an upload), 413 (a request body refused unread: core/limits.py)
    "not_uploaded",  # 409: the file never reached the bucket
    "mismatch",  # 422: the file isn't what its name says
    "no_preview",  # 404/409: this file has no preview
    "file_gone",  # 409: the file was deleted after it was rejected
    "too_many_pending",  # 409: ten files already wait for review
    "not_a_paper",  # 409: only a module's published past papers take question tags
    "already_tagged",  # 409: this question already has this chapter
    # access: roles and feature switches
    "feature_off",  # 404: the feature is switched off for this person (admins see every feature)
    "last_admin",  # 409: the hub needs at least one active admin
    "role_locked",  # 409: the Admin role can't change, and a built-in role can't be deleted
    "role_changed",  # 409: another admin changed the role since it was loaded: load it again
    "role_in_use",  # 409: a feature switch is on for this role: change the switch before deleting the role
    # modules and lessons
    "module_changed",  # 409: another editor saved the module since it was loaded: load it again
    "content_in_use",  # 409: notes, cards, files or threads refer to it: hide it instead
    # documents edited whole in Manage: Career Navigator, Site settings, the guides, the forum, Mini Noora, summary
    "career_changed",  # 409: someone saved Career Navigator since it was loaded: load it again
    "site_changed",  # 409: someone saved the site settings since they were loaded: load them again
    "guides_changed",  # 409: someone saved the guides since they were loaded: load them again
    "forum_changed",  # 409: someone saved the forum's settings since they were loaded: load them again
    "noora_changed",  # 409: someone saved Mini Noora's words since they were loaded: load them again
    "summary_changed",  # 409: someone saved the Sunday summary's words since they were loaded: load them again
    "newsletter_settings_changed",  # 409: someone saved the newsletter's settings since they were loaded
    "grades_changed",  # 409: someone saved the grades calculator's rules since they were loaded
    # suggested videos
    "already_a_lesson",  # 409: the module already has this video as a lesson
    "already_suggested",  # 409: this video (or a time stamp at this time) already waits for review, or is there
    "suggestion_closed",  # 409: the suggestion was already accepted or declined
    "too_many_topics",  # 409: the most time stamps one video may show
    # the notebook
    "note_changed",  # 409: the note was saved elsewhere (another tab) since this version: load it, or save over it
    "ink_changed",  # 409: the sheet's ink was saved elsewhere since this version: load it, or save over it
    "too_many_notes",  # 409: the most notes one student may keep
    "too_many_notebooks",  # 409: the most notebooks one student may keep
    "notes_full",  # 409: the student's notebooks hold as much text, ink and files as they may
    # boards
    "board_full",  # 409: the student's boards hold as many cards, or as much text, as they may
    "boards_full",  # 409: the student has as many boards as they may
    "storage_full",  # 409: the files on the student's cards take as much room as they may
    "limit_reached",  # 409: a board's columns, a card's files or comments, or the labels are at their limit
    "already_on_board",  # 409: this event, lesson, module or file already has a card on that board
    # your own calendar
    "calendar_full",  # 409: the most events of their own a student may keep
    # Mini Noora's AI answers
    "noora_unavailable",  # 503: no AI right now (not set up, or Claude failed): she answers from her script
    "noora_budget_reached",  # 503: the hub's monthly AI budget is spent: she answers from her script
    "noora_busy",  # 503: too many answers are streaming hub-wide right now: she answers from her script
    "noora_daily_limit",  # 429: the student's questions for today are used up (retryAfter: Bahrain midnight)
    # Daily puzzles
    "unknown_word",  # 422: a guess the game doesn't know as a word
    "already_tried",  # 409: the same guess (word, group or line) again
    "game_over",  # 409: the play is finished: no more moves
    "already_played",  # 409: a guest's play can't be kept: the account has already opened that puzzle
    "puzzle_fixed",  # 409: an editor fixed today's puzzle since the play was loaded: load it again (it starts over)
    "not_out_yet",  # 404: a day whose puzzles aren't out yet, before the first one, or a game its theme can't make
    "puzzle_changed",  # 409: another editor saved this puzzle content since it was loaded: load it again
    "theme_not_ready",  # 409: the change would leave a theme that runs without enough puzzles for a game
    "tagging_running",  # 409: Claude is tagging the paper now; run it again once it's done
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
