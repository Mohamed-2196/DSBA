"""Correlations' groups: four to eight words, four of them on a day's board, picked from the day's seed so they change
from day to day; a word may be in two groups of a theme, and a day never shows a word that two of its groups have."""

from __future__ import annotations

import datetime as dt
import uuid
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import User
from app.services.daily import editor
from app.services.daily.content import Entry, NotReadyError
from app.services.daily.games.groups import GroupsGame
from tests.daily.conftest import API

ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]
DAILY = f"{API}/content/daily"
SEED = b"a seed for these tests"
DAY = dt.date(2026, 10, 20)
GAME = GroupsGame()


def group(label: str, level: int, words: str) -> Entry:
    return Entry(uuid.uuid4(), "alpha", {"label": label, "level": level, "words": words.split()})


def days(n: int) -> list[dt.date]:
    return [DAY + dt.timedelta(days=i) for i in range(n)]


PLAIN = [
    group("Trees", 2, "OAK ASH ELM PINE"),
    group("Metals", 3, "IRON GOLD TIN ZINC"),
    group("Rivers", 4, "NILE AMAZON THAMES DANUBE"),
]


def test_a_day_shows_four_of_a_groups_words_and_they_change_from_day_to_day(db: Session) -> None:
    eight = group("Numbers", 1, "ONE TWO THREE FOUR FIVE SIX SEVEN EIGHT")
    shown: set[frozenset[str]] = set()
    for day in days(12):
        board = GAME.build(db, day, [eight, *PLAIN], SEED)
        assert [len(g.words) for g in board.groups] == [4, 4, 4, 4]
        assert set(board.groups[0].words) <= set(eight.data["words"])
        assert sorted(board.order) == sorted(w for g in board.groups for w in g.words)
        assert board == GAME.build(db, day, [eight, *PLAIN], SEED)  # the same day, the same board
        shown.add(frozenset(board.groups[0].words))
    assert len(shown) > 1


def test_a_day_never_shows_a_word_two_of_its_groups_have(db: Session) -> None:
    averages = group("Averages", 1, "MEAN MEDIAN MODE MIDRANGE AVERAGE")
    unkind = group("Unkind", 2, "MEAN CRUEL HARSH NASTY SPITEFUL")
    _, metals, rivers = PLAIN
    assert GAME.choose([averages, unkind, metals, rivers], {}, DAY, SEED) == [averages, unkind, metals, rivers]
    for day in days(10):
        board = GAME.build(db, day, [averages, unkind, metals, rivers], SEED)
        assert "MEAN" not in board.order
        assert len(set(board.order)) == 16
    # Sharing two words, neither group keeps four of its own: no day can take the two together.
    with pytest.raises(NotReadyError):
        GAME.choose([averages, group("Unkind", 2, "MEAN MEDIAN CRUEL HARSH"), metals, rivers], {}, DAY, SEED)


def test_a_day_takes_the_next_group_when_the_first_would_leave_another_short(db: Session) -> None:
    first = group("First", 1, "ALPHA BRAVO CHARLIE DELTA")  # never ran: offered first
    second = group("Second", 1, "ECHO FOXTROT GOLF HOTEL")  # ran yesterday
    trees, metals, _ = PLAIN
    last = group("Last", 4, "ALPHA BRAVO INDIA JULIET KILO")  # shares two words with First
    pool = [first, second, trees, metals, last]
    assert GAME.choose(pool, {second.id: [DAY - dt.timedelta(days=1)]}, DAY, SEED) == [second, trees, metals, last]
    with pytest.raises(NotReadyError):
        GAME.choose([first, trees, metals, last], {}, DAY, SEED)
    problem = editor.problem_of("groups", [first, trees, metals, last])
    assert problem == (
        "Correlations needs four groups, one a level, that each keep four words the other three don't have."
    )


def items(c: TestClient, **params: Any) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = c.get(f"{DAILY}/items", params={"game": "groups", **params}).json()["items"]
    return found


def save(c: TestClient, item: dict[str, Any], **data: Any) -> Any:
    body = {"theme": item["theme"], "data": {**item["data"], **data}, "version": item["version"]}
    return c.put(f"{DAILY}/items/{item['id']}", json=body)


def test_groups_hold_four_to_eight_words_that_other_groups_may_share(
    client_for: ClientFor, make_user: MakeUser
) -> None:
    c = client_for(make_user(roles=("student", "content-manager")))
    eight = ["SNOOKER", "POOL", "DARTS", "BOWLS", "CHESS", "BRIDGE", "POKER", "TENNIS"]
    r = c.post(
        f"{DAILY}/items",
        json={"theme": "alpha", "data": {"game": "groups", "label": "Pub games", "level": 3, "words": eight}},
    )
    assert r.status_code == 201, r.text
    nine = c.post(
        f"{DAILY}/items",
        json={"theme": "alpha", "data": {"game": "groups", "label": "Nine", "level": 3, "words": [*eight, "GOLF"]}},
    )
    assert nine.json()["error"]["fields"]["data.words"] == "Give 4 to 8 words. A day shows four of them."
    # A word another group of the theme has is fine: a day with both groups shows neither of them it.
    fruit = next(i for i in items(c, theme="alpha") if i["data"]["label"] == "Fruit")
    shared = save(c, fruit, words=["APPLE", "PEAR", "PLUM", "FIG", "MARS", "VENUS"])
    assert shared.status_code == 200, shared.text


def test_a_change_that_leaves_no_four_groups_with_four_words_each_is_refused(
    client_for: ClientFor, make_user: MakeUser
) -> None:
    # Alpha's plainest groups are Colours and Fruit, its trickiest Planets and Rivers.
    c = client_for(make_user(roles=("student", "content-manager")))
    by_label = {i["data"]["label"]: i for i in items(c, theme="alpha")}
    assert save(c, by_label["Fruit"], words=["APPLE", "PEAR", "PLUM", "FIG", "MARS", "VENUS"]).status_code == 200
    rivers = by_label["Rivers"]
    assert c.post(f"{DAILY}/items/{rivers['id']}/retire", json={"version": rivers["version"]}).status_code == 200
    # Fruit and Planets alone would leave Planets two words of its own (EARTH, SATURN).
    colours = by_label["Colours"]
    r = c.post(f"{DAILY}/items/{colours['id']}/retire", json={"version": colours["version"]})
    assert (r.status_code, r.json()["error"]["code"]) == (409, "theme_not_ready")
    assert "each keep four words" in r.json()["error"]["message"]
