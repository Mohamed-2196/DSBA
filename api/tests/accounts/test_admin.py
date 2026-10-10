"""Admin: the dashboard counts, people and roles, and the audit log."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.time import utcnow
from app.models import (
    AuditEntry,
    ForumReply,
    ForumThread,
    ItemSource,
    ItemStatus,
    LibraryItem,
    Notification,
    PostStatus,
    Report,
    Role,
    User,
    UserStatus,
)
from tests.accounts.conftest import API

ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]


@pytest.fixture
def admin(make_user: MakeUser) -> User:
    return make_user(email="head@example.com", name="Head Admin", role=Role.admin)


# ── who may ─────────────────────────────────────────────────────────────────────────────────


def test_guests_get_401(client: TestClient) -> None:
    for method, path in [
        ("GET", "/admin/stats"),
        ("GET", "/admin/users"),
        ("PATCH", f"/admin/users/{uuid.uuid4()}"),
        ("GET", "/admin/audit"),
    ]:
        assert client.request(method, f"{API}{path}", json={} if method == "PATCH" else None).status_code == 401


def test_students_get_403(client_for: ClientFor, make_user: MakeUser) -> None:
    c = client_for(make_user())
    for method, path in [
        ("GET", "/admin/stats"),
        ("GET", "/admin/users"),
        ("PATCH", f"/admin/users/{uuid.uuid4()}"),
        ("GET", "/admin/audit"),
    ]:
        r = c.request(method, f"{API}{path}", json={"role": "admin"} if method == "PATCH" else None)
        assert r.status_code == 403, (method, path)
        assert r.json()["error"]["code"] == "forbidden"


def test_moderators_see_stats_only(client_for: ClientFor, make_user: MakeUser) -> None:
    c = client_for(make_user(role=Role.moderator))
    assert c.get(f"{API}/admin/stats").status_code == 200
    assert c.get(f"{API}/admin/users").status_code == 403
    assert c.patch(f"{API}/admin/users/{uuid.uuid4()}", json={"role": "admin"}).status_code == 403
    assert c.get(f"{API}/admin/audit").status_code == 403


def test_suspended_staff_lose_their_powers(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    boss = make_user(role=Role.admin)
    boss.status = UserStatus.suspended
    db.commit()
    c = client_for(boss)
    assert c.get(f"{API}/admin/stats").status_code == 403
    assert c.get(f"{API}/admin/users").status_code == 403
    assert c.patch(f"{API}/admin/users/{make_user().id}", json={"role": "moderator"}).status_code == 403


# ── stats ───────────────────────────────────────────────────────────────────────────────────


def test_stats(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    rep = make_user(role=Role.moderator)
    before = client_for(rep).get(f"{API}/admin/stats").json()
    author = make_user()
    visible = ForumThread(slug=f"v-{uuid.uuid4().hex[:6]}", title="Visible one", body="", category="general")
    hidden = ForumThread(
        slug=f"h-{uuid.uuid4().hex[:6]}", title="Hidden one", body="", category="general", status=PostStatus.hidden
    )
    db.add_all([visible, hidden])
    db.flush()
    db.add_all(
        [
            ForumReply(thread_id=visible.id, author_id=author.id, body="r"),
            ForumReply(thread_id=visible.id, author_id=author.id, body="r", status=PostStatus.hidden),
            LibraryItem(
                slug=f"p-{uuid.uuid4().hex[:6]}",
                source=ItemSource.link,
                kind="notes",
                title="P",
                url="https://x.org",
                status=ItemStatus.published,
            ),
            LibraryItem(
                slug=f"q-{uuid.uuid4().hex[:6]}",
                source=ItemSource.link,
                kind="notes",
                title="Q",
                url="https://x.org",
                status=ItemStatus.pending,
            ),
            Report(reporter_id=author.id, target_type="thread", target_id=visible.id, reason="spam"),
        ]
    )
    db.commit()
    after = client_for(rep).get(f"{API}/admin/stats").json()
    assert set(after) == {"users", "threads", "replies", "libraryItems", "pendingUploads", "openReports"}
    delta = {k: after[k] - before[k] for k in after}
    assert delta == {"users": 1, "threads": 1, "replies": 1, "libraryItems": 1, "pendingUploads": 1, "openReports": 1}


# ── people ──────────────────────────────────────────────────────────────────────────────────


def test_list_and_search_users(client_for: ClientFor, make_user: MakeUser, admin: User, db: Session) -> None:
    now = utcnow()
    people = [
        make_user(email="fatima@uni.bh", name="Fatima Hasan", year=1),
        make_user(phone="+97333123456", name="Ali Mahdi", role=Role.moderator),
        make_user(email="zain_100%@example.com", name="Zain", year=3),
    ]
    for i, u in enumerate(people):  # newest last in the list above
        u.created_at = now + timedelta(minutes=i + 1)
    db.commit()
    c = client_for(admin)

    page = c.get(f"{API}/admin/users").json()
    assert [u["id"] for u in page["items"][:3]] == [str(u.id) for u in reversed(people)]
    assert page["total"] >= 4
    assert set(page["items"][0]) == {
        "id",
        "displayName",
        "email",
        "phone",
        "role",
        "status",
        "year",
        "createdAt",
        "lastSeenAt",
    }

    def found(**params: str) -> list[str]:
        return [u["displayName"] for u in c.get(f"{API}/admin/users", params=params).json()["items"]]

    assert found(q="FATIMA") == ["Fatima Hasan"]
    assert found(q="uni.bh") == ["Fatima Hasan"]
    assert found(q="3312 3456") == ["Ali Mahdi"]
    assert found(q="+973 33") == ["Ali Mahdi"]
    assert found(q="100%") == ["Zain"]
    assert found(q="%") == ["Zain"]  # a wildcard is just a character
    assert found(q="_") == ["Zain"]
    assert found(role="moderator") == ["Ali Mahdi"]
    assert found(q="ali", role="student") == []
    assert c.get(f"{API}/admin/users", params={"role": "owner"}).status_code == 422
    paged = c.get(f"{API}/admin/users", params={"limit": 1, "offset": 1}).json()
    assert [u["id"] for u in paged["items"]] == [str(people[1].id)]


def test_change_a_role(client_for: ClientFor, make_user: MakeUser, admin: User, db: Session) -> None:
    student = make_user(name="Soon A Rep")
    c = client_for(admin)
    r = c.patch(f"{API}/admin/users/{student.id}", json={"role": "moderator"})
    assert r.status_code == 200, r.text
    assert r.json()["role"] == "moderator"
    assert r.json()["status"] == "active"
    entry = db.scalar(
        select(AuditEntry).where(AuditEntry.action == "user.role", AuditEntry.target_id == str(student.id))
    )
    assert entry is not None
    assert entry.actor_id == admin.id
    assert entry.target_type == "user"
    assert entry.data == {"from": "student", "to": "moderator", "actorName": "Head Admin", "targetName": "Soon A Rep"}
    note = db.scalar(select(Notification).where(Notification.user_id == student.id))
    assert note is not None
    assert note.title == "You're now a student rep"
    assert note.actor_id == admin.id
    assert client_for(student).get(f"{API}/admin/stats").status_code == 200  # the new role works at once


def test_suspend_and_restore(client_for: ClientFor, make_user: MakeUser, admin: User, db: Session) -> None:
    student = make_user()
    c = client_for(admin)
    r = c.patch(f"{API}/admin/users/{student.id}", json={"status": "suspended"})
    assert r.status_code == 200
    assert r.json()["status"] == "suspended"
    assert client_for(student).patch(f"{API}/me", json={"displayName": "Renamed"}).status_code == 403
    c.patch(f"{API}/admin/users/{student.id}", json={"status": "active"})
    actions = db.scalars(
        select(AuditEntry.data).where(AuditEntry.action == "user.status", AuditEntry.target_id == str(student.id))
    ).all()
    assert sorted(a["to"] for a in actions) == ["active", "suspended"]


def test_both_at_once_and_nothing_at_all(client_for: ClientFor, make_user: MakeUser, admin: User, db: Session) -> None:
    student = make_user()
    c = client_for(admin)
    r = c.patch(f"{API}/admin/users/{student.id}", json={"role": "admin", "status": "suspended"})
    assert (r.json()["role"], r.json()["status"]) == ("admin", "suspended")
    assert c.patch(f"{API}/admin/users/{student.id}", json={}).json()["role"] == "admin"
    same = c.patch(f"{API}/admin/users/{student.id}", json={"role": "admin"})
    assert same.status_code == 200
    count = len(db.scalars(select(AuditEntry).where(AuditEntry.target_id == str(student.id))).all())
    assert count == 2  # no entry when nothing changes


def test_admins_cannot_change_themselves(client_for: ClientFor, admin: User, db: Session) -> None:
    c = client_for(admin)
    for body in ({"role": "student"}, {"status": "suspended"}, {"role": "admin"}):
        r = c.patch(f"{API}/admin/users/{admin.id}", json=body)
        assert r.status_code == 409
        assert r.json()["error"]["code"] == "cannot_change_self"
    assert db.get(User, admin.id, populate_existing=True).role == Role.admin  # type: ignore[union-attr]


def test_update_errors(client_for: ClientFor, admin: User, make_user: MakeUser) -> None:
    c = client_for(admin)
    assert c.patch(f"{API}/admin/users/{uuid.uuid4()}", json={"role": "moderator"}).status_code == 404
    assert c.patch(f"{API}/admin/users/{make_user().id}", json={"role": "owner"}).status_code == 422


# ── audit log ───────────────────────────────────────────────────────────────────────────────


def test_audit_log(client_for: ClientFor, make_user: MakeUser, admin: User) -> None:
    a, b = make_user(), make_user()
    c = client_for(admin)
    c.patch(f"{API}/admin/users/{a.id}", json={"role": "moderator"})
    c.patch(f"{API}/admin/users/{b.id}", json={"status": "suspended"})
    page = c.get(f"{API}/admin/audit").json()
    assert page["total"] >= 2
    first, second = page["items"][:2]
    assert (first["action"], first["targetId"]) == ("user.status", str(b.id))
    assert (second["action"], second["targetId"]) == ("user.role", str(a.id))
    assert first["actor"] == {"id": str(admin.id), "displayName": "Head Admin", "year": 2, "role": "admin"}
    assert first["data"] == {
        "from": "active",
        "to": "suspended",
        "actorName": "Head Admin",
        "targetName": "Test Student",
    }
    assert set(first) == {"id", "actor", "action", "targetType", "targetId", "data", "createdAt"}
    assert len(c.get(f"{API}/admin/audit", params={"limit": 1}).json()["items"]) == 1
