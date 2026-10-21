from __future__ import annotations

from datetime import date, datetime, time
from typing import Annotated, Any, Literal, get_args
from uuid import UUID

from pydantic import Field, StringConstraints, WithJsonSchema

from app.schemas.access import BoxKey, FeatureKey, RoleSummary
from app.schemas.board import BoardLinkType, ChecklistItem, PaperScore, Priority
from app.schemas.bugs import ExportBugReport
from app.schemas.calendar import EventType, PersonalEventOut
from app.schemas.common import ApiModel, PostStatus, UserStatus, Year
from app.schemas.forum import FollowLevel
from app.schemas.library import ItemStatus, LibraryKind, QuestionMark, Zone
from app.schemas.moderation import ReportReason, ReportTarget
from app.schemas.modules import Progress
from app.schemas.notifications import NotificationKind
from app.schemas.requests import RequestKind, RequestStatus
from app.schemas.seniors import SeniorTopic
from app.schemas.suggestions import SuggestionStatus

Email = Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=254)]
PASSWORD_MIN, PASSWORD_MAX = 8, 256
# A password as sent. Its rules (PASSWORD_MIN characters or more, not one of the most common passwords, not the email
# address) are checked by services/passwords.py, so a weak one answers 422 weak_password with a sentence saying why.
Password = Annotated[str, StringConstraints(min_length=1, max_length=PASSWORD_MAX)]
# 2-40 characters after trimming: letters (any script), digits, spaces and . ' -. The documented schema says so;
# the rule itself is applied by PATCH /me, so that every bad name answers 422 invalid_display_name.
DisplayName = Annotated[str, WithJsonSchema({"type": "string", "maxLength": 40, "minLength": 2})]
# A paper someone sits: a module id ('econometrics'), or a choice the Hub has no module for ('abstract-maths').
PaperId = Annotated[str, StringConstraints(pattern=r"^[a-z0-9][a-z0-9-]{0,63}$")]
MAX_PAPERS = 20


class SignUpRequest(ApiModel):
    """A new account with an email address and a password. The address isn't checked by email: it counts as confirmed
    only once its owner signs in with Google."""

    email: Email
    password: Password


class SignInRequest(ApiModel):
    email: Email
    password: Password


class PasswordChange(ApiModel):
    """A new password from Your account. `currentPassword` is needed when the account has one; an account without one
    (it signs in with Google) adds one within ten minutes of signing in, or after confirming it's you."""

    current_password: Password | None = None
    new_password: Password


class StepUpRequest(ApiModel):
    """Confirm it's you with the account's password (an account with Google only signs in with Google again)."""

    password: Password


class PasswordResetRequest(ApiModel):
    """A new password through a reset link an admin made (the token is the part after #token= in the link)."""

    token: Annotated[str, StringConstraints(min_length=20, max_length=100)]
    new_password: Password


class ResetLinkOut(ApiModel):
    """A one-time link to set a new password, for the admin to pass on. It works once, until `expiresAt`."""

    url: str
    expires_at: datetime


# Where "Continue with Google" ends when it doesn't sign in: the app's page comes back with ?authError=<one of these>.
GoogleError = Literal[
    "google_off",  # not set up on this hub
    "google_cancelled",  # the person stopped at Google
    "google_failed",  # the link expired or was used, another browser started it, or Google's answer didn't check out
    "google_unverified",  # Google hasn't verified this Google account's email address
    "google_taken",  # linking: this Google account already signs in to another account
    "email_taken",  # another account has this Google account's address (linking), or another Google account does
]


class GoogleStart(ApiModel):
    """Where to come back to afterwards: a path in the app ('/forum'); anything else goes back to '/'."""

    return_to: Annotated[str, StringConstraints(max_length=512)] | None = None


class GoogleRedirect(ApiModel):
    """Send the browser here (Google's sign-in page). It comes back to `returnTo`, with ?authError=<GoogleError> when
    it didn't work."""

    url: str


# Home's blocks, in the order a student first sees them. Each one renders only when it has something to show.
HomeBlock = Literal[
    "results_day",  # Results day: two weeks from each results date
    "coming_up",  # the next exam and this week's dates
    "carry_on",  # pick up where you left off: the papers, notes and lessons last opened in this browser, the timer
    "todo",  # the cards due soon on the student's boards
    "continue",  # the lessons to pick up (lesson progress on)
    "modules",  # my modules
    "files",  # new files in my modules
    "forum",  # active threads in my modules
    "noora",  # the Ask Noora prompt
    "daily_question",  # a past exam question before the next exam
    "help_below",  # unanswered questions from the years below (Years 2 and 3)
    "newsletter",  # the latest issue of The DSBA Newsletter
    "daily",  # Today's Daily puzzles
]
MAX_HOME_BLOCKS = len(get_args(HomeBlock))


class Preferences(ApiModel):
    """Which notifications also come by email (to the account's email address; account security notices always do),
    whether the Sunday summary does, whether lesson progress is kept, and Home's blocks. Nothing is emailed until the
    person answers the question about emails when they sign up (`notificationEmails`); then each notification email
    they never switched follows that answer, and the Sunday summary is off until they turn it on."""

    notification_emails: bool | None  # their answer to "Email me about replies, …" at sign-up; None: not yet
    email_replies: bool  # someone replied to your thread or to your reply
    email_answer_accepted: bool  # your reply was accepted as the answer
    email_upload_reviews: bool  # a student rep published or rejected your upload
    email_new_issues: bool  # a new issue of The DSBA Newsletter is out
    email_date_changes: bool  # an exam, mock or deadline of your year moved, or was confirmed
    email_weekly_summary: bool  # the Sunday summary: opt in
    track_progress: bool = False  # keep the lessons watched and the lesson to resume: opt in
    # Home's blocks that show, in order; a block left out is hidden. null: the default layout.
    home_blocks: list[HomeBlock] | None = None


class PreferencesUpdate(ApiModel):
    """Only the fields sent change. A switch sent as null stays as it is; `homeBlocks: null` goes back to the default
    layout. The answer about emails is asked when the profile is first saved (MeUpdate); a later one changes every
    notification email not switched on its own. Turning an email on before there is an answer answers "no" for the
    others."""

    notification_emails: bool | None = None
    email_replies: bool | None = None
    email_answer_accepted: bool | None = None
    email_upload_reviews: bool | None = None
    email_new_issues: bool | None = None
    email_date_changes: bool | None = None
    email_weekly_summary: bool | None = None
    track_progress: bool | None = None
    home_blocks: Annotated[list[HomeBlock], Field(max_length=MAX_HOME_BLOCKS)] | None = None


class Me(ApiModel):
    id: UUID
    display_name: str | None
    year: Year | None
    roles: list[RoleSummary]  # in role order: Admin, Rep, then the others
    boxes: list[BoxKey]  # what the person may do now: none while the account is suspended
    features: list[FeatureKey]  # the features on for this person (admins: every feature)
    status: UserStatus
    email: str
    email_confirmed: bool  # Google vouched for the address (only then may the account hold a staff role)
    has_password: bool
    google_linked: bool  # signs in with Google too
    needs_profile: bool  # True until a display name is set: the web app asks for it right after sign-in
    created_at: datetime
    preferences: Preferences
    # The papers this person sits: their option, electives and papers from other years. Empty: every
    # module of their year.
    papers: list[str]
    zone: Zone | None  # the zone whose papers they sit; None: not chosen
    # The modules this person is resitting ("I'm resitting this" on a module's page): their resits count down for
    # them whatever their year.
    resits: list[str]


class SignInResult(ApiModel):
    user: Me
    is_new_user: bool


class SessionState(ApiModel):
    """GET /auth/session: the signed-in user, or null for a guest. Never 401."""

    me: Me | None
    google_sign_in: bool  # "Continue with Google" is set up on this hub


class MeUpdate(ApiModel):
    """Fields that are not sent stay as they are; `year: null` clears the cohort. The first display name (the
    profile step after signing up) comes with the answer about emails, `preferences.notificationEmails`, unless the
    account has one."""

    display_name: DisplayName | None = None
    year: Year | None = None
    preferences: PreferencesUpdate | None = None
    # The whole list (the order is kept, repeats are dropped); [] clears it. A new `year` clears it when no papers
    # are sent with it.
    papers: Annotated[list[PaperId], Field(max_length=MAX_PAPERS)] | None = None
    zone: Zone | None = None  # null clears it
    # The whole list (repeats are dropped); [] clears it. A new `year` keeps it: a resit follows the student.
    resits: Annotated[list[PaperId], Field(max_length=MAX_PAPERS)] | None = None


class StepUpResult(ApiModel):
    """The browser's session was renewed: adding a password and deleting the account work without confirming again for
    `expires_in` seconds."""

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
    category: str
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
    zone: Zone | None
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


class ExportBoardFile(ApiModel):
    file_name: str
    content_type: str
    size_bytes: int
    created_at: datetime


class ExportBoardComment(ApiModel):
    body: str
    created_at: datetime


class ExportBoardCard(ApiModel):
    id: UUID
    column: str  # the column's name
    title: str
    description: str | None
    due_date: date | None
    due_time: time | None
    remind_before: int | None  # minutes
    priority: Priority
    labels: list[str]
    checklist: list[ChecklistItem]
    link_type: BoardLinkType | None
    link_id: str | None
    plan_module_id: str | None  # the module whose revision plan added it
    files: list[ExportBoardFile]
    comments: list[ExportBoardComment]
    created_at: datetime
    done_at: datetime | None


class ExportBoardColumn(ApiModel):
    name: str
    done: bool


class ExportBoard(ApiModel):
    id: UUID
    name: str
    emoji: str | None
    color: str
    template: str
    archived_at: datetime | None
    created_at: datetime
    columns: list[ExportBoardColumn]
    cards: list[ExportBoardCard]


class ExportBoardPlan(ApiModel):
    module_id: str
    board_id: UUID
    exam_date: date
    paper_every: int
    created_at: datetime


class ExportInk(ApiModel):
    sheet: int
    strokes: list[dict[str, Any]]  # schemas/notes.py Stroke


class ExportNote(ApiModel):
    id: UUID
    title: str
    text: str
    doc: dict[str, Any]  # the typed text as the editor keeps it
    paper: str
    sheets: int
    lesson_id: str | None
    library_item_id: UUID | None
    files: list[str]  # the names of its pictures and files
    ink: list[ExportInk]
    version: int
    created_at: datetime
    updated_at: datetime


class ExportCalendarSettings(ApiModel):
    """What this person keeps off their calendar, and whether their private feed is on (its address is a secret,
    left out)."""

    hidden_events: list[str]
    hidden_modules: list[str]
    hidden_types: list[EventType]
    private_feed: bool


class ExportNotebook(ApiModel):
    id: UUID
    title: str
    module_id: str | None
    created_at: datetime
    notes: list[ExportNote]


class ExportNooraDay(ApiModel):
    """Mini Noora's AI questions on one day: only counts (no question or answer is stored)."""

    day: date
    questions: int
    input_tokens: int
    output_tokens: int


class ExportNotebookUploadDay(ApiModel):
    """The notebook's uploads on one day: only counts (the files are in `notebooks`)."""

    day: date
    uploads: int
    size_bytes: int
    capped: int  # refused at the hourly limit


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
    zone: Zone | None
    event_id: str | None
    status: RequestStatus
    reply: str | None
    found_item_id: UUID | None  # the file the hub offered for this request
    found_at: datetime | None
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


class ExportTopic(ApiModel):
    """A time stamp you suggested for a lesson's video."""

    id: UUID
    lesson_id: str
    seconds: int
    label: str
    status: SuggestionStatus
    reply: str | None
    created_at: datetime


class ExportSharedNote(ApiModel):
    """A copy of one of your notes shared with its module: what its students read (your note is in `notebooks`)."""

    id: UUID
    note_id: UUID
    module_id: str
    credited: bool
    title: str
    text: str
    doc: dict[str, Any]
    hidden: bool
    shared_at: datetime
    updated_at: datetime


class ExportQuestionTag(ApiModel):
    """A past paper's question you tagged with a chapter."""

    id: UUID
    item_id: UUID
    chapter_id: str
    section: str | None
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
    """An email the Hub sent you, or will send (notifications and account notices)."""

    kind: NotificationKind | Literal["account_notice"]
    to_address: str
    subject: str
    status: Literal["pending", "sent", "failed", "cancelled"]
    created_at: datetime
    sent_at: datetime | None


class ExportDailyPlay(ApiModel):
    day: date
    game: str
    variant: str
    status: str
    scored: bool
    points: int
    moves: list[Any]
    mistakes: int
    hints: int
    started_at: datetime
    finished_at: datetime | None
    kept_at: datetime | None  # a guest's play kept on sign-in
    kept_ip: str | None  # the address it was kept from, for a day (the sweep forgets it)


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
    bug_reports: list[ExportBugReport]  # bug reports this person sent
    requests: list[ExportRequest]  # requests this person made
    me_toos: list[UUID]  # requests this person said "me too" to
    question_tags: list[ExportQuestionTag]  # past papers' questions this person tagged with a chapter
    question_flags: list[UUID]  # tags this person said were wrong
    question_marks: list[QuestionMark]  # past questions this person marked done, stuck or skipped while practising
    emails: list[ExportEmail]
    boards: list[ExportBoard]  # boards, their columns and cards
    board_labels: list[str]
    board_plans: list[ExportBoardPlan]  # revision plans on the boards
    paper_scores: list[PaperScore]  # practice scores on past papers
    follows: list[ExportFollow]  # forum threads this person follows
    poll_votes: list[ExportPollVote]  # newsletter poll answers
    senior: ExportSenior | None  # the "Ask a senior" listing
    notebooks: list[ExportNotebook]  # private notebooks and their notes
    noora_usage: list[ExportNooraDay]  # Mini Noora's AI questions per day
    notebook_uploads: list[ExportNotebookUploadDay]  # notebook uploads per day
    video_suggestions: list[ExportSuggestion]  # videos this person suggested for lessons
    lesson_topics: list[ExportTopic]  # time stamps this person suggested for lessons' videos
    shared_notes: list[ExportSharedNote]  # copies of their notes shared with a module
    calendar_events: list[PersonalEventOut]  # events on their own calendar
    calendar_settings: ExportCalendarSettings | None  # the programme dates they hide, and their private feed
    daily_plays: list[ExportDailyPlay]  # daily puzzles played, with their moves
    daily_show_on_board: bool  # the name shows on Daily's leaderboard
    weekly_summaries: list[date]  # the weeks (their Sunday) a Sunday summary was queued for
