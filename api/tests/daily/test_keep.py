"""Keeping a guest's play on sign-in: the moves made as a guest become the account's play, scored as if played signed
in; an account that has opened the puzzle keeps its own; a play finished before a fix is practice, and one a fix
started again doesn't carry over; keeps are rate-limited per account and per address."""

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
from app.services.daily import plays
from tests.daily.conftest import API
from tests.daily.test_plays import move, word_of
from tests.daily.test_today_fix import SPARE, editor, fix, put_out, todays

ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]

__all__ = ["editor"]  # the fixture, for the fix test


def today() -> str:
    return bahrain_today().isoformat()


def keep(c: TestClient, game: str, history: list[dict[str, Any]], day: str | None = None, **extra: Any) -> Any:
    return c.post(f"{API}/daily/{day or today()}/{game}/keep", json={"history": history, **extra})


def wrong_words(answer: str, n: int) -> list[dict[str, Any]]:
    return [{"kind": "guess", "word": w} for w in [w for w in SPARE if w != answer][:n]]


def test_a_guests_win_is_kept_and_scored_on_sign_in(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    answer = word_of(db)
    history = [*wrong_words(answer, 1), {"kind": "guess", "word": answer}]
    replay = client_for().post(f"{API}/daily/{today()}/word/moves", json={"history": history})
    assert replay.json()["play"]["status"] == "won"

    user = make_user()
    c = client_for(user)
    r = keep(c, "word", history)
    assert r.status_code == 200, r.text
    play = r.json()["play"]
    assert (play["status"], play["scored"], play["points"], play["seconds"]) == ("won", True, 90, None)
    assert play["view"]["answer"] == answer  # kept, the play is the account's: nothing is held back
    again = c.get(f"{API}/daily/{today()}/word").json()["play"]
    assert (again["status"], len(again["view"]["rows"])) == ("won", 2)
    card = next(g for g in c.get(f"{API}/daily").json()["games"] if g["info"]["id"] == "word")
    assert (card["status"], card["points"]) == ("won", 90)
    assert c.get(f"{API}/daily/me").json()["stats"]["points"] == 90


def test_an_unfinished_play_carries_on(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    answer = word_of(db)
    c = client_for(make_user())
    play = keep(c, "word", wrong_words(answer, 2)).json()["play"]
    assert (play["status"], len(play["view"]["rows"]), play["view"]["answer"]) == ("playing", 2, None)
    won = move(c, "word", {"kind": "guess", "word": answer}).json()["play"]
    assert (won["status"], won["scored"], won["points"]) == ("won", True, 80)
    assert isinstance(won["seconds"], int)


def test_an_account_that_played_keeps_its_own(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    answer = word_of(db)
    c = client_for(make_user())
    move(c, "word", wrong_words(answer, 1)[0])
    r = keep(c, "word", [{"kind": "guess", "word": answer}])
    assert (r.status_code, r.json()["error"]["code"]) == (409, "already_played")
    row = db.scalars(select(DailyPlay)).one()
    assert (row.status, len(row.moves)) == ("playing", 1)


def test_an_account_that_opened_the_puzzle_keeps_its_own(
    client_for: ClientFor, make_user: MakeUser, db: Session
) -> None:
    answer = word_of(db)
    c = client_for(make_user())
    c.get(f"{API}/daily/{today()}/word")  # opened signed in: its play, without moves, is the one that stands
    r = keep(c, "word", [{"kind": "guess", "word": answer}])
    assert (r.status_code, r.json()["error"]["code"]) == (409, "already_played")
    row = db.scalars(select(DailyPlay)).one()
    assert (row.status, row.moves, row.kept_at) == ("new", [], None)


def test_a_past_days_play_is_kept_as_practice(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    yesterday = (bahrain_today() - dt.timedelta(days=1)).isoformat()
    answer = word_of(db, yesterday)
    c = client_for(make_user())
    play = keep(c, "word", [{"kind": "guess", "word": answer}], day=yesterday).json()["play"]
    assert (play["status"], play["scored"]) == ("won", False)


def test_moves_that_dont_replay_are_refused(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    answer = word_of(db)
    c = client_for(make_user())
    finished = [{"kind": "guess", "word": answer}]
    r = keep(c, "word", [*finished, *wrong_words(answer, 1)])
    assert (r.status_code, r.json()["error"]["code"]) == (409, "game_over")
    assert keep(c, "word", []).status_code == 422
    assert keep(c, "word", [{"kind": "guess", "word": "QXZQX"}]).status_code == 422
    assert db.scalars(select(DailyPlay)).first() is None


def test_only_an_account_with_a_profile_keeps_a_play(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    answer = word_of(db)
    history = [{"kind": "guess", "word": answer}]
    assert keep(client_for(), "word", history).status_code == 401
    user = make_user()
    user.display_name = None
    db.commit()
    assert keep(client_for(user), "word", history).status_code == 403


def test_a_fix_lets_a_finished_play_stand_and_drops_an_unfinished_one(
    client_for: ClientFor, make_user: MakeUser, editor: TestClient
) -> None:
    put_out(client_for, "word")
    answer = todays(editor)["word"]["puzzle"]["answer"]
    wrong = wrong_words(answer, 1)
    fixed = next(w for w in SPARE if w not in (answer, wrong[0]["word"]))
    assert fix(editor, todays(editor)["word"]["items"][0], {"game": "word", "word": fixed}).status_code == 200

    stale = keep(client_for(make_user()), "word", wrong, revision=0)
    assert (stale.status_code, stale.json()["error"]["code"]) == (409, "puzzle_fixed")
    stands = keep(client_for(make_user()), "word", [{"kind": "guess", "word": answer}], revision=0).json()["play"]
    assert (stands["status"], stands["revision"], stands["scored"], stands["points"]) == ("won", 0, False, 0)


def test_keeps_are_rate_limited_per_account_and_per_address(
    client_for: ClientFor, make_user: MakeUser, db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    yesterday = (bahrain_today() - dt.timedelta(days=1)).isoformat()
    won = [{"kind": "guess", "word": word_of(db)}]
    monkeypatch.setattr(plays, "KEEPS_PER_HOUR", 1)
    c = client_for(make_user())
    assert keep(c, "word", won).status_code == 200
    r = keep(c, "word", [{"kind": "guess", "word": word_of(db, yesterday)}], day=yesterday)
    assert (r.status_code, r.json()["error"]["code"]) == (429, "rate_limited")

    monkeypatch.setattr(plays, "KEEPS_PER_HOUR", 20)
    monkeypatch.setattr(plays, "KEEPS_PER_HOUR_PER_IP", 1)
    r = keep(client_for(make_user()), "word", won)  # another account, the same address
    assert (r.status_code, r.json()["error"]["code"]) == (429, "rate_limited")


def test_the_export_carries_a_kept_play_and_the_sweep_forgets_its_address(
    client_for: ClientFor, make_user: MakeUser, db: Session
) -> None:
    """The export has a kept play's address, when it was kept, its mistakes and hints; a day later the sweep forgets
    the address (SEC-59)."""
    answer = word_of(db)
    c = client_for(make_user())
    assert keep(c, "word", [*wrong_words(answer, 1), {"kind": "guess", "word": answer}]).status_code == 200
    row = db.scalars(select(DailyPlay)).one()
    row.kept_ip = "203.0.113.9"
    db.commit()
    exported = c.get(f"{API}/me/export").json()["dailyPlays"][0]
    assert exported["keptIp"] == "203.0.113.9"
    assert exported["keptAt"] is not None
    assert (exported["mistakes"], exported["hints"]) == (row.mistakes, row.hints)

    assert plays.clear_old_kept_ips(db) == 0  # within the day: the keeps' limit may still count it
    assert row.kept_at is not None
    row.kept_at -= plays.KEEP_IP + dt.timedelta(minutes=1)
    db.commit()
    assert plays.clear_old_kept_ips(db) == 1
    db.refresh(row)
    assert row.kept_ip is None
