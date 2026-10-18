"""Site settings: the hub's own words and links, in one document that admins save as a whole (PUT /site). The links to
BIBF's and the University's sites, the About page, the footer, the people who made the hub and the students who shared
their notes, Home's blocks for a student who hasn't arranged their own, the steps of the tour, and search's nicknames
for modules and its suggested searches. Its starting content is app/seed/data/site.json.

Links to other sites are https://. The modules a student shared notes for are module ids, and must exist."""

from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, Field, StringConstraints, model_validator
from pydantic_core import PydanticCustomError

from app.schemas.auth import MAX_HOME_BLOCKS, HomeBlock
from app.schemas.common import ApiModel, UserPublic
from app.schemas.links import MARKUP, SiteUrl

ItemId = Annotated[str, StringConstraints(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", min_length=1, max_length=64)]
ModuleId = Annotated[str, StringConstraints(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", min_length=1, max_length=64)]
Label = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
Line = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Sentence = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]
Markdown = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000), MARKUP]


class SiteLink(ApiModel):
    """A link to another site, as the hub names it."""

    label: Label  # 'BIBF MyClass'
    note: Line  # what it's for, under the label on About: 'Lecture slides, announcements and coursework'
    url: SiteUrl


class SiteLinks(ApiModel):
    myclass: SiteLink  # BIBF's MyClass: the sidebar shows its logo beside the label
    uol_portal: SiteLink  # the University of London's student portal: the sidebar shows the University's logo
    regulations: SiteLink  # this year's programme regulations: the grades calculator and Results day cite them
    results: SiteLink  # the University's exam entry and results page: Results day


class SiteContributor(ApiModel):
    """Someone who built the hub or supplied its materials: in the footer and on About, in this order."""

    id: ItemId
    name: Name
    role: Line | None = None  # what they contributed; None until it's agreed
    affiliation: Line | None = None
    url: SiteUrl | None = None  # their own page


class NoteCredit(ApiModel):
    """A student who shared their notes, and the modules the notes are for. About credits them by name, each module
    linking to its notes in the library."""

    id: ItemId
    name: Name
    modules: list[ModuleId] = Field(min_length=1, max_length=16)


def _lowered(value: str) -> str:
    """A word as search compares it: lower case."""
    return value.lower()


class TourStep(ApiModel):
    """A step of the tour a new student may take ("Take the tour" in the year prompt). Text between `backticks` shows
    as a key to press, and {mod} as the platform's key: ⌘ on a Mac, Ctrl elsewhere."""

    id: ItemId
    art: Literal["search", "library", "forum"]  # the illustration beside it
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]


class SearchNickname(ApiModel):
    """A word students type for modules: search also finds the modules with a word of their name starting with
    `finds` ('stats' finds every module named "… statistics …")."""

    id: ItemId
    word: Annotated[
        str, StringConstraints(strip_whitespace=True, pattern=r"^[A-Za-z0-9]{1,20}$"), AfterValidator(_lowered)
    ]
    finds: Annotated[
        str,
        StringConstraints(strip_whitespace=True, pattern=r"^[A-Za-z0-9]+(?: [A-Za-z0-9]+)*$", max_length=40),
        AfterValidator(_lowered),
    ]


def _unique(ids: Iterable[str], what: str) -> None:
    seen: set[str] = set()
    for i in ids:
        if i in seen:
            raise PydanticCustomError("duplicate", f"Two {what} have the same id “{i}”.")
        seen.add(i)


class SiteDoc(ApiModel):
    tagline: Sentence  # the footer's line: who makes the hub
    about_intro: Sentence  # under About's title
    about: Markdown  # About's "What it is"; the hub's own numbers follow it
    links: SiteLinks
    contributors: list[SiteContributor] = Field(max_length=30)
    note_credits: list[NoteCredit] = Field(max_length=60)
    grades_note: Sentence  # under every class the grades calculator works out
    disclaimer: Sentence  # in the footer and on About
    copyright_holder: Name
    launch_year: int = Field(ge=2000, le=2100)  # the footer's © runs from this year to this one
    home_blocks: list[HomeBlock] = Field(min_length=1, max_length=MAX_HOME_BLOCKS)  # Home before a student arranges it
    tour: list[TourStep] = Field(min_length=1, max_length=5)
    search_nicknames: list[SearchNickname] = Field(max_length=40)
    search_suggestions: list[Label] = Field(min_length=1, max_length=6)  # in search before anything is typed

    @model_validator(mode="after")
    def _ids(self) -> SiteDoc:
        _unique((c.id for c in self.contributors), "contributors")
        _unique((n.id for n in self.note_credits), "students who shared notes")
        _unique((t.id for t in self.tour), "steps of the tour")
        _unique((n.id for n in self.search_nicknames), "nicknames")
        if len(set(self.home_blocks)) != len(self.home_blocks):
            raise PydanticCustomError("duplicate", "A block of Home is listed twice.")
        for n in self.note_credits:
            if len(set(n.modules)) != len(n.modules):
                raise PydanticCustomError("duplicate", f"A module is listed twice for {n.name}.")
        return self

    def module_refs(self) -> list[str]:
        return [m for n in self.note_credits for m in n.modules]


class SiteEditable(ApiModel):
    """The document for admins, with the version a save must name (0 until the first save: the starting content)."""

    data: SiteDoc
    version: int
    updated_at: datetime | None
    updated_by: UserPublic | None


class SiteSave(ApiModel):
    """PUT /site: the whole document, and the version it was edited from."""

    version: int = Field(ge=0)
    data: SiteDoc
