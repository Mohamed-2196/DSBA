"""The round 12 security review's proofs for module art and the file reader's environment. Each test passes while
the problem it names is still there."""

from __future__ import annotations

import os
import subprocess
import sys
import uuid
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Upload, UploadStatus, User
from app.services import paper_text
from tests.content.conftest import API

Clients = Callable[..., TestClient]
UploadFile = Callable[..., dict[str, Any]]
NEW_MODULE = {"id": "data-ethics", "unitCode": "is3001", "name": "Data ethics", "shortName": "Ethics", "year": 3}


@pytest.fixture
def editor(make_user: Callable[..., User]) -> User:
    return make_user(name="Hana Content", roles=("student", "content-manager"), year=None)


def test_sec42_a_modules_art_url_takes_any_address_and_every_visitor_loads_it(
    client_for: Clients, editor: User
) -> None:
    """`artUrl` is a bare string (schemas/modules.py `Link`): another host, a data: or javascript: address are
    stored and served to every visitor, who loads it as the module's picture (<img src>) on the catalogue, Home,
    the forum and the calendar."""
    c = client_for(editor)
    tracker = "https://tracker.example/pixel.png?visitor=1"
    r = c.post(f"{API}/content/modules", json={**NEW_MODULE, "artUrl": tracker})
    assert r.status_code == 201, r.text
    listed = {m["id"]: m for m in client_for().get(f"{API}/modules").json()}
    assert listed["data-ethics"]["artUrl"] == tracker
    for odd in ("javascript:alert(document.domain)", "data:image/svg+xml,<svg/>", "//tracker.example/x.png"):
        body = {**NEW_MODULE, "id": f"m-{uuid.uuid4().hex[:6]}", "unitCode": None, "artUrl": odd}
        made = c.post(f"{API}/content/modules", json=body)
        assert made.status_code == 201, made.text
        assert made.json()["artUrl"] == odd


def test_sec42_module_art_uploads_fail_the_databases_purpose_check(client_for: Clients, editor: User) -> None:
    """Migration 0026 added `modules.art_url` but left `ck_uploads_uploadpurpose` without 'module_art': in every
    database built from the migrations (CI, Railway, production) a module art upload is a 500."""
    c = client_for(editor)
    body = {"purpose": "module_art", "fileName": "art.png", "contentType": "image/png", "sizeBytes": 100}
    with pytest.raises(IntegrityError, match="ck_uploads_uploadpurpose"):
        c.post(f"{API}/uploads", json=body)


def test_sec42_an_upload_that_was_never_checked_becomes_module_art_and_media_serves_it(
    client_for: Clients, editor: User, upload_file: UploadFile, db: Session
) -> None:
    """Once the purpose check takes 'module_art' (here: dropped inside this test's own transaction), `_attach_art()`
    marks any module_art upload attached, a pending one too, so /media serves the unchecked object straight from
    incoming/ (which its uploader can still overwrite until the presigned POST expires). Completing the same bytes
    is refused."""
    db.execute(text("ALTER TABLE uploads DROP CONSTRAINT ck_uploads_uploadpurpose"))  # rolled back with the test
    db.commit()
    c = client_for(editor)
    junk = b"<html><script>alert(1)</script></html>"  # not a PNG
    presigned = upload_file(
        c, purpose="module_art", name="art.png", content_type="image/png", body=junk, complete=False
    )
    upload_id = presigned["uploadId"]
    assert c.post(f"{API}/uploads/{upload_id}/complete").status_code == 422  # the check it skips
    pending = upload_file(c, purpose="module_art", name="art.png", content_type="image/png", body=junk, complete=False)
    art = f"/api/v1/media/{pending['uploadId']}"

    assert c.post(f"{API}/content/modules", json={**NEW_MODULE, "artUrl": art}).status_code == 201
    db.expire_all()
    up = db.get(Upload, uuid.UUID(pending["uploadId"]))
    assert up is not None
    assert (up.status, up.completed_at, up.storage_key) == (UploadStatus.attached, None, f"incoming/{up.id}")
    shown = client_for().get(art, follow_redirects=False)  # a guest
    assert shown.status_code == 302
    assert f"incoming/{up.id}" in shown.headers["location"]


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
