"""Counts and lists agree with what a thread shows: a deleted thread leaves the lists it should (ST-12), replyCount is
the number of visible replies (ST-11), and two requests changing the same post can't move a counter twice (CQ-14)."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.models import ForumReply, ForumThread, PostStatus, Report, ReportStatus, User
from tests.community.helpers import API, ids, new_reply, new_thread, notifications_for, thread_row

Client = Callable[..., TestClient]


def test_where_a_deleted_thread_still_shows(
    client_for: Client, student: User, classmate: User, modules: dict[str, Any]
) -> None:
    s, c, guest = client_for(student), client_for(classmate), client_for()
    alone = new_thread(s, title="Gamma question nobody answered", moduleId="advanced-stats-distribution")
    answered = new_thread(s, title="Gamma question with an answer", moduleId="advanced-stats-distribution")
    new_reply(c, answered["id"], "The answer")
    other = new_thread(c, title="Another gamma question", moduleId="advanced-stats-distribution")
    assert s.delete(f"{API}/forum/threads/{alone['id']}").status_code == 204
    assert s.delete(f"{API}/forum/threads/{answered['id']}").status_code == 204
    # without replies: gone from everything
    for path, params in (
        ("/forum/threads", {}),
        ("/forum/threads", {"q": "gamma"}),
        ("/forum/threads", {"module_id": "advanced-stats-distribution"}),
    ):
        assert alone["id"] not in ids(guest.get(f"{API}{path}", params=params).json()["items"])
    assert alone["id"] not in ids(s.get(f"{API}/forum/threads", params={"mine": "true"}).json()["items"])
    assert guest.get(f"{API}/forum/threads/{alone['slug']}").status_code == 404
    # with replies: still listed (title only, so the replies stay reachable), counted, never hot or related
    listed = {x["id"]: x for x in guest.get(f"{API}/forum/threads").json()["items"]}
    assert set(listed) == {answered["id"], other["id"]}
    assert (listed[answered["id"]]["status"], listed[answered["id"]]["excerpt"]) == ("deleted", "")
    # its body is gone from search (every thread here says "I tried integrating directly."); its title isn't
    assert ids(guest.get(f"{API}/forum/threads", params={"q": "integrating"}).json()["items"]) == [other["id"]]
    found = set(ids(guest.get(f"{API}/forum/threads", params={"q": "gamma"}).json()["items"]))
    assert found == {other["id"], answered["id"]}
    assert ids(guest.get(f"{API}/forum/threads/hot").json()) == [other["id"]]
    assert ids(guest.get(f"{API}/forum/threads/{other['id']}/related").json()) == []
    stats = guest.get(f"{API}/forum/stats").json()
    assert (stats["total"], stats["byCategory"]["year-2"], stats["noReplies"]) == (2, 2, 1)


def _visible_replies(db: Session, thread_id: str) -> int:
    n = db.scalar(
        select(func.count())
        .select_from(ForumReply)
        .where(ForumReply.thread_id == uuid.UUID(thread_id), ForumReply.status == PostStatus.visible)
    )
    return n or 0


def test_reply_count_is_the_visible_replies(
    client_for: Client, student: User, classmate: User, moderator: User, db: Session
) -> None:
    s, c, m = client_for(student), client_for(classmate), client_for(moderator)
    t = new_thread(s, title="Counting replies")
    a = new_reply(c, t["id"], "First")
    b = new_reply(s, t["id"], "Second", parentId=a["id"])
    d = new_reply(c, t["id"], "Third")

    def check(expected: int) -> None:
        assert thread_row(db, t["id"]).reply_count == _visible_replies(db, t["id"]) == expected
        for viewer in (client_for(), m):
            detail = viewer.get(f"{API}/forum/threads/{t['slug']}").json()
            assert detail["replyCount"] == expected
            assert len([r for r in detail["replies"] if r["status"] == "visible"]) == expected

    check(3)
    assert c.delete(f"{API}/forum/replies/{a['id']}").status_code == 204
    check(2)
    assert m.post(f"{API}/forum/replies/{d['id']}/moderate", json={"status": "hidden"}).status_code == 200
    check(1)
    assert m.delete(f"{API}/forum/replies/{d['id']}").status_code == 204  # deleted while hidden: still 1
    check(1)
    assert m.post(f"{API}/forum/replies/{d['id']}/moderate", json={"status": "visible"}).status_code == 200
    check(1)  # it came back deleted, not visible
    assert m.post(f"{API}/forum/replies/{b['id']}/moderate", json={"status": "hidden"}).status_code == 200
    assert m.post(f"{API}/forum/replies/{b['id']}/moderate", json={"status": "visible"}).status_code == 200
    check(1)
    assert c.delete(f"{API}/forum/replies/{a['id']}").status_code == 204  # again: nothing moves
    check(1)


def test_a_reply_deleted_by_two_requests_counts_once(
    client_for: Client, student: User, classmate: User, db: Session
) -> None:
    t = new_thread(client_for(student), title="Two deletes at once")
    first = new_reply(client_for(classmate), t["id"], "Deleted twice at once")
    new_reply(client_for(classmate), t["id"], "Stays")
    # another request deletes it and moves the counter, while this session still holds it as visible
    db.execute(
        update(ForumReply)
        .where(ForumReply.id == uuid.UUID(first["id"]))
        .values(status=PostStatus.deleted, body="")
        .execution_options(synchronize_session=False)
    )
    db.execute(
        update(ForumThread)
        .where(ForumThread.id == uuid.UUID(t["id"]))
        .values(reply_count=ForumThread.reply_count - 1)
        .execution_options(synchronize_session=False)
    )
    db.commit()
    db.expire(thread_row(db, t["id"]), ["reply_count"])
    assert client_for(classmate).delete(f"{API}/forum/replies/{first['id']}").status_code == 204
    assert thread_row(db, t["id"]).reply_count == _visible_replies(db, t["id"]) == 1


def test_a_report_closed_by_two_reps_is_told_once(
    client_for: Client, student: User, classmate: User, moderator: User, db: Session
) -> None:
    t = new_thread(client_for(classmate), title="Reported once, closed twice")
    r = client_for(student).post(f"{API}/reports", json={"targetType": "thread", "targetId": t["id"], "reason": "spam"})
    assert r.status_code == 201
    report = db.scalar(select(Report))
    assert report is not None
    # another rep closes it first, while this session still holds it as open
    db.execute(
        update(Report)
        .where(Report.id == report.id)
        .values(status=ReportStatus.dismissed)
        .execution_options(synchronize_session=False)
    )
    db.commit()
    r = client_for(moderator).post(f"{API}/admin/reports/{report.id}/resolve", json={"status": "resolved"})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "report_closed"
    assert [n.kind for n in notifications_for(db, student)] == []
