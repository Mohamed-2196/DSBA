from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field, StringConstraints, WithJsonSchema

from app.schemas.access import BoxKey, FeatureKey, RoleSummary
from app.schemas.board import BoardColumn, BoardLinkType
from app.schemas.common import ApiModel, PostStatus, UserStatus, Year
from app.schemas.forum import Category, FollowLevel
from app.schemas.library import ItemStatus, LibraryKind, Zone
from app.schemas.moderation import ReportReason, ReportTarget
from app.schemas.modules import Progress
from app.schemas.notifications import NotificationKind
from app.schemas.requests import RequestKind, RequestStatus
from app.schemas.seniors import SeniorTopic
from app.schemas.suggestions import SuggestionStatus

Identifier = Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=254)]
# A 6-digit code, or the long one sent instead once wrong codes were tried for an address: 10 letters and digits,
# written 'ABCDE-FGH23' (any case; the dash, or a space, may be left out).
Code = Annotated[
    str, StringConstraints(strip_whitespace=True, pattern=r"^(?:\d{6}|[A-Za-z0-9]{5}[- ]?[A-Za-z0-9]{5})$")
]
# 2-40 characters after trimming: letters (any script), digits, spaces and . ' -. The documented schema says so;
# the rule itself is applied by PATCH /me, so that every bad name answers 422 invalid_display_name.
DisplayName = Annotated[str, WithJsonSchema({"type": "string", "maxLength": 40, "minLength": 2})]
# A paper someone sits: a module id ('econometrics'), or a choice the Hub has no module for ('abstract-maths').
PaperId = Annotated[str, StringConstraints(pattern=r"^[a-z0-9][a-z0-9-]{0,63}$")]
MAX_PAPERS = 20


class OtpStartRequest(ApiModel):
    """An email address or a phone number (local Bahraini numbers need no country code)."""

    identifier: Identifier


class OtpChallengeOut(ApiModel):
    challenge_id: UUID
    channel: Literal["email", "sms"]
    destination_hint: str  # 'm•••@gmail.com' / '+973 •••• ••12'
    expires_in: int  # seconds
    resend_after: int  # seconds until another code can be requested for this address
    # 'digits': 6 digits. 'long': 10 letters and digits ('ABCDE-FGH23'), sent instead after wrong codes were tried
    # for this address (nobody can guess it); typed in any case, with or without the dash.
    code_format: Literal["digits", "long"] = "digits"


class OtpVerifyRequest(ApiModel):
    challenge_id: UUID
    code: Code


class Preferences(ApiModel):
    """Which notifications also come by email, to the account's email address, and whether the Sunday summary does.
    In the Hub every notification shows whatever these say, and account security notices are always emailed. Unset
    means the default here."""

    email_replies: bool = True  # someone replied to your thread or to your reply
    email_answer_accepted: bool = True  # your reply was accepted as the answer
    email_upload_reviews: bool = True  # a student rep published or rejected your upload
    email_new_issues: bool = True  # a new issue of The DSBA Newsletter is out
    email_date_changes: bool = True  # an exam, mock or deadline of your year moved, or was confirmed
    email_weekly_summary: bool = False  # the Sunday summary: opt in


class PreferencesUpdate(ApiModel):
    """Only the switches sent change."""

    email_replies: bool | None = None
    email_answer_accepted: bool | None = None
    email_upload_reviews: bool | None = None
    email_new_issues: bool | None = None
    email_date_changes: bool | None = None
    email_weekly_summary: bool | None = None


class Me(ApiModel):
    id: UUID
    display_name: str | None
    year: Year | None
    roles: list[RoleSummary]  # in role order: Admin, Rep, then the others
    boxes: list[BoxKey]  # what the person may do now: none while the account is suspended
    features: list[FeatureKey]  # the features on for this person (admins: every feature)
    status: UserStatus
    email: str | None
    phone: str | None
    needs_profile: bool  # True until a display name is set: the web app asks for it right after sign-in
    created_at: datetime
    preferences: Preferences
    # The papers this person sits (IDEA-10): their option, electives and papers from other years. Empty: every
    # module of their year.
    papers: list[str]
    zone: Zone | None  # the zone whose papers they sit; None: not chosen


class SignInResult(ApiModel):
    user: Me
    is_new_user: bool


class SessionState(ApiModel):
    """GET /auth/session: the signed-in user, or null for a guest. Never 401."""

    me: Me | None


class MeUpdate(ApiModel):
    """Fields that are not sent stay as they are; `year: null` clears the cohort."""

    display_name: DisplayName | None = None
    year: Year | None = None
    preferences: PreferencesUpdate | None = None
    # The whole list (the order is kept, repeats are dropped); [] clears it. A new `year` clears it when no papers
    # are sent with it.
    papers: Annotated[list[PaperId], Field(max_length=MAX_PAPERS)] | None = None
    zone: Zone | None = None  # null clears it


class StepUpStart(ApiModel):
    """Which of the account's own identifiers gets the code: by default the email address, else the phone number."""

    via: Literal["email", "phone"] | None = None


class StepUpResult(ApiModel):
    """The browser's session was renewed: changing or removing an identifier and deleting the account work without
    another code for `expires_in` seconds."""

    expires_in: int


class SessionInfo(ApiModel):
    id: UUID
    created_at: datetime
    last_seen_at: datetime | None
    user_agent: str | None
    ip: str | None
    current: bool


# ── the account export ──────────────────────────────────────────────────────────────────────


class ExportThread(ApiModel):
    id: UUID
    slug: str
    title: str
    body: str
    category: Category
    module_id: str | None
    tags: list[str]
    status: PostStatus
    created_at: datetime
    edited_at: datetime | None
    vote_count: int
    reply_count: int
    anonymous: bool


class ExportReply(ApiModel):
    id: UUID
    thread_id: UUID
    thread_slug: str
    parent_id: UUID | None
    body: str
    status: PostStatus
    created_at: datetime
    edited_at: datetime | None
    vote_count: int


class ExportLibraryItem(ApiModel):
    id: UUID
    slug: str
    source: Literal["file", "link"]
    kind: LibraryKind
    title: str
    description: str | None
    module_id: str | None
    year: int | None
    url: str | None
    file_name: str | None
    content_type: str | None
    size_bytes: int | None
    exam_year: int | None
    zone: str | None
    author_name: str | None
    status: ItemStatus
    review_note: str | None
    download_count: int
    created_at: datetime
    published_at: datetime | None


class ExportFollow(ApiModel):
    thread_id: UUID
    thread_slug: str
    level: FollowLevel
    created_at: datetime


class ExportPollVote(ApiModel):
    issue_id: UUID
    issue_slug: str
    poll_id: str
    choice: int  # the answer's position, from 0
    created_at: datetime


class ExportSenior(ApiModel):
    topics: list[SeniorTopic]
    note: str
    paused: bool
    created_at: datetime


class ExportReaction(ApiModel):
    issue_id: UUID
    issue_slug: str
    section_id: str
    reaction: str
    created_at: datetime


class ExportBoardCard(ApiModel):
    id: UUID
    column: BoardColumn
    title: str
    note: str | None
    due_date: date | None
    link_type: BoardLinkType | None
    link_id: str | None
    plan_module_id: str | None  # the module whose revision plan added it
    created_at: datetime
    done_at: datetime | None


class ExportBoardPlan(ApiModel):
    module_id: str
    exam_date: date
    paper_every: int
    created_at: datetime


class ExportNote(ApiModel):
    id: UUID
    title: str
    body: str
    module_id: str | None
    lesson_id: str | None
    version: int
    created_at: datetime
    updated_at: datetime


class ExportNooraDay(ApiModel):
    """Mini Noora's AI questions on one day: only counts (no question or answer is stored)."""

    day: date
    questions: int
    input_tokens: int
    output_tokens: int


class ExportVote(ApiModel):
    type: Literal["thread", "reply"]
    id: UUID
    created_at: datetime


class ExportReport(ApiModel):
    id: UUID
    target_type: ReportTarget
    target_id: UUID
    reason: ReportReason
    note: str | None
    status: Literal["open", "resolved", "dismissed"]
    created_at: datetime


class ExportRequest(ApiModel):
    id: UUID
    kind: RequestKind
    title: str
    details: str
    module_id: str | None
    wanted_kind: LibraryKind | None
    exam_year: int | None
    zone: str | None
    event_id: str | None
    status: RequestStatus
    reply: str | None
    removed: bool
    created_at: datetime


class ExportSuggestion(ApiModel):
    id: UUID
    module_id: str
    chapter_id: str | None
    url: str
    title: str
    reason: str
    status: SuggestionStatus
    reply: str | None
    lesson_id: str | None
    created_at: datetime


class ExportQuestionTag(ApiModel):
    """A past paper's question you tagged with a chapter."""

    id: UUID
    item_id: UUID
    chapter_id: str
    question: int
    page: int | None
    created_at: datetime


class ExportNotification(ApiModel):
    id: UUID
    kind: NotificationKind
    title: str
    body: str | None
    url: str | None
    created_at: datetime
    read_at: datetime | None


class ExportEmail(ApiModel):
    """An email the Hub sent you, or will send (notifications and account notices; sign-in codes are not kept)."""

    kind: NotificationKind | Literal["account_notice"]
    to_address: str
    subject: str
    status: Literal["pending", "sent", "failed", "cancelled"]
    created_at: datetime
    sent_at: datetime | None


class AccountExport(ApiModel):
    """Everything the Hub stores about the signed-in user (GET /me/export)."""

    user: Me
    sessions: list[SessionInfo]
    threads: list[ExportThread]
    replies: list[ExportReply]
    library_items: list[ExportLibraryItem]
    stars: list[UUID]  # library items
    reactions: list[ExportReaction]
    progress: Progress
    notifications: list[ExportNotification]
    votes: list[ExportVote]  # forum upvotes
    reports: list[ExportReport]  # reports this person filed
    requests: list[ExportRequest]  # requests this person made
    me_toos: list[UUID]  # requests this person said "me too" to
    question_tags: list[ExportQuestionTag]  # past papers' questions this person tagged with a chapter
    question_flags: list[UUID]  # tags this person said were wrong
    emails: list[ExportEmail]
    board: list[ExportBoardCard]  # study-board cards
    board_plans: list[ExportBoardPlan]  # revision plans on the study board
    follows: list[ExportFollow]  # forum threads this person follows
    poll_votes: list[ExportPollVote]  # newsletter poll answers
    senior: ExportSenior | None  # the "Ask a senior" listing
    notes: list[ExportNote]  # private notes
    noora_usage: list[ExportNooraDay]  # Mini Noora's AI questions per day
    video_suggestions: list[ExportSuggestion]  # videos this person suggested for lessons
