"""The study board: a private board per student, three fixed columns, cards from the hub."""

from __future__ import annotations

from collections.abc import Callable
from datetime import timedelta
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.time import utcnow
from app.models import BoardCard, CalendarEvent, Module, User, UserStatus
from app.services import board as svc
from tests.board.conftest import API
from tests.core.helpers import share_pdf
from tests.lessons import lesson_id

ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]


def add(c: TestClient, **body: Any) -> dict[str, Any]:
    r = c.post(f"{API}/board/cards", json=body)
    assert r.status_code == 201, r.text
    card: dict[str, Any] = r.json()
    return card


def titles(c: TestClient, column: str) -> list[str]:
    return [card["title"] for card in c.get(f"{API}/board").json()["cards"] if card["column"] == column]


def move(c: TestClient, card: dict[str, Any], column: str, after: dict[str, Any] | None = None) -> Any:
    return c.put(f"{API}/board/cards/{card['id']}/place", json={"column": column, "afterId": after and after["id"]})


def test_a_new_board_is_empty_and_cards_go_to_the_end(client_for: ClientFor, make_user: MakeUser) -> None:
    c = client_for(make_user())
    assert c.get(f"{API}/board").json() == {"cards": [], "plans": [], "limit": svc.MAX_CARDS}
    first = add(c, title="Read chapter 2", note="Pages 30 to 45", dueDate="2026-11-01")
    add(c, title="Past paper 2023")
    add(c, title="Revise", column="doing")
    assert first["column"] == "todo"
    assert (first["note"], first["dueDate"], first["link"], first["doneAt"]) == (
        "Pages 30 to 45",
        "2026-11-01",
        None,
        None,
    )
    assert titles(c, "todo") == ["Read chapter 2", "Past paper 2023"]
    assert titles(c, "doing") == ["Revise"]


def test_moving_writes_one_card_and_keeps_the_order(client_for: ClientFor, make_user: MakeUser) -> None:
    c = client_for(make_user())
    a, b, d = (add(c, title=t) for t in ("A", "B", "D"))
    assert move(c, d, "todo", a).status_code == 200
    assert titles(c, "todo") == ["A", "D", "B"]
    assert move(c, b, "todo").status_code == 200  # null: the top
    assert titles(c, "todo") == ["B", "A", "D"]
    r = move(c, a, "done")
    assert r.status_code == 200
    assert r.json()["column"] == "done"
    assert r.json()["doneAt"] is not None
    assert move(c, a, "doing").json()["doneAt"] is None
    assert titles(c, "doing") == ["A"]


def test_many_moves_into_one_gap_number_the_column_again(
    client_for: ClientFor, make_user: MakeUser, db: Session
) -> None:
    c = client_for(make_user())
    first, last = add(c, title="first"), add(c, title="last")
    moved = [add(c, title=f"card {i}", column="doing") for i in range(60)]
    for card in moved:  # each lands right after "first": the gap halves every time
        assert move(c, card, "todo", first).status_code == 200
    assert titles(c, "todo") == ["first", *[f"card {i}" for i in reversed(range(60))], "last"]
    assert last["title"] == "last"


def test_after_a_card_in_another_column_is_a_retry(client_for: ClientFor, make_user: MakeUser) -> None:
    c = client_for(make_user())
    a, b = add(c, title="A"), add(c, title="B", column="doing")
    r = move(c, a, "todo", b)
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "retry"
    assert move(c, a, "todo", a).status_code == 409


def test_edit_and_delete(client_for: ClientFor, make_user: MakeUser) -> None:
    c = client_for(make_user())
    card = add(c, title="Draft", note="old", dueDate="2026-11-01")
    r = c.patch(f"{API}/board/cards/{card['id']}", json={"title": "Final", "note": None})
    assert r.status_code == 200, r.text
    assert (r.json()["title"], r.json()["note"], r.json()["dueDate"]) == ("Final", None, "2026-11-01")
    r = c.patch(f"{API}/board/cards/{card['id']}", json={"dueDate": None, "title": "   "})
    assert r.status_code == 422
    assert c.patch(f"{API}/board/cards/{card['id']}", json={"dueDate": None}).json()["dueDate"] is None
    assert c.delete(f"{API}/board/cards/{card['id']}").status_code == 204
    assert c.get(f"{API}/board").json()["cards"] == []
    assert c.delete(f"{API}/board/cards/{card['id']}").status_code == 404


def test_a_card_needs_a_title(client_for: ClientFor, make_user: MakeUser) -> None:
    c = client_for(make_user())
    r = c.post(f"{API}/board/cards", json={"note": "no title"})
    assert r.status_code == 422
    assert r.json()["error"]["fields"] == {"title": "Give the card a title."}
    assert c.post(f"{API}/board/cards", json={"title": "x" * 201}).status_code == 422
    assert c.post(f"{API}/board/cards", json={"title": "Fine", "column": "later"}).status_code == 422


def test_boards_are_private(client_for: ClientFor, make_user: MakeUser) -> None:
    sara, omar = client_for(make_user(name="Sara Student")), client_for(make_user(name="Omar Classmate"))
    card = add(sara, title="Mine")
    assert omar.get(f"{API}/board").json()["cards"] == []
    assert omar.patch(f"{API}/board/cards/{card['id']}", json={"title": "Yours"}).status_code == 404
    assert move(omar, card, "done").status_code == 404
    assert omar.delete(f"{API}/board/cards/{card['id']}").status_code == 404
    other = add(omar, title="Omar's")
    assert move(sara, card, "todo", other).status_code == 409  # someone else's card is no neighbour
    assert titles(sara, "todo") == ["Mine"]


def test_guests_get_401_and_suspended_accounts_read_only(
    client_for: ClientFor, make_user: MakeUser, db: Session
) -> None:
    assert client_for().get(f"{API}/board").status_code == 401
    assert client_for().post(f"{API}/board/cards", json={"title": "x"}).status_code == 401
    user = make_user()
    c = client_for(user)
    card = add(c, title="Before")
    user.status = UserStatus.suspended
    db.commit()
    assert [x["title"] for x in c.get(f"{API}/board").json()["cards"]] == ["Before"]
    assert c.post(f"{API}/board/cards", json={"title": "After"}).status_code == 403
    assert c.patch(f"{API}/board/cards/{card['id']}", json={"title": "After"}).status_code == 403
    assert move(c, card, "done").status_code == 403
    assert c.delete(f"{API}/board/cards/{card['id']}").status_code == 403


def test_the_board_is_off_until_switched_on(
    client_for: ClientFor, make_user: MakeUser, set_feature: Callable[..., None]
) -> None:
    set_feature("board", "off")
    r = client_for(make_user()).get(f"{API}/board")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "feature_off"
    assert client_for(make_user(name="Head Admin", roles=("student", "admin"))).get(f"{API}/board").status_code == 200


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
    assert (file["title"], file["link"]["url"]) == ("Week 3 notes", f"/library/{item['slug']}")
    assert file["link"]["kind"] == "notes"
    assert lesson["link"]["moduleId"] == module.id

    again = c.post(f"{API}/board/cards", json={"link": {"type": "event", "id": event.id}})
    assert again.status_code == 409
    assert again.json()["error"]["code"] == "already_on_board"
    for link in (
        {"type": "event", "id": "2020-01-01-nothing"},
        {"type": "lesson", "id": "nosuchlesson"},
        {"type": "lesson", "id": "not-a-key"},
        {"type": "module", "id": "no-such-module"},
        {"type": "library_item", "id": "not-a-uuid"},
    ):
        r = c.post(f"{API}/board/cards", json={"link": link})
        assert r.status_code == 422, link
        assert "link.id" in r.json()["error"]["fields"]


def test_a_link_follows_the_hub(
    client_for: ClientFor, make_user: MakeUser, event: CalendarEvent, db: Session, set_feature: Callable[..., None]
) -> None:
    c = client_for(make_user())
    add(c, link={"type": "event", "id": event.id})
    event.title, event.end_date = "Coursework due (moved)", event.date.replace(day=5)
    db.commit()
    link = c.get(f"{API}/board").json()["cards"][0]["link"]
    assert (link["title"], link["date"]) == ("Coursework due (moved)", "2026-11-05")
    set_feature("calendar", "off")
    link = c.get(f"{API}/board").json()["cards"][0]["link"]
    assert (link["title"], link["url"], link["date"]) == (None, None, None)
    set_feature("calendar", "everyone")
    db.delete(event)
    db.commit()
    card = c.get(f"{API}/board").json()["cards"][0]
    assert card["title"] == "Coursework due"
    assert card["link"]["title"] is None


def test_a_watched_lesson_moves_its_card_to_done(client_for: ClientFor, make_user: MakeUser, module: Module) -> None:
    c = client_for(make_user())
    other = add(c, title="Something done")
    move(c, other, "done")
    card = add(c, link={"type": "lesson", "id": lesson_id(module, 1, 0)})
    assert card["column"] == "todo"
    assert c.put(f"{API}/me/progress/lessons/{lesson_id(module, 1, 0)}", json={"watched": True}).status_code == 200
    done = [x for x in c.get(f"{API}/board").json()["cards"] if x["column"] == "done"]
    assert [x["id"] for x in done] == [card["id"], other["id"]]  # at the top of Done
    assert done[0]["doneAt"] is not None
    # a lesson already watched starts in Done
    c.put(f"{API}/me/progress/lessons/{lesson_id(module, 0, 0)}", json={"watched": True})
    assert add(c, link={"type": "lesson", "id": lesson_id(module, 0, 0)})["column"] == "done"
    # and an imported guest's progress counts too
    later = add(c, link={"type": "lesson", "id": lesson_id(module, 0, 1)})
    r = c.post(
        f"{API}/me/progress/import", json={"watched": {lesson_id(module, 0, 1): "2026-10-01T10:00:00Z"}, "last": {}}
    )
    assert r.status_code == 200
    assert next(x for x in c.get(f"{API}/board").json()["cards"] if x["id"] == later["id"])["column"] == "done"


def test_the_board_has_a_limit(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    user = make_user()
    earlier = utcnow() - timedelta(hours=2)  # outside the rate limit's window
    db.add_all(
        BoardCard(user_id=user.id, column="todo", position=float(i), title=f"{i}", created_at=earlier)
        for i in range(svc.MAX_CARDS)
    )
    db.commit()
    r = client_for(user).post(f"{API}/board/cards", json={"title": "One more"})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "board_full"


def test_adding_cards_is_rate_limited(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    user = make_user()
    db.add_all(
        BoardCard(user_id=user.id, column="todo", position=float(i), title=f"{i}") for i in range(svc.CREATE_LIMIT)
    )
    db.commit()
    r = client_for(user).post(f"{API}/board/cards", json={"title": "One more"})
    assert r.status_code == 429
    assert r.json()["error"]["code"] == "rate_limited"


def test_deleting_the_account_deletes_its_board_and_the_export_holds_it(
    client_for: ClientFor, make_user: MakeUser, db: Session
) -> None:
    user = make_user(email="board-owner@example.com")
    c = client_for(user)
    add(c, title="Mine", note="a note")
    exported = c.get(f"{API}/me/export").json()["board"]
    assert [(x["title"], x["note"], x["column"]) for x in exported] == [("Mine", "a note", "todo")]
    uid = user.id
    db.delete(user)
    db.commit()
    assert db.scalar(select(func.count()).select_from(BoardCard).where(BoardCard.user_id == uid)) == 0
