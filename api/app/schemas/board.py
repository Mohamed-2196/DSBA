"""The study board (R-4): a private board per student with three fixed columns, and revision plans."""

from __future__ import annotations

import datetime as dt
from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field, StringConstraints

from app.schemas.common import ApiModel
from app.schemas.library import LibraryKind

BoardColumn = Literal["todo", "doing", "done"]
BoardLinkType = Literal["event", "my_event", "lesson", "module", "library_item"]

CardTitle = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
CardNote = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]


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


class BoardCard(ApiModel):
    id: UUID
    column: BoardColumn
    title: str
    note: str | None
    due_date: dt.date | None  # the student's own due date
    link: BoardLink | None
    plan_module_id: str | None  # the module whose revision plan added it
    plan_date: dt.date | None  # the day the plan gives it, while it isn't done (the student's own due date wins)
    created_at: dt.datetime
    done_at: dt.datetime | None  # when it reached Done


class BoardPlan(ApiModel):
    """A revision plan for a module: its cards not done yet are spread over the days up to the exam."""

    module_id: str
    module_name: str
    exam_date: dt.date
    paper_every: int  # a past paper every this many days
    left: int  # plan cards not done yet
    done: int  # plan cards done
    days_left: int  # days from today until the exam (0 on the day, negative after it)


class Board(ApiModel):
    """Every card, by column, each column in its order, and the revision plans."""

    cards: list[BoardCard]
    plans: list[BoardPlan]
    limit: int  # how many cards a board may hold


class BoardPlanCreate(ApiModel):
    """Plans a module's revision up to `examDate`: a card for each lesson not watched yet and a past paper every
    `paperEvery` days. Planning the same module again keeps its cards, adds what's missing and takes the new date."""

    module_id: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]
    exam_date: dt.date
    paper_every: int = Field(default=3, ge=1, le=14)


class BoardPlanMade(ApiModel):
    plan: BoardPlan
    added: int  # cards added to To do


class BoardCardCreate(ApiModel):
    """A card at the end of a column. With a link and no title, the card takes the linked thing's title. A lesson
    already watched starts in Done."""

    title: CardTitle | None = None
    note: CardNote | None = None
    due_date: dt.date | None = None
    column: BoardColumn = "todo"
    link: BoardLinkIn | None = None


class BoardCardUpdate(ApiModel):
    """Fields that are not sent stay; null clears the note or the due date."""

    title: CardTitle | None = None
    note: CardNote | None = None
    due_date: dt.date | None = None


class BoardCardMove(ApiModel):
    """Puts the card in `column`, right after the card `afterId`, or at the top with null."""

    column: BoardColumn
    after_id: UUID | None = Field(default=None)
