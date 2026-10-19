"""The days a revision plan's cards fall on (services/board/schedule.py)."""

from __future__ import annotations

from collections import Counter

from app.services.board.schedule import DAY_LOAD, PAPER_LOAD, PlanKind, days_for, lesson_room, papers_wanted


def load(kinds: list[PlanKind], days: list[int | None]) -> Counter[int]:
    """Each day's load."""
    out: Counter[int] = Counter()
    for k, d in zip(kinds, days, strict=True):
        if d is not None:
            out[d] += PAPER_LOAD if k == "paper" else 1
    return out


def test_exam_week_is_a_paper_a_day_with_few_lessons() -> None:
    # ST-40: four days out, 27 lessons and plenty of papers
    papers = papers_wanted(4, 3)
    assert papers == 4
    kinds: list[PlanKind] = ["paper"] * papers + ["lesson"] * 27
    days = days_for(kinds, 4)
    assert [d for k, d in zip(kinds, days, strict=True) if k == "paper"] == [0, 1, 2, 3]
    dated = [d for k, d in zip(kinds, days, strict=True) if k == "lesson" and d is not None]
    assert len(dated) == 4 * (DAY_LOAD - PAPER_LOAD)
    assert all(v <= DAY_LOAD for v in load(kinds, days).values())
    assert lesson_room(4, 4) == 8


def test_the_last_paper_is_the_day_before_the_exam_and_nothing_on_the_day() -> None:
    days = days_for(["paper"], 10)
    assert days == [9]
    assert days_for(["lesson", "paper"], 0) == [None, None]


def test_papers_before_the_last_week_are_spaced_and_lessons_spread_evenly() -> None:
    papers = papers_wanted(30, 3)
    assert papers == 23 // 3 + 7
    kinds: list[PlanKind] = ["paper"] * papers + ["lesson"] * 23
    days = days_for(kinds, 30)
    paper_days = [d for k, d in zip(kinds, days, strict=True) if k == "paper"]
    assert paper_days[-7:] == list(range(23, 30))
    early = paper_days[:-7]
    assert all(d is not None and d < 23 for d in early)
    assert len(set(early)) == len(early)
    lesson_days = [d for k, d in zip(kinds, days, strict=True) if k == "lesson"]
    # one lesson a day before the last week: none piled up
    assert sorted(d for d in lesson_days if d is not None) == list(range(23))


def test_lessons_never_pass_the_day_cap() -> None:
    for days in (1, 3, 7, 12, 40):
        kinds: list[PlanKind] = ["paper"] * papers_wanted(days, 2) + ["lesson"] * 200
        got = days_for(kinds, days)
        assert max(load(kinds, got).values()) <= DAY_LOAD
        assert all(d is None or 0 <= d < days for d in got)


def test_few_lessons_over_many_days_are_spaced_out() -> None:
    days = [d for d in days_for(["lesson"] * 3, 60) if d is not None]
    assert days == sorted(set(days))
    assert len(days) == 3
    assert days[0] == 0
    assert days[-1] < 53  # done before the last week


def test_more_papers_than_days_leave_the_oldest_undated() -> None:
    kinds: list[PlanKind] = ["paper"] * 5
    assert days_for(kinds, 3) == [None, None, 0, 1, 2]
