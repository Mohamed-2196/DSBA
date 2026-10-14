"""Cards: adding, moving across columns and boards, details (checklist, priority, labels, due time, reminders),
cards from the hub, lessons that finish their cards, the agenda, limits and the export."""

from __future__ import annotations

import datetime as dt
from collections.abc import Callable
from datetime import timedelta
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.time import BAHRAIN, bahrain_today, utcnow
from app.models import Board, BoardCard, BoardColumn, CalendarEvent, Module, Notification, User
from app.services.board import cards as svc
from app.services.board import common, reminders
from tests.board.conftest import API, add, column, detail, first_board, make_board, move, titles
from tests.core.helpers import share_pdf
from tests.lessons import lesson_id

ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]


def test_the_first_card_makes_a_study_board(client_for: ClientFor, make_user: MakeUser) -> None:
    c = client_for(make_user())
    first = add(c, title="Read chapter 2", description="Pages **30** to 45", dueDate="2026-11-01")
    board = first_board(c)
    assert (board["name"], board["template"]) == ("Study", "study")
    assert first["columnId"] == column(board, "To do")
    assert (first["description"], first["dueDate"], first["priority"], first["checklist"]) == (
        "Pages **30** to 45",
        "2026-11-01",
        "none",
        [],
    )
    add(c, title="Past paper 2023")
    add(c, columnId=column(board, "In progress"), title="Revise")
    assert titles(c, board, "To do") == ["Read chapter 2", "Past paper 2023"]
    assert titles(c, board, "In progress") == ["Revise"]
    assert len(c.get(f"{API}/boards").json()["boards"]) == 1  # the next cards go to the same board


def test_moving_writes_one_card_and_keeps_the_order(client_for: ClientFor, make_user: MakeUser) -> None:
    c = client_for(make_user())
    board = make_board(c)
    todo, done, doing = column(board, "To do"), column(board, "Done"), column(board, "In progress")
    a, b, d = (add(c, boardId=board["id"], title=t) for t in ("A", "B", "D"))
    assert move(c, d, todo, a).status_code == 200
    assert titles(c, board, "To do") == ["A", "D", "B"]
    assert move(c, b, todo).status_code == 200  # null: the top
    assert titles(c, board, "To do") == ["B", "A", "D"]
    r = move(c, a, done)
    assert r.json()["columnId"] == done
    assert r.json()["doneAt"] is not None
    assert move(c, a, doing).json()["doneAt"] is None
    r = move(c, b, doing, d)  # d is in another column
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "retry"


def test_many_moves_into_one_gap_number_the_column_again(client_for: ClientFor, make_user: MakeUser) -> None:
    c = client_for(make_user())
    board = make_board(c)
    todo, doing = column(board, "To do"), column(board, "In progress")
    first = add(c, columnId=todo, title="first")
    add(c, columnId=todo, title="last")
    moved = [add(c, columnId=doing, title=f"card {i}") for i in range(60)]
    for card in moved:  # each lands right after "first": the gap halves every time
        assert move(c, card, todo, first).status_code == 200
    assert titles(c, board, "To do") == ["first", *[f"card {i}" for i in reversed(range(60))], "last"]


def test_a_card_moves_to_another_board(client_for: ClientFor, make_user: MakeUser, event: CalendarEvent) -> None:
    c = client_for(make_user())
    study, home = make_board(c), make_board(c, "Home", "personal")
    card = add(c, boardId=study["id"], title="Buy a calculator")
    r = move(c, card, column(home, "This week"))
    assert r.status_code == 200
    assert r.json()["boardId"] == home["id"]
    assert detail(c, study)["cards"] == []
    assert [x["title"] for x in detail(c, home)["cards"]] == ["Buy a calculator"]
    on_study = add(c, boardId=study["id"], link={"type": "event", "id": event.id})
    add(c, boardId=home["id"], link={"type": "event", "id": event.id})  # once per board
    r = move(c, on_study, column(home, "Today"))
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "already_on_board"


def test_details_of_a_card(client_for: ClientFor, make_user: MakeUser) -> None:
    c = client_for(make_user())
    card = add(c, title="Draft", description="old", dueDate="2026-11-01", priority="high")
    checklist = [{"id": "a1", "text": "Outline"}, {"id": "b2", "text": "Write", "done": True}]
    r = c.patch(f"{API}/board-cards/{card['id']}", json={"title": "Final", "description": None, "checklist": checklist})
    assert r.status_code == 200, r.text
    got = r.json()
    assert (got["title"], got["description"], got["priority"]) == ("Final", None, "high")
    assert got["checklist"] == [
        {"id": "a1", "text": "Outline", "done": False},
        {"id": "b2", "text": "Write", "done": True},
    ]
    r = c.patch(f"{API}/board-cards/{card['id']}", json={"dueTime": "14:30", "priority": "low"})
    assert (r.json()["dueTime"], r.json()["priority"]) == ("14:30:00", "low")
    r = c.patch(f"{API}/board-cards/{card['id']}", json={"dueDate": None})
    assert (r.json()["dueDate"], r.json()["dueTime"]) == (None, None)  # no time without a day
    assert c.patch(f"{API}/board-cards/{card['id']}", json={"checklist": []}).json()["checklist"] == []
    dup = [{"id": "x", "text": "One"}, {"id": "x", "text": "Two"}]
    assert c.patch(f"{API}/board-cards/{card['id']}", json={"checklist": dup}).status_code == 422
    too_many = [{"id": f"i{i}", "text": "t"} for i in range(51)]
    assert c.patch(f"{API}/board-cards/{card['id']}", json={"checklist": too_many}).status_code == 422
    assert c.patch(f"{API}/board-cards/{card['id']}", json={"title": "   "}).status_code == 422
    assert c.patch(f"{API}/board-cards/{card['id']}", json={"priority": "urgent"}).status_code == 422
    assert c.patch(f"{API}/board-cards/{card['id']}", json={"remindBefore": 30}).status_code == 422
    assert c.delete(f"{API}/board-cards/{card['id']}").status_code == 204
    assert c.delete(f"{API}/board-cards/{card['id']}").status_code == 404


def test_a_card_needs_a_title(client_for: ClientFor, make_user: MakeUser) -> None:
    c = client_for(make_user())
    r = c.post(f"{API}/board-cards", json={"description": "no title"})
    assert r.status_code == 422
    assert r.json()["error"]["fields"] == {"title": "Give the card a title."}
    assert c.post(f"{API}/board-cards", json={"title": "x" * 201}).status_code == 422


def test_reminders_become_notifications(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    user = make_user()
    c = client_for(user)
    tomorrow = bahrain_today() + timedelta(days=1)
    card = add(c, title="Hand in the essay", dueDate=tomorrow.isoformat(), dueTime="10:00")
    c.patch(f"{API}/board-cards/{card['id']}", json={"remindBefore": 60})
    row = db.get(BoardCard, card["id"])
    assert row is not None
    db.refresh(row)
    assert row.remind_at == dt.datetime.combine(tomorrow, dt.time(9, 0), tzinfo=BAHRAIN)

    assert reminders.remind(db, now=utcnow()) == 0  # not yet
    assert reminders.remind(db, now=row.remind_at + timedelta(seconds=1)) == 1
    db.commit()
    note = db.scalar(select(Notification).where(Notification.user_id == user.id))
    assert note is not None
    assert (note.kind, note.title) == ("board_reminder", "Due tomorrow at 10:00: Hand in the essay")
    assert note.url == f"/board?b={card['boardId']}&card={card['id']}"
    db.refresh(row)
    assert row.remind_at is None  # sent once

    # a reminder in the past is never set, and a card done has none
    c.patch(f"{API}/board-cards/{card['id']}", json={"dueDate": "2020-01-01"})
    db.refresh(row)
    assert row.remind_at is None
    c.patch(f"{API}/board-cards/{card['id']}", json={"dueDate": tomorrow.isoformat(), "remindBefore": 15})
    db.refresh(row)
    assert row.remind_at is not None
    move(c, card, column(first_board(c), "Done"))
    db.refresh(row)
    assert row.remind_at is None


def test_cards_from_the_hub(
    client_for: ClientFor, make_user: MakeUser, module: Module, event: CalendarEvent, storage: Any
) -> None:
    boss = client_for(make_user(name="Head Admin", roles=("student", "admin")))
    item = share_pdf(boss, storage, title="Week 3 notes")
    c = client_for(make_user())
    from_event = add(c, link={"type": "event", "id": event.id})
    assert from_event["title"] == "Coursework due"
    assert from_event["link"] == {
        "type": "event",
        "id": event.id,
        "title": "Coursework due",
        "url": f"/calendar?event={event.id}",
        "date": "2026-11-02",
        "kind": None,
        "moduleId": None,
    }
    lesson = add(c, link={"type": "lesson", "id": lesson_id(module, 0, 0)}, title="Watch limits")
    assert lesson["title"] == "Watch limits"
    assert lesson["link"]["title"] == "Test: Limits"
    assert lesson["link"]["url"] == f"/modules/{module.id}/lessons/{lesson_id(module, 0, 0)}"
    untitled = add(c, link={"type": "lesson", "id": lesson_id(module, 0, 1)})
    assert untitled["title"] == "Test: One, lesson 2"
    assert add(c, link={"type": "module", "id": module.id})["link"]["url"] == f"/modules/{module.id}"
    file = add(c, link={"type": "library_item", "id": item["id"]})
    assert (file["title"], file["link"]["url"], file["link"]["kind"]) == (
        "Week 3 notes",
        f"/library/{item['slug']}",
        "notes",
    )
    again = c.post(f"{API}/board-cards", json={"link": {"type": "event", "id": event.id}})
    assert again.status_code == 409
    assert again.json()["error"]["code"] == "already_on_board"
    for link in (
        {"type": "event", "id": "2020-01-01-nothing"},
        {"type": "lesson", "id": "nosuchlesson"},
        {"type": "module", "id": "no-such-module"},
        {"type": "library_item", "id": "not-a-uuid"},
    ):
        r = c.post(f"{API}/board-cards", json={"link": link})
        assert r.status_code == 422, link
        assert "link.id" in r.json()["error"]["fields"]
    states = c.get(f"{API}/board-links").json()
    assert {(s["type"], s["id"], s["done"]) for s in states} == {
        ("event", event.id, False),
        ("lesson", lesson_id(module, 0, 0), False),
        ("lesson", lesson_id(module, 0, 1), False),
        ("module", module.id, False),
        ("library_item", item["id"], False),
    }


def test_a_link_follows_the_hub(
    client_for: ClientFor, make_user: MakeUser, event: CalendarEvent, db: Session, set_feature: Callable[..., None]
) -> None:
    c = client_for(make_user())
    add(c, link={"type": "event", "id": event.id})
    board = first_board(c)
    event.title, event.end_date = "Coursework due (moved)", event.date.replace(day=5)
    db.commit()
    link = detail(c, board)["cards"][0]["link"]
    assert (link["title"], link["date"]) == ("Coursework due (moved)", "2026-11-05")
    set_feature("calendar", "off")
    link = detail(c, board)["cards"][0]["link"]
    assert (link["title"], link["url"], link["date"]) == (None, None, None)
    set_feature("calendar", "everyone")
    db.delete(event)
    db.commit()
    card = detail(c, board)["cards"][0]
    assert card["title"] == "Coursework due"
    assert card["link"]["title"] is None


def test_a_watched_lesson_moves_its_card_to_the_first_done_column(
    client_for: ClientFor, make_user: MakeUser, module: Module
) -> None:
    c = client_for(make_user(tracks=True))
    board = make_board(c)
    done = column(board, "Done")
    other = add(c, title="Something done")
    move(c, other, done)
    card = add(c, link={"type": "lesson", "id": lesson_id(module, 1, 0)})
    assert card["columnId"] == column(board, "To do")
    loose = make_board(c, "No done column", "blank")
    only = column(loose, "To do")
    c.delete(f"{API}/boards/{loose['id']}/columns/{column(loose, 'Done')}")
    kept = add(c, columnId=only, link={"type": "lesson", "id": lesson_id(module, 1, 0)})
    assert c.put(f"{API}/me/progress/lessons/{lesson_id(module, 1, 0)}", json={"watched": True}).status_code == 200
    got = detail(c, board)["cards"]
    assert [x["id"] for x in got if x["columnId"] == done] == [card["id"], other["id"]]  # at the top of Done
    assert next(x for x in got if x["id"] == card["id"])["doneAt"] is not None
    assert detail(c, loose)["cards"][0]["id"] == kept["id"]  # a board without a done column keeps it
    # a lesson already watched starts in Done
    c.put(f"{API}/me/progress/lessons/{lesson_id(module, 0, 0)}", json={"watched": True})
    assert add(c, link={"type": "lesson", "id": lesson_id(module, 0, 0)})["columnId"] == done


def test_the_agenda_spans_the_active_boards(client_for: ClientFor, make_user: MakeUser) -> None:
    c = client_for(make_user())
    today = bahrain_today()
    study, home = make_board(c, "Study"), make_board(c, "Home", "personal", emoji="🏠", color="green")

    def day(n: int) -> str:
        return (today + timedelta(days=n)).isoformat()

    add(c, boardId=study["id"], title="Late", dueDate=day(-2))
    add(c, boardId=home["id"], title="Laundry", dueDate=day(0), dueTime="18:00")
    add(c, boardId=study["id"], title="Quiz", dueDate=day(0), dueTime="09:00")
    add(c, boardId=study["id"], title="Today, any time", dueDate=day(0))
    add(c, boardId=study["id"], title="Next week", dueDate=day(6))
    add(c, boardId=study["id"], title="Far", dueDate=day(20))
    add(c, boardId=study["id"], title="No date")
    finished = add(c, boardId=study["id"], title="Done already", dueDate=day(0))
    move(c, finished, column(study, "Done"))
    archived = make_board(c, "Old")
    add(c, boardId=archived["id"], title="Archived", dueDate=day(0))
    c.patch(f"{API}/boards/{archived['id']}", json={"archived": True})

    got = c.get(f"{API}/board-agenda").json()
    assert (got["today"], got["until"]) == (day(0), day(7))
    assert [x["title"] for x in got["cards"]] == ["Late", "Quiz", "Laundry", "Today, any time", "Next week"]
    laundry = got["cards"][2]
    assert (laundry["boardName"], laundry["boardEmoji"], laundry["boardColor"], laundry["due"]) == (
        "Home",
        "🏠",
        "green",
        day(0),
    )
    assert [x["title"] for x in c.get(f"{API}/board-agenda", params={"days": 0}).json()["cards"]] == [
        "Late",
        "Quiz",
        "Laundry",
        "Today, any time",
    ]


def test_cards_have_a_limit_over_every_board(
    client_for: ClientFor, make_user: MakeUser, db: Session, monkeypatch: Any
) -> None:
    monkeypatch.setattr(common, "MAX_CARDS", 3)
    monkeypatch.setattr(svc, "MAX_CARDS", 3)
    c = client_for(make_user())
    a, b = make_board(c, "A"), make_board(c, "B")
    add(c, boardId=a["id"], title="1")
    add(c, boardId=b["id"], title="2")
    add(c, boardId=b["id"], title="3")
    r = c.post(f"{API}/board-cards", json={"boardId": a["id"], "title": "4"})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "board_full"
    usage = c.get(f"{API}/boards").json()["usage"]
    assert usage["cards"] == 3


def test_adding_cards_is_rate_limited(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    user = make_user()
    c = client_for(user)
    board = make_board(c)
    col = db.scalar(select(BoardColumn).where(BoardColumn.board_id == board["id"]))
    assert col is not None
    db.add_all(
        BoardCard(user_id=user.id, board_id=col.board_id, column_id=col.id, position=float(i), title=f"{i}")
        for i in range(svc.CREATE_LIMIT)
    )
    db.commit()
    r = c.post(f"{API}/board-cards", json={"title": "One more"})
    assert r.status_code == 429
    assert r.json()["error"]["code"] == "rate_limited"


def test_the_export_holds_the_boards(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    c = client_for(make_user())
    board = make_board(c, "Study", emoji="📚")
    label = c.post(f"{API}/board-labels", json={"name": "Exam"}).json()
    card = add(c, title="Mine", description="a note", labelIds=[label["id"]], dueDate="2026-11-01", dueTime="08:15")
    c.patch(f"{API}/board-cards/{card['id']}", json={"checklist": [{"id": "a", "text": "Step"}], "remindBefore": 15})
    c.post(f"{API}/board-cards/{card['id']}/comments", json={"body": "Ask Dr Hassan"})
    exported = c.get(f"{API}/me/export").json()
    assert exported["boardLabels"] == ["Exam"]
    [b] = exported["boards"]
    assert (b["name"], b["emoji"], b["template"]) == ("Study", "📚", "study")
    assert [x["name"] for x in b["columns"]] == ["To do", "In progress", "Done"]
    [x] = b["cards"]
    assert (x["title"], x["description"], x["column"], x["labels"]) == ("Mine", "a note", "To do", ["Exam"])
    assert (x["dueTime"], x["remindBefore"], x["checklist"]) == (
        "08:15:00",
        15,
        [{"id": "a", "text": "Step", "done": False}],
    )
    assert [m["body"] for m in x["comments"]] == ["Ask Dr Hassan"]
    assert board["id"] == b["id"]
    assert db.scalar(select(Board.id).where(Board.id == board["id"])) is not None
