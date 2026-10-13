"""Hidden posts: a rep's delete keeps them hidden (SEC-15), and their author can still read them and is told why
(decision D3, ST-5)."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AuditEntry, PostStatus, User
from tests.community.helpers import API, new_reply, new_thread, notifications_for, reply_row, thread_row

Client = Callable[..., TestClient]


def hide(client: TestClient, thread_id: str, **fields: Any) -> dict[str, Any]:
    r = client.post(f"{API}/forum/threads/{thread_id}/moderate", json={"status": "hidden", **fields})
    assert r.status_code == 200, r.text
    data: dict[str, Any] = r.json()
    return data


def test_deleting_a_hidden_thread_keeps_it_hidden(
    client_for: Client, student: User, classmate: User, moderator: User, modules: dict[str, Any], db: Session
) -> None:
    s, c, m = client_for(student), client_for(classmate), client_for(moderator)
    t = new_thread(s, title="Call Sara on 3612 4587", body="Personal details", moduleId="mathematics")
    reply = new_reply(c, t["id"], "A reply in the pile-on")
    other = new_thread(c, title="Another maths question", moduleId="mathematics")
    hide(m, t["id"])
    assert m.delete(f"{API}/forum/threads/{t['id']}").status_code == 204
    row = thread_row(db, t["id"])
    assert row.status == PostStatus.hidden  # still hidden
    assert row.body == ""  # its text is gone,
    assert row.deleted_at is not None  # and the row says it was deleted
    # nobody but the reps sees anything of it: guests, its author, the student who replied
    for viewer in (client_for(), s, c):
        assert viewer.get(f"{API}/forum/threads/{t['slug']}").status_code == 404
        assert viewer.get(f"{API}/forum/threads/{t['id']}/related").status_code == 404
        listed = viewer.get(f"{API}/forum/threads").json()
        assert [x["id"] for x in listed["items"]] == [other["id"]]
        assert viewer.get(f"{API}/forum/threads", params={"q": "Sara 3612"}).json()["total"] == 0
        assert t["id"] not in [x["id"] for x in viewer.get(f"{API}/forum/threads/hot").json()]
        related = viewer.get(f"{API}/forum/threads/{other['id']}/related").json()
        assert t["id"] not in [x["id"] for x in related]
        assert viewer.put(f"{API}/forum/replies/{reply['id']}/vote").status_code in (401, 404)
    assert client_for().get(f"{API}/forum/stats").json()["total"] == 1
    # the reps see it hidden, with no text left
    seen = m.get(f"{API}/forum/threads/{t['slug']}").json()
    assert (seen["status"], seen["body"], seen["excerpt"], seen["canEdit"]) == ("hidden", "", "", False)
    assert m.patch(f"{API}/forum/threads/{t['id']}", json={"body": "Back"}).status_code == 409
    assert m.delete(f"{API}/forum/threads/{t['id']}").status_code == 204  # again: nothing changes
    # unhiding gives a deleted thread: its title and replies show, as for any deleted thread with replies
    back = m.post(f"{API}/forum/threads/{t['id']}/moderate", json={"status": "visible"}).json()
    assert (back["status"], back["body"]) == ("deleted", "")
    assert thread_row(db, t["id"]).body == ""
    public = client_for().get(f"{API}/forum/threads/{t['slug']}").json()
    assert (public["status"], [x["id"] for x in public["replies"]]) == ("deleted", [reply["id"]])
    actions = db.scalars(select(AuditEntry.action).order_by(AuditEntry.id)).all()
    assert actions == ["forum.thread.hide", "forum.thread.delete", "forum.thread.unhide"]
    assert db.scalars(select(AuditEntry.data).order_by(AuditEntry.id.desc())).first() == {
        "actorName": "Student Rep",
        "title": t["title"],
        "slug": t["slug"],
        "to": "deleted",
    }


def test_deleting_a_hidden_reply_keeps_it_hidden(
    client_for: Client, student: User, classmate: User, moderator: User, db: Session
) -> None:
    t = new_thread(client_for(student), title="A thread with a bad reply")
    reply = new_reply(client_for(classmate), t["id"], "Someone's phone number")
    m = client_for(moderator)
    url = f"{API}/forum/replies/{reply['id']}/moderate"
    assert m.post(url, json={"status": "hidden"}).status_code == 200
    assert m.delete(f"{API}/forum/replies/{reply['id']}").status_code == 204
    row = reply_row(db, reply["id"])
    assert (row.status, row.body) == (PostStatus.hidden, "")
    assert row.deleted_at is not None
    for viewer in (client_for(), client_for(student), client_for(classmate)):  # not even a "deleted" placeholder
        assert viewer.get(f"{API}/forum/threads/{t['slug']}").json()["replies"] == []
    assert [(x["status"], x["body"]) for x in m.get(f"{API}/forum/threads/{t['slug']}").json()["replies"]] == [
        ("hidden", "")
    ]
    assert thread_row(db, t["id"]).reply_count == 0
    assert m.patch(f"{API}/forum/replies/{reply['id']}", json={"body": "Back"}).status_code == 409
    assert m.post(url, json={"status": "visible"}).json()["status"] == "deleted"  # unhiding gives a deleted reply
    assert thread_row(db, t["id"]).reply_count == 0
    shown = client_for().get(f"{API}/forum/threads/{t['slug']}").json()["replies"]
    assert [(x["status"], x["body"]) for x in shown] == [("deleted", "")]


def test_the_author_of_a_hidden_thread_can_still_open_it(
    client_for: Client, student: User, classmate: User, moderator: User, db: Session
) -> None:
    s, m = client_for(student), client_for(moderator)
    t = new_thread(s, title="Selling past paper answers", body="DM me")
    reply = new_reply(client_for(classmate), t["id"], "Not allowed")
    hide(m, t["id"], reason="Selling answers breaks the exam rules.")
    seen = s.get(f"{API}/forum/threads/{t['slug']}")
    assert seen.status_code == 200
    detail = seen.json()
    assert (detail["status"], detail["isMine"], detail["body"]) == ("hidden", True, "DM me")
    assert (detail["canEdit"], detail["canAccept"], detail["canModerate"]) == (False, False, False)
    assert [x["id"] for x in detail["replies"]] == [reply["id"]]
    assert s.get(f"{API}/forum/threads/{t['id']}/related").status_code == 200
    # reading is all: the thread is in the reps' hands
    assert s.patch(f"{API}/forum/threads/{t['id']}", json={"title": "Something else"}).status_code == 404
    assert s.delete(f"{API}/forum/threads/{t['id']}").status_code == 404
    assert s.put(f"{API}/forum/threads/{t['id']}/vote").status_code == 404
    assert s.post(f"{API}/forum/threads/{t['id']}/replies", json={"body": "Why?"}).status_code == 404
    assert s.post(f"{API}/forum/threads/{t['id']}/accept", json={"replyId": reply["id"]}).status_code == 404
    # everyone else: 404
    assert client_for().get(f"{API}/forum/threads/{t['slug']}").status_code == 404
    assert client_for(classmate).get(f"{API}/forum/threads/{t['slug']}").status_code == 404
    # told, with the rep's reason, and without naming the rep
    [n] = [x for x in notifications_for(db, student) if x.kind == "system"]
    assert n.title == "A student rep hid your thread"
    assert n.body == (
        "Your thread “Selling past paper answers” is now visible only to you and the student reps. "
        "Reason: Selling answers breaks the exam rules."
    )
    assert n.url == f"/forum/{t['slug']}"
    assert n.actor_id is None
    entry = db.scalar(select(AuditEntry).where(AuditEntry.action == "forum.thread.hide"))
    assert entry is not None
    assert entry.data["reason"] == "Selling answers breaks the exam rules."
    # unhidden: public again, and nothing more to tell
    assert m.post(f"{API}/forum/threads/{t['id']}/moderate", json={"status": "visible"}).status_code == 200
    assert client_for().get(f"{API}/forum/threads/{t['slug']}").json()["status"] == "visible"
    assert len([x for x in notifications_for(db, student) if x.kind == "system"]) == 1


def test_hiding_without_a_reason_and_hiding_your_own(
    client_for: Client, student: User, moderator: User, db: Session
) -> None:
    t = new_thread(client_for(student), title="Off-topic thread")
    blank = new_thread(client_for(student), title="Another off-topic thread")
    messy = new_thread(client_for(student), title="A third off-topic thread")
    m = client_for(moderator)
    hide(m, t["id"])
    hide(m, blank["id"], reason=" \u0007 ")  # nothing to say: as if no reason were given
    hide(m, messy["id"], reason="Off topic,\n\u0007see the  rules")  # one line in the notification
    told = {n.data["threadId"]: n.body or "" for n in notifications_for(db, student)}
    contact = "Contact a student rep if you think this is a mistake."
    assert told[t["id"]] == f"Your thread “Off-topic thread” is now visible only to you and the student reps. {contact}"
    assert told[blank["id"]].endswith(f"reps. {contact}")
    assert told[messy["id"]].endswith("reps. Reason: Off topic, see the rules")
    own = new_thread(m, title="A rep's own announcement")
    hide(m, own["id"], reason="Posted twice")
    assert notifications_for(db, moderator) == []
    r = m.post(f"{API}/forum/threads/{own['id']}/moderate", json={"status": "hidden", "reason": "x" * 501})
    assert r.status_code == 422


def test_a_hidden_reply_shows_to_its_author_with_a_notice(
    client_for: Client, student: User, classmate: User, moderator: User, db: Session
) -> None:
    t = new_thread(client_for(student), title="A thread with a rude reply")
    reply = new_reply(client_for(classmate), t["id"], "Rude reply")
    r = client_for(moderator).post(
        f"{API}/forum/replies/{reply['id']}/moderate", json={"status": "hidden", "reason": "Be kind."}
    )
    assert r.status_code == 200
    [n] = notifications_for(db, classmate)
    assert (n.kind, n.title) == ("system", "A student rep hid your reply")
    assert n.body == (
        "Your reply in “A thread with a rude reply” is now visible only to you and the student reps. Reason: Be kind."
    )
    assert n.url == f"/forum/{t['slug']}#reply-{reply['id']}"
    mine = client_for(classmate).get(f"{API}/forum/threads/{t['slug']}").json()["replies"]
    assert [(x["id"], x["status"], x["isMine"], x["canEdit"]) for x in mine] == [(reply["id"], "hidden", True, False)]
    assert client_for(student).get(f"{API}/forum/threads/{t['slug']}").json()["replies"] == []
    assert client_for(classmate).put(f"{API}/forum/replies/{reply['id']}/vote").status_code == 404
