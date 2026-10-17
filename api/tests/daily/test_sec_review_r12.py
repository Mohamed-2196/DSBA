"""The round 12 security review's findings for Daily, all fixed and tested here as regressions: the play's flow
(SEC-41's answers and clock, SEC-45), the content half of SEC-41 (no answer bank in the repository, the quiz's options
in each day's order) and SEC-46 (kept puzzles survive a new secret key)."""

from __future__ import annotations

import datetime as dt
import os
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.time import bahrain_today
from app.models import DailyPlay, User
from app.services.daily import content
from app.services.daily.games import GAMES
from app.services.daily.games.nearest import NearestGame
from app.services.daily.games.word import WordGame
from tests.daily.conftest import API

APP = Path(__file__).resolve().parents[2] / "app"
DAILY_SEED = APP / "seed" / "data" / "daily"

ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]


def today() -> str:
    return bahrain_today().isoformat()


def yesterday() -> str:
    return (bahrain_today() - dt.timedelta(days=1)).isoformat()


def move(c: TestClient, game: str, body: dict[str, Any] | None, day: str | None = None, **extra: Any) -> Any:
    return c.post(f"{API}/daily/{day or today()}/{game}/moves", json={"move": body, **extra})


def answer_of(db: Session, day: dt.date) -> str:
    word: str = GAMES["word"].puzzle(db, day, "").answer
    return word


# ── SEC-41: the play's flow ───────────────────────────────────────────────────────────────────────


def test_sec41_a_guest_play_of_todays_set_shows_no_answer(client_for: ClientFor, db: Session) -> None:
    guest = client_for()
    # Today: a guest's give-up shows nothing the player didn't find.
    assert move(guest, "word", {"kind": "give-up"}).json()["play"]["view"]["answer"] is None
    assert move(guest, "nearest", {"kind": "give-up"}).json()["play"]["view"]["answer"] is None
    groups = move(guest, "groups", {"kind": "give-up"}).json()["play"]["view"]
    assert (groups["found"], len(groups["words"])) == ([], 16)
    search = move(guest, "search", {"kind": "give-up"}).json()["play"]["view"]
    assert search["found"] == []
    sudoku = move(guest, "sudoku", {"kind": "give-up"}, variant="easy").json()["play"]
    assert (sudoku["status"], sudoku["view"]["filled"]) == ("lost", [0] * 81)
    # The games' feedback is the game, for guests too (Mohamed, 2026-10-17): a wrong quiz answer shows the right one.
    questions = GAMES["quiz"].puzzle(db, bahrain_today(), "")
    wrong = (questions[0].answer + 1) % len(questions[0].options)
    answered = move(guest, "quiz", {"kind": "answer", "choice": wrong}).json()["play"]["view"]["answered"][0]
    assert (answered["correct"], answered["answer"]) == (False, questions[0].answer)
    # Past days are practice: they show their answers to anyone.
    past = move(guest, "word", {"kind": "give-up"}, day=yesterday()).json()["play"]["view"]
    assert past["answer"] == answer_of(db, bahrain_today() - dt.timedelta(days=1))


def test_sec41_signed_in_the_answer_shows_once_the_play_is_over(client_for: ClientFor, make_user: MakeUser) -> None:
    c = client_for(make_user())
    view = move(c, "word", {"kind": "give-up"}).json()["play"]["view"]
    assert isinstance(view["answer"], str)


def test_sec41_the_clock_starts_when_todays_puzzle_is_first_opened(
    client_for: ClientFor, make_user: MakeUser, db: Session
) -> None:
    user = make_user()
    c = client_for(user)
    opened = c.get(f"{API}/daily/{today()}/word").json()["play"]
    assert (opened["status"], opened["scored"]) == ("new", True)
    row = db.scalars(select(DailyPlay).where(DailyPlay.user_id == user.id, DailyPlay.game == "word")).one()
    assert (row.status, row.scored, row.moves) == ("new", True, [])
    # Opening it again keeps the first clock; the hub shows it as not started.
    c.get(f"{API}/daily/{today()}/word")
    assert len(db.scalars(select(DailyPlay).where(DailyPlay.user_id == user.id)).all()) == 1
    card = next(g for g in c.get(f"{API}/daily").json()["games"] if g["info"]["id"] == "word")
    assert (card["status"], card["scored"]) == ("new", True)
    # Opening a Sudoku difficulty doesn't choose it, and past days and guests keep nothing.
    c.get(f"{API}/daily/{today()}/sudoku", params={"variant": "hard"})
    c.get(f"{API}/daily/{yesterday()}/word")
    client_for().get(f"{API}/daily/{today()}/word")
    assert len(db.scalars(select(DailyPlay)).all()) == 1


def test_sec41_a_one_move_win_straight_away_is_too_fast(
    client_for: ClientFor, make_user: MakeUser, db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    player = make_user(name="Quick Fingers")
    c = client_for(player)
    assert c.put(f"{API}/daily/me", json={"showOnBoard": True}).status_code == 200
    answer = answer_of(db, bahrain_today())
    c.get(f"{API}/daily/{today()}/word")
    play = move(c, "word", {"kind": "guess", "word": answer}).json()["play"]
    assert (play["status"], play["scored"], play["tooFast"], play["points"]) == ("won", True, True, 0)
    assert client_for().get(f"{API}/daily/leaderboard").json()["rows"] == []
    # Nearest Neighbour's first-guess win is held to the same.
    target = GAMES["nearest"].puzzle(db, bahrain_today(), "").target
    play = move(c, "nearest", {"kind": "guess", "word": target}).json()["play"]
    assert (play["status"], play["tooFast"], play["points"]) == ("won", True, 0)
    # At a person's pace, the same win scores.
    monkeypatch.setattr(WordGame, "min_seconds", 0)
    monkeypatch.setattr(NearestGame, "min_seconds", 0)
    other = client_for(make_user())
    assert move(other, "word", {"kind": "guess", "word": answer}).json()["play"]["points"] == 100


# ── SEC-41: the content ───────────────────────────────────────────────────────────────────────────


def test_sec41_the_repository_holds_no_answers_and_the_quiz_shuffles_its_options(db: Session) -> None:
    # The puzzles live in the database (Manage, or a content file kept out of the repository); the repository's Daily
    # data is the themes and a public word list, and no answer bank is left anywhere in the app.
    assert sorted(p.name for p in DAILY_SEED.iterdir()) == ["guesses.txt", "themes.json"]
    banks = ("quiz.json", "groups.json", "words.json", "search.json", "nearest.json", "nearest_ranks.json")
    assert not [p for name in banks for p in APP.rglob(name)]
    # A question's right option moves from day to day: its stored order gives nothing away.
    places = {
        q.answer for n in range(8) for q in GAMES["quiz"].puzzle(db, content.FIRST_DAY + dt.timedelta(days=n), "")[:-1]
    }
    assert len(places) > 1


# ── SEC-45 ────────────────────────────────────────────────────────────────────────────────────────


@pytest.fixture
def raw_client(app: FastAPI) -> Iterator[TestClient]:
    """A guest's browser that gets a 500 instead of the exception."""
    with TestClient(app, raise_server_exceptions=False) as c:
        c.get(f"{API}/auth/csrf")
        c.headers["X-CSRF-Token"] = c.cookies.get("dsba_csrf") or ""
        yield c


def test_sec45_crafted_guest_histories_and_months_are_refused(raw_client: TestClient, db: Session) -> None:
    # A sixth answer to a five-question quiz: the play was over after the fifth.
    sixth = [{"kind": "answer", "choice": 0}] * 6
    r = raw_client.post(f"{API}/daily/{today()}/quiz/moves", json={"history": sixth})
    assert (r.status_code, r.json()["error"]["code"]) == (409, "game_over")
    # A hint after the Sudoku is full.
    puzzle = GAMES["sudoku"].puzzle(db, bahrain_today(), "easy")
    filled = [{"kind": "place", "cell": i, "digit": puzzle.solution[i]} for i in range(81) if not puzzle.givens[i]]
    r = raw_client.post(
        f"{API}/daily/{today()}/sudoku/moves", json={"variant": "easy", "history": [*filled, {"kind": "hint"}]}
    )
    assert (r.status_code, r.json()["error"]["code"]) == (409, "game_over")
    # More moves than the game takes.
    eight = [{"kind": "guess", "word": "CRANE"}] * 8
    r = raw_client.post(f"{API}/daily/{today()}/word/moves", json={"history": eight})
    assert (r.status_code, r.json()["error"]["code"]) == (409, "game_over")
    # Months in years without puzzles.
    for month in ("9999-12", "0001-01", "2025-12"):
        r = raw_client.get(f"{API}/daily/calendar", params={"month": month})
        assert (r.status_code, r.json()["error"]["fields"]) == (422, {"month": "There are no puzzles in that year."})


# ── SEC-46 ────────────────────────────────────────────────────────────────────────────────────────


def test_sec46_rotating_the_secret_key_leaves_kept_puzzles_and_finished_plays_as_they_are(
    client_for: ClientFor, make_user: MakeUser, db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Each day's puzzles are kept the first time they're made, and Daily seeds its choices with a key of its own
    # (daily_seed), so a new DSBA_SECRET_KEY changes nothing that's out.
    monkeypatch.setattr(WordGame, "min_seconds", 0)  # the clock isn't what this is about
    c = client_for(make_user())
    answer = answer_of(db, bahrain_today())
    sudoku = GAMES["sudoku"].puzzle(db, bahrain_today(), "easy")
    won = move(c, "word", {"kind": "guess", "word": answer}).json()["play"]
    assert (won["status"], won["scored"], won["points"]) == ("won", True, 100)

    old = os.environ["DSBA_SECRET_KEY"]
    try:
        os.environ["DSBA_SECRET_KEY"] = f"a-new-secret-after-a-leak-{'x' * 24}"
        get_settings.cache_clear()
        assert answer_of(db, bahrain_today()) == answer
        assert GAMES["sudoku"].puzzle(db, bahrain_today(), "easy") == sudoku
        kept = c.get(f"{API}/daily/{today()}/word").json()["play"]
        assert (kept["status"], kept["scored"], kept["points"], kept["view"]["answer"]) == ("won", True, 100, answer)
        c.get(f"{API}/auth/csrf")
        c.headers["X-CSRF-Token"] = c.cookies.get("dsba_csrf") or ""
        again = move(c, "word", {"kind": "guess", "word": "CRANE"})
        assert (again.status_code, again.json()["error"]["code"]) == (409, "game_over")
    finally:
        os.environ["DSBA_SECRET_KEY"] = old
        get_settings.cache_clear()
