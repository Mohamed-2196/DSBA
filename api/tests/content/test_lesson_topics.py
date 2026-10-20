"""Time stamps in recordings (IDEA-52): students suggest what a lesson's video covers at a time; content managers
accept them (put right if need be), decline them with a reason, or take them off; accepted ones come with the module,
in order; duplicates, playlists, hidden lessons, the limits, the switch, the audit log, export and deletion."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AuditEntry, LessonTopic, Module, Notification, User
from app.services import lesson_topics as svc
from tests.content.conftest import API
from tests.lessons import chapters

Clients = Callable[..., TestClient]


@pytest.fixture(autouse=True)
def stamps_on(set_feature: Callable[..., None]) -> None:
    set_feature("modules.time-stamps", "everyone")


@pytest.fixture
def manager(make_user: Callable[..., User]) -> User:
    return make_user(name="Hana Content", roles=("student", "content-manager"), year=None)


@pytest.fixture
def module(db: Session) -> Module:
    """Chapter One: a class recording, a YouTube video and a playlist; chapter Secret is hidden, with a video."""
    mid = f"topic-mod-{uuid.uuid4().hex[:6]}"
    m = Module(
        id=mid,
        unit_code="ST2134",
        name="Advanced statistics: statistical inference",
        short_name="Inference",
        year=2,
        description="",
        position=100,
        chapters=chapters(
            mid,
            [
                {
                    "title": "One",
                    "videos": [
                        {"kind": "bbb", "url": "https://vc.bibf.com/playback/presentation/2.3/abc-1676264200087"},
                        {"kind": "youtube", "video_id": "aaaaaaaaaaa", "title": "MLE"},
                        {"kind": "youtube-playlist", "video_id": "PLxyz"},
                    ],
                },
                {"title": "Secret", "hidden": True, "videos": [{"kind": "youtube", "video_id": "bbbbbbbbbbb"}]},
            ],
        ),
    )
    db.add(m)
    db.commit()
    return m


def lesson(m: Module, c: int, v: int) -> str:
    return m.chapters[c].lessons[v].id


def suggest(c: TestClient, lesson_id: str, seconds: int, label: str, status: int = 201) -> dict[str, Any]:
    r = c.post(f"{API}/lesson-topics", json={"lessonId": lesson_id, "seconds": seconds, "label": label})
    assert r.status_code == status, r.text
    out: dict[str, Any] = r.json()
    return out


def topics_of(c: TestClient, m: Module, ci: int = 0, vi: int = 0) -> list[tuple[int, str]]:
    detail = c.get(f"{API}/modules/{m.id}").json()
    return [(t["seconds"], t["label"]) for t in detail["chapters"][ci]["videos"][vi]["topics"]]


def test_a_suggestion_waits_then_shows_beside_the_player_in_order(
    client_for: Clients, make_user: Callable[..., User], manager: User, module: Module, db: Session
) -> None:
    hamad = make_user(name="Hamad")
    student = client_for(hamad)
    rec = lesson(module, 0, 0)
    late = suggest(student, rec, 2480, "  Cramér-Rao   bound ")
    early = suggest(student, rec, 760, "Point estimation example")
    assert late["status"] == "pending"
    assert late["label"] == "Cramér-Rao bound"
    assert late["lessonTitle"].startswith("One: class of")
    assert topics_of(client_for(), module) == []  # nothing shows until it's accepted

    mine = student.get(f"{API}/lesson-topics/mine", params={"lessonId": rec}).json()
    assert [t["id"] for t in mine] == [early["id"], late["id"]]

    cm = client_for(manager)
    queue = cm.get(f"{API}/content/lesson-topics").json()
    assert [t["id"] for t in queue["items"]] == [late["id"], early["id"]]  # first come, first reviewed
    stats = client_for(make_user(roles=("student", "rep", "content-manager"))).get(f"{API}/admin/stats")
    assert stats.json()["pendingSuggestions"] == 2

    ok = cm.post(f"{API}/content/lesson-topics/{late['id']}/accept", json={"seconds": 2475})
    assert ok.status_code == 200, ok.text
    assert ok.json()["decidedBy"]["displayName"] == "Hana Content"
    assert (
        cm.post(f"{API}/content/lesson-topics/{early['id']}/accept", json={"label": "Point estimation"}).status_code
        == 200
    )
    assert topics_of(client_for(), module) == [(760, "Point estimation"), (2475, "Cramér-Rao bound")]

    told = db.scalars(select(Notification).where(Notification.user_id == hamad.id)).all()
    assert sorted(n.title for n in told) == [
        "Your time stamp is up: 12:40 Point estimation",
        "Your time stamp is up: 41:15 Cramér-Rao bound",
    ]
    assert any(n.url and n.url.endswith("?t=2475") for n in told)
    actions = db.scalars(select(AuditEntry.action).where(AuditEntry.target_type == "lesson_topic")).all()
    assert sorted(actions) == ["topic.accept", "topic.accept"]


def test_decline_needs_a_reason_and_tells_the_student(
    client_for: Clients, make_user: Callable[..., User], manager: User, module: Module, db: Session
) -> None:
    student_user = make_user()
    t = suggest(client_for(student_user), lesson(module, 0, 1), 65, "Wrong bit")
    cm = client_for(manager)
    assert cm.post(f"{API}/content/lesson-topics/{t['id']}/decline", json={"reply": " "}).status_code == 422
    r = cm.post(f"{API}/content/lesson-topics/{t['id']}/decline", json={"reply": "That's at 2:10, not 1:05."})
    assert r.status_code == 200
    assert r.json()["status"] == "declined"
    again = cm.post(f"{API}/content/lesson-topics/{t['id']}/accept", json={})
    assert again.status_code == 409
    assert again.json()["error"]["code"] == "suggestion_closed"
    note = db.scalars(select(Notification).where(Notification.user_id == student_user.id)).one()
    assert note.body == "That's at 2:10, not 1:05."
    assert topics_of(client_for(), module, 0, 1) == []
    declined = cm.get(f"{API}/content/lesson-topics", params={"status": "declined"}).json()
    assert [d["id"] for d in declined["items"]] == [t["id"]]


def test_only_content_managers_review(client_for: Clients, make_user: Callable[..., User], module: Module) -> None:
    student = client_for(make_user())
    t = suggest(student, lesson(module, 0, 0), 30, "Intro")
    assert student.get(f"{API}/content/lesson-topics").status_code == 403
    assert student.post(f"{API}/content/lesson-topics/{t['id']}/accept", json={}).status_code == 403
    assert (
        client_for(make_user(roles=("student", "rep"))).delete(f"{API}/content/lesson-topics/{t['id']}").status_code
        == 403
    )
    assert client_for().post(
        f"{API}/lesson-topics", json={"lessonId": lesson(module, 0, 0), "seconds": 1, "label": "x"}
    ).status_code in (401, 403)


def test_what_cant_be_suggested(client_for: Clients, make_user: Callable[..., User], module: Module) -> None:
    c = client_for(make_user())
    assert "playlist" in suggest(c, lesson(module, 0, 2), 10, "Part 2", 422)["error"]["fields"]["lessonId"]
    assert suggest(c, lesson(module, 1, 0), 10, "Hidden", 422)["error"]["code"] == "invalid_input"
    assert suggest(c, "zzzzzzzz", 10, "Nowhere", 422)["error"]["code"] == "invalid_input"
    r = c.post(f"{API}/lesson-topics", json={"lessonId": lesson(module, 0, 0), "seconds": 86_400, "label": "Late"})
    assert r.status_code == 422
    r = c.post(f"{API}/lesson-topics", json={"lessonId": lesson(module, 0, 0), "seconds": -1, "label": "Early"})
    assert r.status_code == 422
    r = c.post(f"{API}/lesson-topics", json={"lessonId": lesson(module, 0, 0), "seconds": 5, "label": "x" * 121})
    assert r.status_code == 422


def test_the_same_moment_is_suggested_once(
    client_for: Clients, make_user: Callable[..., User], manager: User, module: Module
) -> None:
    rec = lesson(module, 0, 0)
    first = suggest(client_for(make_user()), rec, 600, "Sufficiency")
    other = client_for(make_user())
    waiting = suggest(other, rec, 605, "Sufficient statistics", 409)
    assert waiting["error"]["code"] == "already_suggested"
    assert "waiting" in waiting["error"]["message"]
    suggest(other, rec, 615, "Factorisation theorem")  # ten seconds on: another moment
    assert client_for(manager).post(f"{API}/content/lesson-topics/{first['id']}/accept", json={}).status_code == 200
    shown = suggest(other, rec, 598, "Sufficiency again", 409)
    assert "already has a time stamp at 10:00" in shown["error"]["message"]


def test_accepting_onto_a_time_already_shown_is_refused(
    client_for: Clients, make_user: Callable[..., User], manager: User, module: Module
) -> None:
    rec = lesson(module, 0, 1)
    a = suggest(client_for(make_user()), rec, 100, "One")
    b = suggest(client_for(make_user()), rec, 200, "Two")
    cm = client_for(manager)
    assert cm.post(f"{API}/content/lesson-topics/{a['id']}/accept", json={}).status_code == 200
    r = cm.post(f"{API}/content/lesson-topics/{b['id']}/accept", json={"seconds": 105})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "already_suggested"


def test_a_video_shows_at_most_max_topics(
    client_for: Clients, make_user: Callable[..., User], manager: User, module: Module, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(svc, "MAX_TOPICS", 1)
    rec = lesson(module, 0, 1)
    c = client_for(make_user())
    a, b = suggest(c, rec, 100, "One"), suggest(c, rec, 300, "Two")
    cm = client_for(manager)
    assert cm.post(f"{API}/content/lesson-topics/{a['id']}/accept", json={}).status_code == 200
    r = cm.post(f"{API}/content/lesson-topics/{b['id']}/accept", json={})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "too_many_topics"


def test_an_accepted_topic_can_be_taken_off(
    client_for: Clients, make_user: Callable[..., User], manager: User, module: Module, db: Session
) -> None:
    t = suggest(client_for(make_user()), lesson(module, 0, 0), 90, "Recap")
    cm = client_for(manager)
    assert cm.delete(f"{API}/content/lesson-topics/{t['id']}").status_code == 409  # still waiting: decline it
    assert cm.post(f"{API}/content/lesson-topics/{t['id']}/accept", json={}).status_code == 200
    assert cm.delete(f"{API}/content/lesson-topics/{t['id']}").status_code == 204
    assert topics_of(client_for(), module) == []
    assert cm.delete(f"{API}/content/lesson-topics/{t['id']}").status_code == 404
    assert db.scalar(select(AuditEntry.action).where(AuditEntry.action == "topic.remove")) == "topic.remove"


def test_suggestions_are_limited_per_day(
    client_for: Clients, make_user: Callable[..., User], module: Module, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(svc, "TOPICS_PER_DAY", 2)
    c = client_for(make_user())
    suggest(c, lesson(module, 0, 0), 10, "One")
    suggest(c, lesson(module, 0, 0), 100, "Two")
    r = suggest(c, lesson(module, 0, 0), 200, "Three", 429)
    assert r["error"]["code"] == "rate_limited"


def test_the_switch(
    client_for: Clients, make_user: Callable[..., User], manager: User, module: Module, set_feature: Any
) -> None:
    c = client_for(make_user())
    t = suggest(c, lesson(module, 0, 0), 10, "Intro")
    assert client_for(manager).post(f"{API}/content/lesson-topics/{t['id']}/accept", json={}).status_code == 200
    set_feature("modules.time-stamps", "off")
    assert topics_of(client_for(), module) == []  # the module reads without them
    assert (
        c.post(f"{API}/lesson-topics", json={"lessonId": lesson(module, 0, 0), "seconds": 50, "label": "x"}).status_code
        == 404
    )


def test_export_and_deletion(
    client_for: Clients, make_user: Callable[..., User], manager: User, module: Module, db: Session
) -> None:
    user = make_user()
    c = client_for(user)
    t = suggest(c, lesson(module, 0, 0), 125, "Bias of the MLE")
    exported = c.get(f"{API}/me/export").json()["lessonTopics"]
    assert [(e["id"], e["seconds"], e["label"], e["status"]) for e in exported] == [
        (t["id"], 125, "Bias of the MLE", "pending")
    ]
    assert client_for(manager).post(f"{API}/content/lesson-topics/{t['id']}/accept", json={}).status_code == 200
    assert c.delete(f"{API}/me").status_code in (200, 204)
    db.expire_all()
    kept = db.get(LessonTopic, t["id"])
    assert kept is not None  # the topic stays on the video, without its author
    assert kept.author_id is None
    assert topics_of(client_for(), module) == [(125, "Bias of the MLE")]
