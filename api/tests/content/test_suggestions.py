"""Suggested videos (IDEA-15): students suggest a video for a chapter; content managers accept it as a lesson or
decline it with a reason; the student is told; the limits, the switch and the audit log."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.time import utcnow
from app.models import AuditEntry, Lesson, Module, Notification, User, VideoSuggestion
from tests.content.conftest import API
from tests.lessons import chapters

Clients = Callable[..., TestClient]
VIDEO = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"


@pytest.fixture(autouse=True)
def suggestions_on(set_feature: Callable[..., None]) -> None:
    set_feature("video_suggestions", "everyone")


@pytest.fixture
def manager(make_user: Callable[..., User]) -> User:
    return make_user(name="Hana Content", roles=("student", "content-manager"), year=None)


@pytest.fixture
def module(db: Session) -> Module:
    """Chapter One has lesson aaaaaaaaaaa; chapter Secret is hidden."""
    mid = f"sugg-mod-{uuid.uuid4().hex[:6]}"
    m = Module(
        id=mid,
        unit_code=None,
        name="Machine learning",
        short_name="ML",
        year=3,
        description="",
        position=100,
        chapters=chapters(
            mid,
            [
                {"title": "One", "videos": [{"kind": "youtube", "video_id": "aaaaaaaaaaa", "title": "Intro"}]},
                {"title": "Secret", "hidden": True},
            ],
        ),
    )
    db.add(m)
    db.commit()
    return m


@pytest.fixture
def empty(db: Session) -> Module:
    """A Year 3 module with no chapters yet."""
    m = Module(id=f"sugg-empty-{uuid.uuid4().hex[:6]}", name="Asset pricing", short_name="AP", year=3)
    db.add(m)
    db.commit()
    return m


def suggest(c: TestClient, module: Module, status: int = 201, **fields: Any) -> dict[str, Any]:
    body = {"moduleId": module.id, "chapterId": module.chapters[0].id if module.chapters else None, "url": VIDEO}
    r = c.post(f"{API}/video-suggestions", json={"title": "Gradient descent, step by step", **body, **fields})
    assert r.status_code == status, r.text
    out: dict[str, Any] = r.json()
    return out


def told(db: Session, user: User) -> list[Notification]:
    q = select(Notification).where(Notification.user_id == user.id, Notification.kind == "video_suggestion")
    return list(db.scalars(q))


def test_suggest_and_see_your_own(client_for: Clients, student: User, other: User, module: Module) -> None:
    made = suggest(client_for(student), module, reason="  Clearer   than the guide  ")
    assert (made["status"], made["chapterTitle"], made["moduleTitle"]) == ("pending", "One", "Machine learning")
    assert (made["kind"], made["url"], made["reason"]) == (
        "youtube",
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "Clearer than the guide",
    )
    assert made["author"]["displayName"] == "Sara Student"
    mine = client_for(student).get(f"{API}/video-suggestions/mine", params={"moduleId": module.id}).json()
    assert [s["id"] for s in mine] == [made["id"]]
    assert client_for(other).get(f"{API}/video-suggestions/mine").json() == []
    assert client_for().get(f"{API}/video-suggestions/mine").status_code == 401


def test_what_a_suggestion_must_be(client_for: Clients, student: User, module: Module, empty: Module) -> None:
    c = client_for(student)
    bad_link = suggest(c, module, 422, url="https://vimeo.com/123456")
    assert "YouTube" in bad_link["error"]["fields"]["url"]
    assert suggest(c, module, 422, url="http://www.youtube.com/watch?v=dQw4w9WgXcQ")["error"]["fields"]["url"]
    assert suggest(c, module, 422, chapterId=module.chapters[1].id)["error"]["fields"]["chapterId"]  # hidden
    assert suggest(c, module, 422, chapterId=empty.id[:16].replace("-", ""))["error"]["fields"]["chapterId"]
    assert suggest(c, module, 422, moduleId="astrology")["error"]["fields"]["moduleId"]
    assert suggest(c, module, 422, title="   ")["error"]["code"] == "invalid_input"
    assert suggest(c, empty, chapterId=None)["chapterId"] is None  # a module with no chapters: the editor picks
    recording = suggest(c, module, url="https://vc.bibf.com/playback/presentation/2.3/abc")
    assert recording["kind"] == "bbb"


def test_a_hidden_module_takes_no_suggestions(client_for: Clients, student: User, module: Module, db: Session) -> None:
    module.hidden = True
    db.commit()
    assert suggest(client_for(student), module, 422)["error"]["fields"]["moduleId"]


def test_no_duplicates(client_for: Clients, student: User, other: User, module: Module) -> None:
    already = suggest(client_for(student), module, 409, url="https://youtu.be/aaaaaaaaaaa")
    assert already["error"]["code"] == "already_a_lesson"
    suggest(client_for(student), module)
    again = suggest(client_for(other), module, 409, url="https://youtu.be/dQw4w9WgXcQ?t=5")
    assert again["error"]["code"] == "already_suggested"


def test_five_a_day(client_for: Clients, student: User, module: Module, db: Session) -> None:
    c = client_for(student)
    for i in range(5):
        suggest(c, module, url=f"https://www.youtube.com/watch?v=video{i}abcde")
    limited = c.post(
        f"{API}/video-suggestions",
        json={"moduleId": module.id, "url": "https://www.youtube.com/watch?v=video9abcde", "title": "One more"},
    )
    assert limited.status_code == 429
    assert limited.json()["error"]["code"] == "rate_limited"
    db.execute(update(VideoSuggestion).values(created_at=utcnow() - timedelta(days=1, minutes=1)))
    db.commit()
    suggest(c, module, url="https://www.youtube.com/watch?v=video9abcde")


def test_only_content_editors_review(client_for: Clients, student: User, moderator: User, module: Module) -> None:
    made = suggest(client_for(student), module)
    for person in (student, moderator):
        c = client_for(person)
        assert c.get(f"{API}/content/video-suggestions").status_code == 403
        assert c.post(f"{API}/content/video-suggestions/{made['id']}/accept", json={}).status_code == 403
        assert c.post(f"{API}/content/video-suggestions/{made['id']}/decline", json={"reply": "No"}).status_code == 403


def test_accept_adds_the_lesson_and_tells_the_student(
    client_for: Clients, student: User, manager: User, module: Module, db: Session
) -> None:
    made = suggest(client_for(student), module)
    c = client_for(manager)
    queue = c.get(f"{API}/content/video-suggestions").json()
    assert (queue["total"], queue["items"][0]["id"]) == (1, made["id"])
    version = c.get(f"{API}/content/modules/{module.id}").json()["version"]
    r = c.post(f"{API}/content/video-suggestions/{made['id']}/accept", json={"title": "Gradient descent"})
    assert r.status_code == 200, r.text
    out = r.json()
    assert (out["status"], out["decidedBy"]["displayName"]) == ("accepted", "Hana Content")
    lesson = db.get(Lesson, out["lessonId"])
    assert lesson is not None
    assert (lesson.chapter_id, lesson.position, lesson.video_id, lesson.title) == (
        module.chapters[0].id,
        1,
        "dQw4w9WgXcQ",
        "Gradient descent",
    )
    edited = c.get(f"{API}/content/modules/{module.id}").json()
    assert edited["version"] == version + 1  # an editor with the old version reloads before saving
    public = client_for().get(f"{API}/modules/{module.id}").json()
    assert [v["videoId"] for v in public["chapters"][0]["videos"]] == ["aaaaaaaaaaa", "dQw4w9WgXcQ"]
    [note] = told(db, student)
    assert note.title == "Your video is now a lesson: Gradient descent"
    assert note.url == f"/modules/{module.id}/lessons/{lesson.id}"
    audit = db.scalar(select(AuditEntry).where(AuditEntry.action == "suggestion.accept"))
    assert audit is not None
    assert audit.data["lessonId"] == lesson.id
    assert audit.data["title"] == "Gradient descent"
    closed = c.post(f"{API}/content/video-suggestions/{made['id']}/decline", json={"reply": "Changed my mind"})
    assert (closed.status_code, closed.json()["error"]["code"]) == (409, "suggestion_closed")
    assert c.get(f"{API}/content/video-suggestions").json()["total"] == 0
    assert c.get(f"{API}/content/video-suggestions", params={"status": "accepted"}).json()["total"] == 1


def test_accept_into_a_new_chapter(
    client_for: Clients, student: User, manager: User, empty: Module, db: Session
) -> None:
    made = suggest(client_for(student), empty, chapterId=None)
    c = client_for(manager)
    no_chapter = c.post(f"{API}/content/video-suggestions/{made['id']}/accept", json={})
    assert no_chapter.status_code == 422
    r = c.post(f"{API}/content/video-suggestions/{made['id']}/accept", json={"newChapter": "Chapter 1: Returns"})
    assert r.status_code == 200, r.text
    assert r.json()["chapterTitle"] == "Chapter 1: Returns"
    db.expire_all()
    m = db.get(Module, empty.id)
    assert m is not None
    assert [(ch.title, [v.id for v in ch.lessons]) for ch in m.chapters] == [
        ("Chapter 1: Returns", [r.json()["lessonId"]])
    ]


def test_accept_refuses_a_video_added_meanwhile(
    client_for: Clients, student: User, manager: User, module: Module, db: Session
) -> None:
    made = suggest(client_for(student), module)
    db.add(
        Lesson(
            id="dupe0001",
            module_id=module.id,
            chapter_id=module.chapters[0].id,
            position=5,
            kind="youtube",
            video_id="dQw4w9WgXcQ",
        )
    )
    db.commit()
    r = client_for(manager).post(f"{API}/content/video-suggestions/{made['id']}/accept", json={})
    assert (r.status_code, r.json()["error"]["code"]) == (409, "already_a_lesson")


def test_decline_needs_a_reason_and_tells_the_student(
    client_for: Clients, student: User, manager: User, module: Module, db: Session
) -> None:
    made = suggest(client_for(student), module)
    c = client_for(manager)
    assert c.post(f"{API}/content/video-suggestions/{made['id']}/decline", json={"reply": ""}).status_code == 422
    r = c.post(f"{API}/content/video-suggestions/{made['id']}/decline", json={"reply": "The audio is too quiet."})
    assert r.status_code == 200, r.text
    assert (r.json()["status"], r.json()["reply"]) == ("declined", "The audio is too quiet.")
    [note] = told(db, student)
    assert (note.title, note.body) == (
        "Video suggestion declined: Gradient descent, step by step",
        "The audio is too quiet.",
    )
    assert db.scalar(select(AuditEntry).where(AuditEntry.action == "suggestion.decline")) is not None
    missing = c.post(f"{API}/content/video-suggestions/{uuid.uuid4()}/decline", json={"reply": "No"})
    assert missing.status_code == 404


def test_no_notice_while_the_feature_is_off_for_the_student(
    client_for: Clients, student: User, manager: User, module: Module, db: Session, set_feature: Callable[..., None]
) -> None:
    made = suggest(client_for(student), module)
    set_feature("video_suggestions", "roles", ["content-manager"])
    r = client_for(manager).post(f"{API}/content/video-suggestions/{made['id']}/decline", json={"reply": "Off topic."})
    assert r.status_code == 200, r.text
    assert told(db, student) == []


def test_the_export_lists_your_suggestions(client_for: Clients, student: User, module: Module) -> None:
    made = suggest(client_for(student), module)
    export = client_for(student).get(f"{API}/me/export").json()
    assert [(s["id"], s["url"]) for s in export["videoSuggestions"]] == [(made["id"], VIDEO)]
