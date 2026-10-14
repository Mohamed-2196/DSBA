"""Groups, word search, the quiz and Nearest neighbour through the API; the leaderboard, badges and calendar."""

from __future__ import annotations

import datetime as dt
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.time import bahrain_today
from app.models import User
from app.services.daily.games import GAMES
from app.services.daily.games.groups import GroupsGame
from app.services.daily.games.quiz import QuizGame
from app.services.daily.games.search import SearchGame
from tests.daily.conftest import API

ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]


@pytest.fixture(autouse=True)
def no_speed_check(monkeypatch: pytest.MonkeyPatch) -> None:
    for game in (GroupsGame, SearchGame, QuizGame):
        monkeypatch.setattr(game, "min_seconds", 0)


def today() -> dt.date:
    return bahrain_today()


def puzzle(db: Session, game: str) -> Any:
    return GAMES[game].puzzle(db, today(), "")  # type: ignore[index]


def move(c: TestClient, game: str, body: dict[str, Any]) -> Any:
    return c.post(f"{API}/daily/{today()}/{game}/moves", json={"move": body})


def test_groups_found_one_away_and_won(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    c = client_for(make_user())
    p = puzzle(db, "groups")
    a, b = p.groups[0], p.groups[1]
    play = c.get(f"{API}/daily/{today()}/groups").json()["play"]
    assert sorted(play["view"]["words"]) == sorted(p.order)
    assert play["view"]["found"] == []
    near = [*a.words[:3], b.words[0]]
    play = move(c, "groups", {"kind": "group", "words": near}).json()["play"]
    assert (play["result"], play["view"]["oneAway"], play["view"]["mistakesLeft"]) == ("one-away", True, 3)
    assert move(c, "groups", {"kind": "group", "words": near}).json()["error"]["code"] == "already_tried"
    for g in p.groups:
        play = move(c, "groups", {"kind": "group", "words": [w.lower() for w in g.words]}).json()["play"]
    assert (play["status"], play["points"], len(play["view"]["found"])) == ("won", 80, 4)
    assert play["view"]["found"][0]["label"] == a.label
    assert "Groups: 4/4, 1 mistake" in play["share"]


def test_groups_hide_the_answers_until_the_end(client_for: ClientFor, db: Session) -> None:
    view = client_for().get(f"{API}/daily/{today()}/groups").json()["play"]["view"]
    assert "label" not in str(view["words"])
    assert view["found"] == []


def cell(at: tuple[int, int]) -> dict[str, int]:
    return {"row": at[0], "col": at[1]}


def test_word_search_reads_lines_both_ways(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    c = client_for(make_user())
    p = puzzle(db, "search")
    first = p.placed[0]
    play = move(c, "search", {"kind": "find", "start": cell(first.end), "end": cell(first.start)}).json()["play"]
    assert (play["result"], play["view"]["found"][0]["word"]) == ("found", first.word)
    r = move(c, "search", {"kind": "find", "start": cell((0, 0)), "end": cell((1, 3))})
    assert r.status_code == 422
    hint = move(c, "search", {"kind": "hint"}).json()["play"]
    assert hint["view"]["hints"] == [cell(p.placed[1].start)]
    for placed in p.placed[1:]:
        play = move(c, "search", {"kind": "find", "start": cell(placed.start), "end": cell(placed.end)}).json()["play"]
    assert (play["status"], play["points"]) == ("won", 90)


def test_the_quiz_explains_each_answer_and_scores_right_ones(
    client_for: ClientFor, make_user: MakeUser, db: Session
) -> None:
    c = client_for(make_user())
    questions = puzzle(db, "quiz")
    assert len(questions) == 5
    view = c.get(f"{API}/daily/{today()}/quiz").json()["play"]["view"]
    assert "answer" not in str(view["questions"])
    for i, q in enumerate(questions):
        choice = q.answer if i else (q.answer + 1) % len(q.options)
        play = move(c, "quiz", {"kind": "answer", "choice": choice}).json()["play"]
        assert play["view"]["answered"][i]["correct"] is bool(i)
    assert (play["status"], play["points"], play["mistakes"]) == ("won", 80, 1)
    assert move(c, "quiz", {"kind": "answer", "choice": 0}).json()["error"]["code"] == "game_over"


def test_nearest_ranks_guesses_and_hints_get_closer(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    c = client_for(make_user())
    p = puzzle(db, "nearest")
    far = p.by_rank[-1]
    play = move(c, "nearest", {"kind": "guess", "word": far.upper()}).json()["play"]
    assert play["view"]["guesses"] == [{"word": far, "rank": len(p.by_rank), "hint": False}]
    assert play["view"]["answer"] is None
    r = move(c, "nearest", {"kind": "guess", "word": "zzzzqq"})
    assert r.json()["error"]["code"] == "unknown_word"
    hint = move(c, "nearest", {"kind": "hint"}).json()["play"]["view"]["guesses"][-1]
    assert hint["hint"] is True
    assert hint["rank"] < len(p.by_rank)
    play = move(c, "nearest", {"kind": "guess", "word": p.target}).json()["play"]
    assert (play["status"], play["points"], play["view"]["answer"]) == ("won", 90, p.target)
    assert p.target not in play["share"]


def test_the_leaderboard_shows_only_people_who_opt_in(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    shy, keen = make_user(name="Shy Player", year=2), make_user(name="Keen Player", year=1)
    for user in (shy, keen):
        c = client_for(user)
        for q in puzzle(db, "quiz"):
            move(c, "quiz", {"kind": "answer", "choice": q.answer})
    keen_c = client_for(keen)
    board = keen_c.get(f"{API}/daily/leaderboard").json()
    assert (board["rows"], board["you"], board["yourPoints"]) == ([], None, 100)
    me = keen_c.put(f"{API}/daily/me", json={"showOnBoard": True}).json()
    assert me["showOnBoard"] is True
    board = keen_c.get(f"{API}/daily/leaderboard").json()
    assert [(r["user"]["displayName"], r["points"], r["rank"], r["you"]) for r in board["rows"]] == [
        ("Keen Player", 100, 1, True)
    ]
    assert board["you"]["rank"] == 1
    assert client_for().get(f"{API}/daily/leaderboard", params={"year": 2}).json()["rows"] == []
    assert len(client_for().get(f"{API}/daily/leaderboard", params={"period": "all"}).json()["rows"]) == 1
    assert "email" not in str(board)


def test_me_shows_stats_streak_and_badges(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    c = client_for(make_user())
    assert c.get(f"{API}/daily/me").json()["stats"]["played"] == 0
    for q in puzzle(db, "quiz"):
        move(c, "quiz", {"kind": "answer", "choice": q.answer})
    me = c.get(f"{API}/daily/me").json()
    assert (me["stats"]["played"], me["stats"]["points"], me["streak"]["current"]) == (1, 100, 1)
    earned = {b["id"] for b in me["badges"] if b["earned"]}
    assert earned == {"first", "quiz-5"}
    assert client_for().get(f"{API}/daily/me").status_code == 401


def test_the_calendar_lists_days_out_and_what_you_finished(
    client_for: ClientFor, make_user: MakeUser, db: Session
) -> None:
    c = client_for(make_user())
    move(c, "word", {"kind": "give-up"})
    month = today().strftime("%Y-%m")
    cal = c.get(f"{API}/daily/calendar", params={"month": month}).json()
    assert cal["days"][-1]["day"] == today().isoformat()
    assert (cal["days"][-1]["done"], cal["total"]) == (1, len(GAMES))
    assert c.get(f"{API}/daily/calendar", params={"month": "2026-13"}).status_code == 422
    assert c.get(f"{API}/daily/calendar", params={"month": "2020-01"}).json()["days"] == []
