from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field, StringConstraints

from app.schemas.common import ApiModel, Page, PostStatus, UserPublic, Year

Category = Literal["year-1", "year-2", "year-3", "study-groups", "general"]
Sort = Literal["hot", "new", "top"]
# What a follower hears about: an accepted answer, every reply too, or nothing (switched off by hand).
FollowLevel = Literal["answers", "replies", "off"]
ThreadTitle = Annotated[str, StringConstraints(strip_whitespace=True, min_length=5, max_length=160)]
ThreadBody = Annotated[str, StringConstraints(strip_whitespace=True, max_length=20_000)]
ReplyBody = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=10_000)]
TagId = Annotated[str, StringConstraints(pattern=r"^[a-z0-9-]{1,32}$")]
# Why a student rep hid a post: it goes to the post's author in their notification (decision D3).
HideReason = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]


class CategoryOut(ApiModel):
    id: Category
    label: str
    short: str
    year: Year | None
    blurb: str


class TagOut(ApiModel):
    id: str
    label: str


class ForumMeta(ApiModel):
    categories: list[CategoryOut]
    tags: list[TagOut]
    max_tags: int


class PostImage(ApiModel):
    src: str
    alt: str


class ThreadSummary(ApiModel):
    id: UUID
    slug: str  # the thread's URL: /forum/<slug>
    title: str
    excerpt: str  # plain text, about 200 characters
    category: Category
    module_id: str | None
    year: Year | None  # the category's cohort, else the module's
    tags: list[str]
    # None: the account was deleted, or the thread is anonymous and the viewer is neither its author nor a moderator
    author: UserPublic | None
    author_year: Year | None
    anonymous: bool  # posted without the author's name: students see "A Year 1 student"
    created_at: datetime
    last_activity_at: datetime
    vote_count: int
    reply_count: int
    voted: bool  # by the signed-in user
    answered: bool
    pinned: bool
    locked: bool
    status: PostStatus
    image: PostImage | None  # the first picture in the post, shown as a thumbnail
    is_mine: bool


class ThreadPage(Page[ThreadSummary]):
    pass


class Reply(ApiModel):
    id: UUID
    thread_id: UUID
    parent_id: UUID | None  # one level of nesting
    author: UserPublic | None  # None as on ThreadSummary
    author_year: Year | None
    anonymous: bool  # the anonymous thread's author replying in it: shown as the asker
    body: str  # markdown; '' when deleted
    created_at: datetime
    edited_at: datetime | None
    vote_count: int
    voted: bool
    status: PostStatus
    accepted: bool
    is_mine: bool
    can_edit: bool


class ThreadDetail(ThreadSummary):
    body: str
    edited_at: datetime | None
    accepted_reply_id: UUID | None
    replies: list[Reply]  # oldest first; hidden ones only for moderators
    can_edit: bool
    can_accept: bool
    can_moderate: bool
    following: FollowLevel  # the signed-in person's follow ('off' for guests and when following is switched off)


class ThreadCreate(ApiModel):
    title: ThreadTitle
    body: ThreadBody = ""
    category: Category | None = None  # default: the module's year, else 'general'
    module_id: str | None = None
    tags: list[TagId] = Field(default_factory=list, max_length=3)
    anonymous: bool = False  # without the author's name (needs the forum.anonymous feature)
    senior_id: UUID | None = None  # a senior asked through Career Navigator: they are told (needs career.seniors)


class ThreadUpdate(ApiModel):
    title: ThreadTitle | None = None
    body: ThreadBody | None = None
    category: Category | None = None
    module_id: str | None = None
    tags: list[TagId] | None = Field(default=None, max_length=3)


class ReplyCreate(ApiModel):
    body: ReplyBody
    parent_id: UUID | None = None


class ReplyUpdate(ApiModel):
    body: ReplyBody


class FollowRequest(ApiModel):
    level: FollowLevel


class FollowResult(ApiModel):
    following: FollowLevel


class VoteResult(ApiModel):
    vote_count: int
    voted: bool


class AcceptRequest(ApiModel):
    reply_id: UUID | None  # None takes the accepted answer away


class ThreadModeration(ApiModel):
    pinned: bool | None = None
    locked: bool | None = None
    status: Literal["visible", "hidden"] | None = None
    reason: HideReason | None = None  # with status 'hidden': told to the thread's author


class ReplyModeration(ApiModel):
    status: Literal["visible", "hidden"]
    reason: HideReason | None = None  # with status 'hidden': told to the reply's author


class Contributor(ApiModel):
    user: UserPublic
    replies: int
    votes: int
    accepted: int
    score: int  # votes on replies + 10 per accepted answer, last 7 days


class ForumStats(ApiModel):
    """Counts over the threads a guest's list shows (visible ones, and deleted ones that still have replies)."""

    total: int
    by_category: dict[str, int]
    replies_today: int  # visible replies since midnight in Bahrain
    no_replies: int
    top_contributors: list[Contributor]
    by_tag: dict[str, int] = Field(default_factory=dict)  # tag id -> threads
    no_replies_by_category: dict[str, int] = Field(default_factory=dict)
    tags_by_category: dict[str, dict[str, int]] = Field(default_factory=dict)  # category -> tag id -> threads
