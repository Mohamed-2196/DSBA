"""Replies: posting (notifications, nesting, locks, rate limit), editing, deleting and hiding."""

from __future__ import annotations

from collections import Counter
from collections.abc import Callable
from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.time import utcnow
from app.models import AuditEntry, ForumReply, PostStatus, UploadStatus, User
from tests.community.helpers import (
    API,
    make_upload,
    new_reply,
    new_thread,
    notifications_for,
    reply_row,
    set_thread,
    thread_row,
)

Client = Callable[..., TestClient]


def test_reply_to_a_thread(client_for: Client, student: User, classmate: User, db: Session) -> None:
    t = new_thread(client_for(student), title="Where is room 2.14?")
    set_thread(db, t["id"], last_activity_at=utcnow() - timedelta(hours=5))
    c = client_for(classmate)
    r = c.post(f"{API}/forum/threads/{t['id']}/replies", json={"body": "  Second floor, *left* of the lifts. "})
    assert r.status_code == 201, r.text
    reply = r.json()
    assert reply["body"] == "Second floor, *left* of the lifts."
    assert reply["threadId"] == t["id"]
    assert reply["parentId"] is None
    assert reply["author"]["displayName"] == "Ebrahim D."
    assert reply["authorYear"] == 2
    assert (reply["voteCount"], reply["voted"], reply["accepted"]) == (0, False, False)
    assert (reply["isMine"], reply["canEdit"], reply["status"]) == (True, True, "visible")
    row = thread_row(db, t["id"])
    assert row.reply_count == 1
    assert row.last_activity_at > utcnow() - timedelta(minutes=1)
    [n] = notifications_for(db, student)
    assert (n.kind, n.title, n.url, n.actor_id) == (
        "thread_reply",
        "Ebrahim D. replied to your thread",
        f"/forum/{t['slug']}",
        classmate.id,
    )
    assert n.body == "“Where is room 2.14?”"
    # replying on your own thread notifies nobody
    new_reply(client_for(student), t["id"], "Thanks!")
    assert len(notifications_for(db, student)) == 1
    detail = client_for().get(f"{API}/forum/threads/{t['slug']}").json()
    assert [x["body"] for x in detail["replies"]] == ["Second floor, *left* of the lifts.", "Thanks!"]  # oldest first
    assert detail["replyCount"] == 2


def test_nested_replies_and_their_notifications(
    client_for: Client, student: User, classmate: User, make_user: Callable[..., User], db: Session
) -> None:
    third = make_user(name="Layla F.", year=1)
    t = new_thread(client_for(student), title="Revision group this week?")
    top = new_reply(client_for(classmate), t["id"], "I'm in")
    child = new_reply(client_for(third), t["id"], "Me too", parentId=top["id"])
    assert child["parentId"] == top["id"]

    def kinds(user: User) -> Counter[str]:
        return Counter(n.kind for n in notifications_for(db, user))

    assert kinds(student) == {"thread_reply": 2}
    assert kinds(classmate) == {"reply_reply": 1}
    # answering under your own reply: nothing for you, the thread's author still hears
    new_reply(client_for(classmate), t["id"], "Answering under my own reply", parentId=top["id"])
    assert kinds(classmate) == {"reply_reply": 1}
    assert kinds(student) == {"thread_reply": 3}
    # under the thread author's own reply: they hear once (reply_reply), not twice
    mine = new_reply(client_for(student), t["id"], "Top-level by the author")
    new_reply(client_for(third), t["id"], "Under the author's reply", parentId=mine["id"])
    assert kinds(student) == {"thread_reply": 3, "reply_reply": 1}
    assert kinds(third) == {}


def test_reply_parent_rules(client_for: Client, student: User, classmate: User, moderator: User) -> None:
    s, c = client_for(student), client_for(classmate)
    t = new_thread(s, title="Parent rules")
    other = new_thread(s, title="Other thread")
    top = new_reply(c, t["id"], "Top")
    child = new_reply(c, t["id"], "Child", parentId=top["id"])
    elsewhere = new_reply(c, other["id"], "Elsewhere")
    gone = new_reply(c, t["id"], "Gone")
    hidden = new_reply(c, t["id"], "Hidden")
    assert c.delete(f"{API}/forum/replies/{gone['id']}").status_code == 204
    assert client_for(moderator).post(f"{API}/forum/replies/{hidden['id']}/moderate", json={"status": "hidden"})
    url = f"{API}/forum/threads/{t['id']}/replies"

    def status(parent_id: str) -> int:
        return s.post(url, json={"body": "A reply", "parentId": parent_id}).status_code

    assert status(child["id"]) == 422  # one level only
    assert status(gone["id"]) == 422
    assert status(elsewhere["id"]) == 404
    assert status(hidden["id"]) == 404
    assert status("00000000-0000-0000-0000-000000000000") == 404


def test_reply_validation_and_access(client_for: Client, student: User, db: Session) -> None:
    t = new_thread(client_for(student), title="Reply validation")
    url = f"{API}/forum/threads/{t['id']}/replies"
    assert client_for().post(url, json={"body": "Guest reply"}).status_code == 401
    s = client_for(student)
    for body in ("", "   ", "\x00\x01", "x" * 10_001):
        r = s.post(url, json={"body": body})
        assert r.status_code == 422, body
        assert r.json()["error"]["code"] == "invalid_input"
    assert (
        s.post(f"{API}/forum/threads/00000000-0000-0000-0000-000000000000/replies", json={"body": "Hi"}).status_code
        == 404
    )
    assert thread_row(db, t["id"]).reply_count == 0


def test_locked_deleted_and_hidden_threads_take_no_replies(
    client_for: Client, student: User, classmate: User, moderator: User, db: Session
) -> None:
    s, c, m = client_for(student), client_for(classmate), client_for(moderator)
    t = new_thread(s, title="Locked soon")
    url = f"{API}/forum/threads/{t['id']}/replies"
    assert m.post(f"{API}/forum/threads/{t['id']}/moderate", json={"locked": True}).status_code == 200
    r = c.post(url, json={"body": "Too late"})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "thread_locked"
    assert m.post(url, json={"body": "Locked: see the pinned thread."}).status_code == 201  # reps still can
    deleted = new_thread(s, title="Deleted soon")
    new_reply(c, deleted["id"])
    assert s.delete(f"{API}/forum/threads/{deleted['id']}").status_code == 204
    r = c.post(f"{API}/forum/threads/{deleted['id']}/replies", json={"body": "Still there?"})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "thread_locked"
    hidden = new_thread(s, title="Hidden soon")
    set_thread(db, hidden["id"], status=PostStatus.hidden)
    assert c.post(f"{API}/forum/threads/{hidden['id']}/replies", json={"body": "Hello?"}).status_code == 404
    assert m.post(f"{API}/forum/threads/{hidden['id']}/replies", json={"body": "Hello?"}).status_code == 409


def test_reply_rate_limit(client_for: Client, student: User, classmate: User, db: Session) -> None:
    t = new_thread(client_for(student), title="Busy thread")
    now = utcnow()
    for i in range(60):
        db.add(
            ForumReply(
                thread_id=thread_row(db, t["id"]).id,
                author_id=classmate.id,
                body=f"reply {i}",
                created_at=now - timedelta(minutes=59, seconds=-i),
            )
        )
    db.commit()
    r = client_for(classmate).post(f"{API}/forum/threads/{t['id']}/replies", json={"body": "One more"})
    assert r.status_code == 429
    assert r.json()["error"]["code"] == "rate_limited"
    assert 0 < r.json()["error"]["retryAfter"] <= 120
    assert client_for(student).post(f"{API}/forum/threads/{t['id']}/replies", json={"body": "Mine"}).status_code == 201


def test_edit_a_reply(client_for: Client, student: User, classmate: User, moderator: User, db: Session) -> None:
    t = new_thread(client_for(student), title="Edit replies")
    reply = new_reply(client_for(classmate), t["id"], "Frist")
    url = f"{API}/forum/replies/{reply['id']}"
    r = client_for(classmate).patch(url, json={"body": "First"})
    assert r.status_code == 200
    assert r.json()["body"] == "First"
    assert r.json()["editedAt"] is not None
    assert client_for(student).patch(url, json={"body": "Hijack"}).status_code == 403
    assert client_for().patch(url, json={"body": "Guest"}).status_code == 401
    assert client_for(classmate).patch(url, json={"body": "  "}).status_code == 422
    assert client_for(moderator).patch(url, json={"body": "Edited by a rep"}).status_code == 200
    assert db.scalars(select(AuditEntry.action)).all() == ["forum.reply.edit"]
    assert client_for(classmate).delete(url).status_code == 204
    r = client_for(classmate).patch(url, json={"body": "Back"})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "post_unavailable"


def test_delete_a_reply(client_for: Client, student: User, classmate: User, moderator: User, db: Session) -> None:
    t = new_thread(client_for(student), title="Delete replies")
    reply = new_reply(client_for(classmate), t["id"], "Regrettable")
    child = new_reply(client_for(student), t["id"], "Answer to it", parentId=reply["id"])
    url = f"{API}/forum/replies/{reply['id']}"
    assert client_for(student).delete(url).status_code == 403
    assert client_for().delete(url).status_code == 401
    assert client_for(classmate).delete(url).status_code == 204
    assert client_for(classmate).delete(url).status_code == 204  # idempotent
    row = reply_row(db, reply["id"])
    assert (row.status, row.body) == (PostStatus.deleted, "")
    detail = client_for().get(f"{API}/forum/threads/{t['slug']}").json()
    assert [(x["id"], x["status"], x["body"]) for x in detail["replies"]] == [
        (reply["id"], "deleted", ""),  # keeps its place, author kept
        (child["id"], "visible", "Answer to it"),
    ]
    assert detail["replies"][0]["author"]["displayName"] == "Ebrahim D."
    assert detail["replies"][0]["canEdit"] is False
    assert detail["replyCount"] == 1
    assert client_for(moderator).delete(f"{API}/forum/replies/{child['id']}").status_code == 204
    assert thread_row(db, t["id"]).reply_count == 0
    assert db.scalars(select(AuditEntry.action)).all() == ["forum.reply.delete"]


def test_hide_and_show_a_reply(
    client_for: Client, student: User, classmate: User, moderator: User, db: Session
) -> None:
    t = new_thread(client_for(student), title="Hide replies")
    reply = new_reply(client_for(classmate), t["id"], "Rude words")
    url = f"{API}/forum/replies/{reply['id']}/moderate"
    m = client_for(moderator)
    assert client_for(student).post(url, json={"status": "hidden"}).status_code == 403
    assert client_for().post(url, json={"status": "hidden"}).status_code == 401
    r = m.post(url, json={"status": "hidden"})
    assert r.status_code == 200
    assert r.json()["status"] == "hidden"
    assert r.json()["body"] == "Rude words"  # kept for the record
    assert thread_row(db, t["id"]).reply_count == 0
    for viewer in (client_for(), client_for(student), client_for(classmate)):
        assert viewer.get(f"{API}/forum/threads/{t['slug']}").json()["replies"] == []
        assert viewer.delete(f"{API}/forum/replies/{reply['id']}").status_code in (401, 404)
    mod_view = m.get(f"{API}/forum/threads/{t['slug']}").json()
    assert [(x["status"], x["body"]) for x in mod_view["replies"]] == [("hidden", "Rude words")]
    assert mod_view["canModerate"] is True
    assert m.post(url, json={"status": "visible"}).json()["status"] == "visible"
    assert thread_row(db, t["id"]).reply_count == 1
    entries = db.scalars(select(AuditEntry).order_by(AuditEntry.id)).all()
    assert [e.action for e in entries] == ["forum.reply.hide", "forum.reply.unhide"]
    assert entries[0].data["from"] == "visible"
    assert entries[0].data["title"] == "Hide replies"
    assert m.post(url, json={"status": "deleted"}).status_code == 422


def test_hiding_a_deleted_reply_keeps_it_deleted(
    client_for: Client, student: User, classmate: User, moderator: User, db: Session
) -> None:
    t = new_thread(client_for(student), title="Hide a deleted reply")
    reply = new_reply(client_for(classmate), t["id"], "Deleted by its author")
    assert client_for(classmate).delete(f"{API}/forum/replies/{reply['id']}").status_code == 204
    m = client_for(moderator)
    url = f"{API}/forum/replies/{reply['id']}/moderate"
    assert m.post(url, json={"status": "hidden"}).json()["status"] == "hidden"
    assert client_for().get(f"{API}/forum/threads/{t['slug']}").json()["replies"] == []  # not even its place
    assert m.post(url, json={"status": "visible"}).json()["status"] == "deleted"  # not brought back to life
    assert thread_row(db, t["id"]).reply_count == 0
    r = m.post(url, json={"status": "visible"})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "post_unavailable"


def test_reply_images_are_attached(client_for: Client, student: User, classmate: User, db: Session) -> None:
    t = new_thread(client_for(student), title="Show your working")
    photo = make_upload(db, classmate)
    new_reply(client_for(classmate), t["id"], f"Here:\n\n![working](/api/v1/media/{photo.id})")
    db.refresh(photo)
    assert photo.status == UploadStatus.attached
