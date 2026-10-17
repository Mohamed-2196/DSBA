"""Manage → Daily puzzles: who may edit, each game's rules, versions and the audit, retiring and deleting, themes,
the schedule, bulk imports, the guess list, the vocabulary and the preview."""

from __future__ import annotations

import datetime as dt
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.time import bahrain_today
from app.models import AuditEntry, DailyItem, DailyTheme, User
from app.services.daily import content
from app.services.daily.games import GAMES
from tests.daily.conftest import API, GUESSES, VOCABULARY

ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]
DAILY = f"{API}/content/daily"


@pytest.fixture
def c(client_for: ClientFor, make_user: MakeUser) -> TestClient:
    return client_for(make_user(name="Hana Content", roles=("student", "content-manager"), year=None))


def items(c: TestClient, game: str, **params: Any) -> list[dict[str, Any]]:
    r = c.get(f"{DAILY}/items", params={"game": game, **params})
    assert r.status_code == 200, r.text
    found: list[dict[str, Any]] = r.json()["items"]
    return found


def overview(c: TestClient) -> dict[str, Any]:
    body: dict[str, Any] = c.get(DAILY).json()
    return body


def actions(db: Session) -> list[str]:
    return [a.action for a in db.scalars(select(AuditEntry).order_by(AuditEntry.id)) if a.action.startswith("daily.")]


def quiz(**fields: Any) -> dict[str, Any]:
    return {
        "game": "quiz",
        "question": "What does a p-value measure?",
        "options": ["The evidence against the null", "The size of the effect"],
        "answer": 0,
        "explanation": "A small p-value says the data would be unlikely if the null were true.",
        **fields,
    }


# ── who may edit ─────────────────────────────────────────────────────────────────────────────


def test_only_content_editors_reach_it(
    client_for: ClientFor, make_user: MakeUser, set_feature: Callable[..., None], c: TestClient
) -> None:
    assert client_for().get(DAILY).status_code == 401
    assert client_for(make_user()).get(DAILY).status_code == 403
    assert client_for(make_user()).post(f"{DAILY}/items", json={"theme": "alpha", "data": quiz()}).status_code == 403
    assert c.get(DAILY).status_code == 200
    set_feature("daily", "off")
    r = c.get(DAILY)
    assert (r.status_code, r.json()["error"]["code"]) == (404, "feature_off")
    admin = client_for(make_user(roles=("student", "admin")))
    assert admin.get(DAILY).status_code == 200  # admins see every feature, to fill one before it's on


def test_the_overview_shows_each_theme_with_what_it_has_and_the_weeks_to_come(c: TestClient) -> None:
    body = overview(c)
    assert [t["id"] for t in body["themes"]] == ["alpha", "beta"]
    alpha = body["themes"][0]
    assert alpha["counts"] == {"word": 8, "groups": 8, "search": 10, "quiz": 6, "nearest": 2}
    assert (alpha["inRotation"], alpha["problems"], alpha["used"]) == (True, [], False)
    weeks = body["weeks"]
    assert len(weeks) == 16
    assert weeks[0]["weekStart"] == content.week_start(bahrain_today()).isoformat()
    assert [w["started"] for w in weeks[:2]] == [True, False]
    assert {weeks[0]["theme"], weeks[1]["theme"]} == {"alpha", "beta"}  # they take turns
    assert (body["guessWords"], body["vocabularyWords"]) == (len(GUESSES), len(VOCABULARY))
    assert body["tags"] == sorted({t for tags, _ in VOCABULARY.values() for t in tags})


# ── each game's rules ────────────────────────────────────────────────────────────────────────


UNIQUE = ["ONE", "TWO", "SIX", "TEN"]


@pytest.mark.parametrize(
    ("data", "field", "says"),
    [
        ({"game": "word", "word": "ABCD"}, "data.word", "five letters"),
        ({"game": "word", "word": "ZZZZZ"}, "data.word", "isn't in the guess list"),
        ({"game": "word", "word": "means"}, "data.word", "already an answer word"),
        ({"game": "groups", "label": "Odd", "level": 2, "words": UNIQUE[:3]}, "data.words", "4 to 8 words"),
        ({"game": "groups", "label": "Odd", "level": 2, "words": ["ONE", "TWO", "TWO", "SIX"]}, "data.words", "once"),
        (
            {"game": "groups", "label": "Odd", "level": 2, "words": ["ON E", "TWO", "SIX", "TEN"]},
            "data.words",
            "spaces",
        ),
        ({"game": "groups", "label": "Odd", "level": 2, "words": [*UNIQUE[:3], "red"]}, "data.words", "in “Colours”"),
        ({"game": "groups", "label": "colours", "level": 2, "words": UNIQUE}, "data.label", "group called"),
        ({"game": "groups", "label": "Odd", "level": 5, "words": UNIQUE}, "data.groups.level", ""),
        ({"game": "search", "word": "ABC"}, "data.word", "4 to 10 letters"),
        ({"game": "search", "word": "median"}, "data.word", "already in Alpha week's word search"),
        (quiz(question="Short?"), "data.question", "10 to 200"),
        (quiz(options=["Only one"]), "data.options", "2 to 6"),
        (quiz(options=["Same", "same "]), "data.options", "different"),
        (quiz(options=["A", ""]), "data.options", "every option"),
        (quiz(answer=2), "data.answer", "right answer"),
        (quiz(explanation=" "), "data.explanation", "300"),
        (quiz(moduleId="no-such-module"), "data.moduleId", "modules"),
        (quiz(question="Which option is right in alpha question 1?"), "data.question", "already in the quiz"),
        ({"game": "nearest", "word": "zebra"}, "data.word", "isn't in the vocabulary"),
        ({"game": "nearest", "word": "Mean"}, "data.word", "already a secret word"),
    ],
)
def test_each_game_checks_its_items(c: TestClient, data: dict[str, Any], field: str, says: str) -> None:
    r = c.post(f"{DAILY}/items", json={"theme": "alpha", "data": data})
    assert r.status_code == 422, r.text
    assert says in r.json()["error"]["fields"][field]


def test_an_item_is_added_and_edited_with_versions_and_the_audit(c: TestClient, db: Session) -> None:
    r = c.post(f"{DAILY}/items", json={"theme": "alpha", "data": quiz(moduleId="test-module-2")})
    assert r.status_code == 201, r.text
    item = r.json()
    assert (item["data"]["moduleId"], item["version"], item["uses"], item["lastUsed"]) == ("test-module-2", 1, 0, None)
    edited = {"theme": "beta", "data": quiz(options=[*quiz()["options"], "  The  sample   size "]), "version": 1}
    r = c.put(f"{DAILY}/items/{item['id']}", json=edited)
    assert r.status_code == 200, r.text
    assert (r.json()["theme"], r.json()["data"]["options"][2], r.json()["version"]) == ("beta", "The sample size", 2)
    stale = c.put(f"{DAILY}/items/{item['id']}", json={**edited, "theme": "alpha"})
    assert (stale.status_code, stale.json()["error"]["code"]) == (409, "puzzle_changed")
    other = c.put(
        f"{DAILY}/items/{item['id']}", json={**edited, "data": {"game": "word", "word": "CRANE"}, "version": 2}
    )
    assert other.json()["error"]["fields"] == {"data.game": "An item stays in its game."}
    assert actions(db) == ["daily.item.create", "daily.item.update"]
    update = db.scalars(select(AuditEntry).where(AuditEntry.action == "daily.item.update")).one()
    assert update.data["before"]["theme"] == "alpha"
    assert update.data["after"]["theme"] == "beta"
    assert update.data["title"].startswith("Quick quiz: What does a p-value")


def test_the_list_finds_items_by_theme_status_and_any_of_their_words(c: TestClient) -> None:
    assert len(items(c, "word", theme="alpha")) == 8
    assert [i["data"]["label"] for i in items(c, "groups", q="hamst")] == ["Pets"]
    assert [i["data"]["word"] for i in items(c, "search", q="edia")] == ["MEDIAN"]
    assert len(items(c, "quiz", q="wrong 3b")) == 2  # an option, in both themes
    assert items(c, "nearest", theme="alpha")[0]["closest"][:1] in (["median"], ["variance"])
    assert c.get(f"{DAILY}/items", params={"game": "sudoku"}).status_code == 422


# ── retiring, deleting, and themes that run ──────────────────────────────────────────────────


def test_an_item_is_retired_brought_back_and_deleted_only_if_it_never_ran(c: TestClient, db: Session) -> None:
    today = bahrain_today()
    word = items(c, "word", theme="alpha", q="RATIO")[0]
    r = c.post(f"{DAILY}/items/{word['id']}/retire", json={"version": word["version"]})
    assert (r.status_code, r.json()["retired"]) == (200, True)
    assert "RATIO" not in [i["data"]["word"] for i in items(c, "word", theme="alpha")]
    assert [i["data"]["word"] for i in items(c, "word", status="retired")] == ["RATIO"]
    again = c.post(f"{DAILY}/items/{word['id']}/restore", json={"version": word["version"]})
    assert again.json()["error"]["code"] == "puzzle_changed"
    back = c.post(f"{DAILY}/items/{word['id']}/restore", json={"version": word["version"] + 1})
    assert (back.status_code, back.json()["retired"]) == (200, False)
    # The word that runs today can't go: its day keeps it. One that never ran can.
    ran = GAMES["word"].puzzle(db, today, "").answer
    db.commit()
    used = items(c, "word", q=ran)[0]
    assert (used["uses"], used["lastUsed"]) == (1, today.isoformat())
    r = c.delete(f"{DAILY}/items/{used['id']}", params={"version": used["version"]})
    assert (r.status_code, r.json()["error"]["code"]) == (409, "content_in_use")
    unused = next(i for i in items(c, "word") if i["uses"] == 0)
    assert c.delete(f"{DAILY}/items/{unused['id']}", params={"version": unused["version"]}).status_code == 204
    assert actions(db) == ["daily.item.retire", "daily.item.restore", "daily.item.delete"]


def test_a_theme_that_runs_is_never_left_short(c: TestClient) -> None:
    last_two = [i for i in items(c, "groups", theme="beta") if i["data"]["level"] == 4]
    assert c.post(f"{DAILY}/items/{last_two[0]['id']}/retire", json={"version": 1}).status_code == 200
    r = c.post(f"{DAILY}/items/{last_two[1]['id']}/retire", json={"version": 1})
    assert (r.status_code, r.json()["error"]["code"]) == (409, "theme_not_ready")
    assert "level 4" in r.json()["error"]["message"]
    # Moving a group to another level is checked the same way.
    group = last_two[1]
    moved = {"theme": "beta", "data": {**group["data"], "level": 3}, "version": 1}
    assert c.put(f"{DAILY}/items/{group['id']}", json=moved).json()["error"]["code"] == "theme_not_ready"


# ── themes, the rotation and the schedule ────────────────────────────────────────────────────


def test_a_new_theme_joins_the_rotation_once_every_game_can_run(c: TestClient, db: Session) -> None:
    r = c.post(f"{DAILY}/themes", json={"id": "gamma", "title": " Gamma  week ", "blurb": "Greek letters."})
    assert r.status_code == 201, r.text
    gamma = next(t for t in r.json()["themes"] if t["id"] == "gamma")
    assert (gamma["title"], gamma["inRotation"], gamma["version"]) == ("Gamma week", False, 1)
    assert len(gamma["problems"]) == 5
    assert c.post(f"{DAILY}/themes", json={"id": "gamma", "title": "Again"}).json()["error"]["code"] == "slug_taken"
    assert "id" in c.post(f"{DAILY}/themes", json={"id": "Gamma!", "title": "Bad"}).json()["error"]["fields"]
    join = {"title": "Gamma week", "blurb": "Greek letters.", "inRotation": True, "version": 1}
    r = c.put(f"{DAILY}/themes/gamma", json=join)
    assert (r.status_code, r.json()["error"]["code"]) == (409, "theme_not_ready")
    renamed = c.put(f"{DAILY}/themes/gamma", json={**join, "title": "Greek week", "inRotation": False})
    assert next(t for t in renamed.json()["themes"] if t["id"] == "gamma")["version"] == 2
    assert c.delete(f"{DAILY}/themes/gamma", params={"version": 2}).status_code == 200
    assert actions(db) == ["daily.theme.create", "daily.theme.update", "daily.theme.delete"]


def test_the_rotation_keeps_a_theme_and_a_theme_that_ran_stays(c: TestClient, db: Session) -> None:
    GAMES["word"].puzzle(db, bahrain_today(), "")  # this week's theme runs
    db.commit()
    themes = {t["id"]: t for t in overview(c)["themes"]}
    running = overview(c)["weeks"][0]["theme"]
    other = next(t for t in themes if t != running)
    out = {"title": themes[other]["title"], "blurb": "", "inRotation": False, "version": 1}
    assert c.put(f"{DAILY}/themes/{other}", json=out).status_code == 200
    last = {"title": themes[running]["title"], "blurb": "", "inRotation": False, "version": 1}
    r = c.put(f"{DAILY}/themes/{running}", json=last)
    assert r.json()["error"]["fields"] == {"inRotation": "At least one theme stays in the rotation."}
    r = c.delete(f"{DAILY}/themes/{running}", params={"version": 1})
    assert (r.status_code, r.json()["error"]["code"]) == (409, "content_in_use")


def test_reordering_the_rotation_leaves_the_weeks_that_started(c: TestClient) -> None:
    before = overview(c)["weeks"]
    r = c.post(f"{DAILY}/themes/order", json={"ids": ["beta", "alpha"]})
    assert r.status_code == 200, r.text
    after = r.json()["weeks"]
    assert after[0] == before[0]  # this week keeps its theme
    assert [t["id"] for t in r.json()["themes"]] == ["beta", "alpha"]
    stale = c.post(f"{DAILY}/themes/order", json={"ids": ["beta"]})
    assert stale.json()["error"]["code"] == "puzzle_changed"


def test_a_week_to_come_can_be_given_a_theme_and_given_back(c: TestClient, db: Session) -> None:
    weeks = overview(c)["weeks"]
    week = weeks[2]
    other = "beta" if week["theme"] == "alpha" else "alpha"
    r = c.put(f"{DAILY}/weeks/{week['weekStart']}", json={"theme": other})
    assert r.status_code == 200, r.text
    chosen = r.json()["weeks"]
    assert (chosen[2]["theme"], chosen[2]["pinned"]) == (other, True)
    assert chosen[3]["theme"] == week["theme"]  # the rotation carries on after it
    assert weeks[1] == chosen[1]
    back = c.put(f"{DAILY}/weeks/{week['weekStart']}", json={"theme": None}).json()["weeks"]
    assert back == weeks
    started = c.put(f"{DAILY}/weeks/{weeks[0]['weekStart']}", json={"theme": other})
    assert "weekStart" in started.json()["error"]["fields"]
    monday = dt.date.fromisoformat(week["weekStart"]) + dt.timedelta(days=1)
    assert "weekStart" in c.put(f"{DAILY}/weeks/{monday}", json={"theme": other}).json()["error"]["fields"]
    unknown = c.put(f"{DAILY}/weeks/{week['weekStart']}", json={"theme": "nope"})
    assert "theme" in unknown.json()["error"]["fields"]
    assert actions(db) == ["daily.schedule.update", "daily.schedule.update"]


# ── bulk import ──────────────────────────────────────────────────────────────────────────────


def test_a_word_list_is_checked_then_imported(c: TestClient, db: Session) -> None:
    body = {"game": "word", "theme": "beta", "text": "plant, BRICK\nglove abcd\nPLANT QUAKE", "dryRun": True}
    dry = c.post(f"{DAILY}/import", json=body).json()
    assert dry["added"] == 0
    assert [(row["line"], row["text"], row["problem"] is None) for row in dry["rows"]] == [
        (1, "plant", True),
        (1, "BRICK", True),
        (2, "glove", True),
        (2, "abcd", False),
        (3, "PLANT", False),
        (3, "QUAKE", False),
    ]
    assert dry["rows"][4]["problem"] == "It's in the list twice."
    assert "guess list" in dry["rows"][5]["problem"]
    assert len(items(c, "word", theme="beta")) == 8
    real = c.post(f"{DAILY}/import", json={**body, "dryRun": False, "addGuesses": True}).json()
    assert real["added"] == 4  # QUAKE joins the guess list too
    assert {"PLANT", "BRICK", "GLOVE", "QUAKE"} <= {i["data"]["word"] for i in items(c, "word", theme="beta")}
    assert actions(db) == ["daily.item.import"]


def test_quiz_questions_and_groups_are_imported_from_a_spreadsheets_rows(c: TestClient) -> None:
    csv = (
        "Question,Correct answer,Wrong 1,Wrong 2,Explanation,Module\n"
        '"What is 2 + 2, roughly?",4,5,22,Basic sums.,ts2001\n'
        "Too short,a,b,c,Nope.,\n"
        "Which unit is this question about?,One,Two,Three,It is.,XX9999\n"
    )
    report = c.post(f"{DAILY}/import", json={"game": "quiz", "theme": "alpha", "text": csv}).json()
    assert report["added"] == 1
    problems = [row["problem"] for row in report["rows"]]
    assert problems[0] is None
    assert "10 to 200" in problems[1]
    assert "no module “XX9999”" in problems[2]
    added = items(c, "quiz", q="2 + 2")[0]["data"]
    assert (added["options"], added["answer"], added["moduleId"]) == (["4", "5", "22"], 0, "test-module-2")
    sheet = "Label\tLevel\tWords\nVehicles\t1\tCAR BUS TRAM TAXI\nAgain\t2\tRED BLUE ONE TWO\nLevel\tfive\tA B C D\n"
    report = c.post(f"{DAILY}/import", json={"game": "groups", "theme": "alpha", "text": sheet}).json()
    assert report["added"] == 1
    assert "“BLUE” is already in “Colours”" in report["rows"][1]["problem"]
    assert "level" in report["rows"][2]["problem"]
    no_header = c.post(f"{DAILY}/import", json={"game": "quiz", "theme": "alpha", "text": "a,b,c\n1,2,3"})
    assert "header row" in no_header.json()["error"]["fields"]["text"]


# ── the guess list and the vocabulary ────────────────────────────────────────────────────────


def test_the_guess_list_takes_words_and_keeps_the_ones_in_use(
    c: TestClient, client_for: ClientFor, make_user: MakeUser, db: Session
) -> None:
    listed = c.get(f"{DAILY}/guesses", params={"q": "cr"}).json()
    assert (listed["total"], listed["words"], listed["more"]) == (len(GUESSES), ["CRANE"], False)
    dry = c.post(f"{DAILY}/guesses", json={"text": "quake, QUILT crane abc", "dryRun": True}).json()
    assert (dry["new"], dry["known"], dry["refused"], dry["total"]) == (
        ["QUAKE", "QUILT"],
        ["CRANE"],
        ["ABC"],
        len(GUESSES) + 2,
    )
    assert c.get(f"{DAILY}/guesses").json()["total"] == len(GUESSES)
    assert c.post(f"{DAILY}/guesses", json={"text": "quake quilt"}).json()["total"] == len(GUESSES) + 2
    answer = c.delete(f"{DAILY}/guesses/MEANS")
    assert (answer.status_code, answer.json()["error"]["code"]) == (409, "content_in_use")
    player = client_for(make_user())
    guessed = player.post(
        f"{API}/daily/{bahrain_today()}/word/moves", json={"move": {"kind": "guess", "word": "brick"}}
    )
    assert guessed.status_code == 200
    assert c.delete(f"{DAILY}/guesses/BRICK").json()["error"]["code"] == "content_in_use"
    assert c.delete(f"{DAILY}/guesses/glove").status_code == 204
    assert c.delete(f"{DAILY}/guesses/GLOVE").status_code == 404
    assert actions(db) == ["daily.guesses.add", "daily.guesses.remove"]


def test_the_vocabulary_ranks_the_secret_words_again_when_it_changes(c: TestClient, db: Session) -> None:
    r = c.post(
        f"{DAILY}/vocabulary", json={"word": "Average", "tags": ["stats", "average", "measure"], "near": ["mean"]}
    )
    assert r.status_code == 201, r.text
    assert (r.json()["word"], r.json()["secretIn"]) == ("average", None)
    mean = items(c, "nearest", q="mean")[0]
    assert mean["closest"][:2] == ["average", "median"]  # both share every tag and are near it
    bad = c.post(f"{DAILY}/vocabulary", json={"word": "odd", "tags": ["one", "two"]})
    assert "tags" in bad.json()["error"]["fields"]
    far = c.post(f"{DAILY}/vocabulary", json={"word": "odd", "tags": ["a1", "bb", "cc"], "near": ["nowhere"]})
    assert "tags" in far.json()["error"]["fields"]
    unknown = c.post(f"{DAILY}/vocabulary", json={"word": "odd", "tags": ["aa", "bb", "cc"], "near": ["nowhere"]})
    assert "isn't in the vocabulary" in unknown.json()["error"]["fields"]["near"]
    saved = c.put(
        f"{DAILY}/vocabulary/average", json={"tags": ["food", "everyday", "nature"], "near": [], "version": 1}
    )
    assert saved.json()["version"] == 2
    assert items(c, "nearest", q="mean")[0]["closest"][0] == "median"
    stale = c.put(f"{DAILY}/vocabulary/average", json={"tags": ["food", "everyday", "nature"], "version": 1})
    assert stale.json()["error"]["code"] == "puzzle_changed"
    secret = c.delete(f"{DAILY}/vocabulary/mean", params={"version": 1})
    assert (secret.status_code, secret.json()["error"]["code"]) == (409, "content_in_use")
    assert c.delete(f"{DAILY}/vocabulary/median", params={"version": 1}).status_code == 204
    near = c.get(f"{DAILY}/vocabulary", params={"q": "mean"}).json()["items"][0]
    assert (near["word"], near["near"], near["secretIn"]) == ("mean", [], "alpha")  # its close word is gone
    listed = c.get(f"{DAILY}/vocabulary", params={"q": "ml"}).json()
    assert {w["word"] for w in listed["items"]} == {"model", "neuron", "layer", "train"}  # by tag
    kinds = actions(db)
    assert kinds == ["daily.vocabulary.create", "daily.vocabulary.update", "daily.vocabulary.delete"]


# ── preview ──────────────────────────────────────────────────────────────────────────────────


def test_the_preview_shows_a_day_to_come_and_a_day_that_is_out(c: TestClient, db: Session) -> None:
    today = bahrain_today()
    soon = c.get(f"{DAILY}/preview", params={"day": (today + dt.timedelta(days=3)).isoformat()}).json()
    assert [g["game"] for g in soon["games"]] == ["word", "groups", "search", "quiz", "nearest"]
    assert not any(g["fixed"] for g in soon["games"])
    by_game = {g["game"]: g["puzzle"] for g in soon["games"]}
    assert len(by_game["word"]["answer"]) == 5
    assert [g["level"] for g in by_game["groups"]["groups"]] == [1, 2, 3, 4]
    assert (len(by_game["search"]["words"]), len(by_game["search"]["grid"])) == (8, 10)
    assert len(by_game["quiz"]["questions"]) == 5
    assert by_game["nearest"]["target"] in {"mean", "variance", "model", "neuron"}
    assert db.scalars(select(DailyItem).limit(1)).first() is not None
    GAMES["word"].puzzle(db, today, "")
    db.commit()
    now = c.get(f"{DAILY}/preview", params={"day": today.isoformat()}).json()
    fixed = {g["game"]: g["fixed"] for g in now["games"]}
    assert (fixed["word"], fixed["groups"]) == (True, False)
    early = c.get(f"{DAILY}/preview", params={"day": "2026-09-01"})
    assert "day" in early.json()["error"]["fields"]
    late = c.get(f"{DAILY}/preview", params={"day": (today + dt.timedelta(days=500)).isoformat()})
    assert "day" in late.json()["error"]["fields"]


def test_a_preview_names_what_a_short_theme_lacks(c: TestClient, db: Session) -> None:
    for item in db.scalars(select(DailyItem).where(DailyItem.game == "search")):
        item.retired = True
    db.commit()
    body = c.get(f"{DAILY}/preview", params={"day": (bahrain_today() + dt.timedelta(days=1)).isoformat()}).json()
    search = next(g for g in body["games"] if g["game"] == "search")
    assert (search["puzzle"], search["problem"]) == (None, "Word search needs at least 8 words.")


def test_a_new_install_puts_its_first_theme_in_the_rotation(c: TestClient, db: Session) -> None:
    # A new install's themes wait out of the rotation, with nothing scheduled.
    for theme in db.scalars(select(DailyTheme)):
        theme.in_rotation = False
    db.commit()
    assert overview(c)["weeks"] == []
    week = (content.week_start(bahrain_today()) + 2 * content.WEEK).isoformat()
    assert c.put(f"{DAILY}/weeks/{week}", json={"theme": "beta"}).status_code == 200
    alpha = next(t for t in overview(c)["themes"] if t["id"] == "alpha")
    r = c.put(f"{DAILY}/themes/alpha", json={"title": alpha["title"], "blurb": "", "inRotation": True, "version": 1})
    assert r.status_code == 200, r.text
    weeks = r.json()["weeks"]
    assert [w["theme"] for w in weeks[:4]] == ["alpha", "alpha", "beta", "alpha"]


def test_rows_that_cant_be_read_are_refused_on_the_text(c: TestClient) -> None:
    huge = "x" * 140_000  # more than a CSV field may hold
    r = c.post(
        f"{DAILY}/import", json={"game": "quiz", "theme": "alpha", "text": f'question,answer,wrong\n"{huge}",b,c'}
    )
    assert (r.status_code, list(r.json()["error"]["fields"])) == (422, ["text"])
