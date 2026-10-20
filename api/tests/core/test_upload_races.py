"""Parallel calls on one upload: each file is copied once, and one upload is one stored object (SEC-49, SEC-58)."""

from __future__ import annotations

import threading
import time
import uuid
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import pytest
from sqlalchemy import Engine, create_engine, delete
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.models import Upload, UploadPurpose, UploadStatus, User
from app.services import uploads as svc
from app.services.storage import Storage
from tests.core.helpers import PDF


@pytest.fixture
def own_connections(engine: Engine) -> Iterator[sessionmaker[Session]]:
    """Sessions on their own connections, so two 'requests' really run at once (the `db` fixture is one
    connection)."""
    separate = create_engine(engine.url.render_as_string(hide_password=False), poolclass=NullPool)
    yield sessionmaker(bind=separate, expire_on_commit=False, autoflush=False)
    separate.dispose()


def _keys(storage: Storage, prefix: str) -> set[str]:
    listing = storage.client.list_objects_v2(Bucket=storage.bucket, Prefix=prefix)
    return {o["Key"] for o in listing.get("Contents", [])}


def test_parallel_completes_copy_the_file_once(
    own_connections: sessionmaker[Session], storage: Storage, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Two /complete calls at once: the second waits for the first's row lock, then returns the stored result. One
    object is made, and the row names it."""
    with own_connections() as s:
        user = User(email=f"race-{uuid.uuid4().hex[:8]}@example.com", display_name="Race Student", year=2)
        s.add(user)
        s.flush()
        up = Upload(
            user_id=user.id,
            purpose=UploadPurpose.library,
            storage_key=f"incoming/{uuid.uuid4()}",
            file_name="notes.pdf",
            content_type="application/pdf",
            size_bytes=len(PDF),
            status=UploadStatus.pending,
        )
        s.add(up)
        s.commit()
        upload_id, user_id, incoming = up.id, user.id, up.storage_key
    storage.client.put_object(Bucket=storage.bucket, Key=incoming, Body=PDF, ContentType="application/pdf")
    before = _keys(storage, "library/")

    copying, second_asking = threading.Event(), threading.Event()
    copies: list[str] = []
    real_copy = Storage.copy

    def slow_copy(self: Storage, src: str, dst: str, content_type: str, **kw: Any) -> None:
        copies.append(dst)
        copying.set()
        assert second_asking.wait(10)
        time.sleep(0.3)  # the second call is waiting for the row lock now
        real_copy(self, src, dst, content_type, **kw)

    monkeypatch.setattr(Storage, "copy", slow_copy)

    def first() -> str:
        with own_connections() as s:
            out = svc.complete_upload(s, s.get_one(User, user_id), upload_id, storage)
            s.commit()
            return out.status

    def second() -> str:
        assert copying.wait(10)
        with own_connections() as s:
            person = s.get_one(User, user_id)
            second_asking.set()
            out = svc.complete_upload(s, person, upload_id, storage)
            s.commit()
            return out.status

    try:
        with ThreadPoolExecutor(2) as pool:
            done = [pool.submit(first), pool.submit(second)]
            assert [f.result(timeout=30) for f in done] == ["uploaded", "uploaded"]
        assert len(copies) == 1
        with own_connections() as s:
            stored = s.get_one(Upload, upload_id)
            assert _keys(storage, "library/") - before == {stored.storage_key}
            assert stored.storage_key.startswith(f"library/{upload_id}/")
    finally:
        with own_connections() as s:
            s.execute(delete(Upload).where(Upload.user_id == user_id))
            s.execute(delete(User).where(User.id == user_id))
            s.commit()
