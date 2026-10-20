"""Security review, round 16: uploads. Each test passing shows the problem is real."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Upload, User
from app.services import uploads as svc
from app.services.storage import Storage
from tests.core.helpers import API, PDF

Clients = Callable[..., TestClient]


def _keys(storage: Storage, prefix: str) -> set[str]:
    listing = storage.client.list_objects_v2(Bucket=storage.bucket, Prefix=prefix)
    return {o["Key"] for o in listing.get("Contents", [])}


def test_sec_r16_parallel_completes_each_copy_the_file_and_only_one_copy_is_ever_tracked(
    client_for: Clients, storage: Storage, student: User, db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """complete_upload() reads the row without a lock, so a second /complete that arrives while the first one copies
    sees it still pending and makes a second final object. Only the last one is recorded; the other is in no row, so
    neither the sweep nor account deletion ever removes it, and no quota counts it (8 parallel calls made 8 objects on
    the local MinIO)."""
    c = client_for(student)
    r = c.post(
        f"{API}/uploads",
        json={"purpose": "library", "fileName": "notes.pdf", "contentType": "application/pdf", "sizeBytes": len(PDF)},
    )
    assert r.status_code == 201, r.text
    body: dict[str, Any] = r.json()
    storage.client.put_object(Bucket=storage.bucket, Key=body["fields"]["key"], Body=PDF, ContentType="application/pdf")
    before = _keys(storage, "library/")

    real_copy = Storage.copy
    raced = {"done": False}

    def copy_while_another_request_completes(self: Storage, src: str, dst: str, content_type: str, **kw: Any) -> None:
        real_copy(self, src, dst, content_type, **kw)
        if not raced["done"]:  # the parallel request arrives now, before this one deletes incoming/ and commits
            raced["done"] = True
            svc.complete_upload(db, student, uuid.UUID(body["uploadId"]))

    monkeypatch.setattr(Storage, "copy", copy_while_another_request_completes)
    assert c.post(f"{API}/uploads/{body['uploadId']}/complete").status_code == 200

    made = _keys(storage, "library/") - before
    up = db.get(Upload, uuid.UUID(body["uploadId"]), populate_existing=True)
    assert up is not None
    assert len(made) == 2  # one upload, two stored files
    assert len(made - {up.storage_key}) == 1  # one of them belongs to no row: nothing will ever delete it
