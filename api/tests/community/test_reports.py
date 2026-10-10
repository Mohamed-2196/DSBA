"""POST /reports, GET /admin/reports and POST /admin/reports/{id}/resolve."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.time import utcnow
from app.models import AuditEntry, ItemSource, ItemStatus, LibraryItem, PostStatus, Report, Role, User, UserStatus
from app.services import forum
from tests.community.helpers import API, new_reply, new_thread, notifications_for, set_thread

Client = Callable[..., TestClient]


def library_item(db: Session, uploader: User, status: ItemStatus = ItemStatus.published) -> LibraryItem:
    item = LibraryItem(
        slug=f"st2133-notes-{uuid.uuid4().hex[:6]}",
        source=ItemSource.file,
        kind="notes",
        title="ST2133 notes",
        description="Chapter **1** to 4",
        storage_key=f"library/{uuid.uuid4()}/notes.pdf",
        file_name="notes.pdf",
        content_type="application/pdf",
        size_bytes=1000,
        uploaded_by=uploader.id,
        status=status,
    )
    db.add(item)
    db.commit()
    return item


def report(client: TestClient, target_type: str, target_id: str, **fields: str) -> int:
    body = {"targetType": target_type, "targetId": target_id, "reason": "spam", **fields}
    return client.post(f"{API}/reports", json=body).status_code


def test_report_flow(client_for: Client, student: User, classmate: User, moderator: User, db: Session) -> None:
    t = new_thread(client_for(classmate), title="Buy essays here")
    c = client_for(student)
    r = c.post(
        f"{API}/reports",
        json={"targetType": "thread", "targetId": t["id"], "reason": "spam", "note": "  Selling essays \x00 "},
    )
    assert r.status_code == 201, r.text
    assert r.json() == {"ok": True}
    r = c.post(f"{API}/reports", json={"targetType": "thread", "targetId": t["id"], "reason": "other"})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "already_reported"

    m = client_for(moderator)
    page = m.get(f"{API}/admin/reports").json()
    assert page["total"] == 1
    [item] = page["items"]
    assert item["targetType"] == "thread"
    assert item["targetId"] == t["id"]
    assert item["targetTitle"] == "Buy essays here"
    assert item["targetUrl"] == f"/forum/{t['slug']}"
    assert item["targetExcerpt"] == "I tried integrating directly."
    assert item["targetStatus"] == "visible"
    assert item["targetAuthor"]["displayName"] == "Ebrahim D."
    assert (item["reason"], item["note"], item["status"]) == ("spam", "Selling essays", "open")
    assert item["reporter"] is None  # student reps don't see who reported (classmates)
    assert item["resolvedBy"] is None

    # the rep hides the thread, then closes the report
    assert m.post(f"{API}/forum/threads/{t['id']}/moderate", json={"status": "hidden"}).status_code == 200
    r = m.post(f"{API}/admin/reports/{item['id']}/resolve", json={"status": "resolved", "note": "Hidden, spam"})
    assert r.status_code == 200, r.text
    closed = r.json()
    assert (closed["status"], closed["resolutionNote"], closed["targetStatus"]) == (
        "resolved",
        "Hidden, spam",
        "hidden",
    )
    assert closed["resolvedBy"]["displayName"] == "Student Rep"
    assert closed["resolvedAt"] is not None
    [n] = notifications_for(db, student)
    assert n.kind == "report_resolved"
    assert n.body == "A student rep looked at the thread “Buy essays here” and took action."
    assert n.url is None  # the thread is hidden now: no link to a 404
    assert n.actor_id == moderator.id
    entry = db.scalar(select(AuditEntry).where(AuditEntry.action == "report.resolve"))
    assert entry is not None
    assert entry.target_id == item["id"]
    assert entry.data["status"] == "resolved"
    assert entry.data["title"] == "Buy essays here"
    r = m.post(f"{API}/admin/reports/{item['id']}/resolve", json={"status": "dismissed"})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "report_closed"
    assert m.get(f"{API}/admin/reports").json()["total"] == 0
    assert m.get(f"{API}/admin/reports", params={"status": "resolved"}).json()["total"] == 1
    # closed reports don't block a new one
    set_thread(db, t["id"], status=PostStatus.visible)
    assert report(c, "thread", t["id"]) == 201


def test_report_replies_and_library_items(
    client_for: Client, student: User, classmate: User, make_user: Callable[..., User], db: Session
) -> None:
    t = new_thread(client_for(student), title="Thread with a rude reply")
    reply = new_reply(client_for(classmate), t["id"], "Rude reply")
    item = library_item(db, classmate)
    c = client_for(student)
    assert report(c, "reply", reply["id"], reason="harassment") == 201
    assert report(c, "library_item", str(item.id), reason="copyright") == 201
    admin = make_user(name="Admin", role=Role.admin)
    page = client_for(admin).get(f"{API}/admin/reports").json()
    by_type = {x["targetType"]: x for x in page["items"]}
    assert by_type["reply"]["targetUrl"] == f"/forum/{t['slug']}#reply-{reply['id']}"
    assert by_type["reply"]["targetTitle"] == "Thread with a rude reply"
    assert by_type["reply"]["targetExcerpt"] == "Rude reply"
    assert by_type["library_item"]["targetUrl"] == f"/library/{item.slug}"
    assert by_type["library_item"]["targetExcerpt"] == "Chapter 1 to 4"
    assert by_type["library_item"]["targetStatus"] == "published"
    assert by_type["reply"]["reporter"]["displayName"] == "Sara M."  # admins see who reported
    # dismissing: the reporter hears, with a link (the reply is still there)
    r = client_for(admin).post(f"{API}/admin/reports/{by_type['reply']['id']}/resolve", json={"status": "dismissed"})
    assert r.status_code == 200
    [n] = [x for x in notifications_for(db, student) if x.kind == "report_resolved"]
    assert n.body == "A student rep looked at a reply in “Thread with a rude reply” and left it up."
    assert n.url == f"/forum/{t['slug']}#reply-{reply['id']}"


def test_what_can_be_reported(client_for: Client, student: User, classmate: User, moderator: User, db: Session) -> None:
    s = client_for(student)
    hidden = new_thread(client_for(classmate), title="Hidden thread")
    set_thread(db, hidden["id"], status=PostStatus.hidden)
    t = new_thread(client_for(classmate), title="Visible thread")
    gone = new_reply(client_for(classmate), t["id"], "Deleted reply")
    assert client_for(classmate).delete(f"{API}/forum/replies/{gone['id']}").status_code == 204
    pending = library_item(db, classmate, ItemStatus.pending)
    missing = str(uuid.uuid4())
    assert report(s, "thread", hidden["id"]) == 404
    assert report(client_for(moderator), "thread", hidden["id"]) == 201  # reps can see it
    assert report(s, "reply", gone["id"]) == 404
    assert report(s, "library_item", str(pending.id)) == 404
    for kind in ("thread", "reply", "library_item"):
        assert report(s, kind, missing) == 404
    assert report(s, "user", t["id"]) == 422
    assert report(s, "thread", t["id"], reason="boring") == 422
    assert report(s, "thread", t["id"], note="x" * 1001) == 422
    assert report(client_for(), "thread", t["id"]) == 401
    student.status = UserStatus.suspended
    db.commit()
    assert report(client_for(student), "thread", t["id"]) == 403


def test_report_rate_limit(client_for: Client, student: User, db: Session) -> None:
    now = utcnow()
    for i in range(20):
        db.add(
            Report(
                reporter_id=student.id,
                target_type="thread",
                target_id=uuid.uuid4(),
                reason="spam",
                created_at=now - timedelta(minutes=i),
            )
        )
    db.commit()
    t = new_thread(client_for(student), title="One report too many")
    r = client_for(student).post(f"{API}/reports", json={"targetType": "thread", "targetId": t["id"], "reason": "spam"})
    assert r.status_code == 429
    assert r.json()["error"]["code"] == "rate_limited"


def test_the_queue_is_for_reps(
    client_for: Client, student: User, moderator: User, make_user: Callable[..., User], db: Session
) -> None:
    assert client_for().get(f"{API}/admin/reports").status_code == 401
    assert client_for(student).get(f"{API}/admin/reports").status_code == 403
    missing = f"{API}/admin/reports/{uuid.uuid4()}/resolve"
    assert client_for(student).post(missing, json={"status": "resolved"}).status_code == 403
    assert client_for(moderator).post(missing, json={"status": "resolved"}).status_code == 404
    assert client_for(moderator).get(f"{API}/admin/reports", params={"status": "nope"}).status_code == 422
    # oldest open report first, with paging
    reporters = [make_user(name=f"Reporter {i}") for i in range(3)]
    threads = [new_thread(client_for(student), title=f"Reported thread {i}") for i in range(3)]
    for who, t in zip(reporters, threads, strict=True):
        assert report(client_for(who), "thread", t["id"]) == 201
    page = client_for(moderator).get(f"{API}/admin/reports", params={"limit": 2, "offset": 1}).json()
    assert page["total"] == 3
    assert [x["targetTitle"] for x in page["items"]] == ["Reported thread 1", "Reported thread 2"]
    moderator.status = UserStatus.suspended
    db.commit()
    assert client_for(moderator).get(f"{API}/admin/reports").status_code == 403


def test_two_reports_at_once(
    client_for: Client, student: User, classmate: User, db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    t = new_thread(client_for(classmate), title="Reported twice at once")

    def racing_twin(*_: object, **__: object) -> None:  # the same report lands between our check and our insert
        db.add(Report(reporter_id=student.id, target_type="thread", target_id=uuid.UUID(t["id"]), reason="spam"))
        db.flush()

    monkeypatch.setattr(forum, "check_rate", racing_twin)
    r = client_for(student).post(f"{API}/reports", json={"targetType": "thread", "targetId": t["id"], "reason": "spam"})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "already_reported"
