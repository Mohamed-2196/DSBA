"""The grades calculator's rules: the subjects in its order and what each counts in the classification, the mark
bands, what each class needs, and the modules a student chooses between. Admins edit them in Manage → Grades
calculator; the calculator applies them in the browser (students' marks never reach the server). Their starting
content is app/seed/data/grades.json, today's programme regulations.

A subject counts as 1, 2 or 3 classification marks, or "average": the subjects marked "average" are averaged together
(once every one has a mark) and their average counts as `average_counts` marks. A classification mark under the
Third band's floor means a resit. A class is given by `needed` marks in its band or a higher one, or by `fewer` of
them with an average classification mark of at least the class's average."""

from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime
from typing import Annotated, Literal

from pydantic import Field, StringConstraints, model_validator
from pydantic_core import PydanticCustomError

from app.schemas.common import ApiModel, UserPublic, Year

ItemId = Annotated[str, StringConstraints(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", min_length=1, max_length=64)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
Mark = Annotated[int, Field(ge=1, le=100)]
ChoiceSlot = Literal["year2Option", "elective1", "elective2"]


class GradeSubject(ApiModel):
    id: ItemId  # the browser keeps a student's marks by it
    name: Name  # shown when there is no module, and for a choice before it's made ('Elective 1')
    year: Year
    module_id: ItemId | None = None  # its module: the calculator shows the module's unit code and name
    choice: ChoiceSlot | None = None  # a module the student picks from the options (no module_id then)
    counts: Literal["average", 1, 2, 3]


class GradeOption(ApiModel):
    """A module a student may pick for a choice."""

    id: ItemId
    module_id: ItemId | None = None
    label: Name | None = None  # for an option with no module in the hub ('Abstract Mathematics')


class GradeBand(ApiModel):
    floor: Mark  # the lowest mark of the band
    gpa: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20)]  # US GPA, approx.


class GradeBands(ApiModel):
    first: GradeBand
    upper: GradeBand
    lower: GradeBand
    third: GradeBand  # under its floor is a fail


class ClassAverages(ApiModel):
    """With `fewer` marks (not `needed`) in a class's band, the average classification mark a class asks for."""

    first: Mark
    upper: Mark
    lower: Mark


def _unique(ids: Iterable[str], what: str) -> None:
    seen: set[str] = set()
    for i in ids:
        if i in seen:
            raise PydanticCustomError("duplicate", "Two {what} have the same id “{id}”.", {"what": what, "id": i})
        seen.add(i)


class GradeRules(ApiModel):
    subjects: list[GradeSubject] = Field(min_length=1, max_length=24)
    average_counts: int = Field(ge=1, le=6)  # what the averaged subjects' average counts as
    bands: GradeBands
    needed: int = Field(ge=1, le=60)  # marks in a class's band, or a higher one, that give the class
    fewer: int = Field(ge=1, le=60)  # with this many (and fewer than `needed`), the average decides
    averages: ClassAverages
    # What Third Class Honours needs, in the regulations' words (the calculator checks `needed` marks of a pass).
    third_rule: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    # Where the rules are, beside the link to the programme regulations: 'regulations 8.7 and 8.8'.
    regulations: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
    year2_options: list[GradeOption] = Field(max_length=12)
    electives: list[GradeOption] = Field(max_length=24)

    @model_validator(mode="after")
    def _consistent(self) -> GradeRules:
        _unique((s.id for s in self.subjects), "subjects")
        _unique((o.id for o in self.year2_options), "Year 2 options")
        _unique((o.id for o in self.electives), "electives")
        b = self.bands
        if not b.first.floor > b.upper.floor > b.lower.floor > b.third.floor:
            raise PydanticCustomError("bands", "Each band starts above the next one down: First, 2:1, 2:2, Third.")
        if self.fewer > self.needed:
            raise PydanticCustomError(
                "fewer", "The smaller number of marks can't be more than the marks a class needs."
            )
        if self.needed > self.total_marks():
            raise PydanticCustomError(
                "needed",
                "A class can't need more marks than the subjects give: {total} in all.",
                {"total": self.total_marks()},
            )
        slots = [s.choice for s in self.subjects if s.choice]
        if len(set(slots)) != len(slots):
            raise PydanticCustomError("choice", "Each choice is made in one subject only.")
        for s in self.subjects:
            if s.choice and s.module_id:
                raise PydanticCustomError(
                    "choice", "A subject is a module or a choice, not both: “{name}”.", {"name": s.name}
                )
        if "year2Option" in slots and not self.year2_options:
            raise PydanticCustomError("choice", "Add the modules a student may pick for their Year 2 option.")
        if ("elective1" in slots or "elective2" in slots) and len(self.electives) < 2:
            raise PydanticCustomError("choice", "Add at least two electives a student may pick.")
        for o in [*self.year2_options, *self.electives]:
            if not o.module_id and not o.label:
                raise PydanticCustomError("option", "Give an option without a module a name.")
        return self

    def total_marks(self) -> int:
        """Classification marks when every subject has one."""
        averaged = any(s.counts == "average" for s in self.subjects)
        return (self.average_counts if averaged else 0) + sum(s.counts for s in self.subjects if s.counts != "average")

    def module_refs(self) -> list[str]:
        return [m for m in (*(s.module_id for s in self.subjects), *(o.module_id for o in self.options())) if m]

    def options(self) -> list[GradeOption]:
        return [*self.year2_options, *self.electives]


class GradeRulesEditable(ApiModel):
    data: GradeRules
    version: int  # 0 until the first save
    updated_at: datetime | None
    updated_by: UserPublic | None


class GradeRulesSave(ApiModel):
    """PUT /grades/rules: the rules, and the version they were edited from."""

    version: int = Field(ge=0)
    data: GradeRules
