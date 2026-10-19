"""When a revision plan's cards fall: the days from today to the day before the exam, with a cap on each day's load.

- The last week before the exam (or every day, when there's less than a week) has a past paper a day, as long as
  there are papers: practice under time is what that week is for.
- Before it, the plan's other papers (one every `paper_every` days, papers_wanted()) are evenly spaced.
- Lessons fill the days around them, as evenly as they fit: a day holds DAY_LOAD, a lesson weighs LESSON_LOAD and a
  paper (sat, then marked with its examiners' report) PAPER_LOAD. Lessons go before the last week first.
- What doesn't fit gets no day: it stays on the board, undated, rather than piling up seven videos on one day.

Pure, so it is unit-tested (tests/board/test_schedule.py). cards.plan_dates() runs days_for() whenever a board is
read, so a student who falls behind sees the rest spread again; plans.make_plan() runs it to decide how many lessons
fit."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Literal

PlanKind = Literal["lesson", "paper"]

FINAL_DAYS = 7  # the last week: a paper a day
LESSON_LOAD = 1
PAPER_LOAD = 2  # about three hours: two of sitting it, one of marking it
DAY_LOAD = 4  # four videos, or a paper and two videos


def final_days(days: int) -> int:
    """How many of the `days` left are the last week."""
    return max(0, min(FINAL_DAYS, days))


def papers_wanted(days: int, paper_every: int) -> int:
    """How many papers a plan with `days` left holds: one every `paper_every` days before the last week, and one a day
    in it."""
    if days <= 0:
        return 0
    final = final_days(days)
    return (days - final) // max(1, paper_every) + final


def _even(caps: Sequence[int], n: int) -> list[int]:
    """`n` lessons over days that hold `caps` lessons each, as evenly as the caps allow: every day gets up to the
    same number, and the last of them go to evenly spaced days. Days get their whole cap when `n` doesn't fit."""
    total = sum(caps)
    if n >= total:
        return list(caps)
    if n <= 0:
        return [0] * len(caps)
    level = 1
    while sum(min(c, level) for c in caps) < n:
        level += 1
    counts = [min(c, level - 1) for c in caps]
    rest = n - sum(counts)
    room = [i for i, c in enumerate(caps) if c >= level]
    for k in range(rest):
        counts[room[k * len(room) // rest]] += 1
    return counts


def days_for(kinds: Sequence[PlanKind], days: int) -> list[int | None]:
    """The day (0 is today) each card falls on, in the order given: papers in their order, lessons in theirs. None
    for a card that doesn't fit before the exam, and for every card on the exam day or after it."""
    out: list[int | None] = [None] * len(kinds)
    if days <= 0:
        return out
    papers = [i for i, k in enumerate(kinds) if k == "paper"]
    lessons = [i for i, k in enumerate(kinds) if k == "lesson"]
    final = final_days(days)
    before = days - final

    # Papers: the last ones a day each up to the exam, the ones before them evenly spaced before the last week; the
    # first (oldest sittings) go undated when there are more than days for them.
    in_final = min(len(papers), final)
    in_before = min(len(papers) - in_final, before)
    skipped = len(papers) - in_final - in_before
    paper_day = [False] * days
    for j, i in enumerate(papers[skipped : skipped + in_before]):
        day = (j + 1) * before // (in_before + 1) if in_before < before else j
        out[i] = day
        paper_day[day] = True
    for j, i in enumerate(papers[skipped + in_before :]):
        day = days - in_final + j
        out[i] = day
        paper_day[day] = True

    # Lessons: as evenly as they fit before the last week, then in it.
    caps = [(DAY_LOAD - (PAPER_LOAD if paper_day[d] else 0)) // LESSON_LOAD for d in range(days)]
    first = _even(caps[:before], len(lessons))
    then = _even(caps[before:], len(lessons) - sum(first))
    per_day = first + then
    queue = iter(lessons)
    for day, count in enumerate(per_day):
        for _ in range(count):
            out[next(queue)] = day
    return out


def lesson_room(papers: int, days: int) -> int:
    """How many lessons fit beside `papers` papers in the `days` left."""
    if days <= 0:
        return 0
    paper: list[PlanKind] = ["paper"]
    lesson: list[PlanKind] = ["lesson"]
    probe = paper * papers + lesson * (days * DAY_LOAD)
    return sum(1 for k, d in zip(probe, days_for(probe, days), strict=True) if k == "lesson" and d is not None)
