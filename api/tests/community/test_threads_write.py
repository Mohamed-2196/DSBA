"""PATCH and DELETE /forum/threads/{id}: who may, what changes, what stays, images and the audit log."""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AuditEntry, PostStatus, UploadStatus, User, UserStatus
from tests.community.helpers import API, make_upload, new_reply, new_thread, set_thread, thread_row

Client = Callable[..., TestClient]


def audit_actions(db: Session) -> list[str]:
    return list(db.scalars(select(AuditEntry.action).order_by(AuditEntry.id)))


def test_author_edits_a_thread(client_for: Client, student: User, modules: dict[str, Any], db: Session) -> None:
    c = client_for(student)
    t = new_thread(c, title="Original title", body="Original body", tags=["r"])
    r = c.patch(
        f"{API}/forum/threads/{t['id']}",
        json={"title": "  Better   title ", "body": "Better **body**", "tags": ["python", "python"]},
    )
    assert r.status_code == 200, r.text
    edited = r.json()
    assert (edited["title"], edited["body"], edited["tags"]) == ("Better title", "Better **body**", ["python"])
    assert edited["slug"] == t["slug"]  # links keep working
    assert edited["editedAt"] is not None
    assert edited["excerpt"] == "Better body"
    assert audit_actions(db) == []  # editing your own post isn't moderation
    # nothing changed: edited_at stays as it was
    again = c.patch(f"{API}/forum/threads/{t['id']}", json={"title": "Better title"}).json()
    assert datetime.fromisoformat(again["editedAt"]) == datetime.fromisoformat(edited["editedAt"])


def test_category_and_module_stay_consistent(client_for: Client, student: User, modules: dict[str, Any]) -> None:
    c = client_for(student)
    t = new_thread(c, title="Where does this go", moduleId="advanced-stats-distribution")
    assert t["category"] == "year-2"

    def patch(**body: Any) -> dict[str, Any]:
        r = c.patch(f"{API}/forum/threads/{t['id']}", json=body)
        assert r.status_code == 200, r.text
        data: dict[str, Any] = r.json()
        return data

    moved = patch(moduleId="mathematics")  # the module wins: the year category follows it
    assert (moved["category"], moved["moduleId"]) == ("year-1", "mathematics")
    regrouped = patch(category="study-groups")  # not a year: the module stays
    assert (regrouped["category"], regrouped["moduleId"], regrouped["year"]) == ("study-groups", "mathematics", 1)
    other_year = patch(category="year-3")  # a year that disagrees with the module: the module goes
    assert (other_year["category"], other_year["moduleId"]) == ("year-3", None)
    cleared = patch(moduleId="advanced-stats-distribution", category="year-1")  # both: the module wins
    assert (cleared["category"], cleared["moduleId"]) == ("year-2", "advanced-stats-distribution")
    assert patch(moduleId=None)["moduleId"] is None
    r = c.patch(f"{API}/forum/threads/{t['id']}", json={"moduleId": "nope"})
    assert r.status_code == 422
    assert "moduleId" in r.json()["error"]["fields"]
    r = c.patch(f"{API}/forum/threads/{t['id']}", json={"title": "abc"})
    assert r.status_code == 422


def test_who_may_edit(
    client_for: Client, student: User, classmate: User, moderator: User, db: Session, make_user: Callable[..., Any]
) -> None:
    t = new_thread(client_for(student), title="Edit permissions")
    url = f"{API}/forum/threads/{t['id']}"
    assert client_for().patch(url, json={"title": "Guest edit"}).status_code == 401
    r = client_for(classmate).patch(url, json={"title": "Someone else's edit"})
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "forbidden"
    r = client_for(moderator).patch(url, json={"title": "Edited by a rep"})
    assert r.status_code == 200
    assert r.json()["canEdit"] is True
    entry = db.scalar(select(AuditEntry).where(AuditEntry.action == "forum.thread.edit"))
    assert entry is not None
    assert entry.actor_id == moderator.id
    assert entry.data["fields"] == ["title"]
    assert entry.data["actorName"] == "Student Rep"
    assert entry.data["title"] == "Edited by a rep"
    # a suspended rep loses the powers
    suspended_rep = make_user(name="Suspended Rep", role=moderator.role)
    suspended_rep.status = UserStatus.suspended
    db.commit()
    assert client_for(suspended_rep).patch(url, json={"title": "Not allowed now"}).status_code == 403
    assert client_for(suspended_rep).delete(url).status_code == 403
    set_thread(db, t["id"], status=PostStatus.hidden)
    assert client_for(student).patch(url, json={"title": "Edit a hidden thread"}).status_code == 404
    assert client_for(moderator).patch(url, json={"title": "Edit a hidden thread"}).status_code == 200


def test_author_deletes_a_thread(client_for: Client, student: User, db: Session) -> None:
    c = client_for(student)
    t = new_thread(c, title="Delete me", body="Gone soon")
    assert c.delete(f"{API}/forum/threads/{t['id']}").status_code == 204
    row = thread_row(db, t["id"])
    assert row.status == PostStatus.deleted
    assert row.body == ""  # the text really goes (search and excerpts can't find it)
    assert row.title == "Delete me"
    # no replies: it's gone for everyone else
    assert client_for().get(f"{API}/forum/threads/{t['slug']}").status_code == 404
    assert c.delete(f"{API}/forum/threads/{t['id']}").status_code == 204  # idempotent
    assert c.patch(f"{API}/forum/threads/{t['id']}", json={"title": "Back again"}).status_code == 404
    assert audit_actions(db) == []


def test_a_deleted_thread_with_replies_keeps_its_place(
    client_for: Client, student: User, classmate: User, moderator: User, db: Session
) -> None:
    s = client_for(student)
    t = new_thread(s, title="Question with an answer", body="Long question text")
    reply = new_reply(client_for(classmate), t["id"], "The answer")
    set_thread(db, t["id"], pinned=True)
    assert s.delete(f"{API}/forum/threads/{t['id']}").status_code == 204
    seen = client_for().get(f"{API}/forum/threads/{t['slug']}").json()
    assert (seen["status"], seen["title"], seen["body"], seen["excerpt"]) == ("deleted", t["title"], "", "")
    assert seen["pinned"] is False
    assert [r["id"] for r in seen["replies"]] == [reply["id"]]
    assert seen["canEdit"] is False
    assert seen["canAccept"] is False
    r = s.patch(f"{API}/forum/threads/{t['id']}", json={"title": "Edit after delete"})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "post_unavailable"
    # a rep's delete of someone else's thread is audited
    other = new_thread(s, title="Spam thread")
    assert client_for(moderator).delete(f"{API}/forum/threads/{other['id']}").status_code == 204
    assert audit_actions(db) == ["forum.thread.delete"]


def test_who_may_delete(client_for: Client, student: User, classmate: User, db: Session) -> None:
    t = new_thread(client_for(student), title="Not yours to delete")
    url = f"{API}/forum/threads/{t['id']}"
    assert client_for().delete(url).status_code == 401
    r = client_for(classmate).delete(url)
    assert r.status_code == 403
    assert thread_row(db, t["id"]).status == PostStatus.visible
    assert client_for(classmate).delete(f"{API}/forum/threads/00000000-0000-0000-0000-000000000000").status_code == 404
    # a suspended author can still delete their own thread
    student.status = UserStatus.suspended
    db.commit()
    assert client_for(student).delete(url).status_code == 204


def test_images_follow_the_body(client_for: Client, student: User, classmate: User, db: Session) -> None:
    c = client_for(student)
    first, second, shared = make_upload(db, student), make_upload(db, student), make_upload(db, student)
    t = new_thread(c, title="Pictures", body=f"![a](/api/v1/media/{first.id})\n\n![shared](/api/v1/media/{shared.id})")
    new_thread(c, title="Another post with the shared picture", body=f"![shared](/api/v1/media/{shared.id})")
    r = c.patch(f"{API}/forum/threads/{t['id']}", json={"body": f"![b](/api/v1/media/{second.id})"})
    assert r.status_code == 200
    assert r.json()["image"]["src"] == f"/api/v1/media/{second.id}"
    for up in (first, second, shared):
        db.refresh(up)
    assert first.status == UploadStatus.uploaded  # no longer shown anywhere: the daily sweep removes it
    assert second.status == UploadStatus.attached
    assert shared.status == UploadStatus.attached  # still in the other post
    assert c.delete(f"{API}/forum/threads/{t['id']}").status_code == 204
    db.refresh(second)
    assert second.status == UploadStatus.uploaded
