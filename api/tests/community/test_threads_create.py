"""POST /forum/threads and GET /forum/threads/{slug}: defaults, validation, slugs, images, rate limit."""

from __future__ import annotations

from collections.abc import Callable
from datetime import timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.time import utcnow
from app.models import ForumThread, ThreadVote, UploadPurpose, UploadStatus, User, UserStatus
from app.services import forum
from tests.community.helpers import API, make_upload, new_thread, thread_row

Client = Callable[..., TestClient]


def test_create_thread(client_for: Client, student: User, modules: dict[str, Any], db: Session) -> None:
    c = client_for(student)
    t = new_thread(
        c,
        title="  How do I find   the MGF of a gamma?  ",
        body="I tried **integrating** directly.",
        moduleId="advanced-stats-distribution",
        tags=["exam-prep", "past-papers", "exam-prep"],
    )
    assert t["slug"] == "how-do-i-find-the-mgf-of-a-gamma"
    assert t["title"] == "How do I find the MGF of a gamma?"
    assert t["category"] == "year-2"  # the module's year
    assert t["year"] == 2
    assert t["tags"] == ["exam-prep", "past-papers"]
    assert t["author"] == {"id": str(student.id), "displayName": "Sara M.", "year": 2, "role": "student"}
    assert t["authorYear"] == 2
    assert t["voteCount"] == 1  # the author upvotes their own thread
    assert t["voted"] is True
    assert t["replyCount"] == 0
    assert t["replies"] == []
    assert t["excerpt"] == "I tried integrating directly."
    assert (t["isMine"], t["canEdit"], t["canAccept"], t["canModerate"]) == (True, True, True, False)
    assert (t["status"], t["pinned"], t["locked"], t["answered"]) == ("visible", False, False, False)
    assert t["lastActivityAt"] == t["createdAt"]
    assert db.scalar(select(func.count()).select_from(ThreadVote)) == 1

    # Anyone can read it, by slug or by id
    guest = client_for()
    r = guest.get(f"{API}/forum/threads/{t['slug']}")
    assert r.status_code == 200
    seen = r.json()
    assert seen["body"] == "I tried **integrating** directly."
    assert (seen["voted"], seen["isMine"], seen["canEdit"], seen["canAccept"]) == (False, False, False, False)
    assert guest.get(f"{API}/forum/threads/{t['id']}").json()["slug"] == t["slug"]
    assert guest.get(f"{API}/forum/threads/nope").status_code == 404


def test_category_defaults_and_follows_the_module(client_for: Client, student: User, modules: dict[str, Any]) -> None:
    c = client_for(student)
    assert new_thread(c, title="Anyone selling a calculator?")["category"] == "general"
    t = new_thread(c, title="Study group for maths", category="study-groups", moduleId="mathematics")
    assert (t["category"], t["year"]) == ("study-groups", 1)
    # A year category that disagrees with the module follows the module
    assert new_thread(c, title="Question on maths", category="year-2", moduleId="mathematics")["category"] == "year-1"
    assert new_thread(c, title="Question on year three", category="year-3")["year"] == 3


def test_slugs_are_unique_and_avoid_reserved_words(client_for: Client, student: User) -> None:
    c = client_for(student)
    assert new_thread(c, title="Exam timetable?")["slug"] == "exam-timetable"
    assert new_thread(c, title="Exam timetable!")["slug"] == "exam-timetable-2"
    assert new_thread(c, title="Exam timetable??")["slug"] == "exam-timetable-3"
    assert new_thread(c, title="New!!")["slug"] == "new-thread"  # /forum/new is the composer
    assert new_thread(c, title="Hot!!")["slug"] == "hot-thread"  # /forum/threads/hot is the hot list
    assert new_thread(c, title="ممكن مساعدة في الإحصاء")["slug"] == "thread"


def test_create_thread_validation(client_for: Client, student: User, modules: dict[str, Any]) -> None:
    c = client_for(student)

    def error(payload: dict[str, Any]) -> dict[str, Any]:
        r = c.post(f"{API}/forum/threads", json=payload)
        assert r.status_code == 422, r.text
        err: dict[str, Any] = r.json()["error"]
        assert err["code"] == "invalid_input"
        return err

    assert "title" in error({"title": "Hey"})["fields"]
    assert "title" in error({"title": "a      b"})["fields"]  # 3 characters once the spaces are collapsed
    assert "title" in error({"title": "?????"})["fields"]
    assert "title" in error({"title": "x" * 161})["fields"]
    assert "tags" in error({"title": "Valid title", "tags": ["not-a-tag"]})["fields"]
    assert "tags" in error({"title": "Valid title", "tags": ["r", "python", "excel", "campus"]})["fields"]
    assert "tags.0" in error({"title": "Valid title", "tags": ["Bad Tag"]})["fields"]
    assert "moduleId" in error({"title": "Valid title", "moduleId": "astrology"})["fields"]
    assert "category" in error({"title": "Valid title", "category": "year-4"})["fields"]
    # core/errors.py drops every "body" part of a location, so the field named body shows as "request" (reported)
    assert {"body", "request"} & set(error({"title": "Valid title", "body": "x" * 20_001})["fields"])
    images = "\n".join(f"![p](/api/v1/media/00000000-0000-4000-8000-{i:012d})" for i in range(21))
    assert "body" in error({"title": "Valid title", "body": images})["fields"]


def test_control_characters_are_dropped(client_for: Client, student: User) -> None:
    t = new_thread(client_for(student), title="Null\x00 byte\ttitle", body="Line one\r\nLine\x00 two\x07")
    assert t["title"] == "Null byte title"
    assert t["body"] == "Line one\nLine two"


def test_only_active_people_with_a_profile_post(
    client_for: Client, make_user: Callable[..., Any], db: Session, student: User
) -> None:
    r = client_for().post(f"{API}/forum/threads", json={"title": "Guest thread"})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "unauthenticated"
    student.status = UserStatus.suspended
    db.commit()
    assert client_for(student).post(f"{API}/forum/threads", json={"title": "Suspended"}).status_code == 403
    nameless = make_user(name=None)
    assert client_for(nameless).post(f"{API}/forum/threads", json={"title": "No profile yet"}).status_code == 403


def test_forum_images_in_the_body_are_attached(client_for: Client, student: User, classmate: User, db: Session) -> None:
    mine = make_upload(db, student)
    theirs = make_upload(db, classmate)
    pending = make_upload(db, student, status=UploadStatus.pending)
    library = make_upload(db, student, purpose=UploadPurpose.library)
    body = "\n\n".join(
        [
            f"![my graph](/api/v1/media/{mine.id})",
            f"![their graph](/api/v1/media/{theirs.id})",
            f"![not uploaded yet](/api/v1/media/{pending.id})",
            f"[a file](/api/v1/media/{library.id})",
        ]
    )
    t = new_thread(client_for(student), title="Is my density plot right?", body=body)
    for up in (mine, theirs, pending, library):
        db.refresh(up)
    assert mine.status == UploadStatus.attached
    assert theirs.status == UploadStatus.uploaded
    assert pending.status == UploadStatus.pending
    assert library.status == UploadStatus.uploaded
    assert t["image"] == {"src": f"/api/v1/media/{mine.id}", "alt": "my graph"}
    assert t["excerpt"] == "a file"


def test_thread_rate_limit(client_for: Client, student: User, db: Session) -> None:
    now = utcnow()
    for i in range(10):
        db.add(
            ForumThread(
                slug=f"spam-{i}",
                title=f"Spam {i}",
                body="",
                category="general",
                author_id=student.id,
                created_at=now - timedelta(minutes=50 - i),
                last_activity_at=now,
            )
        )
    db.add(  # older than an hour: doesn't count
        ForumThread(
            slug="old",
            title="Old one",
            body="",
            category="general",
            author_id=student.id,
            created_at=now - timedelta(hours=2),
            last_activity_at=now,
        )
    )
    db.commit()
    r = client_for(student).post(f"{API}/forum/threads", json={"title": "One more thread"})
    assert r.status_code == 429
    err = r.json()["error"]
    assert err["code"] == "rate_limited"
    assert 0 < err["retryAfter"] <= 11 * 60
    assert r.headers["Retry-After"] == str(err["retryAfter"])


def test_the_rate_limit_is_per_person(client_for: Client, student: User, classmate: User, db: Session) -> None:
    now = utcnow()
    for i in range(10):
        db.add(
            ForumThread(
                slug=f"busy-{i}",
                title=f"Busy {i}",
                body="",
                category="general",
                author_id=classmate.id,
                created_at=now,
                last_activity_at=now,
            )
        )
    db.commit()
    t = new_thread(client_for(student), title="Mine still goes through")
    assert thread_row(db, t["id"]).author_id == student.id


def test_a_slug_taken_in_the_meantime(
    client_for: Client, student: User, db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    first = new_thread(client_for(student), title="Taken slug")
    original = forum._thread_slug

    def racy(db_: Session, title: str, attempt: int) -> str:  # another request took it between check and insert
        return first["slug"] if attempt == 0 else original(db_, title, attempt)

    monkeypatch.setattr(forum, "_thread_slug", racy)
    second = new_thread(client_for(student), title="Taken slug")
    assert second["slug"].startswith("taken-slug-")
    assert second["slug"] != first["slug"]
    assert second["voteCount"] == 1
    assert db.scalar(select(func.count()).select_from(ThreadVote)) == 2
