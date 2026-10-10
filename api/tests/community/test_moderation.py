"""POST /forum/threads/{id}/moderate: pin, lock, hide; who sees hidden threads; the audit log."""

from __future__ import annotations

from collections.abc import Callable

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AuditEntry, PostStatus, Role, User, UserStatus
from tests.community.helpers import API, new_reply, new_thread, thread_row

Client = Callable[..., TestClient]


def test_pin_lock_hide_and_audit(client_for: Client, student: User, moderator: User, db: Session) -> None:
    t = new_thread(client_for(student), title="Moderate me")
    m = client_for(moderator)
    url = f"{API}/forum/threads/{t['id']}/moderate"
    r = m.post(url, json={"pinned": True, "locked": True})
    assert r.status_code == 200, r.text
    assert (r.json()["pinned"], r.json()["locked"], r.json()["canModerate"]) == (True, True, True)
    assert m.post(url, json={"pinned": True}).status_code == 200  # no change: no audit row
    r = m.post(url, json={"status": "hidden"})
    assert r.json()["status"] == "hidden"
    r = m.post(url, json={"status": "visible", "pinned": False, "locked": False})
    assert (r.json()["status"], r.json()["pinned"], r.json()["locked"]) == ("visible", False, False)
    entries = db.scalars(select(AuditEntry).order_by(AuditEntry.id)).all()
    assert [e.action for e in entries] == [
        "forum.thread.pin",
        "forum.thread.lock",
        "forum.thread.hide",
        "forum.thread.unpin",
        "forum.thread.unlock",
        "forum.thread.unhide",
    ]
    assert {(e.actor_id, e.target_type, e.target_id) for e in entries} == {(moderator.id, "thread", t["id"])}
    assert entries[0].data == {"actorName": "Student Rep", "title": "Moderate me", "slug": t["slug"]}
    assert entries[2].data["from"] == "visible"
    assert entries[5].data["to"] == "visible"


def test_only_reps_moderate(
    client_for: Client, student: User, moderator: User, make_user: Callable[..., User], db: Session
) -> None:
    t = new_thread(client_for(student), title="Not yours to moderate")
    url = f"{API}/forum/threads/{t['id']}/moderate"
    assert client_for().post(url, json={"pinned": True}).status_code == 401
    r = client_for(student).post(url, json={"pinned": True})
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "forbidden"
    admin = make_user(name="Admin", role=Role.admin)
    assert client_for(admin).post(url, json={"pinned": True}).status_code == 200
    moderator.status = UserStatus.suspended
    db.commit()
    assert client_for(moderator).post(url, json={"locked": True}).status_code == 403
    assert thread_row(db, t["id"]).locked is False
    assert client_for(admin).post(url, json={"status": "deleted"}).status_code == 422


def test_hidden_threads_exist_only_for_reps(
    client_for: Client, student: User, classmate: User, moderator: User
) -> None:
    t = new_thread(client_for(student), title="Hidden from students")
    m = client_for(moderator)
    assert m.post(f"{API}/forum/threads/{t['id']}/moderate", json={"status": "hidden"}).status_code == 200
    for viewer in (client_for(), client_for(student), client_for(classmate)):
        assert viewer.get(f"{API}/forum/threads/{t['slug']}").status_code == 404
        assert viewer.get(f"{API}/forum/threads/{t['id']}/related").status_code == 404
        assert viewer.get(f"{API}/forum/threads").json()["total"] == 0
    assert client_for(student).delete(f"{API}/forum/threads/{t['id']}").status_code == 404
    seen = m.get(f"{API}/forum/threads/{t['slug']}").json()
    assert (seen["status"], seen["body"]) == ("hidden", "I tried integrating directly.")
    assert m.get(f"{API}/forum/threads").json()["total"] == 1


def test_hiding_a_deleted_thread(
    client_for: Client, student: User, classmate: User, moderator: User, db: Session
) -> None:
    s, m = client_for(student), client_for(moderator)
    t = new_thread(s, title="An offensive title")
    new_reply(client_for(classmate), t["id"])
    assert s.delete(f"{API}/forum/threads/{t['id']}").status_code == 204
    assert client_for().get(f"{API}/forum/threads").json()["total"] == 1  # still listed: it has a reply
    url = f"{API}/forum/threads/{t['id']}/moderate"
    assert m.post(url, json={"status": "hidden"}).json()["status"] == "hidden"
    assert client_for().get(f"{API}/forum/threads").json()["total"] == 0  # the title is gone from the list
    assert m.post(url, json={"status": "visible"}).json()["status"] == "deleted"  # back to deleted, not visible
    assert thread_row(db, t["id"]).status == PostStatus.deleted
    r = m.post(url, json={"status": "visible"})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "post_unavailable"


def test_a_suspended_rep_sees_what_students_see(
    client_for: Client, student: User, moderator: User, db: Session
) -> None:
    t = new_thread(client_for(student), title="Hidden before the suspension")
    m = client_for(moderator)
    assert m.post(f"{API}/forum/threads/{t['id']}/moderate", json={"status": "hidden"}).status_code == 200
    moderator.status = UserStatus.suspended
    db.commit()
    assert m.get(f"{API}/forum/threads/{t['slug']}").status_code == 404
    assert m.get(f"{API}/forum/threads").json()["total"] == 0
    assert m.get(f"{API}/admin/reports").status_code == 403
