"""The round 12 security review's proofs for Daily. Each test passes while the problem it names is still there."""

from __future__ import annotations

import json
import os
from collections.abc import Callable, Iterator
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.time import bahrain_today
from app.models import User
from app.services.daily import content
from app.services.daily.games import GAMES
from app.services.daily.games.quiz import QuizGame
from tests.daily.conftest import API

ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]


def today() -> str:
    return bahrain_today().isoformat()


def move(c: TestClient, game: str, body: dict[str, Any] | None, **extra: Any) -> Any:
    return c.post(f"{API}/daily/{today()}/{game}/moves", json={"move": body, **extra})


def test_sec41_a_guest_gives_up_and_a_signed_in_player_scores_full_points_in_one_move(
    client_for: ClientFor, make_user: MakeUser
) -> None:
    # No account: give up today's word, and the answer comes back.
    answer = move(client_for(), "word", {"kind": "give-up"}).json()["play"]["view"]["answer"]
    assert isinstance(answer, str)
    assert len(answer) == 5
    # Signed in, the first guess is today's scored play: full points, and a one-move win is never too fast.
    player = make_user(name="Quick Fingers")
    c = client_for(player)
    assert c.put(f"{API}/daily/me", json={"showOnBoard": True}).status_code == 200
    play = move(c, "word", {"kind": "guess", "word": answer}).json()["play"]
    assert (play["status"], play["scored"], play["points"], play["tooFast"], play["seconds"]) == (
        "won",
        True,
        100,
        False,
        0,
    )
    board = client_for().get(f"{API}/daily/leaderboard").json()
    mine = next(r for r in board["rows"] if r["user"]["id"] == str(player.id))
    assert (mine["rank"], mine["points"]) == (1, 100)


def test_sec41_the_public_repository_answers_todays_quiz(
    client_for: ClientFor, make_user: MakeUser, monkeypatch: pytest.MonkeyPatch
) -> None:
    # quiz.json is in the public repository, and the bank's options are served in the file's order.
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
            assert q["options"] == listed["options"]
            choice = listed["answer"]
            from_the_file += 1
        play = move(c, "quiz", {"kind": "answer", "choice": choice}).json()["play"]
        if listed is not None:
            assert play["view"]["answered"][-1]["correct"] is True
    assert from_the_file >= 4
    assert (play["status"], play["scored"]) == ("won", True)
    assert play["points"] >= 80


@pytest.fixture
def raw_client(app: FastAPI) -> Iterator[TestClient]:
    """A guest's browser that gets the 500 instead of the exception."""
    with TestClient(app, raise_server_exceptions=False) as c:
        c.get(f"{API}/auth/csrf")
        c.headers["X-CSRF-Token"] = c.cookies.get("dsba_csrf") or ""
        yield c


def test_sec45_crafted_guest_histories_and_months_end_in_500s(raw_client: TestClient, db: Session) -> None:
    # A guest's history with a sixth answer to a five-question quiz: IndexError.
    sixth = [{"kind": "answer", "choice": 0}] * 6
    r = raw_client.post(f"{API}/daily/{today()}/quiz/moves", json={"history": sixth})
    assert (r.status_code, r.json()["error"]["code"]) == (500, "internal")
    # A guest's history that fills the Sudoku and then asks for a hint: ValueError (min of no empty cells).
    puzzle = GAMES["sudoku"].puzzle(db, bahrain_today(), "easy")
    filled = [{"kind": "place", "cell": i, "digit": puzzle.solution[i]} for i in range(81) if not puzzle.givens[i]]
    r = raw_client.post(
        f"{API}/daily/{today()}/sudoku/moves", json={"variant": "easy", "history": [*filled, {"kind": "hint"}]}
    )
    assert (r.status_code, r.json()["error"]["code"]) == (500, "internal")
    # The month after December 9999: OverflowError, for anyone.
    r = raw_client.get(f"{API}/daily/calendar", params={"month": "9999-12"})
    assert (r.status_code, r.json()["error"]["code"]) == (500, "internal")


def test_sec46_rotating_the_secret_key_reopens_a_finished_scored_play(
    client_for: ClientFor, make_user: MakeUser, db: Session
) -> None:
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
