from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field, StringConstraints

from app.schemas.common import ApiModel, Page, PostStatus, UserPublic, Year

Category = Literal["year-1", "year-2", "year-3", "study-groups", "general"]
Sort = Literal["hot", "new", "top"]
ThreadTitle = Annotated[str, StringConstraints(strip_whitespace=True, min_length=5, max_length=160)]
ThreadBody = Annotated[str, StringConstraints(strip_whitespace=True, max_length=20_000)]
ReplyBody = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=10_000)]
TagId = Annotated[str, StringConstraints(pattern=r"^[a-z0-9-]{1,32}$")]


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
    author: UserPublic | None  # None: the account was deleted
    author_year: Year | None
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
    author: UserPublic | None
    author_year: Year | None
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


class ThreadCreate(ApiModel):
    title: ThreadTitle
    body: ThreadBody = ""
    category: Category | None = None  # default: the module's year, else 'general'
    module_id: str | None = None
    tags: list[TagId] = Field(default_factory=list, max_length=3)


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


class VoteResult(ApiModel):
    vote_count: int
    voted: bool


class AcceptRequest(ApiModel):
    reply_id: UUID | None  # None takes the accepted answer away


class ThreadModeration(ApiModel):
    pinned: bool | None = None
    locked: bool | None = None
    status: Literal["visible", "hidden"] | None = None


class ReplyModeration(ApiModel):
    status: Literal["visible", "hidden"]


class Contributor(ApiModel):
    user: UserPublic
    replies: int
    votes: int
    accepted: int
    score: int  # votes on replies + 10 per accepted answer, last 7 days


class ForumStats(ApiModel):
    total: int
    by_category: dict[str, int]
    replies_today: int
    no_replies: int
    top_contributors: list[Contributor]
