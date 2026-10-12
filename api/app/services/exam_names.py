"""What a past paper's file name says about it: the year it was sat, its zone, and whether it is the examiners'
report rather than the paper itself.

The Drive import (python -m app.cli import-drive) files everything in a module's older-exams folder as a past paper
and reads the rest from each file's name, so the library's year and zone filters work for imported papers too. A
wrong guess is worse than none: a paper filed under the wrong year hides from the students who filter by that year,
while a paper without one still shows when no year is chosen."""

from __future__ import annotations

from typing import Literal, NamedTuple

Zone = Literal["A", "B"]


class ExamMeta(NamedTuple):
    exam_year: int | None  # the year the exam was sat, e.g. 2021
    zone: Zone | None  # the University of London sets each paper twice, for zone A and zone B
    examiners_report: bool  # the examiners' report on the paper, not the paper


def exam_meta_from_name(name: str) -> ExamMeta:
    """'ST2133_2021_ZA.pdf' -> ExamMeta(2021, 'A', False), with None (or False) for what the name doesn't say.

    `name` is the file's name as Drive has it, extension included."""
    # TODO(Mohamed): read the year, the zone and the examiners' report marker from the names the real files use.
    return ExamMeta(exam_year=None, zone=None, examiners_report=False)
