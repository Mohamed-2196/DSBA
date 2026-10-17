"""All models, imported here so that Alembic and the app see the whole schema."""

from app.models.access import AccessRole, FeatureSwitch, FeatureSwitchRole, RoleBox, RoleGrant
from app.models.activity import AuditEntry, LessonResume, LessonView, Notification, Report, ReportStatus
from app.models.base import Base
from app.models.board import Board, BoardCard, BoardCardLabel, BoardColumn, BoardComment, BoardLabel, BoardPlan
from app.models.bugs import BugReport, BugStatus
from app.models.content import (
    CalendarEvent,
    Chapter,
    ContentDoc,
    Lesson,
    Module,
    SuggestionStatus,
    VideoSuggestion,
)
from app.models.daily import DailyPlay, DailyProfile
from app.models.daily_content import (
    DailyGuessWord,
    DailyItem,
    DailyNearestWord,
    DailySet,
    DailySetItem,
    DailyTheme,
    DailyThemeWeek,
)
from app.models.forum import FollowLevel, ForumReply, ForumThread, PostStatus, ReplyVote, ThreadFollow, ThreadVote
from app.models.library import (
    DriveFolder,
    ItemSource,
    ItemStatus,
    LibraryItem,
    LibraryStar,
    LibraryText,
    PaperQuestion,
    PaperQuestionFlag,
    TextStatus,
    Upload,
    UploadPurpose,
    UploadStatus,
)
from app.models.my_calendar import CalendarPrefs, PersonalEvent
from app.models.newsletter import IssueStatus, NewsletterIssue, NewsletterReaction, PollVote
from app.models.noora import NooraLimits, NooraUsage
from app.models.notes import Note, Notebook, NoteInk
from app.models.outbox import EmailOutbox, OutboxStatus, WeeklySummarySent
from app.models.requests import RequestMeToo, RequestStatus, StudentRequest
from app.models.seniors import SeniorProfile
from app.models.user import Channel, OtpChallenge, OtpPurpose, User, UserSession, UserStatus

__all__ = [
    "AccessRole",
    "AuditEntry",
    "Base",
    "Board",
    "BoardCard",
    "BoardCardLabel",
    "BoardColumn",
    "BoardComment",
    "BoardLabel",
    "BoardPlan",
    "BugReport",
    "BugStatus",
    "CalendarEvent",
    "CalendarPrefs",
    "Channel",
    "Chapter",
    "ContentDoc",
    "DailyGuessWord",
    "DailyItem",
    "DailyNearestWord",
    "DailyPlay",
    "DailyProfile",
    "DailySet",
    "DailySetItem",
    "DailyTheme",
    "DailyThemeWeek",
    "DriveFolder",
    "EmailOutbox",
    "FeatureSwitch",
    "FeatureSwitchRole",
    "FollowLevel",
    "ForumReply",
    "ForumThread",
    "IssueStatus",
    "ItemSource",
    "ItemStatus",
    "Lesson",
    "LessonResume",
    "LessonView",
    "LibraryItem",
    "LibraryStar",
    "LibraryText",
    "Module",
    "NewsletterIssue",
    "NewsletterReaction",
    "NooraLimits",
    "NooraUsage",
    "Note",
    "NoteInk",
    "Notebook",
    "Notification",
    "OtpChallenge",
    "OtpPurpose",
    "OutboxStatus",
    "PaperQuestion",
    "PaperQuestionFlag",
    "PersonalEvent",
    "PollVote",
    "PostStatus",
    "ReplyVote",
    "Report",
    "ReportStatus",
    "RequestMeToo",
    "RequestStatus",
    "RoleBox",
    "RoleGrant",
    "SeniorProfile",
    "StudentRequest",
    "SuggestionStatus",
    "TextStatus",
    "ThreadFollow",
    "ThreadVote",
    "Upload",
    "UploadPurpose",
    "UploadStatus",
    "User",
    "UserSession",
    "UserStatus",
    "VideoSuggestion",
    "WeeklySummarySent",
]
