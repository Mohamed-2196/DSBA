"""Lesson progress: watched lessons, the lesson to resume, resetting a module, importing a guest's progress."""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.time import utcnow
from app.models import LessonResume, LessonView, Module, User
from tests.accounts.conftest import API
from tests.lessons import chapters, lesson_id

ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]


def _at(value: str) -> datetime:
    return datetime.fromisoformat(value)  # Python 3.11+ reads the trailing "Z"


def _watch(c: TestClient, lesson: str, watched: bool = True) -> Any:
    return c.put(f"{API}/me/progress/lessons/{lesson}", json={"watched": watched})


def _resume(c: TestClient, lesson: str) -> Any:
    return c.put(f"{API}/me/progress/resume", json={"lessonId": lesson})


def test_guests_get_401(client: TestClient, module: Module) -> None:
    lesson = lesson_id(module, 0, 0)
    assert client.get(f"{API}/me/progress").status_code == 401
    assert _watch(client, lesson).status_code == 401
    assert _resume(client, lesson).status_code == 401
    assert client.delete(f"{API}/me/progress/modules/{module.id}").status_code == 401
    assert client.post(f"{API}/me/progress/import", json={"watched": {}, "last": {}}).status_code == 401


def test_nothing_is_kept_until_it_is_turned_on(
    client_for: ClientFor, make_user: MakeUser, module: Module, db: Session
) -> None:
    user = make_user()
    c = client_for(user)
    lesson = lesson_id(module, 0, 0)
    for r in (
        _watch(c, lesson),
        _resume(c, lesson),
        c.post(f"{API}/me/progress/import", json={"watched": {lesson: "2026-10-01T10:00:00Z"}, "last": {}}),
    ):
        assert r.status_code == 409
        assert r.json()["error"]["code"] == "progress_off"
    assert db.query(LessonView).filter_by(user_id=user.id).count() == 0
    assert db.query(LessonResume).filter_by(user_id=user.id).count() == 0
    assert c.patch(f"{API}/me", json={"preferences": {"trackProgress": True}}).status_code == 200
    assert _watch(c, lesson).status_code == 200


def test_mark_lessons_watched(client_for: ClientFor, make_user: MakeUser, module: Module) -> None:
    c = client_for(make_user(tracks=True))
    a, b = lesson_id(module, 0, 1), lesson_id(module, 1, 0)
    assert c.get(f"{API}/me/progress").json() == {"watched": {}, "last": {}}
    r = _watch(c, a)
    assert r.status_code == 200, r.text
    first = r.json()["watched"][a]
    again = _watch(c, a).json()["watched"][a]
    assert again == first  # watching it again keeps the first time
    _watch(c, b)
    assert set(c.get(f"{API}/me/progress").json()["watched"]) == {a, b}
    r = _watch(c, a, watched=False)
    assert set(r.json()["watched"]) == {b}
    assert _watch(c, a, watched=False).status_code == 200  # already not watched


def test_progress_follows_a_lesson_that_moves(
    client_for: ClientFor, make_user: MakeUser, module: Module, db: Session
) -> None:
    """Reordering changes positions only: what students watched stays with the lesson."""
    c = client_for(make_user(tracks=True))
    lesson = lesson_id(module, 0, 1)
    _watch(c, lesson)
    _resume(c, lesson)
    module.chapters[0].lessons[0].position, module.chapters[0].lessons[1].position = 1, 0
    db.commit()
    progress = c.get(f"{API}/me/progress").json()
    assert list(progress["watched"]) == [lesson]
    assert progress["last"][module.id]["lessonId"] == lesson


def test_unknown_and_hidden_lessons_are_404(
    client_for: ClientFor, make_user: MakeUser, module: Module, db: Session
) -> None:
    c = client_for(make_user(tracks=True))
    assert _watch(c, "nosuchlesson").status_code == 404
    module.chapters[1].lessons[0].hidden = True
    db.commit()
    r = _watch(c, lesson_id(module, 1, 0))
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "not_found"


@pytest.mark.parametrize("key", ["Bad", "a:b:c", "UPPER", "x" * 17])
def test_malformed_ids_are_422(client_for: ClientFor, make_user: MakeUser, key: str) -> None:
    assert _watch(client_for(make_user(tracks=True)), key).status_code == 422


def test_resume(client_for: ClientFor, make_user: MakeUser, module: Module) -> None:
    c = client_for(make_user(tracks=True))
    r = _resume(c, lesson_id(module, 1, 0))
    assert r.status_code == 200, r.text
    assert r.json()["last"][module.id]["lessonId"] == lesson_id(module, 1, 0)
    r = _resume(c, lesson_id(module, 0, 1))
    assert r.json()["last"][module.id]["lessonId"] == lesson_id(module, 0, 1)
    assert _resume(c, "nosuchlesson").status_code == 404
    assert _resume(c, "Not-An-Id").status_code == 422


def test_reset_a_module(client_for: ClientFor, make_user: MakeUser, module: Module, db: Session) -> None:
    other_id = f"{module.id}-b"
    other = Module(
        id=other_id,
        name="Other",
        short_name="O",
        year=2,
        description="",
        chapters=chapters(other_id, [{"title": "x", "videos": [{"kind": "youtube", "video_id": "z"}]}]),
    )
    db.add(other)
    db.commit()
    c = client_for(make_user(tracks=True))
    _watch(c, lesson_id(module, 0, 0))
    _watch(c, lesson_id(other, 0, 0))
    _resume(c, lesson_id(module, 0, 0))
    _resume(c, lesson_id(other, 0, 0))
    assert c.delete(f"{API}/me/progress/modules/{module.id}").status_code == 204
    progress = c.get(f"{API}/me/progress").json()
    assert list(progress["watched"]) == [lesson_id(other, 0, 0)]
    assert list(progress["last"]) == [other.id]
    assert c.delete(f"{API}/me/progress/modules/never-heard-of-it").status_code == 204


def test_progress_is_per_user(client_for: ClientFor, make_user: MakeUser, module: Module) -> None:
    a, b = client_for(make_user(tracks=True)), client_for(make_user(tracks=True))
    _watch(a, lesson_id(module, 0, 0))
    assert b.get(f"{API}/me/progress").json() == {"watched": {}, "last": {}}


def test_import_merges_and_the_newest_wins(
    client_for: ClientFor, make_user: MakeUser, module: Module, db: Session
) -> None:
    user = make_user(tracks=True)
    now = utcnow()
    old, older, newer = now - timedelta(days=3), now - timedelta(days=5), now - timedelta(days=1)
    l00, l01, l10 = lesson_id(module, 0, 0), lesson_id(module, 0, 1), lesson_id(module, 1, 0)
    db.add_all(
        [
            LessonView(user_id=user.id, lesson_id=l00, watched_at=old),
            LessonView(user_id=user.id, lesson_id=l10, watched_at=old),
            LessonResume(user_id=user.id, module_id=module.id, lesson_id=l00, opened_at=old),
        ]
    )
    db.commit()
    body = {
        "watched": {
            l00: newer.isoformat(),  # newer than the account's: wins
            l10: older.isoformat(),  # older: the account's stays
            l01: "2026-01-02T03:04:05",  # no time zone: read as UTC
            "nosuchlesson": newer.isoformat(),
            "Not A Key": newer.isoformat(),
        },
        "last": {
            module.id: {"lessonId": l10, "at": newer.isoformat()},
            "no-such-module": {"lessonId": l00, "at": newer.isoformat()},  # not that module's lesson
        },
    }
    r = client_for(user).post(f"{API}/me/progress/import", json=body)
    assert r.status_code == 200, r.text
    watched = r.json()["watched"]
    assert set(watched) == {l00, l10, l01}
    assert _at(watched[l00]["at"]) == newer
    assert _at(watched[l10]["at"]) == old
    assert _at(watched[l01]["at"]) == datetime(2026, 1, 2, 3, 4, 5, tzinfo=UTC)
    assert watched[l01]["moduleId"] == module.id
    last = r.json()["last"]
    assert list(last) == [module.id]
    assert (last[module.id]["lessonId"], _at(last[module.id]["at"])) == (l10, newer)


def test_import_keeps_a_newer_resume_and_ignores_the_future(
    client_for: ClientFor, make_user: MakeUser, module: Module, db: Session
) -> None:
    user = make_user(tracks=True)
    now = utcnow()
    l00, l01, l10 = lesson_id(module, 0, 0), lesson_id(module, 0, 1), lesson_id(module, 1, 0)
    db.add(LessonResume(user_id=user.id, module_id=module.id, lesson_id=l10, opened_at=now - timedelta(hours=1)))
    db.commit()
    future = (now + timedelta(days=365)).isoformat()
    body = {
        "watched": {l00: future},
        "last": {module.id: {"lessonId": l01, "at": (now - timedelta(days=2)).isoformat()}},
    }
    r = client_for(user).post(f"{API}/me/progress/import", json=body)
    assert r.status_code == 200
    assert _at(r.json()["watched"][l00]["at"]) <= utcnow()  # a wrong browser clock can't win forever
    assert r.json()["last"][module.id]["lessonId"] == l10


def test_import_is_capped(client_for: ClientFor, make_user: MakeUser, module: Module) -> None:
    c = client_for(make_user(tracks=True))
    at = utcnow().isoformat()
    r = c.post(f"{API}/me/progress/import", json={"watched": {f"l{i}": at for i in range(5001)}, "last": {}})
    assert r.status_code == 422
    last = {f"m{i}": {"lessonId": "abc", "at": at} for i in range(101)}
    assert c.post(f"{API}/me/progress/import", json={"watched": {}, "last": last}).status_code == 422
