"""The pure parts: Sudoku's generator and solver, the word game's marks, streaks and the day's choices."""

from __future__ import annotations

import datetime as dt
import random

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


def test_themes_take_turns_by_the_week_from_sunday() -> None:
    sunday = D(2026, 10, 11)
    assert content.week_start(D(2026, 10, 17)) == sunday
    assert content.theme_of(sunday) == content.theme_of(D(2026, 10, 17))
    assert content.theme_of(sunday) != content.theme_of(D(2026, 10, 18))
    themes = {content.theme_of(sunday + dt.timedelta(weeks=w)).id for w in range(len(content.themes()))}
    assert len(themes) == len(content.themes())


def test_picks_dont_repeat_until_the_pool_is_used_up() -> None:
    pool = [f"item-{i}" for i in range(14)]
    days = [content.EPOCH + dt.timedelta(days=n) for n in range(400)]
    stats_days = [d for d in days if content.theme_of(d) == content.theme_of(content.EPOCH)][:14]
    picked = [content.pick(pool, "test", d) for d in stats_days]
    assert sorted(picked) == sorted(pool)
    many = content.pick_many(pool, 4, "test", stats_days[0])
    assert len(set(many)) == 4
