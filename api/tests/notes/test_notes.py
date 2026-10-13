"""Notes: private to their writer, saved with a version, searchable, attached to a module or a lesson, switched
off by default, readable but not writable while suspended, limited, and deleted with the account."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Module, Note, User, UserStatus
from app.services import notes as svc

API = "/api/v1"
ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]


def new_note(c: TestClient, **fields: Any) -> dict[str, Any]:
    r = c.post(f"{API}/notes", json={"title": "Moments", "body": "E[X] = $\\int x f(x) dx$", **fields})
    assert r.status_code == 201, r.text
    data: dict[str, Any] = r.json()
    return data


def save(c: TestClient, note: dict[str, Any], **changes: Any) -> Any:
    keys = ("title", "body", "moduleId", "chapter", "video", "version")
    return c.put(f"{API}/notes/{note['id']}", json={k: note[k] for k in keys} | changes)


def test_write_read_save_and_delete(client_for: ClientFor, make_user: MakeUser) -> None:
    c = client_for(make_user())
    note = new_note(c, title="  Week  1 ")
    assert (note["title"], note["version"], note["moduleId"]) == ("Week 1", 1, None)
    assert c.get(f"{API}/notes/{note['id']}").json() == note
    r = save(c, note, body="Updated body")
    assert r.status_code == 200, r.text
    assert (r.json()["body"], r.json()["version"]) == ("Updated body", 2)
    assert save(c, r.json()).json()["version"] == 2  # nothing changed: nothing saved
    assert c.delete(f"{API}/notes/{note['id']}").status_code == 204
    assert c.get(f"{API}/notes/{note['id']}").status_code == 404


def test_a_save_from_an_older_version_is_refused(client_for: ClientFor, make_user: MakeUser) -> None:
    user = make_user()
    tab_one, tab_two = client_for(user), client_for(user)
    note = new_note(tab_one)
    assert save(tab_one, note, body="From the first tab").status_code == 200
    r = save(tab_two, note, body="From the second tab")
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "note_changed"
    theirs = tab_two.get(f"{API}/notes/{note['id']}").json()
    assert theirs["body"] == "From the first tab"
    kept = save(tab_two, theirs, body="From the second tab")  # "keep mine": saved over the newer version
    assert (kept.json()["body"], kept.json()["version"]) == ("From the second tab", 3)


def test_notes_are_private(client_for: ClientFor, make_user: MakeUser) -> None:
    mine = new_note(client_for(make_user(name="Sara Student")))
    for other in (make_user(name="Omar Classmate"), make_user(name="Head Admin", roles=("student", "admin"))):
        c = client_for(other)
        assert c.get(f"{API}/notes/{mine['id']}").status_code == 404
        assert save(c, mine, body="Not yours").status_code == 404
        assert c.delete(f"{API}/notes/{mine['id']}").status_code == 404
        assert c.get(f"{API}/notes").json()["total"] == 0


def test_guests_sign_in_first(client: TestClient) -> None:
    assert client.get(f"{API}/notes").status_code == 401
    assert client.post(f"{API}/notes", json={}).status_code == 401


def test_list_search_and_filter(client_for: ClientFor, make_user: MakeUser, module: Module) -> None:
    c = client_for(make_user())
    first = new_note(c, title="Bayes", body="P(A|B) = P(B|A)P(A)/P(B)")
    second = new_note(c, title="Lecture", body="The 100% sure part: variance", moduleId=module.id)
    lesson = new_note(c, title="Video notes", body="x" * 1000, moduleId=module.id, chapter=0, video=1)
    page = c.get(f"{API}/notes").json()
    assert [n["id"] for n in page["items"]] == [lesson["id"], second["id"], first["id"]]  # last edited first
    assert len(page["items"][0]["excerpt"]) == 240
    assert "body" not in page["items"][0]
    assert save(c, first, body="Bayes again").status_code == 200
    assert c.get(f"{API}/notes").json()["items"][0]["id"] == first["id"]

    def ids(**query: Any) -> list[str]:
        return [n["id"] for n in c.get(f"{API}/notes", params=query).json()["items"]]

    assert ids(q="bayes") == [first["id"]]  # the title, any case
    assert ids(q="VARIANCE") == [second["id"]]  # the body
    assert ids(q="100%") == [second["id"]]  # wildcards are plain characters
    assert ids(q="_") == []
    assert set(ids(module_id=module.id)) == {second["id"], lesson["id"]}
    assert ids(module_id=module.id, chapter=0, video=1) == [lesson["id"]]
    assert ids(limit=1, offset=1) == [lesson["id"]]


@pytest.mark.parametrize(
    ("place", "field"),
    [
        ({"moduleId": "no-such-module"}, "moduleId"),
        ({"chapter": 0, "video": 0}, "moduleId"),
        ({"MODULE": 0, "chapter": 0}, "video"),
        ({"MODULE": 0, "chapter": 1, "video": 1}, "chapter"),
    ],
)
def test_the_module_and_lesson_must_exist(
    client_for: ClientFor, make_user: MakeUser, module: Module, place: dict[str, Any], field: str
) -> None:
    body = {("moduleId" if k == "MODULE" else k): (module.id if k == "MODULE" else v) for k, v in place.items()}
    r = client_for(make_user()).post(f"{API}/notes", json={"title": "Somewhere", **body})
    assert r.status_code == 422, r.text
    assert field in r.json()["error"]["fields"]


def test_sizes_are_capped(client_for: ClientFor, make_user: MakeUser) -> None:
    c = client_for(make_user())
    assert c.post(f"{API}/notes", json={"body": "x" * 100_000}).status_code == 201
    r = c.post(f"{API}/notes", json={"body": "x" * 100_001})
    assert r.status_code == 422
    assert "body" in r.json()["error"]["fields"]
    assert c.post(f"{API}/notes", json={"title": "t" * 201}).status_code == 422


def test_how_many_notes_and_how_fast(
    client_for: ClientFor, make_user: MakeUser, monkeypatch: pytest.MonkeyPatch
) -> None:
    c = client_for(make_user())
    monkeypatch.setattr(svc, "MAX_NOTES", 3)
    for _ in range(3):
        note = new_note(c)
    r = c.post(f"{API}/notes", json={})
    assert (r.status_code, r.json()["error"]["code"]) == (409, "too_many_notes")

    monkeypatch.setattr(svc, "MAX_NOTES", 100)
    monkeypatch.setattr(svc, "CREATES_PER_HOUR", 4)
    new_note(c)
    r = c.post(f"{API}/notes", json={})
    assert (r.status_code, r.json()["error"]["code"]) == (429, "rate_limited")

    monkeypatch.setattr(svc, "SAVES_PER_MINUTE", 2)
    for i in range(2):
        note = save(c, note, body=f"Save {i}").json()
    r = save(c, note, body="One too many")
    assert (r.status_code, r.json()["error"]["code"]) == (429, "rate_limited")
    assert r.headers["Retry-After"]


def test_a_suspended_account_reads_but_does_not_write(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    user = make_user()
    c = client_for(user)
    note = new_note(c)
    user.status = UserStatus.suspended
    db.commit()
    assert c.get(f"{API}/notes").json()["total"] == 1
    assert c.get(f"{API}/notes/{note['id']}").status_code == 200
    assert save(c, note, body="Changed").status_code == 403
    assert c.post(f"{API}/notes", json={}).status_code == 403
    assert c.delete(f"{API}/notes/{note['id']}").status_code == 403


def test_switched_off_by_default_and_off_for_students(
    client_for: ClientFor, make_user: MakeUser, set_feature: Callable[..., None]
) -> None:
    student, boss = make_user(), make_user(name="Head Admin", roles=("student", "admin"))
    assert "notes" in client_for(student).get(f"{API}/me").json()["features"]
    set_feature("notes", "off")
    r = client_for(student).get(f"{API}/notes")
    assert (r.status_code, r.json()["error"]["code"]) == (404, "feature_off")
    assert "notes" not in client_for(student).get(f"{API}/me").json()["features"]
    assert client_for(boss).get(f"{API}/notes").status_code == 200  # admins try it before switching it on


def test_deleting_the_account_deletes_its_notes(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    user = make_user()
    c = client_for(user)
    new_note(c)
    new_note(c)
    keep = new_note(client_for(make_user(name="Omar Classmate")))
    r = c.delete(f"{API}/me")
    assert r.status_code in (200, 204), r.text
    db.expire_all()
    assert db.scalar(select(func.count()).select_from(Note).where(Note.user_id == user.id)) == 0
    assert db.get(Note, keep["id"]) is not None


def test_a_deleted_module_leaves_its_notes(
    client_for: ClientFor, make_user: MakeUser, module: Module, db: Session
) -> None:
    c = client_for(make_user())
    note = new_note(c, moduleId=module.id)
    db.delete(module)
    db.commit()
    assert c.get(f"{API}/notes/{note['id']}").json()["moduleId"] is None
