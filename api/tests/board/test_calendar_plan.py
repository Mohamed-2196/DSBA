"""The student's plan on their calendar (IDEA-55): their boards' dated cards, theirs alone, switched on in their
calendar settings, and carried by their private feed while it is on."""

from __future__ import annotations

from collections.abc import Callable
from datetime import timedelta
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.time import bahrain_today
from app.models import CalendarEvent, Module, User
from tests.board.conftest import API, add, column, detail, first_board, make_board, move

ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]
PLAN = f"{API}/calendar/mine/plan"
SETTINGS = f"{API}/calendar/mine/settings"


def day(n: int) -> str:
    return (bahrain_today() + timedelta(days=n)).isoformat()


def plan(c: TestClient) -> list[dict[str, Any]]:
    r = c.get(PLAN)
    assert r.status_code == 200, r.text
    out: list[dict[str, Any]] = r.json()
    return out


def test_the_plan_is_your_dated_cards(client_for: ClientFor, make_user: MakeUser, event: CalendarEvent) -> None:
    c = client_for(make_user(name="Layla"))
    later = add(c, title="Past paper 2023", dueDate=day(9))
    soon = add(c, title="Read chapter 4", dueDate=day(2), dueTime="18:30")
    overdue = add(c, title="Flashcards", dueDate=day(-3))
    add(c, title="No day")  # no date: not on the calendar
    add(c, link={"type": "event", "id": event.id})  # dated only by its event: the calendar shows the event
    done = add(c, title="Done already", dueDate=day(1))
    board = detail(c, first_board(c))["board"]
    assert move(c, done, column(board, "Done")).status_code == 200
    archived = make_board(c, name="Old term")
    add(c, title="On an archived board", dueDate=day(4), boardId=archived["id"])
    assert c.patch(f"{API}/boards/{archived['id']}", json={"archived": True}).status_code == 200

    got = plan(c)
    assert [card["id"] for card in got] == [overdue["id"], soon["id"], later["id"]]
    assert got[1]["due"] == day(2)
    assert got[1]["dueTime"] == "18:30:00"
    assert got[1]["boardName"] == board["name"]


def test_a_revision_plan_gives_its_cards_days(
    client_for: ClientFor, make_user: MakeUser, module: Module, db: Session
) -> None:
    c = client_for(make_user(name="Layla"))
    r = c.post(f"{API}/board-plans", json={"moduleId": module.id, "examDate": day(10)})
    assert r.status_code == 200, r.text
    got = plan(c)
    assert got, "a plan's lessons have days"
    assert all(card["planModuleId"] == module.id and card["dueDate"] is None for card in got)
    assert all(day(0) <= card["due"] <= day(10) for card in got)


def test_the_plan_is_yours_alone(client_for: ClientFor, make_user: MakeUser) -> None:
    sara = client_for(make_user(name="Sara"))
    add(sara, title="Sara's paper", dueDate=day(2))
    assert plan(client_for(make_user(name="Omar"))) == []
    assert client_for().get(PLAN).status_code == 401


def test_no_plan_while_boards_are_off(
    client_for: ClientFor, make_user: MakeUser, set_feature: Callable[..., None]
) -> None:
    c = client_for(make_user(name="Layla"))
    add(c, title="Paper", dueDate=day(2))
    set_feature("board", "off")
    assert plan(c) == []


def test_show_plan_is_a_setting_off_until_switched_on(client_for: ClientFor, make_user: MakeUser) -> None:
    c = client_for(make_user(name="Layla"))
    assert c.get(SETTINGS).json()["showPlan"] is False
    r = c.patch(SETTINGS, json={"showPlan": True})
    assert r.status_code == 200, r.text
    assert r.json()["showPlan"] is True
    # other settings leave it as it is
    assert c.patch(SETTINGS, json={"hiddenTypes": ["break"]}).json()["showPlan"] is True
    assert c.patch(SETTINGS, json={"showPlan": False}).json()["showPlan"] is False


def test_the_private_feed_carries_the_plan_while_it_shows(
    client_for: ClientFor, make_user: MakeUser, client: TestClient
) -> None:
    c = client_for(make_user(name="Layla", year=1))
    card = add(c, title="Past paper 2023; zone A", dueDate=day(3))
    timed = add(c, title="Mock run", dueDate=day(4), dueTime="18:30")
    r = c.post(f"{API}/calendar/mine/feed")
    assert r.status_code == 200, r.text
    path = r.json()["feedPath"]
    assert "dsba-hub-plan" not in client.get(path).text  # off until switched on

    c.patch(SETTINGS, json={"showPlan": True})
    ics = client.get(path).text.replace("\r\n ", "")
    assert f"UID:{card['id']}@dsba-hub-plan" in ics
    assert "SUMMARY:Past paper 2023\\; zone A" in ics
    start = day(3).replace("-", "")
    assert f"DTSTART;VALUE=DATE:{start}" in ics
    assert f"UID:{timed['id']}@dsba-hub-plan" in ics
    assert f"DTSTART;TZID=Asia/Bahrain:{day(4).replace('-', '')}T183000" in ics
    assert f"/board?board={card['boardId']}&card={card['id']}" in ics
