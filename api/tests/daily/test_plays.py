"""Playing: moves checked on the server, kept for signed-in players, scored once a day; guests replay their own."""

from __future__ import annotations

import datetime as dt
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.time import bahrain_today
from app.models import DailyPlay, User
from app.services.daily.games import GAMES
from app.services.daily.games.sudoku import SudokuGame
from tests.daily.conftest import API

ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]


def today() -> str:
    return bahrain_today().isoformat()


def sudoku(db: Session, day: str, variant: str = "easy") -> Any:
    return GAMES["sudoku"].puzzle(db, dt.date.fromisoformat(day), variant)


def move(c: TestClient, game: str, body: dict[str, Any], day: str | None = None, **extra: Any) -> Any:
    return c.post(f"{API}/daily/{day or today()}/{game}/moves", json={"move": body, **extra})


def solve_all(
    c: TestClient, puzzle: Any, day: str | None = None, variant: str = "easy", skip: frozenset[int] = frozenset()
) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for cell in range(81):
        if not puzzle.givens[cell] and cell not in skip:
            r = move(c, "sudoku", {"kind": "place", "cell": cell, "digit": puzzle.solution[cell]}, day, variant=variant)
            assert r.status_code == 200, r.text
            out = r.json()
    return out


def test_the_hub_lists_every_game_for_guests(client_for: ClientFor) -> None:
    r = client_for().get(f"{API}/daily")
    assert r.status_code == 200
    body = r.json()
    assert body["day"] == today()
    assert [g["info"]["id"] for g in body["games"]] == list(GAMES)
    assert body["streak"] is None
    assert body["done"] == 0


def test_a_sudoku_never_shows_its_solution_before_the_end(client_for: ClientFor, db: Session) -> None:
    puzzle = sudoku(db, today())
    play = client_for().get(f"{API}/daily/{today()}/sudoku", params={"variant": "easy"}).json()["play"]
    assert play["status"] == "new"
    assert play["view"]["givens"] == list(puzzle.givens)
    assert play["view"]["filled"] == [0] * 81


def test_digits_are_checked_and_mistakes_and_hints_counted(
    client_for: ClientFor, make_user: MakeUser, db: Session
) -> None:
    c = client_for(make_user())
    puzzle = sudoku(db, today(), "medium")
    empty = [i for i in range(81) if not puzzle.givens[i]]
    wrong = next(d for d in range(1, 10) if d != puzzle.solution[empty[0]])
    r = move(c, "sudoku", {"kind": "place", "cell": empty[0], "digit": wrong}, variant="medium")
    play = r.json()["play"]
    assert (play["result"], play["mistakes"], play["view"]["filled"][empty[0]]) == ("wrong", 1, 0)
    assert play["view"]["wrong"] == {"kind": "place", "cell": empty[0], "digit": wrong}
    r = move(c, "sudoku", {"kind": "place", "cell": empty[0], "digit": puzzle.solution[empty[0]]}, variant="medium")
    assert r.json()["play"]["result"] == "correct"
    assert move(c, "sudoku", {"kind": "place", "cell": empty[0], "digit": 1}, variant="medium").status_code == 422
    play = move(c, "sudoku", {"kind": "hint"}, variant="medium").json()["play"]
    assert (play["result"], play["hints"], len(play["view"]["hinted"])) == ("hint", 1, 1)
    # Kept: reading it again shows the same play.
    again = c.get(f"{API}/daily/{today()}/sudoku", params={"variant": "medium"}).json()["play"]
    assert again["view"] == play["view"] | {"wrong": None}
    assert again["scored"] is True


def test_a_solved_sudoku_scores_once_and_too_fast_scores_nothing(
    client_for: ClientFor, make_user: MakeUser, db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    c = client_for(make_user())
    out = solve_all(c, sudoku(db, today()))
    play = out["play"]
    assert (play["status"], play["scored"], play["tooFast"], play["points"]) == ("won", True, True, 0)
    assert "Sudoku, easy: solved" in play["share"]
    assert move(c, "sudoku", {"kind": "hint"}, variant="easy").json()["error"]["code"] == "game_over"
    # Another difficulty the same day is practice.
    monkeypatch.setattr(SudokuGame, "min_seconds", 0)
    play = solve_all(c, sudoku(db, today(), "hard"), variant="hard")["play"]
    assert (play["scored"], play["points"]) == (False, 150)


def test_a_scored_sudoku_earns_its_points(
    client_for: ClientFor, make_user: MakeUser, db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(SudokuGame, "min_seconds", 0)
    c = client_for(make_user())
    puzzle = sudoku(db, today())
    hinted = move(c, "sudoku", {"kind": "hint"}, variant="easy").json()["play"]["view"]["hinted"]
    play = solve_all(c, puzzle, skip=frozenset(hinted))["play"]
    assert (play["status"], play["scored"], play["points"], play["hints"]) == ("won", True, 40, 1)
    hub = c.get(f"{API}/daily").json()
    assert (hub["done"], hub["points"], hub["streak"]["current"], hub["streak"]["playedToday"]) == (1, 40, 1, True)
    sudoku_card = next(g for g in hub["games"] if g["info"]["id"] == "sudoku")
    assert (sudoku_card["status"], sudoku_card["points"]) == ("won", 40)


def test_past_days_are_practice_and_future_days_are_not_out(
    client_for: ClientFor, make_user: MakeUser, db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(SudokuGame, "min_seconds", 0)
    c = client_for(make_user())
    yesterday = (bahrain_today() - dt.timedelta(days=1)).isoformat()
    play = solve_all(c, sudoku(db, yesterday), yesterday)["play"]
    assert (play["status"], play["scored"]) == ("won", False)
    tomorrow = (bahrain_today() + dt.timedelta(days=1)).isoformat()
    r = c.get(f"{API}/daily/{tomorrow}/sudoku")
    assert (r.status_code, r.json()["error"]["code"]) == (404, "not_out_yet")
    assert c.get(f"{API}/daily/2026-01-01/sudoku").status_code == 404


def test_guests_send_their_moves_and_nothing_is_kept(client_for: ClientFor, db: Session) -> None:
    c = client_for()
    puzzle = sudoku(db, today())
    cell = puzzle.givens.index(0)
    first = {"kind": "place", "cell": cell, "digit": puzzle.solution[cell]}
    play = move(c, "sudoku", first, variant="easy").json()["play"]
    assert play["view"]["filled"][cell] == puzzle.solution[cell]
    assert play["scored"] is False
    # The same move again, with the history, is refused: the cell is filled.
    assert move(c, "sudoku", first, variant="easy", history=[first]).status_code == 422
    # No move: the play replayed from the history.
    r = c.post(f"{API}/daily/{today()}/sudoku/moves", json={"variant": "easy", "history": [first]})
    assert r.json()["play"]["view"]["filled"][cell] == puzzle.solution[cell]
    assert db.scalars(select(DailyPlay)).first() is None


def test_moves_a_game_doesnt_take_and_unknown_variants_are_refused(client_for: ClientFor, make_user: MakeUser) -> None:
    c = client_for(make_user())
    r = move(c, "sudoku", {"kind": "guess", "word": "TREND"}, variant="easy")
    assert (r.status_code, r.json()["error"]["fields"]) == (422, {"move": "Sudoku doesn't take that move."})
    r = c.get(f"{API}/daily/{today()}/sudoku", params={"variant": "extreme"})
    assert r.status_code == 422


def test_a_suspended_account_cant_play(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    from app.models import UserStatus

    user = make_user()
    user.status = UserStatus.suspended
    db.commit()
    r = move(client_for(user), "sudoku", {"kind": "hint"}, variant="easy")
    assert r.status_code == 403


def word_of(db: Session, day: str | None = None) -> str:
    answer: str = GAMES["word"].puzzle(db, dt.date.fromisoformat(day or today()), "").answer
    return answer


def test_the_word_marks_guesses_and_shows_the_answer_only_at_the_end(
    client_for: ClientFor, make_user: MakeUser, db: Session
) -> None:
    c = client_for(make_user())
    answer = word_of(db)
    first = c.get(f"{API}/daily/{today()}/word").json()["play"]
    assert (first["status"], first["view"]["answer"]) == ("new", None)
    guess = "CRANE" if answer != "CRANE" else "SLATE"
    play = move(c, "word", {"kind": "guess", "word": guess.lower()}).json()["play"]
    assert play["view"]["rows"][0]["word"] == guess
    assert play["view"]["answer"] is None
    assert move(c, "word", {"kind": "guess", "word": guess}).json()["error"]["code"] == "already_tried"
    r = move(c, "word", {"kind": "guess", "word": "QXZQX"})
    assert (r.status_code, r.json()["error"]["code"]) == (422, "unknown_word")
    play = move(c, "word", {"kind": "guess", "word": answer}).json()["play"]
    assert (play["status"], play["points"], play["view"]["answer"]) == ("won", 90, answer)
    assert play["share"].splitlines()[1] == "The word 2/6"
    assert answer not in play["share"]


def test_six_wrong_guesses_lose_and_give_up_ends_the_word(
    client_for: ClientFor, make_user: MakeUser, db: Session
) -> None:
    c = client_for(make_user())
    answer = word_of(db)
    for word in [w for w in ("CRANE", "SLATE", "PIOUS", "MIGHT", "BLUNT", "FORGE", "WHISK") if w != answer][:6]:
        play = move(c, "word", {"kind": "guess", "word": word}).json()["play"]
    assert (play["status"], play["points"], play["view"]["answer"]) == ("lost", 0, answer)
    other = client_for(make_user())
    play = move(other, "word", {"kind": "give-up"}).json()["play"]
    assert (play["status"], play["view"]["answer"]) == ("lost", answer)
