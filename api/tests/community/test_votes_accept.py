"""Votes on threads and replies, and accepted answers."""

from __future__ import annotations

from collections.abc import Callable

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import AuditEntry, PostStatus, ReplyVote, ThreadVote, User
from tests.community.helpers import API, new_reply, new_thread, notifications_for, reply_row, set_thread, thread_row

Client = Callable[..., TestClient]


def test_thread_votes_are_idempotent(client_for: Client, student: User, classmate: User, db: Session) -> None:
    t = new_thread(client_for(student), title="Vote on me")
    c = client_for(classmate)
    url = f"{API}/forum/threads/{t['id']}/vote"
    for _ in range(2):
        r = c.put(url)
        assert r.status_code == 200
        assert r.json() == {"voteCount": 2, "voted": True}
    assert c.get(f"{API}/forum/threads/{t['slug']}").json()["voted"] is True
    for _ in range(2):
        r = c.delete(url)
        assert r.status_code == 200
        assert r.json() == {"voteCount": 1, "voted": False}
    # the author can take back their own automatic vote
    assert client_for(student).delete(url).json() == {"voteCount": 0, "voted": False}
    assert thread_row(db, t["id"]).vote_count == 0
    assert db.scalar(select(func.count()).select_from(ThreadVote)) == 0
    assert client_for().put(url).status_code == 401


def test_reply_votes_are_idempotent(client_for: Client, student: User, classmate: User, db: Session) -> None:
    t = new_thread(client_for(student), title="Vote on replies")
    reply = new_reply(client_for(classmate), t["id"])
    url = f"{API}/forum/replies/{reply['id']}/vote"
    s = client_for(student)
    assert s.put(url).json() == {"voteCount": 1, "voted": True}
    assert s.put(url).json() == {"voteCount": 1, "voted": True}
    assert client_for(classmate).put(url).json() == {"voteCount": 2, "voted": True}  # your own reply too
    detail = s.get(f"{API}/forum/threads/{t['slug']}").json()
    assert (detail["replies"][0]["voteCount"], detail["replies"][0]["voted"]) == (2, True)
    assert s.delete(url).json() == {"voteCount": 1, "voted": False}
    assert s.delete(url).json() == {"voteCount": 1, "voted": False}
    assert reply_row(db, reply["id"]).vote_count == db.scalar(select(func.count()).select_from(ReplyVote)) == 1
    assert client_for().delete(url).status_code == 401
    assert s.put(f"{API}/forum/replies/00000000-0000-0000-0000-000000000000/vote").status_code == 404


def test_no_votes_on_deleted_or_hidden_posts(
    client_for: Client, student: User, classmate: User, moderator: User, db: Session
) -> None:
    s, c, m = client_for(student), client_for(classmate), client_for(moderator)
    t = new_thread(s, title="Votes and visibility")
    reply = new_reply(c, t["id"])
    assert c.delete(f"{API}/forum/replies/{reply['id']}").status_code == 204
    r = s.put(f"{API}/forum/replies/{reply['id']}/vote")
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "post_unavailable"
    set_thread(db, t["id"], status=PostStatus.hidden)
    assert c.put(f"{API}/forum/threads/{t['id']}/vote").status_code == 404  # students can't see it at all
    r = m.put(f"{API}/forum/threads/{t['id']}/vote")
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "post_unavailable"
    other = new_thread(s, title="Deleted thread with a reply")
    other_reply = new_reply(c, other["id"])
    assert s.delete(f"{API}/forum/threads/{other['id']}").status_code == 204
    assert c.put(f"{API}/forum/threads/{other['id']}/vote").status_code == 409
    assert s.put(f"{API}/forum/replies/{other_reply['id']}/vote").status_code == 200  # its replies still count


def test_accept_an_answer(client_for: Client, student: User, classmate: User, db: Session) -> None:
    s, c = client_for(student), client_for(classmate)
    t = new_thread(s, title="Which calculator is allowed?")
    answer = new_reply(c, t["id"], "The Casio fx-83GT.")
    url = f"{API}/forum/threads/{t['id']}/accept"
    r = s.post(url, json={"replyId": answer["id"]})
    assert r.status_code == 200, r.text
    detail = r.json()
    assert detail["acceptedReplyId"] == answer["id"]
    assert detail["answered"] is True
    assert detail["replies"][0]["accepted"] is True
    accepted = [n for n in notifications_for(db, classmate) if n.kind == "answer_accepted"]
    assert len(accepted) == 1
    assert accepted[0].url == f"/forum/{t['slug']}"
    assert accepted[0].actor_id == student.id
    assert s.post(url, json={"replyId": answer["id"]}).status_code == 200  # again: no second notification
    assert len([n for n in notifications_for(db, classmate) if n.kind == "answer_accepted"]) == 1
    listed = client_for().get(f"{API}/forum/threads").json()["items"][0]
    assert listed["answered"] is True
    cleared = s.post(url, json={"replyId": None}).json()
    assert cleared["acceptedReplyId"] is None
    assert cleared["answered"] is False
    assert db.scalar(select(func.count()).select_from(AuditEntry)) == 0  # the author's own call: no audit


def test_who_may_accept(client_for: Client, student: User, classmate: User, moderator: User, db: Session) -> None:
    t = new_thread(client_for(student), title="Accept permissions")
    answer = new_reply(client_for(classmate), t["id"])
    url = f"{API}/forum/threads/{t['id']}/accept"
    assert client_for().post(url, json={"replyId": answer["id"]}).status_code == 401
    r = client_for(classmate).post(url, json={"replyId": answer["id"]})
    assert r.status_code == 403
    r = client_for(moderator).post(url, json={"replyId": answer["id"]})
    assert r.status_code == 200
    assert r.json()["answered"] is True
    entry = db.scalar(select(AuditEntry).where(AuditEntry.action == "forum.thread.accept"))
    assert entry is not None
    assert entry.data["replyId"] == answer["id"]
    assert client_for(student).get(f"{API}/forum/threads/{t['slug']}").json()["canAccept"] is True
    assert client_for(classmate).get(f"{API}/forum/threads/{t['slug']}").json()["canAccept"] is False


def test_what_can_be_accepted(client_for: Client, student: User, classmate: User, moderator: User) -> None:
    s, c = client_for(student), client_for(classmate)
    t = new_thread(s, title="Accept rules")
    other_thread = new_thread(c, title="Another thread")
    top = new_reply(c, t["id"], "Top-level answer")
    nested = new_reply(c, t["id"], "Nested follow-up", parentId=top["id"])
    own = new_reply(s, t["id"], "Answering myself")
    elsewhere = new_reply(c, other_thread["id"], "Wrong thread")
    gone = new_reply(c, t["id"], "Deleted answer")
    hidden = new_reply(c, t["id"], "Hidden answer")
    assert c.delete(f"{API}/forum/replies/{gone['id']}").status_code == 204
    r = client_for(moderator).post(f"{API}/forum/replies/{hidden['id']}/moderate", json={"status": "hidden"})
    assert r.status_code == 200
    url = f"{API}/forum/threads/{t['id']}/accept"

    def code(reply_id: str) -> tuple[int, str]:
        r = s.post(url, json={"replyId": reply_id})
        return r.status_code, r.json()["error"]["code"]

    assert code(nested["id"]) == (422, "invalid_input")  # only a direct reply is the answer
    assert code(own["id"]) == (422, "invalid_input")  # not your own
    assert code(gone["id"]) == (422, "invalid_input")
    assert code(elsewhere["id"]) == (404, "not_found")  # another thread's reply
    assert code(hidden["id"]) == (404, "not_found")  # a reply the author can't see
    assert code("00000000-0000-0000-0000-000000000000") == (404, "not_found")
    assert s.post(url, json={}).status_code == 422  # replyId is required (null clears)


def test_the_answer_goes_when_its_reply_does(
    client_for: Client, student: User, classmate: User, moderator: User
) -> None:
    s, c, m = client_for(student), client_for(classmate), client_for(moderator)
    t = new_thread(s, title="Answer then hidden")
    first = new_reply(c, t["id"], "First answer")
    assert s.post(f"{API}/forum/threads/{t['id']}/accept", json={"replyId": first["id"]}).status_code == 200
    assert m.post(f"{API}/forum/replies/{first['id']}/moderate", json={"status": "hidden"}).status_code == 200
    assert s.get(f"{API}/forum/threads/{t['slug']}").json()["answered"] is False
    second = new_reply(c, t["id"], "Second answer")
    assert s.post(f"{API}/forum/threads/{t['id']}/accept", json={"replyId": second["id"]}).status_code == 200
    assert c.delete(f"{API}/forum/replies/{second['id']}").status_code == 204
    detail = s.get(f"{API}/forum/threads/{t['slug']}").json()
    assert detail["acceptedReplyId"] is None
    assert detail["answered"] is False


def test_no_accepting_on_a_deleted_thread(client_for: Client, student: User, classmate: User) -> None:
    s = client_for(student)
    t = new_thread(s, title="Deleted before the answer")
    answer = new_reply(client_for(classmate), t["id"])
    assert s.delete(f"{API}/forum/threads/{t['id']}").status_code == 204
    r = s.post(f"{API}/forum/threads/{t['id']}/accept", json={"replyId": answer["id"]})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "post_unavailable"
