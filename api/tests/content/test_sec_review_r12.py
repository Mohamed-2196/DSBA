"""The round 12 security review's tests for module art: regression tests, module art is fixed."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Upload, UploadPurpose, UploadStatus, User
from tests.content.conftest import API

Clients = Callable[..., TestClient]
UploadFile = Callable[..., dict[str, Any]]
NEW_MODULE = {"id": "data-ethics", "unitCode": "is3001", "name": "Data ethics", "shortName": "Ethics", "year": 3}


@pytest.fixture
def editor(make_user: Callable[..., User]) -> User:
    return make_user(name="Hana Content", roles=("student", "content-manager"), year=None)


@pytest.mark.parametrize(
    "odd",
    [
        "https://tracker.example/pixel.png?visitor=1",
        "javascript:alert(document.domain)",
        "data:image/svg+xml,<svg/>",
        "//tracker.example/x.png",
    ],
)
def test_sec42_module_art_is_a_picture_of_the_hub_or_an_upload(client_for: Clients, editor: User, odd: str) -> None:
    """Module art follows the picture rules (`PictureSrc`): another host, a data: or javascript: address, or //host
    is refused, so no visitor's browser loads it."""
    c = client_for(editor)
    r = c.post(f"{API}/content/modules", json={**NEW_MODULE, "art": odd})
    assert r.status_code == 422, r.text
    assert "art" in r.json()["error"]["fields"]
    assert all(m["id"] != "data-ethics" for m in client_for().get(f"{API}/modules").json())


def test_sec42_every_upload_purpose_can_be_stored(db: Session, editor: User) -> None:
    """The database's purpose check takes every UploadPurpose (the module_art upload was a 500)."""
    for purpose in UploadPurpose:
        key = f"incoming/{uuid.uuid4()}"
        db.add(
            Upload(
                user_id=editor.id,
                purpose=purpose,
                storage_key=key,
                file_name="x.png",
                content_type="image/png",
                size_bytes=100,
            )
        )
        db.flush()
    db.rollback()


def test_sec42_module_art_uploads_work(client_for: Clients, editor: User) -> None:
    body = {"purpose": "module_art", "fileName": "art.png", "contentType": "image/png", "sizeBytes": 100}
    assert client_for(editor).post(f"{API}/uploads", json=body).status_code == 201


def test_sec42_an_upload_that_was_never_checked_is_refused_as_module_art(
    client_for: Clients, editor: User, upload_file: UploadFile, db: Session
) -> None:
    """Only a module_art upload that passed the checks (uploaded or attached) can be a module's art: a pending one is
    refused, stays pending, and /media never serves it."""
    c = client_for(editor)
    junk = b"<html><script>alert(1)</script></html>"  # not a PNG
    pending = upload_file(c, purpose="module_art", name="art.png", content_type="image/png", body=junk, complete=False)
    art = f"/api/v1/media/{pending['uploadId']}"
    r = c.post(f"{API}/content/modules", json={**NEW_MODULE, "art": art})
    assert r.status_code == 422, r.text
    assert list(r.json()["error"]["fields"]) == ["art"]
    db.expire_all()
    up = db.get(Upload, uuid.UUID(pending["uploadId"]))
    assert up is not None
    assert up.status == UploadStatus.pending
    assert client_for().get(art, follow_redirects=False).status_code == 404
