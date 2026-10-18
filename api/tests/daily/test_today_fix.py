"""Fixing today's puzzle in Manage → Daily puzzles: today's puzzles with the items they use, a dry run that shows today
before and after, finished plays that stand, unfinished ones (guests' too) that start again on the fixed puzzle with a
line saying why, the activity log, fixes made on an old view, and the most fixes a day."""

from __future__ import annotations

import datetime as dt
import uuid
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.time import bahrain_today, utcnow
from app.models import AuditEntry, DailyPlay, DailySetRevision, User
from tests.daily.conftest import API, GUESSES

ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]
DAILY = f"{API}/content/daily"
SPARE = [w for w in GUESSES if w in {"PLANT", "BRICK", "GLOVE", "STONE", "WHISK", "FORGE", "BLUNT"}]  # not answers


@pytest.fixture
def editor(client_for: ClientFor, make_user: MakeUser) -> TestClient:
    return client_for(make_user(name="Hana Content", roles=("student", "content-manager"), year=None))


def today() -> dt.date:
    return bahrain_today()


def todays(c: TestClient) -> dict[str, dict[str, Any]]:
    r = c.get(f"{DAILY}/today")
    assert r.status_code == 200, r.text
    return {g["game"]: g for g in r.json()["games"]}


def put_out(client_for: ClientFor, *games: str) -> None:
    """Someone opens the games, so today's puzzles are kept."""
    guest = client_for()
    for game in games:
        assert guest.get(f"{API}/daily/{today()}/{game}").status_code == 200


def fix(
    c: TestClient,
    item: dict[str, Any],
    data: dict[str, Any],
    *,
    revision: int = 0,
    dry_run: bool = False,
    day: dt.date | None = None,
) -> Any:
    body = {
        "day": (day or today()).isoformat(),
        "revision": revision,
        "version": item["version"],
        "data": data,
        "dryRun": dry_run,
    }
    return c.post(f"{DAILY}/items/{item['id']}/fix-today", json=body)


def move(c: TestClient, game: str, body: dict[str, Any] | None, **extra: Any) -> Any:
    return c.post(f"{API}/daily/{today()}/{game}/moves", json={"move": body, **extra})


def play_of(c: TestClient, game: str) -> dict[str, Any]:
    r = c.get(f"{API}/daily/{today()}/{game}")
    assert r.status_code == 200, r.text
    found: dict[str, Any] = r.json()["play"]
    return found


def audit(db: Session, action: str) -> list[AuditEntry]:
    return list(db.scalars(select(AuditEntry).where(AuditEntry.action == action).order_by(AuditEntry.id)))


# ── who ──────────────────────────────────────────────────────────────────────────────────────


def test_only_content_editors_see_and_fix_todays_puzzles(
    client_for: ClientFor, make_user: MakeUser, editor: TestClient
) -> None:
    put_out(client_for, "word")
    item = todays(editor)["word"]["items"][0]
    data = {"game": "word", "word": SPARE[0]}
    for c, status in ((client_for(), 401), (client_for(make_user()), 403)):
        assert c.get(f"{DAILY}/today").status_code == status
        assert fix(c, item, data).status_code == status


# ── today's puzzles ──────────────────────────────────────────────────────────────────────────


def test_todays_puzzles_show_the_items_each_uses_and_who_is_playing(
    client_for: ClientFor, make_user: MakeUser, editor: TestClient
) -> None:
    planned = todays(editor)
    assert [(g["out"], g["revision"], g["fixesLeft"]) for g in planned.values()] == [(False, 0, 5)] * 5
    assert [len(g["items"]) for g in planned.values()] == [1, 4, 8, 4, 1]
    assert [i["data"]["level"] for i in planned["groups"]["items"]] == [1, 2, 3, 4]
    assert not any(i["inToday"] for g in planned.values() for i in g["items"])

    finished, partway = client_for(make_user()), client_for(make_user())
    assert move(finished, "groups", {"kind": "give-up"}).json()["play"]["status"] == "lost"
    assert move(partway, "quiz", {"kind": "answer", "choice": 0}).json()["play"]["status"] == "playing"
    out = todays(editor)
    assert (out["groups"]["out"], out["groups"]["finished"], out["groups"]["playing"]) == (True, 1, 0)
    assert (out["quiz"]["out"], out["quiz"]["finished"], out["quiz"]["playing"]) == (True, 0, 1)
    assert out["word"]["out"] is False
    # Kept as planned, in the order the puzzle shows them.
    assert [i["id"] for i in out["groups"]["items"]] == [i["id"] for i in planned["groups"]["items"]]
    questions = [q["prompt"] for q in out["quiz"]["puzzle"]["questions"]]
    assert [i["data"]["question"] for i in out["quiz"]["items"]] == questions[:4]
    assert all(i["inToday"] for i in out["quiz"]["items"])
    listed = editor.get(f"{DAILY}/items", params={"game": "quiz", "limit": 200}).json()["items"]
    assert {i["id"] for i in listed if i["inToday"]} == {i["id"] for i in out["quiz"]["items"]}


# ── a fix ────────────────────────────────────────────────────────────────────────────────────


def test_a_fix_keeps_finished_results_and_starts_the_other_plays_again(
    client_for: ClientFor, make_user: MakeUser, editor: TestClient, db: Session
) -> None:
    done, partway, looker = (client_for(make_user(name=n)) for n in ("Done Already", "Half Way", "Just Looking"))
    assert done.put(f"{API}/daily/me", json={"showOnBoard": True}).status_code == 200
    answer = todays(editor)["word"]["puzzle"]["answer"]
    won = move(done, "word", {"kind": "guess", "word": answer}).json()["play"]
    assert (won["status"], won["points"], won["revision"]) == ("won", 100, 0)
    wrong = next(w for w in SPARE if w != answer)
    assert move(partway, "word", {"kind": "guess", "word": wrong}).json()["play"]["status"] == "playing"
    assert play_of(looker, "word")["status"] == "new"

    item = todays(editor)["word"]["items"][0]
    fixed = next(w for w in SPARE if w not in (answer, wrong))
    dry = fix(editor, item, {"game": "word", "word": fixed}, dry_run=True)
    assert dry.status_code == 200, dry.text
    preview = dry.json()
    assert (preview["applied"], preview["revision"], preview["playing"], preview["finished"]) == (False, 0, 1, 1)
    assert (preview["before"]["answer"], preview["after"]["answer"]) == (answer, fixed)
    assert preview["changes"] == [f"The answer is {fixed}, not {answer}."]
    assert (preview["item"]["version"], preview["item"]["data"]["word"]) == (item["version"], answer)
    assert todays(editor)["word"]["revision"] == 0
    assert audit(db, "daily.today.fix") == []
    assert move(partway, "word", None).json()["play"]["view"]["rows"][0]["word"] == wrong  # untouched

    r = fix(editor, item, {"game": "word", "word": fixed})
    assert r.status_code == 200, r.text
    out = r.json()
    assert (out["applied"], out["revision"], out["item"]["version"], out["item"]["data"]["word"]) == (
        True,
        1,
        item["version"] + 1,
        fixed,
    )
    assert todays(editor)["word"]["revision"] == 1

    # A finished play stands on the puzzle it was played on, points and all.
    kept = play_of(done, "word")
    assert (kept["status"], kept["points"], kept["revision"], kept["restarted"]) == ("won", 100, 0, False)
    assert kept["view"]["answer"] == answer
    over = move(done, "word", {"kind": "guess", "word": fixed}, revision=1)
    assert (over.status_code, over.json()["error"]["code"]) == (409, "game_over")
    board = client_for().get(f"{API}/daily/leaderboard").json()["rows"]
    assert [(row["user"]["displayName"], row["points"]) for row in board] == [("Done Already", 100)]

    # A play partway through starts again on the fixed puzzle, and says why until its next move.
    hub = next(g for g in partway.get(f"{API}/daily").json()["games"] if g["info"]["id"] == "word")
    assert hub["status"] == "new"
    again = play_of(partway, "word")
    assert (again["status"], again["revision"], again["restarted"], again["view"]["rows"]) == ("new", 1, True, [])
    assert again["scored"] is True
    stale = move(partway, "word", {"kind": "guess", "word": wrong})  # made on the version the fix replaced
    assert (stale.status_code, stale.json()["error"]["code"]) == (409, "puzzle_fixed")
    assert "fixed a mistake in today's puzzle" in stale.json()["error"]["message"]
    replayed = move(partway, "word", {"kind": "guess", "word": fixed}, revision=1).json()["play"]
    assert (replayed["status"], replayed["scored"], replayed["points"], replayed["restarted"]) == (
        "won",
        True,
        100,
        False,
    )

    # Someone who had only opened it is on the fixed puzzle, with nothing to explain.
    looked = play_of(looker, "word")
    assert (looked["status"], looked["revision"], looked["restarted"]) == ("new", 1, False)

    # The activity log has what changed, and the puzzle the fix replaced is kept.
    (entry,) = audit(db, "daily.today.fix")
    assert entry.data["changes"] == [f"The answer is {fixed}, not {answer}."]
    assert (entry.data["restarted"], entry.data["finished"], entry.data["revision"]) == (1, 1, 1)
    assert (entry.data["before"], entry.data["after"]) == ({"data": {"word": answer}}, {"data": {"word": fixed}})
    earlier = db.get(DailySetRevision, (today(), "word", "", 0))
    assert earlier is not None
    assert earlier.puzzle == {"answer": answer}


def test_a_restarted_plays_clock_starts_when_the_player_comes_back(
    client_for: ClientFor, make_user: MakeUser, editor: TestClient, db: Session
) -> None:
    user = make_user()
    player = client_for(user)
    answer = todays(editor)["word"]["puzzle"]["answer"]
    wrong = next(w for w in SPARE if w != answer)
    move(player, "word", {"kind": "guess", "word": wrong})
    fixed = next(w for w in SPARE if w not in (answer, wrong))
    assert fix(editor, todays(editor)["word"]["items"][0], {"game": "word", "word": fixed}).status_code == 200
    row = db.scalars(select(DailyPlay).where(DailyPlay.user_id == user.id, DailyPlay.game == "word")).one()
    row.started_at = utcnow() - dt.timedelta(hours=3)  # the player comes back hours after the fix
    db.commit()
    play_of(player, "word")
    won = move(player, "word", {"kind": "guess", "word": fixed}, revision=1).json()["play"]
    assert won["status"] == "won"
    assert won["seconds"] < 60


def test_a_guests_play_follows_the_same_rule(client_for: ClientFor, editor: TestClient) -> None:
    guest = client_for()
    answer = todays(editor)["word"]["puzzle"]["answer"]
    wrong = next(w for w in SPARE if w != answer)
    finished = [{"kind": "guess", "word": answer}]
    unfinished = [{"kind": "guess", "word": wrong}]
    assert move(guest, "word", None, history=finished).json()["play"]["status"] == "won"
    fixed = next(w for w in SPARE if w not in (answer, wrong))
    assert fix(editor, todays(editor)["word"]["items"][0], {"game": "word", "word": fixed}).status_code == 200

    stands = move(guest, "word", None, history=finished, revision=0).json()["play"]
    assert (stands["status"], stands["revision"], stands["restarted"]) == ("won", 0, False)
    late = move(guest, "word", {"kind": "guess", "word": fixed}, history=finished, revision=0)
    assert (late.status_code, late.json()["error"]["code"]) == (409, "game_over")

    again = move(guest, "word", None, history=unfinished, revision=0).json()["play"]
    assert (again["status"], again["revision"], again["restarted"], again["view"]["rows"]) == ("new", 1, True, [])
    for history in (unfinished, []):  # moves made on a view of the version the fix replaced
        stale = move(guest, "word", {"kind": "guess", "word": fixed}, history=history, revision=0)
        assert (stale.status_code, stale.json()["error"]["code"]) == (409, "puzzle_fixed")
    won = move(guest, "word", {"kind": "guess", "word": fixed}, history=[], revision=1).json()["play"]
    assert (won["status"], won["revision"]) == ("won", 1)
    unknown = move(guest, "word", None, history=unfinished, revision=7)
    assert (unknown.status_code, list(unknown.json()["error"]["fields"])) == (422, ["revision"])


def test_a_group_fix_changes_that_word_on_the_board(client_for: ClientFor, editor: TestClient) -> None:
    put_out(client_for, "groups")
    game = todays(editor)["groups"]
    item, board = game["items"][1], game["puzzle"]["groups"][1]
    label, gone = item["data"]["label"], board["words"][0]
    words = [w if w != gone else "ZEBRA" for w in item["data"]["words"]]
    order = client_for().get(f"{API}/daily/{today()}/groups").json()["play"]["view"]["words"]

    r = fix(editor, item, {**item["data"], "words": words})
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["changes"] == [f"ZEBRA replaces {gone} in “{label}”."]
    assert out["after"]["groups"][1]["words"] == ["ZEBRA", *board["words"][1:]]
    assert [g for n, g in enumerate(out["after"]["groups"]) if n != 1] == [
        g for n, g in enumerate(out["before"]["groups"]) if n != 1
    ]
    shown = client_for().get(f"{API}/daily/{today()}/groups").json()["play"]["view"]["words"]
    assert shown == ["ZEBRA" if w == gone else w for w in order]  # the new word takes the old one's place

    # A fix keeps the group's level, and today's board needs four words of each group that no other group has.
    item = out["item"]
    level = fix(editor, item, {**item["data"], "level": 3}, revision=1)
    assert (level.status_code, list(level.json()["error"]["fields"])) == (422, ["data.level"])
    taken = game["puzzle"]["groups"][0]["words"][0]  # on today's board in the level 1 group
    clash = fix(editor, item, {**item["data"], "words": [taken, *item["data"]["words"][1:]]}, revision=1)
    assert clash.status_code == 422, clash.text
    assert "Today's board needs four words in" in clash.json()["error"]["fields"]["data.words"]


def test_a_fix_today_doesnt_show_leaves_today_as_it_is(client_for: ClientFor, editor: TestClient, db: Session) -> None:
    put_out(client_for, "groups")
    item = todays(editor)["groups"]["items"][0]
    extra = {**item["data"], "words": [*item["data"]["words"], "ZEBRAS"]}
    saved = editor.put(
        f"{DAILY}/items/{item['id']}", json={"theme": item["theme"], "data": extra, "version": item["version"]}
    )
    assert saved.status_code == 200, saved.text
    item = saved.json()
    typo = {**item["data"], "words": [*item["data"]["words"][:-1], "ZEBRA"]}
    out = fix(editor, item, typo).json()
    assert (out["applied"], out["changes"], out["revision"], out["before"]) == (True, [], 0, out["after"])
    assert out["item"]["data"]["words"][-1] == "ZEBRA"
    assert audit(db, "daily.today.fix") == []
    saves = audit(db, "daily.item.update")
    assert len(saves) == 2  # the word added, then the fix: today's board doesn't show it
    assert saves[-1].data["after"]["data"]["words"][-1] == "ZEBRA"


def test_a_quiz_fix_keeps_every_question_in_its_place(client_for: ClientFor, editor: TestClient) -> None:
    put_out(client_for, "quiz")
    game = todays(editor)["quiz"]
    item, questions = game["items"][1], game["puzzle"]["questions"]
    reworded = "Which option is right in the reworded question?"
    out = fix(editor, item, {**item["data"], "question": reworded}).json()
    assert out["changes"] == [f"Question 2 now reads “{reworded}”."]
    assert [q["prompt"] for q in out["after"]["questions"]] == [
        reworded if n == 1 else q["prompt"] for n, q in enumerate(questions)
    ]
    assert out["after"]["questions"][4] == questions[4]  # the question about the modules stays

    item = out["item"]
    right, other = item["data"]["options"][0], item["data"]["options"][1]
    moved = fix(editor, item, {**item["data"], "answer": 1}, revision=1).json()
    assert moved["changes"] == [f"Question 2's right answer is “{other}”, not “{right}”."]


def test_a_word_search_fix_lays_the_grid_out_again(client_for: ClientFor, editor: TestClient) -> None:
    put_out(client_for, "search")
    game = todays(editor)["search"]
    words = game["puzzle"]["words"]
    item = game["items"][0]
    longest = max((w for w in words if w != item["data"]["word"]), key=len)
    inside = fix(editor, item, {"game": "search", "word": longest[:4]})
    assert (inside.status_code, list(inside.json()["error"]["fields"])) == (422, ["data.word"])
    assert f"inside “{longest}”" in inside.json()["error"]["message"]
    r = fix(editor, item, {"game": "search", "word": "ZYGOTE"})
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["changes"] == [
        f"ZYGOTE replaces {item['data']['word']} in the word list.",
        "The grid is laid out again, so the words sit in new places.",
    ]
    assert sorted(out["after"]["words"]) == sorted([w for w in words if w != item["data"]["word"]] + ["ZYGOTE"])


def test_a_nearest_neighbour_fix_changes_the_secret_word(client_for: ClientFor, editor: TestClient) -> None:
    put_out(client_for, "nearest")
    item = todays(editor)["nearest"]["items"][0]
    out = fix(editor, item, {"game": "nearest", "word": "spread"}).json()
    assert out["changes"] == [f"The secret word is “spread”, not “{item['data']['word']}”."]
    assert out["after"]["target"] == "spread"


# ── old views and limits ─────────────────────────────────────────────────────────────────────


def test_a_fix_made_on_an_old_view_is_refused(client_for: ClientFor, editor: TestClient) -> None:
    put_out(client_for, "word")
    item = todays(editor)["word"]["items"][0]
    data = {"game": "word", "word": SPARE[0] if SPARE[0] != item["data"]["word"] else SPARE[1]}

    def refused(r: Any, says: str) -> None:
        assert (r.status_code, r.json()["error"]["code"]) == (409, "puzzle_changed"), r.text
        assert says in r.json()["error"]["message"]

    refused(fix(editor, {**item, "version": item["version"] + 1}, data), "Someone saved this")
    refused(fix(editor, item, data, day=today() - dt.timedelta(days=1)), "new day")
    refused(fix(editor, item, data, revision=1), "Someone fixed today's puzzle")
    other = next(
        i
        for i in editor.get(f"{DAILY}/items", params={"game": "word", "limit": 200}).json()["items"]
        if i["id"] != item["id"]
    )
    refused(fix(editor, other, {"game": "word", "word": data["word"]}), "doesn't use this item")
    quiz = todays(editor)["quiz"]["items"][0]  # nobody has opened today's quiz: a save is enough
    refused(fix(editor, quiz, quiz["data"]), "saving it is enough")
    wrong_game = fix(editor, item, {"game": "search", "word": "HELLO"})
    assert list(wrong_game.json()["error"]["fields"]) == ["data.game"]
    missing = fix(editor, {"id": str(uuid.uuid4()), "version": 1}, data)
    assert missing.status_code == 404


def test_a_game_takes_five_fixes_a_day(client_for: ClientFor, editor: TestClient) -> None:
    put_out(client_for, "word")
    answer = todays(editor)["word"]["puzzle"]["answer"]
    words = [w for w in SPARE if w != answer]
    for n in range(5):
        item = todays(editor)["word"]["items"][0]
        r = fix(editor, item, {"game": "word", "word": words[n]}, revision=n)
        assert (r.status_code, r.json()["revision"]) == (200, n + 1), r.text
    game = todays(editor)["word"]
    assert game["fixesLeft"] == 0
    r = fix(editor, game["items"][0], {"game": "word", "word": words[5]}, revision=5)
    assert (r.status_code, r.json()["error"]["code"]) == (429, "rate_limited")
    assert r.json()["error"]["retryAfter"] > 0
