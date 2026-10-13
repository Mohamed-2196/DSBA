"""The study board (R-4): a private board per student with three fixed columns."""

from __future__ import annotations

import datetime as dt
from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field, StringConstraints

from app.schemas.common import ApiModel

BoardColumn = Literal["todo", "doing", "done"]
BoardLinkType = Literal["event", "lesson", "module", "library_item"]

CardTitle = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
CardNote = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]


class BoardLinkIn(ApiModel):
    """What a card points at: a calendar event id, a lesson id, a module id or a library item id."""

    type: BoardLinkType
    id: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=96)]


class BoardLink(ApiModel):
    type: BoardLinkType
    id: str
    title: str | None  # None: the thing is gone from the hub
    url: str | None  # where it lives in the web app
    date: dt.date | None  # an event's last day: the card is due then unless it has its own due date


class BoardCard(ApiModel):
    id: UUID
    column: BoardColumn
    title: str
    note: str | None
    due_date: dt.date | None  # the student's own due date
    link: BoardLink | None
    created_at: dt.datetime
    done_at: dt.datetime | None  # when it reached Done


class Board(ApiModel):
    """Every card, by column, each column in its order."""

    cards: list[BoardCard]
    limit: int  # how many cards a board may hold


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
