"""The notebook's uploads: the hourly limit admins set in Manage (60 to start), counted apart from other uploads, and
the numbers Manage shows admins: uploads in the last hour, day and week, students refused at the limit, the top
uploaders by display name, and everyone's note files against the sum of their rooms."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AuditEntry, NotebookLimits, User
from app.models.notes import DEFAULT_UPLOADS_PER_HOUR
from app.services import notes as svc
from app.services import uploads
from tests.core.helpers import PNG, upload

API = "/api/v1"
ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]


def start(c: TestClient, size: int = 1000, purpose: str = "note_file", name: str = "page.png") -> Any:
    kind = "image/png" if name.endswith(".png") else "application/pdf"
    return c.post(f"{API}/uploads", json={"purpose": purpose, "fileName": name, "contentType": kind, "sizeBytes": size})


def set_limit(db: Session, n: int) -> None:
    db.get_one(NotebookLimits, 1).uploads_per_hour = n
    db.commit()


def test_the_limit_starts_at_60_an_hour(client_for: ClientFor, make_user: MakeUser) -> None:
    boss = client_for(make_user(name="Head Admin", roles=("student", "admin")))
    assert DEFAULT_UPLOADS_PER_HOUR == 60
    assert boss.get(f"{API}/admin/notebook").json()["uploadsPerHour"] == 60


def test_note_files_have_their_own_hourly_limit(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    """The admins' limit holds note files; a refusal is counted for Manage. Other uploads keep their own limit and
    don't use up the notebook's."""
    set_limit(db, 3)
    sara = make_user(name="Sara Notes")
    c = client_for(sara)
    for _ in range(3):
        assert start(c).status_code == 201
    r = start(c)
    assert (r.status_code, r.json()["error"]["code"]) == (429, "rate_limited")
    assert "pictures and files to your notes" in r.json()["error"]["message"]
    assert int(r.headers["Retry-After"]) > 0
    assert start(c, purpose="library", name="sheet.pdf").status_code == 201  # the library is not held by the notebook's

    boss = client_for(make_user(name="Head Admin", roles=("student", "admin")))
    numbers = boss.get(f"{API}/admin/notebook").json()
    assert (numbers["uploadsLastHour"], numbers["uploadsLastDay"], numbers["uploadsLastWeek"]) == (3, 3, 3)
    assert (numbers["cappedStudents"], numbers["cappedUploads"]) == (1, 1)
    top = numbers["topByCount"][0]
    assert (top["displayName"], top["uploads"], top["sizeBytes"], top["capped"]) == ("Sara Notes", 3, 3000, 1)

    set_limit(db, 4)  # raised: one more fits at once
    assert start(c).status_code == 201


def test_other_uploads_still_stop_at_their_own_limit(client_for: ClientFor, make_user: MakeUser) -> None:
    c = client_for(make_user())
    for _ in range(uploads.UPLOADS_PER_HOUR):
        assert start(c, purpose="library", name="sheet.pdf").status_code == 201
    assert start(c, purpose="library", name="sheet.pdf").status_code == 429
    assert start(c).status_code == 201  # the notebook's room is apart


def test_admins_see_the_numbers_by_display_name(
    client_for: ClientFor, make_user: MakeUser, storage: Any, db: Session
) -> None:
    sara, ali = make_user(name="Sara Notes"), make_user(name="Ali Notes")
    cs, ca = client_for(sara), client_for(ali)
    picture = upload(cs, storage, purpose="note_file", name="board.png", content_type="image/png", body=PNG)
    note = {"title": "Pictures", "doc": {"type": "doc", "content": [{"type": "image", "attrs": {"upload": picture}}]}}
    assert cs.post(f"{API}/notes", json=note).status_code == 201
    for _ in range(2):
        assert start(ca, size=10).status_code == 201
    assert ca.post(f"{API}/notes", json={"title": "Empty", "doc": {"type": "doc", "content": []}}).status_code == 201

    boss = client_for(make_user(name="Head Admin", roles=("student", "admin")))
    r = boss.get(f"{API}/admin/notebook")
    assert r.status_code == 200, r.text
    n = r.json()
    assert (n["uploadsLastHour"], n["uploadsLastWeek"]) == (3, 3)
    assert [(u["displayName"], u["uploads"]) for u in n["topByCount"]] == [("Ali Notes", 2), ("Sara Notes", 1)]
    assert [(u["displayName"], u["sizeBytes"]) for u in n["topByBytes"]] == [
        ("Sara Notes", len(PNG)),
        ("Ali Notes", 20),
    ]
    assert (n["cappedStudents"], n["cappedUploads"]) == (0, 0)
    assert n["students"] == 2
    assert n["filesBytes"] == len(PNG) + 20  # Ali's two are on their way to a note: they count
    assert (n["filesLimitBytes"], n["budgetBytes"]) == (svc.FILES_LIMIT, 2 * svc.FILES_LIMIT)
    assert sara.email is not None
    assert sara.email not in r.text
    assert set(n["topByCount"][0]) == {"userId", "displayName", "uploads", "sizeBytes", "capped"}

    exported = cs.get(f"{API}/me/export").json()["notebookUploads"]
    assert [(d["uploads"], d["sizeBytes"], d["capped"]) for d in exported] == [(1, len(PNG), 0)]


def test_only_admins_see_and_set_the_limit(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    sara, rep = make_user(), make_user(name="Maryam Rep", roles=("student", "rep"))
    boss = make_user(name="Head Admin", roles=("student", "admin"))
    body = {"uploadsPerHour": 90}
    assert client_for().get(f"{API}/admin/notebook").status_code == 401
    for person in (sara, rep):
        assert client_for(person).get(f"{API}/admin/notebook").status_code == 403
        assert client_for(person).put(f"{API}/admin/notebook", json=body).status_code == 403

    r = client_for(boss).put(f"{API}/admin/notebook", json=body)
    assert r.status_code == 200, r.text
    assert r.json()["uploadsPerHour"] == 90
    assert r.json()["updatedAt"] is not None
    entry = db.scalars(select(AuditEntry).where(AuditEntry.action == "notebook.limits")).one()
    assert entry.data["before"] == {"uploadsPerHour": 60}
    assert entry.data["after"] == {"uploadsPerHour": 90}
    for bad in (0, 1001, "many"):
        r = client_for(boss).put(f"{API}/admin/notebook", json={"uploadsPerHour": bad})
        assert (r.status_code, r.json()["error"]["code"]) == (422, "invalid_input")


def test_the_numbers_follow_the_notes_switch(
    client_for: ClientFor, make_user: MakeUser, set_feature: Callable[..., None]
) -> None:
    """Admins see every feature, so they can set the limit before the notebook is switched on."""
    set_feature("notes", "off")
    assert client_for(make_user(roles=("student", "admin"))).get(f"{API}/admin/notebook").status_code == 200
