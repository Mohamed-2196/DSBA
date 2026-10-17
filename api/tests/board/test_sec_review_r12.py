"""The round 12 security review's proofs for Boards. Each test passes while the problem it describes is still there;
when one fails, the problem is fixed and the test goes."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Text, cast, func, select
from sqlalchemy.orm import Session

from app.models import BoardCard, BoardComment, User
from app.services import uploads
from app.services.board import common
from tests.board.conftest import API, add
from tests.core.helpers import PDF, upload

ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]

WIDE = "\U0001f4da"  # one character, four bytes in UTF-8


def put(c: TestClient, storage: Any) -> str:
    return upload(c, storage, purpose="board", name="notes.pdf", content_type="application/pdf", body=PDF)


def test_sec38_boards_hold_hundreds_of_megabytes_of_text_per_account(
    client_for: ClientFor, make_user: MakeUser, db: Session
) -> None:
    c = client_for(make_user())
    card = add(c, title="Plan")
    # Saving a card has no rate limit: more saves than any hourly limit on the boards all go through.
    for i in range(121):
        assert c.patch(f"{API}/board-cards/{card['id']}", json={"description": f"v{i}"}).status_code == 200
    checklist = [{"id": f"item-{i}", "text": WIDE * 200} for i in range(50)]
    big = {"title": WIDE * 200, "description": WIDE * 10_000, "checklist": checklist}
    assert c.patch(f"{API}/board-cards/{card['id']}", json=big).status_code == 200
    for _ in range(common.MAX_COMMENTS):
        r = c.post(f"{API}/board-cards/{card['id']}/comments", json={"body": WIDE * 2000})
        assert r.status_code == 201, r.text

    card_id = uuid.UUID(card["id"])
    on_card = db.scalar(
        select(
            func.octet_length(BoardCard.title)
            + func.octet_length(BoardCard.description)
            + func.octet_length(cast(BoardCard.checklist, Text))
        ).where(BoardCard.id == card_id)
    )
    in_comments = db.scalar(
        select(func.sum(func.octet_length(BoardComment.body))).where(BoardComment.card_id == card_id)
    )
    per_card = int(on_card or 0) + int(in_comments or 0)
    assert per_card > 880_000  # one card: 40 KB of description, 40 KB of checklist, 800 KB of comments
    assert common.MAX_CARDS * per_card > 880_000_000  # about 880 MB of Postgres rows per free account
    # Nothing counts it: the only total the boards keep is the files' bytes.
    assert c.get(f"{API}/boards").json()["usage"]["storageBytes"] == 0


def test_sec39_detaching_a_board_file_gives_its_slot_back_to_the_hourly_upload_limit(
    client_for: ClientFor, make_user: MakeUser, storage: Any
) -> None:
    c = client_for(make_user())
    card = add(c, title="Scratch")
    ids = [put(c, storage) for _ in range(uploads.UPLOADS_PER_HOUR)]
    one_more = {"purpose": "board", "fileName": "a.pdf", "contentType": "application/pdf", "sizeBytes": len(PDF)}
    assert c.post(f"{API}/uploads", json=one_more).status_code == 429  # the limit holds...
    made = len(ids)
    for _ in range(uploads.UPLOADS_PER_HOUR):  # ...until each file is attached and detached: its row is deleted
        up = ids.pop()
        assert c.post(f"{API}/board-cards/{card['id']}/attachments", json={"uploadId": up}).status_code == 201
        assert c.delete(f"{API}/board-cards/{card['id']}/attachments/{up}").status_code == 204
        ids.append(put(c, storage))  # 201 again, inside the same hour
        made += 1
    assert made == 2 * uploads.UPLOADS_PER_HOUR  # and so on, as often as a script likes


def test_sec45_a_reminder_on_a_card_due_in_year_1_crashes_the_request(
    client_for: ClientFor, make_user: MakeUser
) -> None:
    c = client_for(make_user())
    card = add(c, title="Ancient")
    with pytest.raises(OverflowError):  # a 500 for the student: the due date has no range
        c.patch(f"{API}/board-cards/{card['id']}", json={"dueDate": "0001-01-01", "remindBefore": 1440})
