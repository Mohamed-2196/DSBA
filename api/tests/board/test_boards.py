"""Boards, their columns and labels: templates, order, archive, limits, privacy and the switch."""

from __future__ import annotations

from collections.abc import Callable
from datetime import timedelta
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.time import utcnow
from app.models import Board, User, UserStatus
from app.services.board import boards as svc
from app.services.board import common
from tests.board.conftest import API, add, column, detail, make_board, move, titles

ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]


def names(board: dict[str, Any]) -> list[str]:
    return [c["name"] for c in board["columns"]]


def test_a_board_starts_from_its_template(client_for: ClientFor, make_user: MakeUser) -> None:
    c = client_for(make_user())
    assert c.get(f"{API}/boards").json()["boards"] == []
    expected = {
        "study": ["To do", "In progress", "Done"],
        "revision": ["To revise", "Revising", "Revised"],
        "assignment": ["Research", "Draft", "Review", "Submitted"],
        "weekly": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "Done"],
        "personal": ["Today", "This week", "Later", "Done"],
        "blank": ["To do", "Done"],
    }
    for template, columns in expected.items():
        board = make_board(c, template.title(), template, emoji="📚", color="teal")
        assert names(board) == columns
        assert [col["done"] for col in board["columns"]] == [False] * (len(columns) - 1) + [True]
        assert (board["emoji"], board["color"], board["template"], board["archived"]) == ("📚", "teal", template, False)
    listed = c.get(f"{API}/boards").json()
    assert [b["name"] for b in listed["boards"]] == [t.title() for t in expected]
    assert listed["usage"]["boards"] == 6
    assert listed["usage"]["maxBoards"] == common.MAX_BOARDS
    assert c.post(f"{API}/boards", json={"name": "x", "template": "kanban"}).status_code == 422
    assert c.post(f"{API}/boards", json={"name": "  "}).status_code == 422


def test_boards_rename_reorder_archive_and_delete(client_for: ClientFor, make_user: MakeUser) -> None:
    c = client_for(make_user())
    a, b, d = (make_board(c, n) for n in ("A", "B", "D"))
    r = c.patch(f"{API}/boards/{a['id']}", json={"name": "Errands", "emoji": None, "color": "coral"})
    assert (r.json()["name"], r.json()["color"]) == ("Errands", "coral")
    assert c.put(f"{API}/boards/{d['id']}/place", json={"afterId": None}).status_code == 200

    def order() -> list[str]:
        return [x["name"] for x in c.get(f"{API}/boards").json()["boards"]]

    assert order() == ["D", "Errands", "B"]
    assert c.patch(f"{API}/boards/{d['id']}", json={"archived": True}).json()["archived"] is True
    assert order() == ["Errands", "B", "D"]  # archived ones last
    assert c.put(f"{API}/boards/{d['id']}/place", json={"afterId": None}).status_code == 409
    c.patch(f"{API}/boards/{d['id']}", json={"archived": False})
    assert order() == ["Errands", "B", "D"]  # back after the active ones
    add(c, boardId=b["id"], title="On B")
    assert c.delete(f"{API}/boards/{b['id']}").status_code == 204
    assert order() == ["Errands", "D"]
    assert c.get(f"{API}/boards/{b['id']}").status_code == 404


def test_columns_add_rename_reorder_mark_done_and_delete(client_for: ClientFor, make_user: MakeUser) -> None:
    c = client_for(make_user())
    board = make_board(c, "Project", "blank")
    todo, done = column(board, "To do"), column(board, "Done")
    board = c.post(f"{API}/boards/{board['id']}/columns", json={"name": "Waiting"}).json()
    waiting = column(board, "Waiting")
    assert names(board) == ["To do", "Done", "Waiting"]
    board = c.put(f"{API}/boards/{board['id']}/columns/{waiting}/place", json={"afterId": todo}).json()
    assert names(board) == ["To do", "Waiting", "Done"]
    board = c.patch(f"{API}/boards/{board['id']}/columns/{waiting}", json={"name": "Blocked"}).json()
    assert names(board) == ["To do", "Blocked", "Done"]

    card = add(c, columnId=waiting, title="Ask the tutor")
    r = c.patch(f"{API}/boards/{board['id']}/columns/{waiting}", json={"done": True})
    assert r.json()["done"] == 1
    assert detail(c, board)["cards"][0]["doneAt"] is not None
    c.patch(f"{API}/boards/{board['id']}/columns/{waiting}", json={"done": False})
    assert detail(c, board)["cards"][0]["doneAt"] is None

    r = c.delete(f"{API}/boards/{board['id']}/columns/{waiting}")
    assert r.status_code == 422
    assert "moveTo" in r.json()["error"]["fields"]
    r = c.delete(f"{API}/boards/{board['id']}/columns/{waiting}", params={"moveTo": done})
    assert r.status_code == 200, r.text
    assert names(r.json()) == ["To do", "Done"]
    moved = detail(c, board)["cards"][0]
    assert (moved["id"], moved["columnId"]) == (card["id"], done)
    assert moved["doneAt"] is not None
    assert c.delete(f"{API}/boards/{board['id']}/columns/{todo}").status_code == 200  # empty: no moveTo needed
    last = c.delete(f"{API}/boards/{board['id']}/columns/{done}")
    assert last.status_code == 409
    assert last.json()["error"]["code"] == "limit_reached"


def test_a_board_holds_at_most_max_columns(client_for: ClientFor, make_user: MakeUser, monkeypatch: Any) -> None:
    monkeypatch.setattr(svc, "MAX_COLUMNS", 3)
    c = client_for(make_user())
    board = make_board(c, "Small", "blank")
    assert c.post(f"{API}/boards/{board['id']}/columns", json={"name": "Three"}).status_code == 201
    r = c.post(f"{API}/boards/{board['id']}/columns", json={"name": "Four"})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "limit_reached"


def test_boards_have_a_limit_and_a_rate_limit(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    user = make_user()
    earlier = utcnow() - timedelta(hours=2)
    db.add_all(
        Board(user_id=user.id, name=f"{i}", color="cobalt", template="blank", position=float(i), created_at=earlier)
        for i in range(common.MAX_BOARDS)
    )
    db.commit()
    r = client_for(user).post(f"{API}/boards", json={"name": "One more"})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "boards_full"

    busy = make_user()
    db.add_all(
        Board(user_id=busy.id, name=f"{i}", color="cobalt", template="blank", position=float(i))
        for i in range(svc.BOARD_LIMIT)
    )
    db.commit()
    assert client_for(busy).post(f"{API}/boards", json={"name": "One more"}).status_code == 429


def test_labels(client_for: ClientFor, make_user: MakeUser) -> None:
    c = client_for(make_user())
    exam = c.post(f"{API}/board-labels", json={"name": "Exam", "color": "coral"}).json()
    home = c.post(f"{API}/board-labels", json={"name": "Home"}).json()
    dup = c.post(f"{API}/board-labels", json={"name": "exam"})
    assert dup.status_code == 422
    assert "name" in dup.json()["error"]["fields"]
    assert c.patch(f"{API}/board-labels/{home['id']}", json={"name": "Exam"}).status_code == 422
    assert c.patch(f"{API}/board-labels/{home['id']}", json={"color": "green"}).json()["color"] == "green"
    card = add(c, title="Revise", labelIds=[exam["id"], home["id"]])
    assert set(card["labelIds"]) == {exam["id"], home["id"]}
    assert [x["name"] for x in c.get(f"{API}/boards").json()["labels"]] == ["Exam", "Home"]
    assert c.delete(f"{API}/board-labels/{exam['id']}").status_code == 204
    board = c.get(f"{API}/boards").json()["boards"][0]
    assert detail(c, board)["cards"][0]["labelIds"] == [home["id"]]
    other = client_for(make_user(name="Omar Classmate"))
    assert other.patch(f"{API}/board-labels/{home['id']}", json={"name": "Mine"}).status_code == 404
    r = other.post(f"{API}/board-cards", json={"title": "Steal", "labelIds": [home["id"]]})
    assert r.status_code == 422


def test_boards_are_private(client_for: ClientFor, make_user: MakeUser) -> None:
    sara, omar = client_for(make_user(name="Sara Student")), client_for(make_user(name="Omar Classmate"))
    board = make_board(sara)
    card = add(sara, boardId=board["id"], title="Mine")
    theirs = make_board(omar)
    assert omar.get(f"{API}/boards/{board['id']}").status_code == 404
    assert omar.patch(f"{API}/boards/{board['id']}", json={"name": "Yours"}).status_code == 404
    assert omar.delete(f"{API}/boards/{board['id']}").status_code == 404
    assert omar.post(f"{API}/boards/{board['id']}/columns", json={"name": "x"}).status_code == 404
    col = column(board, "To do")
    assert omar.patch(f"{API}/boards/{theirs['id']}/columns/{col}", json={"name": "x"}).status_code == 404
    assert omar.patch(f"{API}/board-cards/{card['id']}", json={"title": "Yours"}).status_code == 404
    assert omar.get(f"{API}/board-cards/{card['id']}").status_code == 404
    assert move(omar, card, column(theirs, "To do")).status_code == 404
    assert move(sara, card, column(theirs, "To do")).status_code == 404  # no moving into someone else's board
    assert omar.post(f"{API}/board-cards", json={"columnId": col, "title": "x"}).status_code == 404
    assert omar.post(f"{API}/board-cards", json={"boardId": board["id"], "title": "x"}).status_code == 404
    assert omar.delete(f"{API}/board-cards/{card['id']}").status_code == 404
    other = add(omar, boardId=theirs["id"], title="Omar's")
    assert move(sara, card, col, other).status_code == 409  # someone else's card is no neighbour
    assert titles(sara, board, "To do") == ["Mine"]


def test_guests_get_401_and_suspended_accounts_read_only(
    client_for: ClientFor, make_user: MakeUser, db: Session
) -> None:
    assert client_for().get(f"{API}/boards").status_code == 401
    assert client_for().post(f"{API}/boards", json={"name": "x"}).status_code == 401
    user = make_user()
    c = client_for(user)
    board = make_board(c)
    card = add(c, title="Before")
    user.status = UserStatus.suspended
    db.commit()
    assert [x["title"] for x in detail(c, board)["cards"]] == ["Before"]
    assert c.get(f"{API}/board-agenda").status_code == 200
    assert c.post(f"{API}/boards", json={"name": "After"}).status_code == 403
    assert c.patch(f"{API}/boards/{board['id']}", json={"name": "After"}).status_code == 403
    assert c.post(f"{API}/board-cards", json={"title": "After"}).status_code == 403
    assert c.patch(f"{API}/board-cards/{card['id']}", json={"title": "After"}).status_code == 403
    assert move(c, card, column(board, "Done")).status_code == 403
    assert c.delete(f"{API}/board-cards/{card['id']}").status_code == 403


def test_the_boards_are_off_until_switched_on(
    client_for: ClientFor, make_user: MakeUser, set_feature: Callable[..., None]
) -> None:
    set_feature("board", "off")
    r = client_for(make_user()).get(f"{API}/boards")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "feature_off"
    assert client_for(make_user(name="Head Admin", roles=("student", "admin"))).get(f"{API}/boards").status_code == 200


def test_deleting_the_account_deletes_its_boards(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    user = make_user(email="board-owner@example.com")
    c = client_for(user)
    make_board(c)
    add(c, title="Mine")
    uid = user.id
    db.delete(user)
    db.commit()
    assert db.scalar(select(func.count()).select_from(Board).where(Board.user_id == uid)) == 0
