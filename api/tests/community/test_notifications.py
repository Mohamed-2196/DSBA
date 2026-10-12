"""The forum's notifications: they open at the reply (ST-4), quote it (ST-6), and go when the reply does (ST-6)."""

from __future__ import annotations

from collections.abc import Callable

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import EmailOutbox, OutboxStatus, User
from tests.community.helpers import API, new_reply, new_thread, notifications_for

Client = Callable[..., TestClient]


def test_reply_notifications_open_at_the_reply(
    client_for: Client, student: User, classmate: User, make_user: Callable[..., User], db: Session
) -> None:
    third = make_user(name="Layla F.", year=1)
    t = new_thread(client_for(student), title="A very long question about moment generating functions of a gamma")
    top = new_reply(client_for(classmate), t["id"], "**Use** the definition, then [the notes](/library/x).")
    under = new_reply(client_for(third), t["id"], "Thanks, that worked", parentId=top["id"])
    assert client_for(student).post(f"{API}/forum/threads/{t['id']}/accept", json={"replyId": top["id"]})
    to_student = {n.data["replyId"]: n for n in notifications_for(db, student)}
    first = to_student[top["id"]]
    assert first.url == f"/forum/{t['slug']}#reply-{top['id']}"
    # the thread's title, cut at a word under 60 characters
    assert (
        first.title
        == "Ebrahim D. replied to your thread “A very long question about moment generating functions of a…”"
    )
    assert first.body == "Use the definition, then the notes."  # the reply, as plain text
    assert to_student[under["id"]].url == f"/forum/{t['slug']}#reply-{under['id']}"
    by_kind = {n.kind: n for n in notifications_for(db, classmate)}
    assert by_kind["reply_reply"].url == f"/forum/{t['slug']}#reply-{under['id']}"
    assert by_kind["reply_reply"].title.startswith("Layla F. replied to you in “A very long question")
    assert by_kind["reply_reply"].body == "Thanks, that worked"
    assert by_kind["answer_accepted"].url == f"/forum/{t['slug']}#reply-{top['id']}"


def test_deleting_a_reply_takes_its_notifications_back(
    client_for: Client, student: User, classmate: User, make_user: Callable[..., User], db: Session
) -> None:
    third = make_user(name="Layla F.", year=1)
    t = new_thread(client_for(student), title="Which calculator is allowed?")
    answer = new_reply(client_for(classmate), t["id"], "The Casio fx-83GT")
    under = new_reply(client_for(third), t["id"], "Same here", parentId=answer["id"])
    keep = new_reply(client_for(third), t["id"], "Also the fx-85GT")
    assert client_for(student).post(f"{API}/forum/threads/{t['id']}/accept", json={"replyId": answer["id"]})
    email = db.scalar(select(EmailOutbox).where(EmailOutbox.user_id == student.id).order_by(EmailOutbox.created_at))
    assert email is not None  # the reply's email to the thread's author is waiting for the mail worker
    assert email.status == OutboxStatus.pending
    assert client_for(classmate).delete(f"{API}/forum/replies/{answer['id']}").status_code == 204
    # about the deleted reply: gone from the thread's author and its own author; their unsent email cancelled
    left = {(n.kind, n.data["replyId"]) for n in notifications_for(db, student)}
    assert left == {("thread_reply", under["id"]), ("thread_reply", keep["id"])}
    assert [n.kind for n in notifications_for(db, classmate)] == ["reply_reply"]  # about Layla's reply: it stays
    after = db.execute(select(EmailOutbox.status, EmailOutbox.notification_id).where(EmailOutbox.id == email.id)).one()
    assert tuple(after) == (OutboxStatus.cancelled, None)


def test_hiding_a_reply_takes_its_notifications_back(
    client_for: Client, student: User, classmate: User, moderator: User, db: Session
) -> None:
    t = new_thread(client_for(student), title="Thread with a spam reply")
    spam = new_reply(client_for(classmate), t["id"], "Buy essays here")
    assert [n.kind for n in notifications_for(db, student)] == ["thread_reply"]
    r = client_for(moderator).post(f"{API}/forum/replies/{spam['id']}/moderate", json={"status": "hidden"})
    assert r.status_code == 200
    assert notifications_for(db, student) == []
    # showing it again doesn't bring the notification back: it was news when it was posted
    assert client_for(moderator).post(f"{API}/forum/replies/{spam['id']}/moderate", json={"status": "visible"})
    assert notifications_for(db, student) == []
