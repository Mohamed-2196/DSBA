"""All models, imported here so that Alembic and the app see the whole schema."""

from app.models.access import AccessRole, FeatureSwitch, FeatureSwitchRole, RoleBox, RoleGrant
from app.models.activity import AuditEntry, LessonResume, LessonView, Notification, Report, ReportStatus
from app.models.base import Base
from app.models.board import BoardCard, BoardPlan
from app.models.content import CalendarEvent, Chapter, ContentDoc, Lesson, Module
from app.models.forum import ForumReply, ForumThread, PostStatus, ReplyVote, ThreadVote
from app.models.library import (
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
from app.models.newsletter import IssueStatus, NewsletterIssue, NewsletterReaction
from app.models.noora import NooraLimits, NooraUsage
from app.models.notes import Note
from app.models.outbox import EmailOutbox, OutboxStatus, WeeklySummarySent
from app.models.requests import RequestMeToo, RequestStatus, StudentRequest
from app.models.user import Channel, OtpChallenge, OtpPurpose, User, UserSession, UserStatus

__all__ = [
    "AccessRole",
    "AuditEntry",
    "Base",
    "BoardCard",
    "BoardPlan",
    "CalendarEvent",
    "Channel",
    "Chapter",
    "ContentDoc",
    "EmailOutbox",
    "FeatureSwitch",
    "FeatureSwitchRole",
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
    "Notification",
    "OtpChallenge",
    "OtpPurpose",
    "OutboxStatus",
    "PaperQuestion",
    "PaperQuestionFlag",
    "PostStatus",
    "ReplyVote",
    "Report",
    "ReportStatus",
    "RequestMeToo",
    "RequestStatus",
    "RoleBox",
    "RoleGrant",
    "StudentRequest",
    "TextStatus",
    "ThreadVote",
    "Upload",
    "UploadPurpose",
    "UploadStatus",
    "User",
    "UserSession",
    "UserStatus",
    "WeeklySummarySent",
]
