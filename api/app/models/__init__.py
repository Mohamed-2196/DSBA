"""All models, imported here so that Alembic and the app see the whole schema."""

from app.models.access import AccessRole, FeatureSwitch, FeatureSwitchRole, RoleBox, RoleGrant
from app.models.activity import AuditEntry, LessonResume, LessonView, Notification, Report, ReportStatus
from app.models.base import Base
from app.models.content import CalendarEvent, ContentDoc, Module
from app.models.forum import ForumReply, ForumThread, PostStatus, ReplyVote, ThreadVote
from app.models.library import ItemSource, ItemStatus, LibraryItem, LibraryStar, Upload, UploadPurpose, UploadStatus
from app.models.newsletter import IssueStatus, NewsletterIssue, NewsletterReaction
from app.models.notes import Note
from app.models.outbox import EmailOutbox, OutboxStatus
from app.models.requests import RequestMeToo, RequestStatus, StudentRequest
from app.models.user import Channel, OtpChallenge, OtpPurpose, User, UserSession, UserStatus

__all__ = [
    "AccessRole",
    "AuditEntry",
    "Base",
    "CalendarEvent",
    "Channel",
    "ContentDoc",
    "EmailOutbox",
    "FeatureSwitch",
    "FeatureSwitchRole",
    "ForumReply",
    "ForumThread",
    "IssueStatus",
    "ItemSource",
    "ItemStatus",
    "LessonResume",
    "LessonView",
    "LibraryItem",
    "LibraryStar",
    "Module",
    "NewsletterIssue",
    "NewsletterReaction",
    "Note",
    "Notification",
    "OtpChallenge",
    "OtpPurpose",
    "OutboxStatus",
    "PostStatus",
    "ReplyVote",
    "Report",
    "ReportStatus",
    "RequestMeToo",
    "RequestStatus",
    "RoleBox",
    "RoleGrant",
    "StudentRequest",
    "ThreadVote",
    "Upload",
    "UploadPurpose",
    "UploadStatus",
    "User",
    "UserSession",
    "UserStatus",
]
