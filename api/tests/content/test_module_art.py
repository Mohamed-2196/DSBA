"""A module's art: a picture of the web app or an image a content editor uploads (purpose module_art). An upload a
module shows is attached, and public while that module is; before that, and once no module shows it, only editors
and its uploader see it, and the daily sweep deletes it."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Module, UploadStatus, User
from app.models import Upload as UploadRow
from app.seed.loader import load_modules
from tests.content.conftest import API, PNG, Upload

Clients = Callable[..., TestClient]


@pytest.fixture
def manager(make_user: Callable[..., User]) -> User:
    return make_user(name="Hana Content", roles=("student", "content-manager"), year=None)


@pytest.fixture
def module(db: Session) -> Module:
    m = Module(id=f"art-mod-{uuid.uuid4().hex[:6]}", name="Test module", short_name="Test", year=1, description="")
    db.add(m)
    db.commit()
    return m


def art_upload(c: TestClient, upload_file: Upload) -> dict[str, Any]:
    return upload_file(c, purpose="module_art", name="logo.png", content_type="image/png", body=PNG)


def edit(c: TestClient, module_id: str, **changes: Any) -> Any:
    loaded = c.get(f"{API}/content/modules/{module_id}").json()
    body = {k: loaded[k] for k in ("unitCode", "name", "shortName", "year", "description", "icon", "art", "hidden")}
    chapters = [
        {
            "id": ch["id"],
            "title": ch["title"],
            "hidden": ch["hidden"],
            "lessons": [{k: v for k, v in item.items() if k != "kind"} for item in ch["lessons"]],
        }
        for ch in loaded["chapters"]
    ]
    return c.put(
        f"{API}/content/modules/{module_id}",
        json={**body, "chapters": chapters, "version": loaded["version"], **changes},
    )


def status_of(db: Session, upload_id: str) -> UploadStatus:
    db.expire_all()
    row = db.get(UploadRow, uuid.UUID(upload_id))
    assert row is not None
    return row.status


def test_the_seeded_modules_come_with_their_art(client_for: Clients, db: Session) -> None:
    load_modules(db)
    db.commit()
    arts = {m["id"]: m["art"] for m in client_for().get(f"{API}/modules").json()}
    assert arts["economics"] == "modules/module-ec1002.png"
    assert all(a and a.startswith("modules/module-") for a in arts.values())


def test_uploaded_art_is_public_once_a_module_shows_it(
    client_for: Clients,
    manager: User,
    make_user: Callable[..., User],
    module: Module,
    upload_file: Upload,
    db: Session,
) -> None:
    c = client_for(manager)
    up = art_upload(c, upload_file)
    media = up["mediaUrl"]
    assert media == f"/api/v1/media/{up['uploadId']}"
    other_editor = client_for(make_user(name="Omar Content", roles=("student", "content-manager")))
    assert client_for().get(media, follow_redirects=False).status_code == 404  # not shown by any module yet
    assert client_for(make_user(name="Sara Student")).get(media, follow_redirects=False).status_code == 404
    assert other_editor.get(media, follow_redirects=False).status_code == 302  # the editor's preview

    r = edit(c, module.id, art=media)
    assert r.status_code == 200, r.text
    assert r.json()["art"] == media
    assert status_of(db, up["uploadId"]) == UploadStatus.attached
    assert client_for().get(media, follow_redirects=False).status_code == 302
    shown = next(m for m in client_for().get(f"{API}/modules").json() if m["id"] == module.id)
    assert shown["art"] == media

    # a hidden module's art is out of sight, except for its editors
    assert edit(c, module.id, hidden=True).status_code == 200
    assert client_for().get(media, follow_redirects=False).status_code == 404
    assert other_editor.get(media, follow_redirects=False).status_code == 302
    assert edit(c, module.id, hidden=False).status_code == 200
    assert client_for().get(media, follow_redirects=False).status_code == 302

    # replaced by a picture of the app: the upload goes back to uploaded, for the sweep, and out of sight
    assert edit(c, module.id, art="modules/module-ec1002.png").status_code == 200
    assert status_of(db, up["uploadId"]) == UploadStatus.uploaded
    assert client_for().get(media, follow_redirects=False).status_code == 404


def test_removing_the_art_or_the_module_lets_the_upload_go(
    client_for: Clients, manager: User, module: Module, upload_file: Upload, db: Session
) -> None:
    c = client_for(manager)
    up = art_upload(c, upload_file)
    assert edit(c, module.id, art=up["mediaUrl"]).status_code == 200
    assert edit(c, module.id, art=None, icon="Sigma").status_code == 200
    assert status_of(db, up["uploadId"]) == UploadStatus.uploaded

    again = art_upload(c, upload_file)
    made = c.post(
        f"{API}/content/modules",
        json={"id": "art-new", "name": "Art module", "shortName": "Art", "year": 2, "art": again["mediaUrl"]},
    )
    assert made.status_code == 201, made.text
    assert status_of(db, again["uploadId"]) == UploadStatus.attached
    version = made.json()["version"]
    assert c.delete(f"{API}/content/modules/art-new", params={"version": version}).status_code == 204
    assert status_of(db, again["uploadId"]) == UploadStatus.uploaded


@pytest.mark.parametrize(
    "art",
    [
        "https://tracker.example.com/logo.png",  # another host would log every reader's address
        "javascript:alert(1)",
        "data:image/svg+xml,<svg/>",
        "//tracker.example/x.png",
        "../secrets.png",
        "/api/v1/media/not-an-id",
    ],
)
def test_art_is_a_picture_of_the_hub_or_an_upload(client_for: Clients, manager: User, module: Module, art: str) -> None:
    r = edit(client_for(manager), module.id, art=art)
    assert r.status_code == 422, r.text
    assert "art" in r.json()["error"]["fields"]


def test_module_art_can_be_uploaded(client_for: Clients, manager: User) -> None:
    body = {"purpose": "module_art", "fileName": "art.png", "contentType": "image/png", "sizeBytes": 100}
    assert client_for(manager).post(f"{API}/uploads", json=body).status_code == 201


def test_art_must_be_a_module_art_upload_that_arrived(
    client_for: Clients,
    manager: User,
    make_user: Callable[..., User],
    module: Module,
    upload_file: Upload,
) -> None:
    c = client_for(manager)
    pending = upload_file(c, purpose="module_art", name="logo.png", content_type="image/png", body=PNG, complete=False)
    r = edit(c, module.id, art=f"/api/v1/media/{pending['uploadId']}")
    assert (r.status_code, list(r.json()["error"]["fields"])) == (422, ["art"])

    poster = client_for(make_user(name="Sara Student"))
    forum = upload_file(poster, purpose="forum_image", name="photo.png", content_type="image/png", body=PNG)
    r = edit(c, module.id, art=forum["mediaUrl"])
    assert (r.status_code, list(r.json()["error"]["fields"])) == (422, ["art"])
    assert edit(c, module.id, art=f"/api/v1/media/{uuid.uuid4()}").status_code == 422


def test_only_content_editors_upload_art(client_for: Clients, make_user: Callable[..., User]) -> None:
    for who in (make_user(name="Sara Student"), make_user(name="Maryam Rep", roles=("student", "rep"))):
        r = client_for(who).post(
            f"{API}/uploads",
            json={"purpose": "module_art", "fileName": "logo.png", "contentType": "image/png", "sizeBytes": len(PNG)},
        )
        assert r.status_code == 403, r.text
