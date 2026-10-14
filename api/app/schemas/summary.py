from __future__ import annotations

import datetime as dt

from app.schemas.common import ApiModel, Year


class SummaryPreview(ApiModel):
    """A year's Sunday summary for this week, as plain text with links: what the email says above its footer, and
    what a rep pastes into the year's group."""

    year: Year
    week_of: dt.date  # the week's Sunday
    subject: str
    text: str
    empty: bool  # nothing to tell this week: no email goes out
    subscribers: int  # people in that year with "Sunday summary" on
