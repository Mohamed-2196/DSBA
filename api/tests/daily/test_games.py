"""Groups, word search, the quiz and Nearest neighbour through the API; the leaderboard, badges and calendar."""

from __future__ import annotations

import datetime as dt
from collections.abc import Callable
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import Engine, event
from sqlalchemy.orm import Session

from app.core.time import bahrain_today, utcnow
from app.models import DailyPlay, DailyProfile, User
from app.services import access
from app.services.daily import content
from app.services.daily.games import GAMES
from app.services.daily.games.groups import SQUARES
from app.services.daily.games.nearest import CLOSE, WARM
from tests.daily.conftest import API

ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]


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
    assert "Correlations 4/4, 1 mistake" in play["share"]
    # Each try's colours, one square per word: the levels' colours in the web app, purple for the trickiest.
    assert play["share"].splitlines()[-1] == SQUARES[p.groups[-1].level] * 4
    assert set(SQUARES.values()) == {"🟨", "🟩", "🟦", "🟪"}
    # The picture is the share grid in squares: each try's words by level.
    shared = [list(line) for line in play["share"].splitlines()[2:]]
    assert [[SQUARES[int(m[1])] for m in row] for row in play["picture"]] == shared
    assert len(play["picture"]) == 5


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
    assert not any(f["revealed"] for f in play["view"]["found"])
    assert play["picture"] == [["hit"] * 4, ["hit"] * 4]


def test_word_search_given_up_reveals_the_words_left(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    c = client_for(make_user())
    p = puzzle(db, "search")
    first = p.placed[0]
    move(c, "search", {"kind": "find", "start": cell(first.start), "end": cell(first.end)})
    play = move(c, "search", {"kind": "give-up"}).json()["play"]
    view = play["view"]
    assert [(f["word"], f["revealed"]) for f in view["found"]][:2] == [(first.word, False), (p.placed[1].word, True)]
    assert len(view["found"]) == len(p.placed)
    assert play["picture"] == [["hit", "miss", "miss", "miss"], ["miss"] * 4]  # what was found, not where


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
    assert play["picture"] == [["wrong", "hit", "hit", "hit", "hit"]]
    assert move(c, "quiz", {"kind": "answer", "choice": 0}).json()["error"]["code"] == "game_over"


def test_nearest_ranks_guesses_and_hints_get_closer(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    c = client_for(make_user())
    p = puzzle(db, "nearest")
    far = p.by_rank[-1]
    play = move(c, "nearest", {"kind": "guess", "word": far.upper()}).json()["play"]
    assert play["view"]["guesses"] == [{"word": far, "rank": len(p.by_rank), "hint": False}]
    assert (play["view"]["answer"], play["picture"]) == (None, None)  # a picture once it's over
    r = move(c, "nearest", {"kind": "guess", "word": "zzzzqq"})
    assert r.json()["error"]["code"] == "unknown_word"
    # A word it doesn't know, with known words it may have meant.
    r = move(c, "nearest", {"kind": "guess", "word": "varience"})
    assert (r.status_code, r.json()["error"]["message"]) == (422, "We don't know “varience”. Try variance.")
    hint = move(c, "nearest", {"kind": "hint"}).json()["play"]["view"]["guesses"][-1]
    assert hint["hint"] is True
    assert hint["rank"] < len(p.by_rank)
    play = move(c, "nearest", {"kind": "guess", "word": p.target}).json()["play"]
    assert (play["status"], play["points"], play["view"]["answer"]) == ("won", 90, p.target)
    assert p.target not in play["share"]
    # The guesses' closeness in order, hints left out: the found word last, close.
    closeness = [
        "hit" if g["rank"] <= CLOSE else "near" if g["rank"] <= WARM else "miss" for g in [play["view"]["guesses"][0]]
    ]
    assert play["picture"] == [[*closeness, "hit"]]


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
    assert (cal["days"][-1]["finished"], cal["total"]) == (["word"], len(GAMES))
    assert cal["days"][-1]["theme"] == content.theme_of(db, today()).model_dump(by_alias=True)
    assert c.get(f"{API}/daily/calendar", params={"month": "2026-13"}).status_code == 422
    assert c.get(f"{API}/daily/calendar", params={"month": "2020-01"}).status_code == 422
    assert c.get(f"{API}/daily/calendar", params={"month": "2026-09"}).json()["days"] == []  # before the first day


def test_the_leaderboard_reads_its_players_badges_in_one_go(
    client_for: ClientFor, make_user: MakeUser, engine: Engine, db: Session
) -> None:
    def players(names: range) -> None:
        for n in names:
            user = make_user(name=f"Player {n}")
            db.add(DailyProfile(user_id=user.id, show_on_board=True))
            db.add(
                DailyPlay(
                    user_id=user.id,
                    day=today(),
                    game="word",
                    status="won",
                    scored=True,
                    points=50 + n,
                    finished_at=utcnow(),
                )
            )
        db.commit()

    def statements() -> int:
        reader.get(f"{API}/daily/leaderboard")
        access.forget(db)  # nobody's roles loaded before the request
        seen: list[str] = []

        def count(*_: Any) -> None:
            seen.append("")

        event.listen(engine, "before_cursor_execute", count)
        try:
            assert reader.get(f"{API}/daily/leaderboard").status_code == 200
        finally:
            event.remove(engine, "before_cursor_execute", count)
        return len(seen)

    reader = client_for()
    players(range(2))
    few = statements()
    players(range(2, 9))
    assert len(reader.get(f"{API}/daily/leaderboard").json()["rows"]) == 9
    assert statements() == few
