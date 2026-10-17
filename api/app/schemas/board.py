"""Boards: each student's private boards of cards, with their own columns, labels, checklists, files and reminders,
and revision plans that add study cards."""

from __future__ import annotations

import datetime as dt
from typing import Annotated, Literal
from uuid import UUID

from pydantic import AfterValidator, Field, StringConstraints
from pydantic_core import PydanticCustomError

from app.schemas.common import ApiModel
from app.schemas.library import LibraryKind

BoardLinkType = Literal["event", "my_event", "lesson", "module", "library_item"]
BoardTemplate = Literal["study", "revision", "assignment", "weekly", "personal", "blank"]
BoardColor = Literal["cobalt", "teal", "green", "amber", "coral", "slate"]
Priority = Literal["none", "low", "medium", "high"]
# Minutes before the card is due that its reminder comes: at the time, 15 minutes, an hour, a day, two days.
RemindBefore = Literal[0, 15, 60, 1440, 2880]

BoardName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
BoardEmoji = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=16)]
ColumnName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]
LabelName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=30)]
CardTitle = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
CardDescription = Annotated[str, StringConstraints(strip_whitespace=True, max_length=10000)]
ChecklistText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
CommentBody = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
ItemId = Annotated[str, StringConstraints(min_length=1, max_length=40, pattern=r"^[A-Za-z0-9_-]+$")]
DUE_FIRST, DUE_LAST = dt.date(2000, 1, 1), dt.date(2100, 12, 31)  # the due dates a card may have


def _due(value: dt.date) -> dt.date:
    if not DUE_FIRST <= value <= DUE_LAST:
        raise PydanticCustomError("due_date", "Pick a due date between 2000 and 2100.")
    return value


DueDate = Annotated[dt.date, AfterValidator(_due)]


# ── boards and columns ─────────────────────────────────────────────────────────────────────


class BoardColumn(ApiModel):
    id: UUID
    name: str
    done: bool  # cards here count as done: they leave the agenda and get `doneAt`


class BoardSummary(ApiModel):
    id: UUID
    name: str
    emoji: str | None
    color: BoardColor
    template: BoardTemplate
    archived: bool
    columns: list[BoardColumn]  # in order
    open: int  # cards not in a done column
    done: int


class BoardUsage(ApiModel):
    """What the student holds and may hold, over every board (archived ones too)."""

    boards: int
    max_boards: int
    cards: int
    max_cards: int
    storage_bytes: int  # files attached to cards
    max_storage_bytes: int


class BoardLabel(ApiModel):
    id: UUID
    name: str
    color: BoardColor


class Boards(ApiModel):
    """Every board, active ones in order first, then the archived ones; the student's labels; the revision plans,
    nearest exam first; the limits."""

    boards: list[BoardSummary]
    labels: list[BoardLabel]
    plans: list[BoardPlan]
    usage: BoardUsage


class BoardCreate(ApiModel):
    """A board after the others, with the template's columns."""

    name: BoardName
    emoji: BoardEmoji | None = None
    color: BoardColor = "cobalt"
    template: BoardTemplate = "blank"


class BoardUpdate(ApiModel):
    """Fields that are not sent stay; null clears the emoji."""

    name: BoardName | None = None
    emoji: BoardEmoji | None = None
    color: BoardColor | None = None
    archived: bool | None = None


class AfterId(ApiModel):
    """Right after `afterId`, or first with null."""

    after_id: UUID | None = None


class ColumnCreate(ApiModel):
    """A column at the end of the board."""

    name: ColumnName
    done: bool = False


class ColumnUpdate(ApiModel):
    name: ColumnName | None = None
    done: bool | None = None


# ── cards ───────────────────────────────────────────────────────────────────────────────────


class BoardLinkIn(ApiModel):
    """What a card points at: a calendar event id, one of the student's own events, a lesson id, a module id or a
    library item id."""

    type: BoardLinkType
    id: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=96)]


class BoardLink(ApiModel):
    type: BoardLinkType
    id: str
    title: str | None  # None: the thing is gone from the hub
    url: str | None  # where it lives in the web app
    date: dt.date | None  # an event's last day (a repeat's next): the card is due then unless it has its own due date
    kind: LibraryKind | None  # a library item's kind ('past-paper', ...)
    module_id: str | None  # the module a lesson or a library item belongs to


class ChecklistItem(ApiModel):
    id: ItemId
    text: ChecklistText
    done: bool = False


class BoardCard(ApiModel):
    id: UUID
    board_id: UUID
    column_id: UUID
    title: str
    description: str | None  # Markdown
    due_date: dt.date | None  # the student's own due date
    due_time: dt.time | None  # Bahrain time; none: some time that day
    remind_before: RemindBefore | None  # minutes before it's due (09:00 when it has no time); none: no reminder
    priority: Priority
    label_ids: list[UUID]
    checklist: list[ChecklistItem]
    link: BoardLink | None
    plan_module_id: str | None  # the module whose revision plan added it
    plan_date: dt.date | None  # the day the plan gives it, while it isn't done (the student's own due date wins)
    cover_url: str | None  # a picture attached to the card, shown on top of it
    attachment_count: int
    comment_count: int
    created_at: dt.datetime
    done_at: dt.datetime | None  # when it reached a done column


class BoardPlan(ApiModel):
    """A revision plan for a module: its cards not done yet are spread over the days up to the exam."""

    module_id: str
    module_name: str
    board_id: UUID
    exam_date: dt.date
    paper_every: int  # a past paper every this many days
    left: int  # plan cards not done yet
    done: int  # plan cards done
    days_left: int  # days from today until the exam (0 on the day, negative after it)


class BoardDetail(ApiModel):
    """One board: its columns in order, its cards (each column's in order, columns in order) and its revision
    plans, nearest exam first."""

    board: BoardSummary
    cards: list[BoardCard]
    plans: list[BoardPlan]


class BoardCardCreate(ApiModel):
    """A card at the end of a column: `columnId`, or the first column of `boardId`, or of the student's first board
    (made from the Study template when there is none). With a link and no title, the card takes the linked thing's
    title. A lesson already watched starts in the board's first done column."""

    board_id: UUID | None = None
    column_id: UUID | None = None
    title: CardTitle | None = None
    description: CardDescription | None = None
    due_date: DueDate | None = None
    due_time: dt.time | None = None
    priority: Priority = "none"
    label_ids: list[UUID] = Field(default_factory=list, max_length=10)
    link: BoardLinkIn | None = None


class BoardCardUpdate(ApiModel):
    """Fields that are not sent stay; null clears. A checklist replaces the card's whole checklist."""

    title: CardTitle | None = None
    description: CardDescription | None = None
    due_date: DueDate | None = None
    due_time: dt.time | None = None
    remind_before: RemindBefore | None = None
    priority: Priority | None = None
    label_ids: list[UUID] | None = Field(default=None, max_length=10)
    checklist: list[ChecklistItem] | None = Field(default=None, max_length=50)
    cover_id: UUID | None = None  # one of the card's pictures; null: no cover


class BoardCardMove(ApiModel):
    """Puts the card in `columnId` (on any of the student's boards), right after the card `afterId`, or at the top
    with null."""

    column_id: UUID
    after_id: UUID | None = None


class CardAttachment(ApiModel):
    id: UUID
    file_name: str
    content_type: str
    size_bytes: int
    image: bool  # a picture: shown as a preview, and may be the card's cover
    url: str  # a short-lived link: shown in the browser for pictures and PDFs, downloaded otherwise
    created_at: dt.datetime


class CardComment(ApiModel):
    id: UUID
    body: str
    created_at: dt.datetime


class BoardCardDetail(BoardCard):
    """A card with its files and its comments to self, oldest comment first."""

    attachments: list[CardAttachment]
    comments: list[CardComment]


class AttachmentCreate(ApiModel):
    """A file uploaded with purpose 'board' (POST /uploads, then /uploads/{id}/complete)."""

    upload_id: UUID


class CommentCreate(ApiModel):
    body: CommentBody


class LabelCreate(ApiModel):
    name: LabelName
    color: BoardColor = "cobalt"


class LabelUpdate(ApiModel):
    name: LabelName | None = None
    color: BoardColor | None = None


class AgendaCard(BoardCard):
    board_name: str
    board_emoji: str | None
    board_color: BoardColor
    due: dt.date  # its own due date, else its plan's day, else its event's last day


class Agenda(ApiModel):
    """Cards not done on the active boards that are due by `until`: by day, then time, then board."""

    today: dt.date
    until: dt.date
    cards: list[AgendaCard]


class BoardLinkState(ApiModel):
    """A hub thing that is on one of the student's boards."""

    type: BoardLinkType
    id: str
    card_id: UUID
    board_id: UUID
    done: bool


# ── revision plans ──────────────────────────────────────────────────────────────────────────


class BoardPlanCreate(ApiModel):
    """Plans a module's revision up to `examDate` on `boardId` (the student's first board when not sent): a card for
    each lesson not watched yet and a past paper every `paperEvery` days. Planning the same module again keeps its
    cards and board, adds what's missing and takes the new date."""

    module_id: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]
    exam_date: dt.date
    paper_every: int = Field(default=3, ge=1, le=14)
    board_id: UUID | None = None


class BoardPlanMade(ApiModel):
    plan: BoardPlan
    added: int  # cards added to the board's first column
