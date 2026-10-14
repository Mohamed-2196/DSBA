"""The DSBA Newsletter: issues, their cover and sections, and reactions.

An issue's cover and sections are typed (code quality review CQ-4, decision D5: student reps edit them with a form),
so the API refuses what the reader can't show and the web app's types are generated from these models. The block
and aside types are the ones the issues use (a paragraph, a bulleted list, a sign-off, plus a button; a card or a
few numbers beside the copy): adding one later is an additive change, a new member of its union. A validation error
inside a block or an aside names its type in the path: 'sections.0.blocks.2.cta.to'.

Copy holds one level of inline markup: **bold**, *italic*, ==highlight== and [label](link), where a link is
https://, mailto: or a page of the Hub (app/schemas/links.py). Issues are stored as JSON, camelCase as on the wire."""

from __future__ import annotations

import datetime as dt
from typing import Annotated, Literal
from uuid import UUID

from pydantic import AfterValidator, Field, StringConstraints, model_validator
from pydantic_core import PydanticCustomError

from app.schemas.common import ApiModel
from app.schemas.links import MARKUP, HubLink, PictureSrc

Reaction = Literal["useful", "love", "laugh"]
Slug = Annotated[str, StringConstraints(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=80)]
# A section's id: its ?section= deep link and the key of its reactions. Stable once the issue is out.
SectionId = Annotated[str, StringConstraints(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", min_length=1, max_length=64)]
# The icons a section's label may carry (the web app bundles these: features/newsletter/components/sectionIcons.ts).
SectionIcon = Literal[
    "NotePencil",
    "ListBullets",
    "CalendarCheck",
    "Sparkle",
    "Megaphone",
    "UsersThree",
    "Lightbulb",
    "Student",
    "ChatsCircle",
    "Books",
    "ChartLineUp",
    "Microphone",
    "RocketLaunch",
    "Newspaper",
]
# Live sections list data from other features when they are read: the exams in a window of dates, the hottest forum
# threads, the newest library files.
SectionKind = Literal["deadlines", "forum", "library"]
CoverTone = Literal["navy", "paper"]  # the stock a typographic cover is printed on

MAX_SECTIONS = 40

# Copy, by how long it may be (markup links are checked).
Label = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40), MARKUP]
CoverText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60), MARKUP]
Line = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120), MARKUP]
Heading = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160), MARKUP]
Short = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300), MARKUP]
Item = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000), MARKUP]
Paragraph = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000), MARKUP]
Standfirst = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000), MARKUP]  # dek and summary
Editor = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
IssueTitle = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]


class ReactionCounts(ApiModel):
    useful: int = 0
    love: int = 0
    laugh: int = 0
    mine: list[Reaction] = Field(default=[])


# ── an issue's content ───────────────────────────────────────────────────────────────────────


class IssueFigure(ApiModel):
    """A picture beside a section's copy. Width and height (pixels) reserve its space while it loads; `alt`
    describes it for people who can't see it."""

    src: PictureSrc
    width: int = Field(ge=1, le=10_000)
    height: int = Field(ge=1, le=10_000)
    alt: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] = ""
    caption: Short | None = None


class ParagraphBlock(ApiModel):
    type: Literal["p"]
    text: Paragraph
    lead: bool = False  # the opening paragraph of a story, set larger


class ListBlock(ApiModel):
    """A bulleted list."""

    type: Literal["list"]
    items: list[Item] = Field(min_length=1, max_length=30)


class SignoffBlock(ApiModel):
    """The editors' sign-off at the end of a story or an issue, shown with their avatars."""

    type: Literal["signoff"]
    text: Line


class CtaBlock(ApiModel):
    """A button: 'Open the calendar', 'Upload a file'."""

    type: Literal["cta"]
    label: Label
    to: HubLink  # a page of the Hub ('/calendar'), https:// or mailto:


PollAnswer = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]


class PollBlock(ApiModel):
    """A question to the cohort with two to five answers: one vote per signed-in student, and the counts once you
    have voted (needs the newsletter.polls feature). `id` keeps its votes: it is unique in the issue and stays put
    once the issue is out."""

    type: Literal["poll"]
    id: SectionId
    question: Heading
    answers: list[PollAnswer] = Field(min_length=2, max_length=5)  # fixed once the poll has votes
    closed: bool = False  # takes no more votes; the counts show to everyone


IssueBlock = Annotated[ParagraphBlock | ListBlock | SignoffBlock | CtaBlock | PollBlock, Field(discriminator="type")]


class CardAside(ApiModel):
    """A typographic card beside the copy: a kicker, a short title in a highlight, a line of text."""

    type: Literal["card"]
    kicker: Label
    title: Line
    text: Short
    wide: bool = False  # takes the figure's column


class StatItem(ApiModel):
    value: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=24)]  # '16', '120+'
    label: Line


class StatsAside(ApiModel):
    """A few numbers beside the copy."""

    type: Literal["stats"]
    title: Line
    items: list[StatItem] = Field(min_length=1, max_length=8)
    foot: Short | None = None
    wide: bool = False


IssueAside = Annotated[CardAside | StatsAside, Field(discriminator="type")]


class DateWindow(ApiModel):
    """The dates a deadlines section lists (either end may be open)."""

    from_: dt.date | None = Field(default=None, alias="from")
    to: dt.date | None = None

    @model_validator(mode="after")
    def _in_order(self) -> DateWindow:
        if self.from_ is not None and self.to is not None and self.to < self.from_:
            raise PydanticCustomError("date_order", "The last day can't be before the first.")
        return self


class LiveFallback(ApiModel):
    """What a live section says when there is nothing to list yet."""

    title: Line
    text: Item


class IssueSection(ApiModel):
    id: SectionId
    title: Heading
    label: Label | None = None  # beside the icon, above the title (the title when there is none)
    icon: SectionIcon | None = None
    kind: SectionKind | None = None  # a live section; None for a story
    blocks: list[IssueBlock] = Field(default=[], max_length=40)
    after: list[IssueBlock] = Field(default=[], max_length=10)  # after a live section's list
    figure: IssueFigure | None = None
    aside: IssueAside | None = None
    window: DateWindow | None = None  # deadlines
    fallback: LiveFallback | None = None  # forum and library: when there is nothing to list
    est_words: int | None = Field(default=None, ge=0, le=5_000)  # words a live list adds to the read time


def _unique_ids(sections: list[IssueSection]) -> list[IssueSection]:
    seen: set[str] = set()
    polls: set[str] = set()
    for s in sections:
        if s.id in seen:
            raise PydanticCustomError("duplicate_id", "Two sections have the same id: “{id}”.", {"id": s.id})
        seen.add(s.id)
        for b in [*s.blocks, *s.after]:
            if isinstance(b, PollBlock):
                if b.id in polls:
                    raise PydanticCustomError("duplicate_id", "Two polls have the same id: “{id}”.", {"id": b.id})
                polls.add(b.id)
    return sections


Sections = Annotated[list[IssueSection], Field(max_length=MAX_SECTIONS), AfterValidator(_unique_ids)]


class CoverLine(ApiModel):
    section: SectionId  # the story it points to
    text: CoverText  # that story's headline cut down to a cover line


class IssueCover(ApiModel):
    """Typographic, or an illustration (`art`, portrait 3:4) with the type over it. A cover shows five lines at most
    (three over an illustration)."""

    tone: CoverTone = "navy"
    art: PictureSrc | None = None
    lines: list[CoverLine] = Field(default=[], max_length=5)


# ── issues ───────────────────────────────────────────────────────────────────────────────────


class IssueSummary(ApiModel):
    id: UUID
    slug: str
    number: int
    title: str
    date: dt.date
    cover: IssueCover
    dek: str
    summary: str
    editors: list[str]
    status: Literal["draft", "published"]
    published_at: dt.datetime | None


class PollResult(ApiModel):
    """A poll's votes. Nobody sees who voted."""

    total: int
    # by answer; None until the viewer has voted (always for people who manage the newsletter, and once it's closed)
    counts: list[int] | None
    mine: int | None  # the answer the viewer chose


class PollVoteRequest(ApiModel):
    choice: int = Field(ge=0, le=4)  # the answer's position, from 0


class IssueDetail(IssueSummary):
    sections: list[IssueSection]
    reactions: dict[str, ReactionCounts]  # by section id
    polls: dict[str, PollResult]  # by poll id; empty while polls are switched off for the viewer


class PublishedIssue(IssueDetail):
    emailed: bool  # false: an issue email went to the cohort in the last 24 hours, or the newsletter is off


class IssueCreate(ApiModel):
    """A new draft. The whole issue may take 256 KB of JSON."""

    slug: Slug
    number: int = Field(ge=0, le=100_000)
    title: IssueTitle
    date: dt.date
    cover: IssueCover = Field(default_factory=IssueCover)
    dek: Standfirst = ""
    summary: Standfirst = ""
    editors: list[Editor] = Field(default_factory=list, max_length=12)
    sections: Sections = Field(default_factory=list)


class IssueUpdate(ApiModel):
    """Fields that are not sent stay as they are."""

    slug: Slug | None = None
    number: int | None = Field(default=None, ge=0, le=100_000)
    title: IssueTitle | None = None
    date: dt.date | None = None
    cover: IssueCover | None = None
    dek: Standfirst | None = None
    summary: Standfirst | None = None
    editors: list[Editor] | None = Field(default=None, max_length=12)
    sections: Sections | None = None
