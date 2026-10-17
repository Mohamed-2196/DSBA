"""The round 12 security review's findings for Daily. The play's flow (SEC-41's answers and clock, SEC-45) is fixed
and tested here as regressions. The proofs left (SEC-41's answer banks, SEC-46) still pass while those problems are
there; they belong to the move of the puzzles' content into the database."""

from __future__ import annotations

import datetime as dt
import json
import os
from collections.abc import Callable, Iterator
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
from app.services.daily.games.quiz import QuizGame
from app.services.daily.games.word import WordGame
from tests.daily.conftest import API

ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]


def today() -> str:
    return bahrain_today().isoformat()


def yesterday() -> str:
    return (bahrain_today() - dt.timedelta(days=1)).isoformat()


def move(c: TestClient, game: str, body: dict[str, Any] | None, day: str | None = None, **extra: Any) -> Any:
    return c.post(f"{API}/daily/{day or today()}/{game}/moves", json={"move": body, **extra})


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
    # A wrong quiz answer says it's wrong, but not which one is right; a right one shows as right.
    questions = GAMES["quiz"].puzzle(db, bahrain_today(), "")
    wrong = (questions[0].answer + 1) % len(questions[0].options)
    answered = move(guest, "quiz", {"kind": "answer", "choice": wrong}).json()["play"]["view"]["answered"][0]
    assert (answered["correct"], answered["answer"], answered["explain"]) == (False, None, None)
    history = [{"kind": "answer", "choice": wrong}]
    second = move(guest, "quiz", {"kind": "answer", "choice": questions[1].answer}, history=history).json()["play"]
    assert second["view"]["answered"][1]["answer"] == questions[1].answer
    # Past days are practice: they show their answers to anyone.
    past = move(guest, "word", {"kind": "give-up"}, day=yesterday()).json()["play"]["view"]
    assert past["answer"] == GAMES["word"].puzzle(db, bahrain_today() - dt.timedelta(days=1), "")


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
    answer = GAMES["word"].puzzle(db, bahrain_today(), "")
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


def test_sec41_quiz_options_come_in_the_days_own_order(client_for: ClientFor, db: Session) -> None:
    bank = {q["question"]: q for q in json.loads((content.DATA / "quiz.json").read_text(encoding="utf-8"))}
    questions = client_for().get(f"{API}/daily/{today()}/quiz").json()["play"]["view"]["questions"]
    served = GAMES["quiz"].puzzle(db, bahrain_today(), "")
    reordered = 0
    for q, kept in zip(questions, served, strict=True):
        listed = bank.get(q["prompt"])
        if listed is None:
            continue  # the question about the hub's modules
        assert sorted(q["options"]) == sorted(listed["options"])
        assert q["options"][kept.answer] == listed["options"][listed["answer"]]  # the right answer moved with it
        reordered += q["options"] != listed["options"]
    assert reordered >= 1


# ── SEC-41: the answer banks (content: still open) ────────────────────────────────────────────────


def test_sec41_the_public_repository_answers_todays_quiz(
    client_for: ClientFor, make_user: MakeUser, monkeypatch: pytest.MonkeyPatch
) -> None:
    # quiz.json is in the public repository: each question's right option can be read off it by its text.
    bank = {q["question"]: q for q in json.loads((content.DATA / "quiz.json").read_text(encoding="utf-8"))}
    monkeypatch.setattr(QuizGame, "min_seconds", 0)  # a person spreads the five answers over five seconds
    c = client_for(make_user())
    questions = c.get(f"{API}/daily/{today()}/quiz").json()["play"]["view"]["questions"]
    from_the_file = 0
    for q in questions:
        listed = bank.get(q["prompt"])
        if q["source"] is not None or listed is None:  # the question about the hub's modules
            choice = 0
        else:
            choice = q["options"].index(listed["options"][listed["answer"]])
            from_the_file += 1
        play = move(c, "quiz", {"kind": "answer", "choice": choice}).json()["play"]
        if listed is not None:
            assert play["view"]["answered"][-1]["correct"] is True
    assert from_the_file >= 4
    assert (play["status"], play["scored"]) == ("won", True)
    assert play["points"] >= 80


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


# ── SEC-46 (content: still open) ──────────────────────────────────────────────────────────────────


def test_sec46_rotating_the_secret_key_reopens_a_finished_scored_play(
    client_for: ClientFor, make_user: MakeUser, db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(WordGame, "min_seconds", 0)  # the clock isn't what this is about
    c = client_for(make_user())
    answer = GAMES["word"].puzzle(db, bahrain_today(), "")
    won = move(c, "word", {"kind": "guess", "word": answer}).json()["play"]
    assert (won["status"], won["scored"], won["points"]) == ("won", True, 100)

    old = os.environ["DSBA_SECRET_KEY"]
    try:
        # DSBA_SECRET_KEY is rotated after a leak: today's word changes under the kept play.
        for n in range(20):
            os.environ["DSBA_SECRET_KEY"] = f"a-new-secret-after-a-leak-{n}-{'x' * 24}"
            get_settings.cache_clear()
            new_answer = GAMES["word"].puzzle(db, bahrain_today(), "")
            if new_answer != answer:
                break
        assert new_answer != answer
        reopened = c.get(f"{API}/daily/{today()}/word").json()["play"]
        assert (reopened["status"], reopened["scored"], reopened["view"]["answer"]) == ("playing", True, None)
        # The CSRF token is bound with the key too: take the new one, then finish the play again.
        c.get(f"{API}/auth/csrf")
        c.headers["X-CSRF-Token"] = c.cookies.get("dsba_csrf") or ""
        again = move(c, "word", {"kind": "guess", "word": new_answer}).json()["play"]
        assert (again["status"], again["scored"], again["points"]) == ("won", True, 90)  # scored a second time
    finally:
        os.environ["DSBA_SECRET_KEY"] = old
        get_settings.cache_clear()
