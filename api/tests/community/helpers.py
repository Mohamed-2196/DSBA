"""Helpers for the forum and reports tests: posting through the API and reaching into the database."""

from __future__ import annotations

import uuid
from datetime import timedelta
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.time import utcnow
from app.models import ForumReply, ForumThread, Notification, Upload, UploadPurpose, UploadStatus, User

API = "/api/v1"


def new_thread(client: TestClient, **fields: Any) -> dict[str, Any]:
    payload = {"title": "How do I find the MGF of a gamma?", "body": "I tried integrating directly.", **fields}
    r = client.post(f"{API}/forum/threads", json=payload)
    assert r.status_code == 201, r.text
    data: dict[str, Any] = r.json()
    return data


def new_reply(client: TestClient, thread_id: str, body: str = "Try the worked example first.", **fields: Any) -> dict:
    r = client.post(f"{API}/forum/threads/{thread_id}/replies", json={"body": body, **fields})
    assert r.status_code == 201, r.text
    data: dict[str, Any] = r.json()
    return data


def thread_row(db: Session, thread_id: str) -> ForumThread:
    t = db.get(ForumThread, uuid.UUID(thread_id))
    assert t is not None
    return t


def reply_row(db: Session, reply_id: str) -> ForumReply:
    r = db.get(ForumReply, uuid.UUID(reply_id))
    assert r is not None
    return r


def backdate(db: Session, thread_id: str, hours: float) -> None:
    """Make a thread `hours` old."""
    t = thread_row(db, thread_id)
    t.created_at = t.last_activity_at = utcnow() - timedelta(hours=hours)
    db.commit()


def notifications_for(db: Session, user: User) -> list[Notification]:
    return list(db.scalars(select(Notification).where(Notification.user_id == user.id).order_by(Notification.id)))


def make_upload(
    db: Session,
    owner: User,
    *,
    status: UploadStatus = UploadStatus.uploaded,
    purpose: UploadPurpose = UploadPurpose.forum_image,
) -> Upload:
    up = Upload(
        user_id=owner.id,
        purpose=purpose,
        storage_key=f"forum/{uuid.uuid4()}/photo.png",
        file_name="photo.png",
        content_type="image/png",
        size_bytes=1234,
        status=status,
    )
    db.add(up)
    db.commit()
    return up


def set_thread(db: Session, thread_id: str, **values: Any) -> ForumThread:
    """Change a thread's row directly (counts, dates, pinned, status...)."""
    t = thread_row(db, thread_id)
    for key, value in values.items():
        setattr(t, key, value)
    db.commit()
    return t


def ids(items: list[dict[str, Any]]) -> list[str]:
    return [x["id"] for x in items]
