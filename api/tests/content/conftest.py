"""Fixtures for the content area: people, the module catalogue, and a browser-style upload."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Module, Role, User

API = "/api/v1"
PDF = b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< >>\n%%EOF\n"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\rIHDR" + b"\x00" * 48
DOCX = b"PK\x03\x04" + b"\x00" * 60

Upload = Callable[..., dict[str, Any]]


@pytest.fixture
def modules(db: Session) -> dict[str, Module]:
    from app.seed.loader import load_modules

    load_modules(db)
    db.commit()
    return {m.id: m for m in db.scalars(select(Module))}


@pytest.fixture
def student(make_user: Callable[..., User]) -> User:
    return make_user(name="Sara Student", year=2)


@pytest.fixture
def other(make_user: Callable[..., User]) -> User:
    return make_user(name="Omar Other", year=1)


@pytest.fixture
def moderator(make_user: Callable[..., User]) -> User:
    return make_user(name="Maryam Rep", role=Role.moderator, year=3)


@pytest.fixture
def admin(make_user: Callable[..., User]) -> User:
    return make_user(name="Ali Admin", role=Role.admin, year=None)


def browser_post(storage: Any, fields: dict[str, str], body: bytes, content_type: str | None = None) -> None:
    """What the browser's POST to the bucket does: store `body` under the presigned key."""
    storage.client.put_object(
        Bucket=storage.bucket, Key=fields["key"], Body=body, ContentType=content_type or fields["Content-Type"]
    )


@pytest.fixture
def upload_file(storage: Any) -> Upload:
    """upload_file(client, purpose=, name=, content_type=, body=, complete=True) -> the UploadOut (or the presign)."""

    def _upload(
        client: TestClient,
        *,
        purpose: str = "library",
        name: str = "notes.pdf",
        content_type: str = "application/pdf",
        body: bytes = PDF,
        complete: bool = True,
    ) -> dict[str, Any]:
        r = client.post(
            f"{API}/uploads",
            json={"purpose": purpose, "fileName": name, "contentType": content_type, "sizeBytes": len(body)},
        )
        assert r.status_code == 201, r.text
        presigned: dict[str, Any] = r.json()
        browser_post(storage, presigned["fields"], body)
        if not complete:
            return presigned
        done = client.post(f"{API}/uploads/{presigned['uploadId']}/complete")
        assert done.status_code == 200, done.text
        out: dict[str, Any] = done.json()
        return out

    return _upload


@pytest.fixture
def share_file(upload_file: Upload) -> Callable[..., dict[str, Any]]:
    """share_file(client, title=, kind=, module_id=, name=, body=, ...) -> the new LibraryItem."""

    def _share(
        client: TestClient,
        *,
        title: str = "Chapter 3 notes",
        kind: str = "notes",
        module_id: str | None = None,
        name: str = "chapter-3.pdf",
        content_type: str = "application/pdf",
        body: bytes = PDF,
        **extra: Any,
    ) -> dict[str, Any]:
        up = upload_file(client, name=name, content_type=content_type, body=body)
        r = client.post(
            f"{API}/library/items",
            json={"uploadId": up["uploadId"], "title": title, "kind": kind, "moduleId": module_id, **extra},
        )
        assert r.status_code == 201, r.text
        item: dict[str, Any] = r.json()
        return item

    return _share
