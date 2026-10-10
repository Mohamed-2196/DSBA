from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import timedelta
from typing import Any
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.core.time import utcnow
from app.models import Upload, User, UserStatus
from app.services.storage import safe_file_name
from app.services.uploads import MEDIA_PATH_RE
from tests.content.conftest import API, DOCX, PDF, PNG, browser_post

Clients = Callable[..., TestClient]


def presign(client: TestClient, **body: Any) -> Any:
    payload = {"purpose": "library", "fileName": "notes.pdf", "contentType": "application/pdf", "sizeBytes": 1000}
    payload.update(body)
    return client.post(f"{API}/uploads", json=payload)


def exists(storage: Any, key: str) -> bool:
    return storage.head(key) is not None


# ── POST /uploads ────────────────────────────────────────────────────────────────────────────


def test_presign_pins_type_size_and_a_throwaway_key(client_for: Clients, student: User) -> None:
    r = presign(client_for(student), fileName="Week 3 - Notes (final).pdf", sizeBytes=1234)
    assert r.status_code == 201
    body = r.json()
    assert body["maxBytes"] == 1234
    assert body["expiresIn"] > 0
    fields = body["fields"]
    assert fields["key"] == f"incoming/{body['uploadId']}"  # never the final key (security-design finding 6)
    assert fields["Content-Type"] == "application/pdf"
    assert {"policy", "x-amz-signature"} <= set(fields)


@pytest.mark.parametrize(
    ("purpose", "name", "content_type"),
    [
        ("library", "malware.exe", "application/octet-stream"),
        ("library", "page.html", "text/html"),
        ("library", "notes.pdf", "image/png"),  # the extension must match the type
        ("library", "photo.png", "image/png"),  # images are forum-only
        ("library", "noextension", "application/pdf"),
        ("forum_image", "drawing.svg", "image/svg+xml"),
        ("forum_image", "page.html", "text/html"),
        ("forum_image", "photo.png", "image/jpeg"),
        ("forum_image", "notes.pdf", "application/pdf"),
    ],
)
def test_unsupported_types_are_refused(
    client_for: Clients, student: User, purpose: str, name: str, content_type: str
) -> None:
    r = presign(client_for(student), purpose=purpose, fileName=name, contentType=content_type)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "unsupported_type"


@pytest.mark.parametrize(
    ("purpose", "name", "content_type", "stored"),
    [
        ("library", "a.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", None),
        ("library", "a.doc", "application/msword", None),
        ("library", "a.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", None),
        ("library", "a.xls", "application/vnd.ms-excel", None),
        ("library", "a.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation", None),
        ("library", "a.ppt", "application/vnd.ms-powerpoint", None),
        ("library", "a.ipynb", "application/octet-stream", "application/x-ipynb+json"),
        ("library", "analysis.R", "text/plain", "text/x-r"),
        ("library", "data.csv", "application/vnd.ms-excel", "text/csv"),
        ("forum_image", "a.JPG", "image/jpeg", None),
        ("forum_image", "a.webp", "image/webp", None),
        ("forum_image", "a.gif", "image/gif", None),
    ],
)
def test_allowed_types_are_stored_with_the_allowlist_type(
    client_for: Clients, student: User, purpose: str, name: str, content_type: str, stored: str | None
) -> None:
    r = presign(client_for(student), purpose=purpose, fileName=name, contentType=content_type)
    assert r.status_code == 201, r.text
    assert r.json()["fields"]["Content-Type"] == (stored or content_type)


def test_size_limits(client_for: Clients, student: User) -> None:
    c = client_for(student)
    r = presign(c, sizeBytes=50 * 1024 * 1024 + 1)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "too_large"
    assert presign(c, sizeBytes=50 * 1024 * 1024).status_code == 201
    r = presign(c, purpose="forum_image", fileName="a.png", contentType="image/png", sizeBytes=8 * 1024 * 1024 + 1)
    assert r.json()["error"]["code"] == "too_large"
    assert presign(c, sizeBytes=0).status_code == 422


def test_uploading_needs_an_active_account(client_for: Clients, make_user: Callable[..., User], db: Session) -> None:
    assert presign(client_for()).status_code == 401
    suspended = make_user(name="Sam")
    suspended.status = UserStatus.suspended
    db.commit()
    assert presign(client_for(suspended)).status_code == 403
    no_profile = make_user(name=None)
    assert presign(client_for(no_profile)).status_code == 403


def test_twenty_uploads_per_hour(client_for: Clients, student: User, db: Session) -> None:
    c = client_for(student)
    for _ in range(20):
        assert presign(c).status_code == 201
    r = presign(c)
    assert r.status_code == 429
    assert r.json()["error"]["code"] == "rate_limited"
    assert int(r.headers["Retry-After"]) > 0
    # an hour later the window has moved on
    db.execute(update(Upload).where(Upload.user_id == student.id).values(created_at=utcnow() - timedelta(hours=2)))
    db.commit()
    assert presign(c).status_code == 201


# ── POST /uploads/{id}/complete ──────────────────────────────────────────────────────────────


def test_complete_moves_the_checked_file_to_its_final_key(
    client_for: Clients, student: User, storage: Any, db: Session
) -> None:
    c = client_for(student)
    body = presign(c, fileName="Week 3 - Notes (final).pdf", sizeBytes=len(PDF)).json()
    incoming = body["fields"]["key"]

    r = c.post(f"{API}/uploads/{body['uploadId']}/complete")
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "not_uploaded"

    browser_post(storage, body["fields"], PDF)
    r = c.post(f"{API}/uploads/{body['uploadId']}/complete")
    assert r.status_code == 200, r.text
    out = r.json()
    assert out == {
        "uploadId": body["uploadId"],
        "status": "uploaded",
        "fileName": "Week 3 - Notes (final).pdf",
        "contentType": "application/pdf",
        "sizeBytes": len(PDF),
        "mediaUrl": None,
    }
    up = db.get(Upload, uuid.UUID(body["uploadId"]))
    assert up is not None
    prefix, key_uuid, name = up.storage_key.split("/")
    assert prefix == "library"
    assert uuid.UUID(key_uuid)
    assert name == safe_file_name("Week 3 - Notes (final).pdf")
    assert not exists(storage, incoming)
    info = storage.head(up.storage_key)
    assert info.size == len(PDF)
    assert info.content_type == "application/pdf"

    # a second call returns the stored result and touches nothing (the incoming key is gone anyway)
    browser_post(storage, body["fields"], b"%PDF-1.7 swapped")
    again = c.post(f"{API}/uploads/{body['uploadId']}/complete")
    assert again.status_code == 200
    assert again.json() == out
    assert storage.head(up.storage_key).size == len(PDF)


@pytest.mark.parametrize(
    ("declared_size", "stored_body", "stored_type"),
    [
        (len(PDF), PDF, "text/html"),  # another type than the policy's
        (10, PDF, None),  # bigger than declared
        (len(b"<html><script>alert(1)</script></html>"), b"<html><script>alert(1)</script></html>", None),  # not a PDF
    ],
)
def test_complete_deletes_a_file_that_does_not_match(
    client_for: Clients,
    student: User,
    storage: Any,
    declared_size: int,
    stored_body: bytes,
    stored_type: str | None,
) -> None:
    c = client_for(student)
    body = presign(c, sizeBytes=declared_size).json()
    browser_post(storage, body["fields"], stored_body, stored_type)
    r = c.post(f"{API}/uploads/{body['uploadId']}/complete")
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "mismatch"
    assert not exists(storage, body["fields"]["key"])
    assert c.post(f"{API}/uploads/{body['uploadId']}/complete").json()["error"]["code"] == "not_uploaded"


def test_an_image_that_is_not_an_image_is_refused(client_for: Clients, student: User, storage: Any) -> None:
    c = client_for(student)
    fake = b"GIF89a-but-actually-a-png"
    body = presign(c, purpose="forum_image", fileName="a.png", contentType="image/png", sizeBytes=len(fake)).json()
    browser_post(storage, body["fields"], fake)
    assert c.post(f"{API}/uploads/{body['uploadId']}/complete").json()["error"]["code"] == "mismatch"


def test_only_the_uploader_can_complete(client_for: Clients, student: User, other: User, storage: Any) -> None:
    body = presign(client_for(student), sizeBytes=len(PDF)).json()
    browser_post(storage, body["fields"], PDF)
    r = client_for(other).post(f"{API}/uploads/{body['uploadId']}/complete")
    assert r.status_code == 404
    assert client_for(student).post(f"{API}/uploads/{uuid.uuid4()}/complete").status_code == 404


def test_office_files_are_checked_by_their_signature(
    client_for: Clients, student: User, upload_file: Callable[..., dict[str, Any]]
) -> None:
    out = upload_file(
        client_for(student),
        name="Essay.docx",
        content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        body=DOCX,
    )
    assert out["status"] == "uploaded"


# ── GET /media/{id} ──────────────────────────────────────────────────────────────────────────


def test_forum_images_are_served_inline_from_a_short_lived_link(
    client_for: Clients, student: User, upload_file: Callable[..., dict[str, Any]]
) -> None:
    out = upload_file(client_for(student), purpose="forum_image", name="graph.png", content_type="image/png", body=PNG)
    assert out["mediaUrl"] == f"/api/v1/media/{out['uploadId']}"

    r = client_for().get(out["mediaUrl"], follow_redirects=False)  # public, like the forum
    assert r.status_code == 302
    assert r.headers["cache-control"] == "private, max-age=240"
    location = urlparse(r.headers["location"])
    assert "/forum/" in location.path
    params = parse_qs(location.query)
    assert params["response-content-type"] == ["image/png"]
    assert params["response-content-disposition"][0].startswith("inline;")


def test_media_serves_nothing_but_completed_forum_images(
    client_for: Clients, student: User, upload_file: Callable[..., dict[str, Any]]
) -> None:
    c = client_for(student)
    pending = upload_file(c, purpose="forum_image", name="a.png", content_type="image/png", body=PNG, complete=False)
    library = upload_file(c)  # a library file must never skip review through /media
    for upload_id in (pending["uploadId"], library["uploadId"], str(uuid.uuid4())):
        assert client_for().get(f"{API}/media/{upload_id}", follow_redirects=False).status_code == 404
    assert client_for().get(f"{API}/media/not-a-uuid", follow_redirects=False).status_code == 422


def test_media_paths_are_what_posts_refer_to(
    client_for: Clients, student: User, upload_file: Callable[..., dict[str, Any]]
) -> None:
    out = upload_file(client_for(student), purpose="forum_image", name="a.png", content_type="image/png", body=PNG)
    found = MEDIA_PATH_RE.search(f"![graph]({out['mediaUrl']})")
    assert found is not None
    assert found.group(1) == out["uploadId"]
    assert MEDIA_PATH_RE.search(f"{out['mediaUrl']}/../x") is None
