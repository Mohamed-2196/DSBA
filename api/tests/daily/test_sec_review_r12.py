"""The round 12 security review's proofs for Daily. A test named for a problem passes while it is still there; the
content half of SEC-41 and SEC-46 are fixed, and their tests check the fixes."""

from __future__ import annotations

import datetime as dt
import os
from collections.abc import Callable, Iterator
from pathlib import Path
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
from tests.daily.conftest import API

APP = Path(__file__).resolve().parents[2] / "app"
DAILY_SEED = APP / "seed" / "data" / "daily"

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


def test_sec41_the_repository_holds_no_answers_and_the_quiz_shuffles_its_options(db: Session) -> None:
    # Fixed: the puzzles live in the database (Manage, or a content file kept out of the repository); the
    # repository's Daily data is the themes and a public word list, and no answer bank is left anywhere in the app.
    assert sorted(p.name for p in DAILY_SEED.iterdir()) == ["guesses.txt", "themes.json"]
    banks = ("quiz.json", "groups.json", "words.json", "search.json", "nearest.json", "nearest_ranks.json")
    assert not [p for name in banks for p in APP.rglob(name)]
    # A question's right option moves from day to day: its stored order gives nothing away.
    places = {
        q.answer for n in range(8) for q in GAMES["quiz"].puzzle(db, content.FIRST_DAY + dt.timedelta(days=n), "")[:-1]
    }
    assert len(places) > 1


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


def test_sec46_rotating_the_secret_key_leaves_kept_puzzles_and_finished_plays_as_they_are(
    client_for: ClientFor, make_user: MakeUser, db: Session
) -> None:
    # Fixed: each day's puzzles are kept the first time they're made, and Daily seeds its choices with a key of its
    # own (daily_seed), so a new DSBA_SECRET_KEY changes nothing that's out.
    c = client_for(make_user())
    answer = GAMES["word"].puzzle(db, bahrain_today(), "").answer
    sudoku = GAMES["sudoku"].puzzle(db, bahrain_today(), "easy")
    won = move(c, "word", {"kind": "guess", "word": answer}).json()["play"]
    assert (won["status"], won["scored"], won["points"]) == ("won", True, 100)

    old = os.environ["DSBA_SECRET_KEY"]
    try:
        os.environ["DSBA_SECRET_KEY"] = f"a-new-secret-after-a-leak-{'x' * 24}"
        get_settings.cache_clear()
        assert GAMES["word"].puzzle(db, bahrain_today(), "").answer == answer
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
