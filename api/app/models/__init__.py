"""All models, imported here so that Alembic and the app see the whole schema."""

from app.models.activity import AuditEntry, LessonResume, LessonView, Notification, Report, ReportStatus
from app.models.base import Base
from app.models.content import CalendarEvent, ContentDoc, Module
from app.models.forum import ForumReply, ForumThread, PostStatus, ReplyVote, ThreadVote
from app.models.library import ItemSource, ItemStatus, LibraryItem, LibraryStar, Upload, UploadPurpose, UploadStatus
from app.models.newsletter import IssueStatus, NewsletterIssue, NewsletterReaction
from app.models.user import Channel, OtpChallenge, OtpPurpose, Role, User, UserSession, UserStatus

__all__ = [
    "AuditEntry",
    "Base",
    "CalendarEvent",
    "Channel",
    "ContentDoc",
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
    "Notification",
    "OtpChallenge",
    "OtpPurpose",
    "PostStatus",
    "ReplyVote",
    "Report",
    "ReportStatus",
    "Role",
    "ThreadVote",
    "Upload",
    "UploadPurpose",
    "UploadStatus",
    "User",
    "UserSession",
    "UserStatus",
]
