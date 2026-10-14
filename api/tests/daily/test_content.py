"""The content in app/services/daily/data: shapes, rules, and a year of daily puzzles that all build."""

from __future__ import annotations

import datetime as dt
import json
import re
from collections import Counter

from sqlalchemy.orm import Session

from app.services.daily import content
from app.services.daily.games import GAMES
from app.services.daily.games.groups import SIZE
from app.services.daily.games.groups import bank as groups_bank
from app.services.daily.games.nearest import RANKS_FILE, compute_ranks
from app.services.daily.games.quiz import bank as quiz_bank
from app.services.daily.games.search import SIZE as GRID
from app.services.daily.games.search import bank as search_bank
from app.services.daily.games.word import answers, guesses

THEMES = {t.id for t in content.themes()}
LETTERS = re.compile(r"^[A-Z]+$")


def test_every_theme_has_content_for_every_game() -> None:
    assert set(answers()) == THEMES
    assert set(groups_bank()) == THEMES
    assert set(search_bank()) == THEMES
    assert set(quiz_bank()) == THEMES
    assert set(json.loads((content.DATA / "nearest.json").read_text())["targets"]) == THEMES


def test_word_answers_are_five_letters_unique_and_guessable() -> None:
    every = [w for words in answers().values() for w in words]
    assert all(len(w) == 5 and LETTERS.match(w) for w in every)
    assert not [w for w, n in Counter(every).items() if n > 1]
    assert all(len(words) >= 30 for words in answers().values())
    assert len(guesses()) > 10000


def test_groups_hold_four_or_more_words_and_no_word_twice_in_a_theme() -> None:
    ids = Counter(g["id"] for g in content.load("groups.json"))
    assert max(ids.values()) == 1
    for theme, groups in groups_bank().items():
        assert len(groups) >= 12, theme
        assert {g.level for g in groups} == {1, 2, 3, 4}
        words = Counter(w for g in groups for w in g.words)
        assert not [w for w, n in words.items() if n > 1], theme
        assert all(len(g.words) >= SIZE and all(LETTERS.match(w) and len(w) <= 12 for w in g.words) for g in groups)


def test_search_words_fit_the_grid() -> None:
    for theme, words in search_bank().items():
        assert len(words) >= 16, theme
        assert all(LETTERS.match(w) and 4 <= len(w) <= GRID for w in words)


def test_quiz_questions_have_one_right_answer_among_their_options() -> None:
    raw = content.load("quiz.json")
    assert len({q["id"] for q in raw}) == len(raw)
    for theme, questions in quiz_bank().items():
        assert len(questions) >= 16, theme
        for q in questions:
            assert len(set(q.options)) == len(q.options) == 4, q.prompt
            assert 0 <= q.answer < 4
            assert q.explain


def test_nearest_vocabulary_is_consistent_and_its_ranks_are_up_to_date() -> None:
    data = content.load("nearest.json")
    tags = set(data["tags"])
    for word, entry in data["words"].items():
        assert re.match(r"^[a-z]+$", word)
        assert set(entry["tags"]) <= tags, word
        assert 3 <= len(entry["tags"]) <= 8, word
        assert set(entry.get("near", [])) <= set(data["words"]), word
    targets = [t for ts in data["targets"].values() for t in ts]
    assert set(targets) <= set(data["words"])
    assert len(set(targets)) == len(targets)
    assert content.load(RANKS_FILE) == compute_ranks(data), "run: python -m app.cli daily-neighbours"


def test_a_year_of_daily_puzzles_builds(db: Session) -> None:
    for n in range(0, 370, 5):
        day = content.FIRST_DAY + dt.timedelta(days=n)
        for game in GAMES.values():
            for variant in game.variants:
                if game.id == "sudoku" and n % 30:
                    continue  # Sudoku is slower to make; its engine has its own tests
                puzzle = game.puzzle(db, day, variant)
                assert puzzle == game.puzzle(db, day, variant)
                game.view(puzzle, game.start(puzzle), over=True)
