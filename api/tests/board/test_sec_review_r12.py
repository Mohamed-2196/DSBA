"""The round 12 security review's findings for Boards, as regression tests: each asserts the fix (SEC-38, SEC-39, and
the board half of SEC-45)."""

from __future__ import annotations

import uuid
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import cli
from app.core.time import utcnow
from app.models import Upload, User
from app.services import uploads
from app.services.board import boards, common
from tests.board.conftest import API, add
from tests.core.helpers import PDF, upload

ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]

WIDE = "\U0001f4da"  # one character, four bytes in UTF-8


def put(c: TestClient, storage: Any) -> str:
    return upload(c, storage, purpose="board", name="notes.pdf", content_type="application/pdf", body=PDF)


def test_sec38_the_text_on_a_students_cards_has_a_total(
    client_for: ClientFor, make_user: MakeUser, db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Titles, descriptions, checklists and comments count towards one total per student (10 MB). A change that
    would pass it answers 409 board_full and changes nothing; a change that takes text away is always saved."""
    assert common.MAX_TEXT_BYTES == 10 * 1024 * 1024
    monkeypatch.setattr(boards, "MAX_TEXT_BYTES", 60_000)
    student = make_user()
    c = client_for(student)
    card = add(c, title="Plan")
    url = f"{API}/board-cards/{card['id']}"

    assert c.patch(url, json={"description": WIDE * 10_000}).status_code == 200  # 40 KB
    checklist = [{"id": f"item-{i}", "text": WIDE * 200} for i in range(50)]  # 40 KB more
    r = c.patch(url, json={"checklist": checklist})
    assert r.status_code == 409, r.text
    assert r.json()["error"]["code"] == "board_full"
    assert c.get(url).json()["checklist"] == []

    comments = f"{API}/board-cards/{card['id']}/comments"
    assert c.post(comments, json={"body": WIDE * 2000}).status_code == 201  # 8 KB: 48 KB in all
    assert c.post(comments, json={"body": WIDE * 2000}).status_code == 201  # 56 KB
    r = c.post(comments, json={"body": WIDE * 2000})
    assert r.status_code == 409, r.text  # 64 KB would pass the total
    assert len(c.get(url).json()["comments"]) == 2

    r = c.post(f"{API}/board-cards", json={"title": WIDE * 200, "description": WIDE * 2000})
    assert r.status_code == 409, r.text
    assert r.json()["error"]["code"] == "board_full"

    # Over the total (it was lowered): taking text away still saves, adding more doesn't.
    monkeypatch.setattr(boards, "MAX_TEXT_BYTES", 10_000)
    assert boards.text_used(db, student.id) > 10_000
    assert c.patch(url, json={"description": WIDE * 5_000}).status_code == 200
    assert c.patch(url, json={"description": WIDE * 6_000}).status_code == 409
    assert c.patch(url, json={"title": "Mind"}).status_code == 200  # no more text than before: saved
    assert c.patch(url, json={"title": "Mind map"}).status_code == 409


def test_sec39_taking_a_file_off_a_card_keeps_its_place_in_the_hourly_upload_limit(
    client_for: ClientFor, make_user: MakeUser, storage: Any, db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Detaching deletes the object at once and frees its room, but the upload still counts towards the 20 an hour;
    the sweep deletes its row a day after the upload."""
    c = client_for(make_user())
    card = add(c, title="Scratch")
    ids = [put(c, storage) for _ in range(uploads.UPLOADS_PER_HOUR)]
    one_more = {"purpose": "board", "fileName": "a.pdf", "contentType": "application/pdf", "sizeBytes": len(PDF)}
    assert c.post(f"{API}/uploads", json=one_more).status_code == 429

    up = ids[0]
    assert c.post(f"{API}/board-cards/{card['id']}/attachments", json={"uploadId": up}).status_code == 201
    key = db.scalar(select(Upload.storage_key).where(Upload.id == uuid.UUID(up)))
    assert key
    assert c.delete(f"{API}/board-cards/{card['id']}/attachments/{up}").status_code == 204
    assert c.post(f"{API}/uploads", json=one_more).status_code == 429  # its place stays taken

    assert c.get(f"{API}/board-cards/{card['id']}").json()["attachments"] == []
    assert c.get(f"{API}/board-files/{up}").status_code == 404
    assert storage.client.list_objects_v2(Bucket=storage.bucket, Prefix=key).get("KeyCount", 0) == 0  # gone at once
    assert c.post(f"{API}/board-cards/{card['id']}/attachments", json={"uploadId": up}).status_code == 404
    # It no longer takes room: only the other uploads, not attached yet, do.
    assert c.get(f"{API}/boards").json()["usage"]["storageBytes"] == (uploads.UPLOADS_PER_HOUR - 1) * len(PDF)

    # A day after the upload, the sweep deletes the row.
    row = db.get(Upload, uuid.UUID(up))
    assert row is not None
    assert row.card_id is None
    row.created_at = utcnow() - timedelta(days=2)
    db.commit()

    @contextmanager
    def same_session() -> Iterator[Session]:
        yield db

    monkeypatch.setattr(cli, "get_sessionmaker", lambda: same_session)
    cli.sweep()
    db.expire_all()
    assert db.get(Upload, uuid.UUID(up)) is None


@pytest.mark.parametrize("due", ["0001-01-01", "1999-12-31", "2101-01-01", "9999-12-31"])
def test_sec45_a_cards_due_date_is_between_2000_and_2100(client_for: ClientFor, make_user: MakeUser, due: str) -> None:
    c = client_for(make_user())
    card = add(c, title="Ancient")
    url = f"{API}/board-cards/{card['id']}"
    r = c.patch(url, json={"dueDate": due, "remindBefore": 1440})
    assert r.status_code == 422, r.text
    assert r.json()["error"]["fields"]["dueDate"] == "Pick a due date between 2000 and 2100."
    assert c.post(f"{API}/board-cards", json={"title": "Old", "dueDate": due}).status_code == 422
    assert c.patch(url, json={"dueDate": "2100-12-31", "remindBefore": 2880}).status_code == 200
    assert c.patch(url, json={"dueDate": "2000-01-01", "remindBefore": 2880}).status_code == 200
