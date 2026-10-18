"""Mini Noora's words, edited by admins in Manage → Mini Noora and kept as one document (its starting content is
app/seed/data/noora.json):

- the prompt: her instructions and the programme facts she starts from. Her AI reads them before every question,
  followed by rules that always apply and that no edit can remove (app/services/noora/prompt.py, FIXED_RULES). Never
  shown to students.
- the script: what she says when she answers from her script (without her AI, or for a guest), the questions she
  offers on each page, and the starter cards of her full page. Public (GET /mini-noora/script).

Placeholders: in a question she offers, {module} is the module of the page (or else the first module of the student's
year) and {module2} the second module of their year, each by its unit code; in a starter card, {module} is the first
module of the student's year."""

from __future__ import annotations

import re
from collections.abc import Iterable
from datetime import datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, Field, StringConstraints, model_validator
from pydantic_core import PydanticCustomError

from app.schemas.common import ApiModel, UserPublic, placeholders

ItemId = Annotated[str, StringConstraints(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", min_length=1, max_length=64)]
_DATA_TAGS = re.compile(r"<\s*/?\s*(hub_data|student_note)", re.IGNORECASE)


def _no_data_tags(value: str) -> str:
    if _DATA_TAGS.search(value):
        raise PydanticCustomError(
            "data_tags", "Leave out <hub_data> and <student_note>: Noora reads what's inside them as data, not rules."
        )
    return value


Instructions = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=40, max_length=8000), AfterValidator(_no_data_tags)
]
Fact = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=400), AfterValidator(_no_data_tags)
]
Line = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]
Question = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
PageQuestion = Annotated[Question, placeholders(("module", "module2"))]
StarterText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]
# The pages her questions are offered on; 'other' is every page without questions of its own.
NooraPage = Literal["home", "modules", "module", "library", "calendar", "forum", "notes", "grades", "other"]
# The pictures of the starter cards.
StarterIcon = Literal["lightbulb", "teacher", "checklist", "notepad", "exam", "briefcase", "pencil", "magnifier"]


def _unique(ids: Iterable[str], what: str) -> None:
    seen: set[str] = set()
    for i in ids:
        if i in seen:
            raise PydanticCustomError("duplicate", "Two {what} have the same id “{id}”.", {"what": what, "id": i})
        seen.add(i)


class NooraFact(ApiModel):
    id: ItemId
    text: Fact  # 'Each course has a mark out of 100: …'


class NooraPrompt(ApiModel):
    """What her AI reads first: who she is and how she answers, then the facts about the programme."""

    instructions: Instructions
    facts: list[NooraFact] = Field(max_length=40)

    @model_validator(mode="after")
    def _ids(self) -> NooraPrompt:
        _unique((f.id for f in self.facts), "facts")
        return self


class NooraChip(ApiModel):
    """A question she offers. Left out while the feature it needs is off for the student, or when it names a module
    the student has none of."""

    text: PageQuestion  # 'Where are the {module} past papers?'
    needs: Literal["calendar", "library"] | None = None


class NooraPageChips(ApiModel):
    page: NooraPage
    chips: list[NooraChip] = Field(min_length=1, max_length=6)


class NooraStarter(ApiModel):
    """A card of her full page: it fills the question box with `template`, its [part in square brackets] selected."""

    id: ItemId
    icon: StarterIcon
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]
    example: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80), placeholders(("module",))
    ]
    template: Annotated[StarterText, placeholders(("module",))]


class NooraScript(ApiModel):
    """What she says from her script, and what she offers to answer."""

    greeting: Line  # after "Hi Sara!" when her chat opens, and when someone says hello
    greeting_chips: list[Question] = Field(min_length=1, max_length=4)  # after hello, or after saying who she is
    who: Line  # asked who she is or what she can do
    thanks: Line  # thanked
    refusal: Line  # asked to do someone's coursework or exam (she shows where it's taught instead)
    not_found: Line  # nothing in the material matches
    try_instead: list[Question] = Field(min_length=1, max_length=4)  # after not_found
    no_photos: Line  # sent a photo: she can't read pictures
    photo_ask: Line  # after no_photos, when the words with the photo found nothing
    file_guess: Line  # sent a file she can't open, whose name says what it's about
    file_unknown: Line  # sent a file she can't open, whose name says nothing
    welcome: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=400)]  # her full page
    page_chips: list[NooraPageChips] = Field(min_length=1, max_length=9)
    starters: list[NooraStarter] = Field(min_length=4, max_length=8)  # four or eight: whole rows of four or of two

    @model_validator(mode="after")
    def _consistent(self) -> NooraScript:
        pages = [p.page for p in self.page_chips]
        if len(set(pages)) != len(pages):
            raise PydanticCustomError("duplicate", "Each page has one list of questions.")
        if "other" not in pages:
            raise PydanticCustomError("other_page", "Keep the questions for every other page.")
        _unique((s.id for s in self.starters), "starter cards")
        if len(self.starters) % 4:
            raise PydanticCustomError("starters", "Keep four or eight starter cards, so they fill whole rows.")
        return self


class NooraDoc(ApiModel):
    prompt: NooraPrompt
    script: NooraScript


class NooraEditable(ApiModel):
    """The document for admins, with the version a save must name (0 until the first save: the starting content),
    and the rules that always follow her instructions, which no edit removes."""

    data: NooraDoc
    version: int
    updated_at: datetime | None
    updated_by: UserPublic | None
    fixed_rules: str


class NooraSave(ApiModel):
    """PUT /mini-noora/settings: the whole document, and the version it was edited from."""

    version: int = Field(ge=0)
    data: NooraDoc


class NooraPromptPreview(ApiModel):
    """POST /mini-noora/settings/preview: the prompt as her AI would read it, from a draft."""

    prompt: NooraPrompt


class NooraPromptAssembled(ApiModel):
    """What her AI reads before a question: the part that is the same for every question (her instructions, the
    facts, the fixed rules, the hub's pages and its modules) and, as an example, the part about one student's screen
    (Year 2, on Home, today)."""

    stable: str
    screen: str
    tokens: int  # about how many tokens both parts take
