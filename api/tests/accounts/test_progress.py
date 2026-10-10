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

ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]


def _at(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _watch(c: TestClient, key: str, watched: bool = True) -> Any:
    return c.put(f"{API}/me/progress/lessons/{key}", json={"watched": watched})


def test_guests_get_401(client: TestClient, module: Module) -> None:
    key = f"{module.id}:0:0"
    assert client.get(f"{API}/me/progress").status_code == 401
    assert _watch(client, key).status_code == 401
    assert (
        client.put(f"{API}/me/progress/resume", json={"moduleId": module.id, "chapter": 0, "video": 0}).status_code
        == 401
    )
    assert client.delete(f"{API}/me/progress/modules/{module.id}").status_code == 401
    assert client.post(f"{API}/me/progress/import", json={"watched": {}, "last": {}}).status_code == 401


def test_mark_lessons_watched(client_for: ClientFor, make_user: MakeUser, module: Module) -> None:
    c = client_for(make_user())
    assert c.get(f"{API}/me/progress").json() == {"watched": {}, "last": {}}
    r = _watch(c, f"{module.id}:0:1")
    assert r.status_code == 200, r.text
    first = r.json()["watched"][f"{module.id}:0:1"]
    again = _watch(c, f"{module.id}:0:1").json()["watched"][f"{module.id}:0:1"]
    assert again == first  # watching it again keeps the first time
    _watch(c, f"{module.id}:1:0")
    assert set(c.get(f"{API}/me/progress").json()["watched"]) == {f"{module.id}:0:1", f"{module.id}:1:0"}
    r = _watch(c, f"{module.id}:0:1", watched=False)
    assert set(r.json()["watched"]) == {f"{module.id}:1:0"}
    assert _watch(c, f"{module.id}:0:1", watched=False).status_code == 200  # already not watched


@pytest.mark.parametrize("key", ["{m}:0:2", "{m}:2:0", "no-such-module:0:0", "{m}:01:0"])
def test_unknown_lessons_are_404(client_for: ClientFor, make_user: MakeUser, module: Module, key: str) -> None:
    c = client_for(make_user())
    r = _watch(c, key.format(m=module.id))
    if key == "{m}:01:0":  # not how keys are written, but it names lesson 1:0: stored as written canonically
        assert r.status_code == 200
        assert f"{module.id}:1:0" in r.json()["watched"]
        return
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "not_found"


@pytest.mark.parametrize("key", ["Bad", "MOD:0:0", "a:b:c", "m:0:0:0", "m:1000:0"])
def test_malformed_keys_are_422(client_for: ClientFor, make_user: MakeUser, key: str) -> None:
    assert _watch(client_for(make_user()), key).status_code == 422


def test_resume(client_for: ClientFor, make_user: MakeUser, module: Module) -> None:
    c = client_for(make_user())
    r = c.put(f"{API}/me/progress/resume", json={"moduleId": module.id, "chapter": 1, "video": 0})
    assert r.status_code == 200, r.text
    last = r.json()["last"][module.id]
    assert (last["chapter"], last["video"]) == (1, 0)
    r = c.put(f"{API}/me/progress/resume", json={"moduleId": module.id, "chapter": 0, "video": 1})
    assert (r.json()["last"][module.id]["chapter"], r.json()["last"][module.id]["video"]) == (0, 1)
    for bad in ({"moduleId": module.id, "chapter": 1, "video": 1}, {"moduleId": "nope", "chapter": 0, "video": 0}):
        assert c.put(f"{API}/me/progress/resume", json=bad).status_code == 404
    r = c.put(f"{API}/me/progress/resume", json={"moduleId": module.id, "chapter": -1, "video": 0})
    assert r.status_code == 404


def test_reset_a_module(client_for: ClientFor, make_user: MakeUser, module: Module, db: Session) -> None:
    other = Module(
        id=f"{module.id}-b",
        name="Other",
        short_name="O",
        year=2,
        description="",
        resources={},
        chapters=[{"title": "x", "videos": [{"kind": "youtube", "id": "z"}]}],
    )
    db.add(other)
    db.commit()
    c = client_for(make_user())
    _watch(c, f"{module.id}:0:0")
    _watch(c, f"{other.id}:0:0")
    c.put(f"{API}/me/progress/resume", json={"moduleId": module.id, "chapter": 0, "video": 0})
    c.put(f"{API}/me/progress/resume", json={"moduleId": other.id, "chapter": 0, "video": 0})
    assert c.delete(f"{API}/me/progress/modules/{module.id}").status_code == 204
    progress = c.get(f"{API}/me/progress").json()
    assert list(progress["watched"]) == [f"{other.id}:0:0"]
    assert list(progress["last"]) == [other.id]
    assert c.delete(f"{API}/me/progress/modules/never-heard-of-it").status_code == 204


def test_progress_is_per_user(client_for: ClientFor, make_user: MakeUser, module: Module) -> None:
    a, b = client_for(make_user()), client_for(make_user())
    _watch(a, f"{module.id}:0:0")
    assert b.get(f"{API}/me/progress").json() == {"watched": {}, "last": {}}


def test_import_merges_and_the_newest_wins(
    client_for: ClientFor, make_user: MakeUser, module: Module, db: Session
) -> None:
    user = make_user()
    now = utcnow()
    old, older, newer = now - timedelta(days=3), now - timedelta(days=5), now - timedelta(days=1)
    db.add_all(
        [
            LessonView(user_id=user.id, lesson_key=f"{module.id}:0:0", module_id=module.id, watched_at=old),
            LessonView(user_id=user.id, lesson_key=f"{module.id}:1:0", module_id=module.id, watched_at=old),
            LessonResume(user_id=user.id, module_id=module.id, chapter=0, video=0, opened_at=old),
        ]
    )
    db.commit()
    body = {
        "watched": {
            f"{module.id}:0:0": newer.isoformat(),  # newer than the account's: wins
            f"{module.id}:1:0": older.isoformat(),  # older: the account's stays
            f"{module.id}:0:1": "2026-01-02T03:04:05",  # no time zone: read as UTC
            f"{module.id}:9:9": newer.isoformat(),  # no such lesson
            "no-such-module:0:0": newer.isoformat(),
            "Not A Key": newer.isoformat(),
        },
        "last": {
            module.id: {"chapter": 1, "video": 0, "at": newer.isoformat()},
            "no-such-module": {"chapter": 0, "video": 0, "at": newer.isoformat()},
        },
    }
    r = client_for(user).post(f"{API}/me/progress/import", json=body)
    assert r.status_code == 200, r.text
    watched = r.json()["watched"]
    assert set(watched) == {f"{module.id}:0:0", f"{module.id}:1:0", f"{module.id}:0:1"}
    assert _at(watched[f"{module.id}:0:0"]) == newer
    assert _at(watched[f"{module.id}:1:0"]) == old
    assert _at(watched[f"{module.id}:0:1"]) == datetime(2026, 1, 2, 3, 4, 5, tzinfo=UTC)
    last = r.json()["last"]
    assert list(last) == [module.id]
    assert (last[module.id]["chapter"], _at(last[module.id]["at"])) == (1, newer)


def test_import_keeps_a_newer_resume_and_ignores_the_future(
    client_for: ClientFor, make_user: MakeUser, module: Module, db: Session
) -> None:
    user = make_user()
    now = utcnow()
    db.add(LessonResume(user_id=user.id, module_id=module.id, chapter=1, video=0, opened_at=now - timedelta(hours=1)))
    db.commit()
    future = (now + timedelta(days=365)).isoformat()
    body = {
        "watched": {f"{module.id}:0:0": future},
        "last": {module.id: {"chapter": 0, "video": 1, "at": (now - timedelta(days=2)).isoformat()}},
    }
    r = client_for(user).post(f"{API}/me/progress/import", json=body)
    assert r.status_code == 200
    assert _at(r.json()["watched"][f"{module.id}:0:0"]) <= utcnow()  # a wrong browser clock can't win forever
    assert r.json()["last"][module.id]["chapter"] == 1


def test_import_is_capped(client_for: ClientFor, make_user: MakeUser, module: Module) -> None:
    c = client_for(make_user())
    at = utcnow().isoformat()
    r = c.post(f"{API}/me/progress/import", json={"watched": {f"m:{i}:0": at for i in range(5001)}, "last": {}})
    assert r.status_code == 422
    last = {f"m{i}": {"chapter": 0, "video": 0, "at": at} for i in range(101)}
    assert c.post(f"{API}/me/progress/import", json={"watched": {}, "last": last}).status_code == 422
