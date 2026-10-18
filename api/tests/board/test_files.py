"""Files and pictures on cards (the upload flow with purpose 'board'), covers, the storage limit, the sweep, and
comments to self."""

from __future__ import annotations

import threading
import time
import uuid
from collections.abc import Callable, Iterator
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, delete
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from app import cli
from app.core.errors import ApiError
from app.core.time import utcnow
from app.models import Upload, UploadPurpose, UploadStatus, User
from app.schemas.uploads import UploadCreate
from app.services import accounts, uploads
from app.services.board import common, files
from tests.board.conftest import API, add, detail, first_board
from tests.core.helpers import PDF, PNG, upload

ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]


def put(
    c: TestClient, storage: Any, name: str = "notes.pdf", content_type: str = "application/pdf", body: bytes = PDF
) -> str:
    return upload(c, storage, purpose="board", name=name, content_type=content_type, body=body)


def test_files_and_pictures_on_a_card(client_for: ClientFor, make_user: MakeUser, storage: Any) -> None:
    c = client_for(make_user())
    card = add(c, title="Group project")
    pdf = put(c, storage)
    r = c.post(f"{API}/board-cards/{card['id']}/attachments", json={"uploadId": pdf})
    assert r.status_code == 201, r.text
    assert (r.json()["fileName"], r.json()["image"]) == ("notes.pdf", False)
    photo = put(c, storage, "whiteboard.png", "image/png", PNG)
    assert c.post(f"{API}/board-cards/{card['id']}/attachments", json={"uploadId": photo}).status_code == 201
    again = c.post(f"{API}/board-cards/{card['id']}/attachments", json={"uploadId": photo})
    assert again.status_code == 201  # the same file again changes nothing

    got = c.get(f"{API}/board-cards/{card['id']}").json()
    assert [(a["fileName"], a["image"]) for a in got["attachments"]] == [("notes.pdf", False), ("whiteboard.png", True)]
    assert got["coverUrl"] == f"/api/v1/board-files/{photo}"  # the first picture is the cover
    assert got["attachmentCount"] == 2
    assert detail(c, first_board(c))["cards"][0]["coverUrl"] == got["coverUrl"]

    shown = c.get(f"{API}/board-files/{photo}", follow_redirects=False)
    assert shown.status_code == 302
    assert "response-content-disposition=inline" in shown.headers["location"]
    pdf_link = c.get(f"{API}/board-files/{pdf}", follow_redirects=False).headers["location"]
    assert "response-content-disposition=inline" in pdf_link
    saved = c.get(f"{API}/board-files/{pdf}?download=true", follow_redirects=False)
    assert saved.status_code == 302
    assert "response-content-disposition=attachment" in saved.headers["location"]
    other = client_for(make_user(name="Omar Classmate"))
    assert other.get(f"{API}/board-files/{photo}", follow_redirects=False).status_code == 404
    assert other.post(f"{API}/board-cards/{card['id']}/attachments", json={"uploadId": pdf}).status_code == 404
    theirs = add(other, title="Theirs")
    assert other.post(f"{API}/board-cards/{theirs['id']}/attachments", json={"uploadId": pdf}).status_code == 404

    assert c.patch(f"{API}/board-cards/{card['id']}", json={"coverId": pdf}).status_code == 422  # not a picture
    assert c.patch(f"{API}/board-cards/{card['id']}", json={"coverId": None}).json()["coverUrl"] is None
    assert c.patch(f"{API}/board-cards/{card['id']}", json={"coverId": photo}).json()["coverUrl"] is not None

    up = c.get(f"{API}/board-cards/{card['id']}").json()["attachments"][1]
    assert c.delete(f"{API}/board-cards/{card['id']}/attachments/{up['id']}").status_code == 204
    got = c.get(f"{API}/board-cards/{card['id']}").json()
    assert (got["attachmentCount"], got["coverUrl"]) == (1, None)
    assert c.get(f"{API}/board-files/{photo}", follow_redirects=False).status_code == 404


def test_only_board_uploads_attach(client_for: ClientFor, make_user: MakeUser, storage: Any) -> None:
    c = client_for(make_user(name="Head Admin", roles=("student", "admin")))
    card = add(c, title="x")
    forum = upload(c, storage, purpose="library", name="a.pdf", content_type="application/pdf", body=PDF)
    assert c.post(f"{API}/board-cards/{card['id']}/attachments", json={"uploadId": forum}).status_code == 404
    r = c.post(
        f"{API}/uploads",
        json={"purpose": "board", "fileName": "a.pdf", "contentType": "application/pdf", "sizeBytes": 9},
    )
    pending = r.json()["uploadId"]
    r = c.post(f"{API}/board-cards/{card['id']}/attachments", json={"uploadId": pending})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "not_uploaded"
    bad = c.post(
        f"{API}/uploads", json={"purpose": "board", "fileName": "a.svg", "contentType": "image/svg+xml", "sizeBytes": 9}
    )
    assert bad.status_code == 422


def test_a_card_holds_at_most_max_attachments(
    client_for: ClientFor, make_user: MakeUser, storage: Any, monkeypatch: Any
) -> None:
    monkeypatch.setattr(files, "MAX_ATTACHMENTS", 1)
    c = client_for(make_user())
    card = add(c, title="x")
    assert c.post(f"{API}/board-cards/{card['id']}/attachments", json={"uploadId": put(c, storage)}).status_code == 201
    r = c.post(f"{API}/board-cards/{card['id']}/attachments", json={"uploadId": put(c, storage)})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "limit_reached"


def test_the_storage_limit(client_for: ClientFor, make_user: MakeUser, storage: Any, monkeypatch: Any) -> None:
    monkeypatch.setattr(files, "MAX_STORAGE_BYTES", len(PDF) + 10)
    c = client_for(make_user())
    card = add(c, title="x")
    c.post(f"{API}/board-cards/{card['id']}/attachments", json={"uploadId": put(c, storage)})
    r = c.post(
        f"{API}/uploads",
        json={"purpose": "board", "fileName": "b.pdf", "contentType": "application/pdf", "sizeBytes": 11},
    )
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "storage_full"
    assert c.get(f"{API}/boards").json()["usage"]["storageBytes"] == len(PDF)


def test_a_deleted_card_leaves_its_files_to_the_sweep(
    client_for: ClientFor, make_user: MakeUser, storage: Any, db: Session, monkeypatch: Any
) -> None:
    c = client_for(make_user())
    card = add(c, title="x")
    pdf = put(c, storage)
    c.post(f"{API}/board-cards/{card['id']}/attachments", json={"uploadId": pdf})
    assert c.delete(f"{API}/board-cards/{card['id']}").status_code == 204
    assert c.get(f"{API}/boards").json()["usage"]["storageBytes"] == 0
    up = db.get(Upload, pdf)
    assert up is not None
    db.refresh(up)
    assert (up.status, up.card_id) == (UploadStatus.attached, None)
    key = up.storage_key
    up.created_at = utcnow() - timedelta(days=2)
    db.commit()

    @contextmanager
    def same_session() -> Iterator[Session]:
        yield db

    monkeypatch.setattr(cli, "get_sessionmaker", lambda: same_session)
    cli.sweep()
    db.expire_all()
    assert db.get(Upload, pdf) is None
    assert storage.head(key) is None


def test_deleting_the_account_deletes_the_files(
    client_for: ClientFor, make_user: MakeUser, storage: Any, db: Session
) -> None:
    user = make_user()
    c = client_for(user)
    card = add(c, title="x")
    pdf = put(c, storage)
    c.post(f"{API}/board-cards/{card['id']}/attachments", json={"uploadId": pdf})
    up = db.get(Upload, pdf)
    assert up is not None
    key = up.storage_key
    accounts.delete_account(db, user, storage)
    db.commit()
    assert storage.head(key) is None


def test_comments_to_self(client_for: ClientFor, make_user: MakeUser, monkeypatch: Any) -> None:
    c = client_for(make_user())
    card = add(c, title="Essay")
    first = c.post(f"{API}/board-cards/{card['id']}/comments", json={"body": "Asked Dr Hassan about the length"})
    assert first.status_code == 201
    c.post(f"{API}/board-cards/{card['id']}/comments", json={"body": "1500 words"})
    got = c.get(f"{API}/board-cards/{card['id']}").json()
    assert [x["body"] for x in got["comments"]] == ["Asked Dr Hassan about the length", "1500 words"]
    assert got["commentCount"] == 2
    assert c.post(f"{API}/board-cards/{card['id']}/comments", json={"body": "  "}).status_code == 422
    other = client_for(make_user(name="Omar Classmate"))
    assert other.post(f"{API}/board-cards/{card['id']}/comments", json={"body": "hi"}).status_code == 404
    assert other.delete(f"{API}/board-cards/{card['id']}/comments/{first.json()['id']}").status_code == 404
    assert c.delete(f"{API}/board-cards/{card['id']}/comments/{first.json()['id']}").status_code == 204
    assert c.get(f"{API}/board-cards/{card['id']}").json()["commentCount"] == 1
    monkeypatch.setattr(files, "MAX_COMMENTS", 1)
    r = c.post(f"{API}/board-cards/{card['id']}/comments", json={"body": "one more"})
    assert r.status_code == 409


def test_limits_are_shared_constants() -> None:
    assert common.MAX_STORAGE_BYTES == 200 * 1024 * 1024


@pytest.fixture
def own_connections(engine: Engine) -> Iterator[sessionmaker[Session]]:
    """Sessions on connections of their own: what they commit is real, so each test cleans up after itself."""
    separate = create_engine(engine.url.render_as_string(hide_password=False), poolclass=NullPool)
    yield sessionmaker(bind=separate, expire_on_commit=False, autoflush=False)
    separate.dispose()


def test_two_uploads_at_once_cannot_both_fit_in_the_room_left(
    own_connections: sessionmaker[Session], storage: Any
) -> None:
    """The room left on a student's boards is counted under their upload lock: the second of two parallel requests
    waits for the first, then counts its file. 160 MB used, two 30 MB files, room for one."""
    mb = 1024 * 1024
    with own_connections() as s:
        user = User(email=f"race-{uuid.uuid4().hex[:8]}@example.com", display_name="Race Student", year=2)
        s.add(user)
        s.flush()
        s.add_all(
            Upload(
                user_id=user.id,
                purpose=UploadPurpose.board,
                storage_key=f"board/{uuid.uuid4()}/old.pdf",
                file_name="old.pdf",
                content_type="application/pdf",
                size_bytes=80 * mb,
                status=UploadStatus.uploaded,
                created_at=utcnow() - timedelta(hours=2),  # outside the hourly limit's window
            )
            for _ in range(2)
        )
        s.commit()
    body = UploadCreate.model_validate(
        {"purpose": "board", "fileName": "notes.pdf", "contentType": "application/pdf", "sizeBytes": 30 * mb}
    )
    first_in, second_asking = threading.Event(), threading.Event()

    def first() -> str:
        with own_connections() as s:
            uploads.create_upload(s, s.get_one(User, user.id), body, storage)
            first_in.set()
            assert second_asking.wait(10)
            time.sleep(0.3)  # the second request is waiting for the lock now
            s.commit()
        return "ok"

    def second() -> str:
        assert first_in.wait(10)
        with own_connections() as s:
            person = s.get_one(User, user.id)
            second_asking.set()
            try:
                uploads.create_upload(s, person, body, storage)
            except ApiError as e:
                return e.code
            s.commit()
        return "ok"

    try:
        with ThreadPoolExecutor(2) as pool:
            done = [pool.submit(first), pool.submit(second)]
            assert [f.result(timeout=30) for f in done] == ["ok", "storage_full"]
    finally:
        with own_connections() as s:
            s.execute(delete(Upload).where(Upload.user_id == user.id))
            s.execute(delete(User).where(User.id == user.id))
            s.commit()
