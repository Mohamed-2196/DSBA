"""The Sunday summary: a year's text for this week, and its words, which holders of summary.share edit in Manage →
Sunday summary (the subject line, the headings, the line before the closing link, and the time it goes out on Sunday).
The words' starting content is app/seed/data/summary.json."""

from __future__ import annotations

import datetime as dt
from typing import Annotated

from pydantic import Field, StringConstraints

from app.schemas.common import ApiModel, UserPublic, Year, placeholders

Heading = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]


class SummaryPreview(ApiModel):
    """A year's Sunday summary for this week, as plain text with links: what the email says above its footer, and
    what a rep pastes into the year's group."""

    year: Year
    week_of: dt.date  # the week's Sunday
    subject: str
    text: str
    empty: bool  # nothing to tell this week: no email goes out
    subscribers: int  # people in that year with "Sunday summary" on


class SummaryHeadings(ApiModel):
    """Above each part of the summary; a part with nothing in it this week is left out."""

    calendar: Heading  # the week's exams, mocks and deadlines
    library: Heading  # files published in the year's modules over the last seven days
    forum: Heading  # the year's questions nobody has answered yet
    newsletter: Heading  # the newsletter issue of the last seven days


class SummaryWords(ApiModel):
    subject: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120), placeholders(("year", "week"))
    ]  # {year} is the year's number, {week} the week ('18 to 24 October')
    headings: SummaryHeadings
    closing: Heading  # before the link to the hub at the end: 'Everything else:'
    send_at: Annotated[str, StringConstraints(pattern=r"^(?:[01][0-9]|2[0-3]):[0-5][0-9]$")]  # Sunday, Bahrain

    def send_time(self) -> dt.time:
        return dt.time.fromisoformat(self.send_at)


class SummaryEditable(ApiModel):
    """The words with the version a save must name (0 until the first save: the starting content)."""

    data: SummaryWords
    version: int
    updated_at: dt.datetime | None
    updated_by: UserPublic | None


class SummarySave(ApiModel):
    """PUT /summary/settings: the words, and the version they were edited from."""

    version: int = Field(ge=0)
    data: SummaryWords


class SummaryDraftPreview(ApiModel):
    """POST /summary/settings/preview: this week's summary for a year with a draft of the words."""

    year: Year
    words: SummaryWords
