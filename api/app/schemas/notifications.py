from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from app.schemas.common import ApiModel, Page, UserPublic

NotificationKind = Literal[
    "thread_reply",  # someone replied to your thread
    "reply_reply",  # someone replied to your reply
    "answer_accepted",  # your reply was accepted as the answer
    "followed_reply",  # a new reply in a thread you follow (when you follow every reply)
    "followed_answer",  # a thread you follow has an accepted answer
    "senior_question",  # someone asked you a question as a senior
    "upload_published",  # your library upload was approved
    "upload_rejected",
    "new_issue",  # a newsletter issue was published
    "report_resolved",  # a moderator acted on your report
    "request_update",  # a request you made or said "me too" to changed status
    "system",
]


class NotificationOut(ApiModel):
    id: UUID
    kind: NotificationKind
    title: str
    body: str | None
    url: str | None  # a path inside the web app
    actor: UserPublic | None
    created_at: datetime
    read_at: datetime | None


class NotificationPage(Page[NotificationOut]):
    unread_count: int
