"""Seniors who answer: Year 3 students listed in Career Navigator's "Ask a senior" panel."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field, StringConstraints

from app.schemas.common import ApiModel, UserPublic

# What a senior answers questions about (the web app has the labels).
SeniorTopic = Literal["internships", "jobs", "msc", "electives", "modules"]
SeniorNote = Annotated[str, StringConstraints(strip_whitespace=True, max_length=140)]


class Senior(ApiModel):
    """A listed senior: name, cohort and badge, the topics and their line. No contact details."""

    user: UserPublic
    topics: list[SeniorTopic]
    note: str  # "I did NBB's summer internship"; '' when they wrote none


class SeniorUpdate(ApiModel):
    topics: list[SeniorTopic] = Field(min_length=1, max_length=5)
    note: SeniorNote = ""
    paused: bool = False  # kept, but not listed and not asked


class MySenior(ApiModel):
    """The signed-in person's listing, and whether they may have one (Year 3 only)."""

    eligible: bool
    listed: bool  # signed up (paused or not)
    topics: list[SeniorTopic]
    note: str
    paused: bool
