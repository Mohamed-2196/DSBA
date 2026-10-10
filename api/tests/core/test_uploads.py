"""Completing an upload checks the copy that will be served (security review, findings 6 and SEC-13)."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from typing import Any

import pytest
from botocore.exceptions import ClientError
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Upload, UploadStatus, User
from app.services.storage import Storage
from tests.core.helpers import API, PDF

Clients = Callable[..., TestClient]
SWAPPED = b"{\\rtf1 not a pdf}" + b" " * (len(PDF) - 17)  # same size and declared type, other bytes


def _presign(c: TestClient, storage: Storage) -> dict[str, Any]:
    r = c.post(
        f"{API}/uploads",
        json={"purpose": "library", "fileName": "notes.pdf", "contentType": "application/pdf", "sizeBytes": len(PDF)},
    )
    assert r.status_code == 201, r.text
    body: dict[str, Any] = r.json()
    storage.client.put_object(Bucket=storage.bucket, Key=body["fields"]["key"], Body=PDF, ContentType="application/pdf")
    return body


def _library_keys(storage: Storage) -> set[str]:
    listing = storage.client.list_objects_v2(Bucket=storage.bucket, Prefix="library/")
    return {o["Key"] for o in listing.get("Contents", [])}


def test_a_file_swapped_between_the_check_and_the_copy_is_caught(
    client_for: Clients, storage: Storage, student: User, db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    c = client_for(student)
    body = _presign(c, storage)
    before = _library_keys(storage)
    real_copy = Storage.copy

    def racing_copy(self: Storage, src: str, dst: str, content_type: str, *, if_match: str | None = None) -> None:
        # the uploader re-POSTs to incoming/ right after the HEAD (the store here ignores CopySourceIfMatch)
        self.client.put_object(Bucket=self.bucket, Key=src, Body=SWAPPED, ContentType="application/pdf")
        real_copy(self, src, dst, content_type, if_match=if_match)

    monkeypatch.setattr(Storage, "copy", racing_copy)
    r = c.post(f"{API}/uploads/{body['uploadId']}/complete")
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "mismatch"
    assert _library_keys(storage) == before  # the swapped copy is gone too
    up = db.get(Upload, uuid.UUID(body["uploadId"]), populate_existing=True)
    assert up is not None
    assert up.status == UploadStatus.pending


def test_a_store_that_checks_the_version_refuses_the_copy(
    client_for: Clients, storage: Storage, student: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    c = client_for(student)
    body = _presign(c, storage)
    seen: list[str | None] = []

    def strict_copy(self: Storage, src: str, dst: str, content_type: str, *, if_match: str | None = None) -> None:
        seen.append(if_match)
        raise ClientError({"Error": {"Code": "PreconditionFailed", "Message": "changed"}}, "CopyObject")

    monkeypatch.setattr(Storage, "copy", strict_copy)
    r = c.post(f"{API}/uploads/{body['uploadId']}/complete")
    assert r.status_code == 409
    assert r.json()["error"] == {
        "code": "not_uploaded",
        "message": "The file changed while we checked it. Upload it again.",
    }
    assert seen[0] is not None
    assert seen[0].strip('"')  # the copy was tied to the ETag the HEAD saw
