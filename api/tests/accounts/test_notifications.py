"""The signed-in user's notifications: the list, the unread count, marking them read."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.time import utcnow
from app.models import Notification, Role, User
from tests.accounts.conftest import API

ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]


def _notify(
    db: Session,
    user: User,
    title: str,
    minutes_ago: int,
    *,
    actor: User | None = None,
    read: bool = False,
    kind: str = "thread_reply",
) -> Notification:
    now = utcnow()
    n = Notification(
        user_id=user.id,
        kind=kind,
        title=title,
        body=f"{title} body",
        url="/forum/some-thread",
        actor_id=actor.id if actor else None,
        created_at=now - timedelta(minutes=minutes_ago),
        read_at=now if read else None,
    )
    db.add(n)
    db.commit()
    return n


def test_guests_get_401(client: TestClient) -> None:
    assert client.get(f"{API}/notifications").status_code == 401
    assert client.post(f"{API}/notifications/{uuid.uuid4()}/read").status_code == 401
    assert client.post(f"{API}/notifications/read-all").status_code == 401


def test_list(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    user = make_user()
    actor = make_user(email="actor@example.com", phone="+97333123480", name="Noor", role=Role.moderator, year=1)
    _notify(db, user, "Oldest", 30, read=True)
    _notify(db, user, "Middle", 20, actor=actor)
    _notify(db, user, "Newest", 10)
    _notify(db, make_user(), "Someone else's", 5)
    page = client_for(user).get(f"{API}/notifications").json()
    assert [n["title"] for n in page["items"]] == ["Newest", "Middle", "Oldest"]
    assert (page["total"], page["unreadCount"], page["limit"], page["offset"]) == (3, 2, 20, 0)
    middle = page["items"][1]
    assert middle["actor"] == {"id": str(actor.id), "displayName": "Noor", "year": 1, "role": "moderator"}
    assert set(middle) == {"id", "kind", "title", "body", "url", "actor", "createdAt", "readAt"}
    assert page["items"][0]["actor"] is None
    assert page["items"][2]["readAt"] is not None


def test_unread_filter_and_paging(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    user = make_user()
    for i in range(5):
        _notify(db, user, f"n{i}", 50 - i, read=i % 2 == 0)
    c = client_for(user)
    unread = c.get(f"{API}/notifications", params={"unread": "true"}).json()
    assert [n["title"] for n in unread["items"]] == ["n3", "n1"]
    assert (unread["total"], unread["unreadCount"]) == (2, 2)
    page = c.get(f"{API}/notifications", params={"limit": 2, "offset": 2}).json()
    assert [n["title"] for n in page["items"]] == ["n2", "n1"]
    assert page["total"] == 5
    assert c.get(f"{API}/notifications", params={"limit": 0}).status_code == 422


def test_mark_one_read(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    user, other = make_user(), make_user()
    mine = _notify(db, user, "Mine", 5)
    theirs = _notify(db, other, "Theirs", 5)
    c = client_for(user)
    assert c.post(f"{API}/notifications/{mine.id}/read").status_code == 204
    assert c.get(f"{API}/notifications").json()["unreadCount"] == 0
    assert c.post(f"{API}/notifications/{mine.id}/read").status_code == 204  # already read
    r = c.post(f"{API}/notifications/{theirs.id}/read")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "not_found"
    assert c.post(f"{API}/notifications/{uuid.uuid4()}/read").status_code == 404
    assert client_for(other).get(f"{API}/notifications").json()["unreadCount"] == 1


def test_mark_all_read(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    user, other = make_user(), make_user()
    for i in range(3):
        _notify(db, user, f"n{i}", i + 1)
    _notify(db, other, "Theirs", 1)
    c = client_for(user)
    assert c.post(f"{API}/notifications/read-all").status_code == 204
    page = c.get(f"{API}/notifications").json()
    assert page["unreadCount"] == 0
    assert all(n["readAt"] for n in page["items"])
    assert client_for(other).get(f"{API}/notifications").json()["unreadCount"] == 1


def test_unknown_kinds_show_as_system(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    user = make_user()
    _notify(db, user, "From the future", 1, kind="something_new")
    assert client_for(user).get(f"{API}/notifications").json()["items"][0]["kind"] == "system"
