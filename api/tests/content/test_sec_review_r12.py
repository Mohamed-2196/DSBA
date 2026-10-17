"""The round 12 security review's tests for module art, the library's "your files" list and the file reader's
environment. SEC-42's are regression tests: module art is fixed. The others pass while the problem they name is
still there."""

from __future__ import annotations

import os
import subprocess
import sys
import uuid
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Upload, UploadPurpose, UploadStatus, User
from app.services import paper_text
from tests.content.conftest import API

Clients = Callable[..., TestClient]
UploadFile = Callable[..., dict[str, Any]]
Share = Callable[..., dict[str, Any]]
NEW_MODULE = {"id": "data-ethics", "unitCode": "is3001", "name": "Data ethics", "shortName": "Ethics", "year": 3}


@pytest.fixture
def editor(make_user: Callable[..., User]) -> User:
    return make_user(name="Hana Content", roles=("student", "content-manager"), year=None)


@pytest.mark.parametrize(
    "odd",
    [
        "https://tracker.example/pixel.png?visitor=1",
        "javascript:alert(document.domain)",
        "data:image/svg+xml,<svg/>",
        "//tracker.example/x.png",
    ],
)
def test_sec42_module_art_is_a_picture_of_the_hub_or_an_upload(client_for: Clients, editor: User, odd: str) -> None:
    """Module art follows the picture rules (`PictureSrc`): another host, a data: or javascript: address, or //host
    is refused, so no visitor's browser loads it."""
    c = client_for(editor)
    r = c.post(f"{API}/content/modules", json={**NEW_MODULE, "art": odd})
    assert r.status_code == 422, r.text
    assert "art" in r.json()["error"]["fields"]
    assert all(m["id"] != "data-ethics" for m in client_for().get(f"{API}/modules").json())


def test_sec42_every_upload_purpose_can_be_stored(db: Session, editor: User) -> None:
    """The database's purpose check takes every UploadPurpose (the module_art upload was a 500)."""
    for purpose in UploadPurpose:
        key = f"incoming/{uuid.uuid4()}"
        db.add(
            Upload(
                user_id=editor.id,
                purpose=purpose,
                storage_key=key,
                file_name="x.png",
                content_type="image/png",
                size_bytes=100,
            )
        )
        db.flush()
    db.rollback()


def test_sec42_module_art_uploads_work(client_for: Clients, editor: User) -> None:
    body = {"purpose": "module_art", "fileName": "art.png", "contentType": "image/png", "sizeBytes": 100}
    assert client_for(editor).post(f"{API}/uploads", json=body).status_code == 201


def test_sec42_an_upload_that_was_never_checked_is_refused_as_module_art(
    client_for: Clients, editor: User, upload_file: UploadFile, db: Session
) -> None:
    """Only a module_art upload that passed the checks (uploaded or attached) can be a module's art: a pending one is
    refused, stays pending, and /media never serves it."""
    c = client_for(editor)
    junk = b"<html><script>alert(1)</script></html>"  # not a PNG
    pending = upload_file(c, purpose="module_art", name="art.png", content_type="image/png", body=junk, complete=False)
    art = f"/api/v1/media/{pending['uploadId']}"
    r = c.post(f"{API}/content/modules", json={**NEW_MODULE, "art": art})
    assert r.status_code == 422, r.text
    assert list(r.json()["error"]["fields"]) == ["art"]
    db.expire_all()
    up = db.get(Upload, uuid.UUID(pending["uploadId"]))
    assert up is not None
    assert up.status == UploadStatus.pending
    assert client_for().get(art, follow_redirects=False).status_code == 404


def test_sec19_your_files_still_lists_removed_ones(
    client_for: Clients, make_user: Callable[..., User], share_file: Share
) -> None:
    """Re-check of SEC-19: `mine` with a status lists that status, removed included."""
    student = client_for(make_user(name="Sara Student"))
    item = share_file(student, title="Old notes")
    assert student.delete(f"{API}/library/items/{item['id']}").status_code == 204
    listed = student.get(f"{API}/library/items", params={"mine": True, "status": "removed"}).json()["items"]
    assert [(i["id"], i["status"]) for i in listed] == [(item["id"], "removed")]


@pytest.mark.skipif(sys.platform != "linux", reason="/proc is Linux's; production and CI run Linux")
def test_sec33_the_reader_runs_as_the_worker_so_it_can_read_the_workers_secrets() -> None:
    """Re-check of SEC-33: the reader's own environment is PATH and PYTHONPATH only, but it runs as the same user
    as the text worker, which holds every secret (compose.prod.yaml gives `texts` the API's whole environment). Code
    running in the reader reads them back from /proc/<parent>/environ."""
    assert os.environ.get("DSBA_SECRET_KEY")
    peek = "import os; print(open(f'/proc/{os.getppid()}/environ', 'rb').read().decode(errors='replace'))"
    done = subprocess.run(  # noqa: S603 - this interpreter, a fixed script: what code running in the reader could do
        [sys.executable, "-c", peek],
        capture_output=True,
        timeout=30,
        check=True,
        cwd=paper_text._API_ROOT,
        env=paper_text._child_env(),
        preexec_fn=paper_text._limit_memory,  # as read_file() starts the reader
    )
    seen = done.stdout.decode()
    assert "DSBA_SECRET_KEY" not in paper_text._child_env()
    assert f"DSBA_SECRET_KEY={os.environ['DSBA_SECRET_KEY']}" in seen
    assert "DSBA_DATABASE_URL=" in seen
