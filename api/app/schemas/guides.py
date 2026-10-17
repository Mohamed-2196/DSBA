"""The guides: Start here (Year 1's first weeks), Results day (what results mean and what to do next) and Choosing
your Year 3 electives. One document that holders of guides.edit save as a whole (PUT /guides); its starting content is
app/seed/data/guides.json.

A step's links say where its buttons go: another site (https://), one of the hub's saved links (Site settings), a page
of the hub, the next calendar date whose title contains some words, or the button that installs the app. A step's
`id` is how each browser keeps its tick, so it stays the same when the step is reworded."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import Field, StringConstraints, model_validator
from pydantic_core import PydanticCustomError

from app.schemas.access import FeatureKey
from app.schemas.common import ApiModel, UserPublic
from app.schemas.links import HttpsUrl, HubPath

StepId = Annotated[str, StringConstraints(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", min_length=1, max_length=40)]
Label = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
Sentence = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]
Hint = Annotated[str, StringConstraints(strip_whitespace=True, max_length=600)]
# One of Site settings' links, by its name there.
SiteLinkKey = Literal["myclass", "uolPortal", "regulations", "results"]


class WebLink(ApiModel):
    kind: Literal["web"]
    href: HttpsUrl
    label: Label


class SavedLink(ApiModel):
    """One of the hub's saved links: it follows Site settings when the address changes."""

    kind: Literal["site"]
    link: SiteLinkKey
    label: Label


class PageLink(ApiModel):
    kind: Literal["page"]
    to: HubPath
    label: Label
    feature: FeatureKey | None = None  # the link hides while this feature is off


class DateLink(ApiModel):
    """The next calendar date of this type whose title contains `title`: 'Deadline Sunday 1 November'."""

    kind: Literal["date"]
    title: Label
    type: Literal["deadline", "event"]
    label: Label


class InstallLink(ApiModel):
    """ "Install the app", or how to add it to an iPhone's home screen."""

    kind: Literal["install"]


GuideLink = Annotated[WebLink | SavedLink | PageLink | DateLink | InstallLink, Field(discriminator="kind")]


class GuideStep(ApiModel):
    id: StepId
    title: Title
    hint: Hint  # on the guide's page, under the title
    links: list[GuideLink] = Field(default=[], max_length=4)


class GuidePlace(ApiModel):
    """One of the sites Start here tells apart."""

    name: Label
    whose: Label  # whose site it is: 'BIBF'
    what: Sentence
    link: SiteLinkKey | None = None


class TermStart(ApiModel):
    month: int = Field(ge=1, le=12)
    day: int = Field(ge=1, le=31)


def _unique_steps(steps: list[GuideStep]) -> None:
    seen: set[str] = set()
    for s in steps:
        if s.id in seen:
            raise PydanticCustomError("duplicate", f"Two steps have the same id “{s.id}”.")
        seen.add(s.id)


class StartHere(ApiModel):
    """Year 1's first weeks: Home's card for Year 1 from the first day of term for `weeks` weeks, and /start-here."""

    title: Label
    intro: Sentence
    term_start: TermStart  # the first day of the academic year
    weeks: int = Field(ge=1, le=20)
    steps: list[GuideStep] = Field(min_length=1, max_length=20)
    done: Sentence  # once every step is ticked
    places_title: Label
    places_intro: Sentence
    places: list[GuidePlace] = Field(default=[], max_length=6)

    @model_validator(mode="after")
    def _ids(self) -> StartHere:
        _unique_steps(self.steps)
        return self


class ResultsDay(ApiModel):
    """What results mean and what to do next: Home's card for `weeks` weeks from each results date on the calendar
    (an event whose title contains `event_title`), and /results-day."""

    title: Label
    intro: Sentence
    event_title: Label
    weeks: int = Field(ge=1, le=12)
    steps: list[GuideStep] = Field(min_length=1, max_length=20)
    sources_intro: Sentence  # above the University's own pages (Site settings' regulations and results links)

    @model_validator(mode="after")
    def _ids(self) -> ResultsDay:
        _unique_steps(self.steps)
        return self


class Electives(ApiModel):
    """/career/electives: the Year 3 electives side by side, built from the modules and Career Navigator."""

    title: Label
    intro: Sentence
    pick: int = Field(ge=1, le=6)  # how many of the electives a student takes
    disclaimer: Sentence


class GuidesDoc(ApiModel):
    start_here: StartHere
    results_day: ResultsDay
    electives: Electives


class GuidesEditable(ApiModel):
    """The guides for their editors, with the version a save must name (0 until the first save)."""

    data: GuidesDoc
    version: int
    updated_at: datetime | None
    updated_by: UserPublic | None


class GuidesSave(ApiModel):
    """PUT /guides: every guide, and the version they were edited from."""

    version: int = Field(ge=0)
    data: GuidesDoc
