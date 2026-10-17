from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field, StringConstraints, model_validator
from pydantic_core import PydanticCustomError

from app.schemas.common import ApiModel, Page, PostStatus, UserPublic, Year

# A category's or a tag's id: in links (?cohort=year-2), set when it is made and never changed.
TaxonomyId = Annotated[str, StringConstraints(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", min_length=1, max_length=32)]
Sort = Literal["hot", "new", "top"]
# What a follower hears about: an accepted answer, every reply too, or nothing (switched off by hand).
FollowLevel = Literal["answers", "replies", "off"]
ThreadTitle = Annotated[str, StringConstraints(strip_whitespace=True, min_length=5, max_length=160)]
ThreadBody = Annotated[str, StringConstraints(strip_whitespace=True, max_length=20_000)]
ReplyBody = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=10_000)]
# Why a student rep hid a post: it goes to the post's author in their notification (decision D3).
HideReason = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]


CategoryLabel = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]
CategoryShort = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20)]
CategoryBlurb = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
TagLabel = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]
Guideline = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
# The pictures a guideline, or a category for every year, can have beside it in the forum's sidebar.
ForumIcon = Literal[
    "search", "tag", "check", "shield", "heart", "chat", "people", "book", "calendar", "flag", "info", "briefcase"
]


class ForumCategoryOut(ApiModel):
    """Where a thread lives. A retired one is no longer offered; its threads keep it."""

    id: TaxonomyId
    label: CategoryLabel  # 'Year 1'
    short: CategoryShort  # on a thread's row: 'Study group'
    year: Year | None  # its cohort; None: forum-wide (threads without a module show to every year)
    blurb: CategoryBlurb  # under the label in the sidebar
    icon: ForumIcon | None = None  # beside a category for every year (a year's category shows its number)
    retired: bool = False


class ForumTagOut(ApiModel):
    id: TaxonomyId
    label: TagLabel
    retired: bool = False


class ForumGuideline(ApiModel):
    """One of the forum's guidelines, in the sidebar."""

    id: TaxonomyId
    icon: ForumIcon
    text: Guideline


class ForumTip(ApiModel):
    """A tip for a good thread, beside the composer. `code` in backticks shows as code."""

    id: TaxonomyId
    text: Guideline


class ForumMeta(ApiModel):
    """Everything the forum's pages need to place and file threads: every category and tag (retired ones too, for
    the threads that carry them), where a thread goes when no year fits, and the guidelines and tips."""

    categories: list[ForumCategoryOut]
    tags: list[ForumTagOut]
    max_tags: int
    default_category: str  # a thread without a year goes here
    guidelines: list[ForumGuideline]
    tips: list[ForumTip]


class PostImage(ApiModel):
    src: str
    alt: str


class ThreadSummary(ApiModel):
    id: UUID
    slug: str  # the thread's URL: /forum/<slug>
    title: str
    excerpt: str  # plain text, about 200 characters
    category: str
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
    category: TaxonomyId | None = None  # default: the module's year's category, else the default category
    module_id: str | None = None
    tags: list[TaxonomyId] = Field(default_factory=list, max_length=3)
    anonymous: bool = False  # without the author's name (needs the forum.anonymous feature)
    senior_id: UUID | None = None  # a senior asked through Career Navigator: they are told (needs career.seniors)


class ThreadUpdate(ApiModel):
    title: ThreadTitle | None = None
    body: ThreadBody | None = None
    category: TaxonomyId | None = None
    module_id: str | None = None
    tags: list[TaxonomyId] | None = Field(default=None, max_length=3)


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


# ── Manage → Forum ──────────────────────────────────────────────────────────────────────────────────


def _unique(ids: Iterable[str], what: str) -> None:
    seen: set[str] = set()
    for i in ids:
        if i in seen:
            raise PydanticCustomError("duplicate", "Two {what} have the same id “{id}”.", {"what": what, "id": i})
        seen.add(i)


class ForumDoc(ApiModel):
    """The forum's words, kept as one document (its starting content is app/seed/data/forum.json)."""

    default_category: TaxonomyId  # a thread goes here when no year fits it
    guidelines: list[ForumGuideline] = Field(min_length=1, max_length=8)
    tips: list[ForumTip] = Field(min_length=1, max_length=8)


class ForumSettings(ForumDoc):
    """Manage → Forum, saved as a whole: the categories and tags in their order, and the forum's words."""

    categories: list[ForumCategoryOut] = Field(min_length=1, max_length=20)
    tags: list[ForumTagOut] = Field(max_length=40)

    @model_validator(mode="after")
    def _consistent(self) -> ForumSettings:
        _unique((c.id for c in self.categories), "categories")
        _unique((t.id for t in self.tags), "tags")
        _unique((g.id for g in self.guidelines), "guidelines")
        _unique((t.id for t in self.tips), "tips")
        if all(c.retired for c in self.categories):
            raise PydanticCustomError("no_category", "Keep at least one category that isn't retired.")
        default = next((c for c in self.categories if c.id == self.default_category), None)
        if default is None or default.retired or default.year is not None:
            raise PydanticCustomError(
                "default_category",
                "Choose where threads go when no year fits them: a category for every year that isn't retired.",
            )
        return self

    def doc(self) -> ForumDoc:
        return ForumDoc(default_category=self.default_category, guidelines=self.guidelines, tips=self.tips)


class ForumSettingsEditable(ApiModel):
    """The settings with the version a save names (0 until the first save), and how many threads use each category
    and tag (one in use is retired rather than removed)."""

    data: ForumSettings
    version: int
    updated_at: datetime | None
    updated_by: UserPublic | None
    threads_by_category: dict[str, int]
    threads_by_tag: dict[str, int]


class ForumSettingsSave(ApiModel):
    """PUT /forum/settings: everything, and the version it was edited from."""

    version: int = Field(ge=0)
    data: ForumSettings
