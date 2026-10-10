"""Helpers for the core tests: forum images, posts and library files made through the API."""

from __future__ import annotations

import uuid
from typing import Any

from fastapi.testclient import TestClient

API = "/api/v1"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\rIHDR" + b"\x00" * 48
PDF = b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< >>\n%%EOF\n"


def upload(c: TestClient, storage: Any, *, purpose: str, name: str, content_type: str, body: bytes) -> str:
    """Presign, 'POST the file to the bucket', complete: -> the upload id."""
    r = c.post(
        f"{API}/uploads",
        json={"purpose": purpose, "fileName": name, "contentType": content_type, "sizeBytes": len(body)},
    )
    assert r.status_code == 201, r.text
    fields = r.json()["fields"]
    storage.client.put_object(Bucket=storage.bucket, Key=fields["key"], Body=body, ContentType=content_type)
    done = c.post(f"{API}/uploads/{r.json()['uploadId']}/complete")
    assert done.status_code == 200, done.text
    upload_id: str = done.json()["uploadId"]
    return upload_id


def image(c: TestClient, storage: Any) -> str:
    """A forum image of the signed-in user: -> its /api/v1/media path."""
    return (
        f"{API}/media/{upload(c, storage, purpose='forum_image', name='graph.png', content_type='image/png', body=PNG)}"
    )


def new_thread(c: TestClient, body: str, title: str = "Is my density plot right?") -> dict[str, Any]:
    r = c.post(f"{API}/forum/threads", json={"title": title, "body": body})
    assert r.status_code == 201, r.text
    data: dict[str, Any] = r.json()
    return data


def new_reply(c: TestClient, thread_id: str, body: str) -> dict[str, Any]:
    r = c.post(f"{API}/forum/threads/{thread_id}/replies", json={"body": body})
    assert r.status_code == 201, r.text
    data: dict[str, Any] = r.json()
    return data


def share_pdf(c: TestClient, storage: Any, title: str = "Week 3 notes") -> dict[str, Any]:
    """A library file shared by the signed-in user (published at once for moderators)."""
    upload_id = upload(c, storage, purpose="library", name="week-3.pdf", content_type="application/pdf", body=PDF)
    r = c.post(f"{API}/library/items", json={"uploadId": upload_id, "title": title, "kind": "notes"})
    assert r.status_code == 201, r.text
    item: dict[str, Any] = r.json()
    return item


def as_uuid(value: str) -> uuid.UUID:
    return uuid.UUID(value.rsplit("/", 1)[-1])
