"""Admin: the dashboard counts, people, and the audit log."""

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
    User,
    UserStatus,
)
from app.services import access
from tests.accounts.conftest import API, Deliver, Outbox, sync_csrf

ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]


@pytest.fixture
def admin(make_user: MakeUser) -> User:
    return make_user(email="head@example.com", name="Head Admin", roles=("student", "admin"))


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
        r = c.request(method, f"{API}{path}", json={"status": "suspended"} if method == "PATCH" else None)
        assert r.status_code == 403, (method, path)
        assert r.json()["error"]["code"] == "forbidden"


def test_moderators_see_stats_only(client_for: ClientFor, make_user: MakeUser) -> None:
    c = client_for(make_user(roles=("student", "rep")))
    assert c.get(f"{API}/admin/stats").status_code == 200
    assert c.get(f"{API}/admin/users").status_code == 403
    assert c.patch(f"{API}/admin/users/{uuid.uuid4()}", json={"status": "suspended"}).status_code == 403
    assert c.get(f"{API}/admin/audit").status_code == 403


def test_suspended_staff_lose_their_powers(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    boss = make_user(roles=("student", "admin"))
    boss.status = UserStatus.suspended
    db.commit()
    c = client_for(boss)
    assert c.get(f"{API}/admin/stats").status_code == 403
    assert c.get(f"{API}/admin/users").status_code == 403
    assert c.patch(f"{API}/admin/users/{make_user().id}", json={"status": "suspended"}).status_code == 403


# ── stats ───────────────────────────────────────────────────────────────────────────────────


def test_stats(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    rep = make_user(roles=("student", "rep"))
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
        make_user(phone="+97333123456", name="Ali Mahdi", roles=("student", "rep")),
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
        "roles",
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
    assert found(role="rep") == ["Ali Mahdi"]
    assert found(q="ali", role="newsletter-manager") == []
    assert c.get(f"{API}/admin/users", params={"role": "owner"}).status_code == 422
    paged = c.get(f"{API}/admin/users", params={"limit": 1, "offset": 1}).json()
    assert [u["id"] for u in paged["items"]] == [str(people[1].id)]


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


def test_nothing_sent_changes_nothing_and_the_same_status_is_not_logged_twice(
    client_for: ClientFor, make_user: MakeUser, admin: User, db: Session
) -> None:
    student = make_user()
    c = client_for(admin)
    assert c.patch(f"{API}/admin/users/{student.id}", json={}).json()["status"] == "active"
    for _ in range(2):
        assert c.patch(f"{API}/admin/users/{student.id}", json={"status": "suspended"}).status_code == 200
    count = len(db.scalars(select(AuditEntry).where(AuditEntry.target_id == str(student.id))).all())
    assert count == 1


def test_admins_cannot_change_themselves(client_for: ClientFor, admin: User, db: Session) -> None:
    c = client_for(admin)
    for body in ({"status": "suspended"}, {"email": "new@example.com"}):
        r = c.patch(f"{API}/admin/users/{admin.id}", json=body)
        assert r.status_code == 409
        assert r.json()["error"]["code"] == "cannot_change_self"
    assert access.is_admin(admin)


def test_update_errors(client_for: ClientFor, admin: User, make_user: MakeUser) -> None:
    c = client_for(admin)
    assert c.patch(f"{API}/admin/users/{uuid.uuid4()}", json={"status": "suspended"}).status_code == 404
    assert c.patch(f"{API}/admin/users/{make_user().id}", json={"status": "gone"}).status_code == 422


# ── audit log ───────────────────────────────────────────────────────────────────────────────


def test_audit_log(client_for: ClientFor, make_user: MakeUser, admin: User) -> None:
    a, b = make_user(), make_user()
    c = client_for(admin)
    c.patch(f"{API}/admin/users/{a.id}", json={"status": "suspended"})
    c.patch(f"{API}/admin/users/{b.id}", json={"status": "suspended"})
    page = c.get(f"{API}/admin/audit").json()
    assert page["total"] >= 2
    first, second = page["items"][:2]
    assert (first["action"], first["targetId"]) == ("user.status", str(b.id))
    assert (second["action"], second["targetId"]) == ("user.status", str(a.id))
    assert first["actor"] == {"id": str(admin.id), "displayName": "Head Admin", "year": 2, "badge": "Admin"}
    assert first["data"] == {
        "from": "active",
        "to": "suspended",
        "actorName": "Head Admin",
        "targetName": "Test Student",
    }
    assert set(first) == {"id", "actor", "action", "targetType", "targetId", "data", "createdAt"}
    assert len(c.get(f"{API}/admin/audit", params={"limit": 1}).json()["items"]) == 1


def test_the_log_names_an_account_without_a_name_by_its_masked_address(
    client_for: ClientFor, make_user: MakeUser, admin: User, db: Session
) -> None:
    """UX-15: every account action in the activity log names its target, even before the person picked a name."""
    nameless = make_user(email="nameless@example.com", name=None)
    client_for(admin).patch(f"{API}/admin/users/{nameless.id}", json={"status": "suspended"})
    entry = db.scalar(select(AuditEntry).where(AuditEntry.target_id == str(nameless.id)))
    assert entry is not None
    assert entry.data["targetName"] == "n•••@example.com"


# ── account recovery (security review SEC-9) ─────────────────────────────────────────────────


def test_an_admin_gives_an_account_back_its_email(
    client_for: ClientFor, make_user: MakeUser, admin: User, db: Session, outbox: Outbox, deliver: Deliver
) -> None:
    owner = make_user(email="taken-over@example.com", phone="+97333123493", name="Lost Student")
    hijacked = client_for(owner)
    r = client_for(admin).patch(f"{API}/admin/users/{owner.id}", json={"email": "Back@Example.com"})
    assert r.status_code == 200, r.text
    assert r.json()["email"] == "back@example.com"
    assert hijacked.get(f"{API}/me").status_code == 401  # every session of the account ended
    entry = db.scalar(select(AuditEntry).where(AuditEntry.action == "user.identifier"))
    assert entry is not None
    assert entry.actor_id == admin.id
    assert entry.data == {
        "kind": "email",
        "from": "t•••@example.com",
        "to": "b•••@example.com",
        "actorName": "Head Admin",
        "targetName": "Lost Student",
    }
    note = db.scalar(select(Notification).where(Notification.user_id == owner.id))
    assert note is not None
    assert note.title == "An admin changed the email address on your account"
    deliver()
    [notice] = outbox.to("taken-over@example.com")
    assert "changed to b•••@example.com" in notice.text


def test_an_admin_removes_a_phone_number(
    client_for: ClientFor, make_user: MakeUser, admin: User, outbox: Outbox
) -> None:
    owner = make_user(email="keeps@example.com", phone="+97333123494")
    c = client_for(admin)
    r = c.patch(f"{API}/admin/users/{owner.id}", json={"phone": None})
    assert r.status_code == 200, r.text
    assert r.json()["phone"] is None
    r = c.patch(f"{API}/admin/users/{owner.id}", json={"email": None})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "last_identifier"
    [text] = outbox.to("+97333123494")  # a text goes at once, after the change is saved
    assert "removed from your DSBA Hub account" in text.text


def test_recovery_errors(client_for: ClientFor, make_user: MakeUser, admin: User) -> None:
    owner = make_user(email="owner@example.com")
    make_user(email="other-owner@example.com")
    c = client_for(admin)
    r = c.patch(f"{API}/admin/users/{owner.id}", json={"email": "other-owner@example.com"})
    assert (r.status_code, r.json()["error"]["code"]) == (409, "identifier_taken")
    r = c.patch(f"{API}/admin/users/{owner.id}", json={"email": "+97333123495"})
    assert (r.status_code, r.json()["error"]["code"]) == (422, "invalid_identifier")
    r = c.patch(f"{API}/admin/users/{owner.id}", json={"phone": "not a number"})
    assert (r.status_code, r.json()["error"]["code"]) == (422, "invalid_identifier")
    r = c.patch(f"{API}/admin/users/{admin.id}", json={"email": "me-again@example.com"})
    assert (r.status_code, r.json()["error"]["code"]) == (409, "cannot_change_self")
    assert c.patch(f"{API}/admin/users/{owner.id}", json={"email": "owner@example.com"}).status_code == 200  # no change
    rep = client_for(make_user(roles=("student", "rep")))
    assert rep.patch(f"{API}/admin/users/{owner.id}", json={"email": "x@example.com"}).status_code == 403


def test_recovery_needs_a_recent_step_up(
    client_for: ClientFor,
    make_user: MakeUser,
    admin: User,
    db: Session,
    older_sessions: Callable[..., None],
    outbox: Outbox,
) -> None:
    """Security review AD-1 (SEC-16): with a session older than the step-up window, an admin can still suspend, but
    can't change anyone's email address or phone number until a code confirms it's them."""
    owner = make_user(email="owner@example.com", phone="+97333123496", name="Owner")
    c = client_for(admin)
    older_sessions()
    for body in ({"email": "thief@example.com"}, {"phone": "+97333123497"}, {"phone": None}):
        r = c.patch(f"{API}/admin/users/{owner.id}", json=body)
        assert (r.status_code, r.json()["error"]["code"]) == (403, "step_up_required"), body
    db.refresh(owner)
    assert (owner.email, owner.phone) == ("owner@example.com", "+97333123496")
    assert c.patch(f"{API}/admin/users/{owner.id}", json={"status": "suspended"}).status_code == 200

    started = c.post(f"{API}/me/step-up", json={})
    assert started.status_code == 202, started.text
    code = outbox.to("head@example.com")[-1].code
    done = c.post(f"{API}/me/step-up/verify", json={"challengeId": started.json()["challengeId"], "code": code})
    assert done.status_code == 200, done.text
    sync_csrf(c)
    r = c.patch(f"{API}/admin/users/{owner.id}", json={"email": "back@example.com"})
    assert (r.status_code, r.json()["email"]) == (200, "back@example.com")


def test_an_admins_account_is_never_recovered(
    client_for: ClientFor, make_user: MakeUser, admin: User, db: Session
) -> None:
    """Security review AD-1: recovery would hand an admin's account, and every admin power, to whoever reads the new
    address. An admin changes their own sign-in details, or loses Admin first."""
    other = make_user(email="second@example.com", name="Second Admin", roles=("student", "admin"))
    c = client_for(admin)
    for body in ({"email": "thief@example.com"}, {"phone": "+97333123498"}):
        r = c.patch(f"{API}/admin/users/{other.id}", json=body)
        assert r.status_code == 403, body
        assert r.json()["error"]["message"] == (
            "An admin's email address and phone number can't be changed here. Take Admin away first."
        )
    db.refresh(other)
    assert (other.email, other.phone) == ("second@example.com", None)
    assert db.scalar(select(AuditEntry).where(AuditEntry.action == "user.identifier")) is None
