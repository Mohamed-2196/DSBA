"""The pure parts: Sudoku's generator and solver, the word game's marks, streaks and the day's choices."""

from __future__ import annotations

import datetime as dt
import random
import uuid

import pytest

from app.services.daily import content
from app.services.daily.games.word import marks
from app.services.daily.streaks import streak_of
from app.services.daily.sudoku_engine import TARGET_GIVENS, Difficulty, count_solutions, generate, logic_level, solve

D = dt.date


@pytest.mark.parametrize("difficulty", ["easy", "medium", "hard"])
def test_sudoku_puzzles_have_one_solution_at_their_difficulty(difficulty: Difficulty) -> None:
    for seed in range(3):
        puzzle, solution = generate(random.Random(seed), difficulty)
        assert count_solutions(puzzle) == 1
        assert solve(puzzle) == solution
        assert all(p in (0, s) for p, s in zip(puzzle, solution, strict=True))
        assert 81 - puzzle.count(0) <= TARGET_GIVENS[difficulty] + 4
        if difficulty == "easy":
            assert logic_level(puzzle) == "singles"
        if difficulty == "medium":
            assert logic_level(puzzle) in ("singles", "hidden")


def test_sudoku_generation_is_repeatable() -> None:
    assert generate(random.Random(7), "medium") == generate(random.Random(7), "medium")


def test_a_grid_with_two_solutions_is_counted_as_two() -> None:
    _, solution = generate(random.Random(1), "easy")
    assert count_solutions([0] * 81) == 2
    assert count_solutions(solution) == 1


def test_marks_use_each_letter_of_the_answer_once() -> None:
    assert marks("TREND", "TREND") == ["hit"] * 5
    assert marks("SPEED", "STEEP") == ["hit", "near", "hit", "hit", "miss"]
    assert marks("EERIE", "THREE") == ["near", "miss", "hit", "miss", "hit"]
    assert marks("LLAMA", "MODEL") == ["near", "miss", "miss", "near", "miss"]


def test_streaks_count_days_in_a_row_and_a_freeze_covers_one_missed_day_a_week() -> None:
    today = D(2026, 10, 14)  # a Wednesday; the week started on Sunday the 11th
    run = {D(2026, 10, 12), D(2026, 10, 13), D(2026, 10, 14)}
    s = streak_of(run, today)
    assert (s.current, s.best, s.played_today, s.freeze_ready, s.frozen_days) == (3, 3, True, True, [])
    # Not played yet today: the streak still stands on yesterday.
    assert streak_of(run - {today}, today).current == 2
    # A missed Monday is frozen, and this week's freeze is gone.
    s = streak_of({D(2026, 10, 10), D(2026, 10, 11), D(2026, 10, 13), D(2026, 10, 14)}, today)
    assert (s.current, s.frozen_days, s.freeze_ready) == (4, [D(2026, 10, 12)], False)
    # Two missed days in one week break it.
    s = streak_of({D(2026, 10, 11), D(2026, 10, 14)}, today)
    assert (s.current, s.best) == (1, 1)
    # A freeze that nothing played comes before doesn't count.
    assert streak_of(set(), today).frozen_days == []


def _schedule(*themes: tuple[str, int, bool], pinned: dict[dt.date, str] | None = None) -> content.Schedule:
    infos = {t: content.ThemeInfo(t, t.title(), "", position, rotating) for t, position, rotating in themes}
    return content.Schedule(infos, dict(pinned or {}))


def test_themes_take_turns_by_the_week_from_sunday() -> None:
    plan = _schedule(("a", 0, True), ("b", 1, True), ("c", 2, True))
    sunday = D(2026, 10, 11)
    assert content.week_start(D(2026, 10, 17)) == sunday
    assert plan.theme_id(sunday) == plan.theme_id(D(2026, 10, 17))
    assert [plan.theme_id(content.EPOCH + w * content.WEEK) for w in range(6)] == ["a", "b", "c", "a", "b", "c"]


def test_a_week_given_a_theme_runs_it_and_the_rotation_carries_on_after_it() -> None:
    weeks = [content.EPOCH + w * content.WEEK for w in range(7)]
    plan = _schedule(("a", 0, True), ("b", 1, True), ("c", 2, True), ("exams", 3, False), pinned={weeks[2]: "a"})
    assert [plan.theme_id(w) for w in weeks] == ["a", "b", "a", "b", "c", "a", "b"]
    # A theme out of the rotation runs on its week; the rotation goes on with the theme after its place.
    plan = _schedule(("a", 0, True), ("b", 1, True), ("exams", 1, False), ("c", 2, True), pinned={weeks[1]: "exams"})
    assert [plan.theme_id(w) for w in weeks[:4]] == ["a", "exams", "c", "a"]
    with pytest.raises(content.NoThemeError):
        _schedule(("a", 0, False)).theme_id(weeks[0])


def _entries(n: int) -> list[content.Entry]:
    return [content.Entry(uuid.UUID(int=i + 1), "a", {"n": i}) for i in range(n)]


def test_items_that_never_ran_come_first_then_those_that_ran_longest_ago() -> None:
    pool = _entries(6)
    seed = b"test"
    day = D(2026, 10, 20)
    ran: content.Uses = {e.id: [day - dt.timedelta(days=10 + e.data["n"])] for e in pool[:4]}
    two = content.spread(pool, ran, day, 2, "test", seed)
    assert {e.data["n"] for e in two} == {4, 5}  # never ran
    used = {**ran, pool[4].id: [day - dt.timedelta(days=1)], pool[5].id: [day - dt.timedelta(days=2)]}
    assert [e.data["n"] for e in content.spread(pool, used, day, 2, "test", seed)] == [3, 2]  # longest ago first
    # A day that is made late keeps away from the days after it too.
    assert content.spread(pool, {pool[0].id: [day + dt.timedelta(days=1)]}, day, 6, "test", seed)[-1] == pool[0]


def test_a_pool_runs_through_before_anything_repeats_and_ties_follow_the_seed() -> None:
    pool = _entries(7)
    used: content.Uses = {}
    days = [D(2026, 10, 1) + dt.timedelta(days=n) for n in range(14)]
    picked = []
    for day in days:
        (entry,) = content.spread(pool, used, day, 1, "test", b"seed")
        used.setdefault(entry.id, []).append(day)
        picked.append(entry.data["n"])
    assert sorted(picked[:7]) == list(range(7))
    assert sorted(picked[7:]) == list(range(7))
    assert content.spread(pool, {}, days[0], 3, "test", b"seed") == content.spread(
        pool, {}, days[0], 3, "test", b"seed"
    )
    orders = {tuple(e.data["n"] for e in content.spread(pool, {}, days[0], 7, "test", s)) for s in (b"x", b"y", b"z")}
    assert len(orders) > 1
    with pytest.raises(content.NotReadyError):
        content.spread(pool, {}, days[0], 8, "test", b"seed")
