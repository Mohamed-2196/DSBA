"""The round 12 security review's tests for the private calendar feed's address and for bug reports. A proof passes
while the problem it names is still there; the test for a fixed finding (SEC-37) asserts the fix."""

from __future__ import annotations

import logging
import threading
import time
import uuid
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any

import httpx
import pytest
import uvicorn
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import BugReport, Notification, Upload, User
from tests.core.conftest import BrowserAt
from tests.core.helpers import API, PNG, upload

ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]
ADMIN = ("student", "admin")
DOCKERFILE = Path(__file__).resolve().parents[2] / "Dockerfile"


class _Lines(logging.Handler):
    def __init__(self) -> None:
        super().__init__()
        self.lines: list[str] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.lines.append(record.getMessage())


@pytest.fixture
def uvicorn_loggers() -> Iterator[None]:
    """uvicorn's own logging config is applied for one test (as the image runs it); its loggers are put back after."""
    names = ("uvicorn", "uvicorn.error", "uvicorn.access")
    saved = {
        n: (list(logging.getLogger(n).handlers), logging.getLogger(n).level, logging.getLogger(n).propagate)
        for n in names
    }
    yield
    for n, (handlers, level, propagate) in saved.items():
        logger = logging.getLogger(n)
        logger.handlers, logger.level, logger.propagate = handlers, level, propagate


def test_sec37_the_private_feeds_secret_never_reaches_the_apis_access_log(
    app: FastAPI,
    client_for: ClientFor,
    make_user: MakeUser,
    set_feature: Callable[..., None],
    uvicorn_loggers: None,
) -> None:
    """The image starts uvicorn with its access log on. A calendar app polling a student's private feed is logged
    with /api/v1/feeds/calendar/….ics as the path: the feed's secret never reaches the container's output."""
    cmd = next(line for line in DOCKERFILE.read_text().splitlines() if line.startswith("CMD"))
    assert "uvicorn" in cmd
    assert "--no-access-log" not in cmd

    set_feature("calendar", "everyone")
    student = client_for(make_user(name="Sara Student"))
    assert (
        student.post(f"{API}/calendar/mine/events", json={"title": "Dentist", "date": "2026-11-02"}).status_code == 201
    )
    feed = student.post(f"{API}/calendar/mine/feed").json()["feedPath"]
    secret = feed.rsplit("/", 1)[1].removesuffix(".ics")
    assert len(secret) == 43

    config = uvicorn.Config(app, host="127.0.0.1", port=0, lifespan="off")  # the image's defaults
    assert config.access_log is True
    lines = _Lines()
    logging.getLogger("uvicorn.access").addHandler(lines)
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    try:
        deadline = time.monotonic() + 10
        while not server.started and time.monotonic() < deadline:
            time.sleep(0.05)
        assert server.started
        port = server.servers[0].sockets[0].getsockname()[1]
        with httpx.Client(trust_env=False, timeout=10) as calendar_app:
            r = calendar_app.get(f"http://127.0.0.1:{port}{feed}?refresh=1")
        assert r.status_code == 200, r.text
        assert "SUMMARY:Dentist" in r.text
    finally:
        server.should_exit = True
        thread.join(timeout=10)
    assert lines.lines
    assert not [line for line in lines.lines if secret in line], lines.lines
    assert any(f"GET {API}/feeds/calendar/….ics?refresh=1 HTTP/1.1" in line for line in lines.lines), lines.lines


def test_sec40_a_students_bug_reports_and_screenshots_are_not_in_the_export_and_outlive_the_account(
    client_for: ClientFor, make_user: MakeUser, storage: Any, db: Session
) -> None:
    """'Download your data' promises everything the Hub keeps; deletion promises personal data goes for good. A bug
    report (what the student wrote, their browser and screen size) and its screenshot are neither exported nor
    deleted."""
    student = make_user(name="Sara Student")
    c = client_for(student)
    shot = upload(c, storage, purpose="bug_screenshot", name="my-account.png", content_type="image/png", body=PNG)
    words = f"My grades page shows someone else's marks {uuid.uuid4().hex[:6]}"
    sent = c.post(
        f"{API}/bug-reports",
        json={
            "whatHappened": words,
            "pageUrl": "/account",
            "appVersion": "test",
            "browser": "Safari 19 on iOS, 390x844",
            "screenshotUploadId": shot,
        },
    )
    assert sent.status_code == 201, sent.text

    export = c.get(f"{API}/me/export")
    assert export.status_code == 200
    assert words not in export.text
    assert shot not in export.text
    assert not [key for key in export.json() if "bug" in key.lower()]

    assert c.delete(f"{API}/me").status_code in (200, 204)
    db.expire_all()
    report = db.get(BugReport, uuid.UUID(sent.json()["id"]))
    picture = db.get(Upload, uuid.UUID(shot))
    assert report is not None
    assert (report.what_happened, report.browser) == (words, "Safari 19 on iOS, 390x844")
    assert picture is not None
    assert storage.head(picture.storage_key) is not None  # the screenshot's object is still in the bucket


def test_sec44_guests_on_many_networks_send_admins_reports_without_a_hub_wide_cap(
    browser_at: BrowserAt, make_user: MakeUser, db: Session
) -> None:
    """Five reports an hour per network and nothing hub-wide: every report from every network is a notification for
    every admin, with up to 4,300 characters stored each."""
    admins = [make_user(name="Head Admin", roles=ADMIN), make_user(name="Second Admin", roles=ADMIN)]
    body = {"whatHappened": "x" * 2000, "expected": "y" * 2000, "pageUrl": "/", "appVersion": "1", "browser": "z" * 300}
    networks = [f"2001:db8:{n:x}::1" for n in range(1, 7)]  # six /64s: one home or phone network has thousands
    for peer in networks:
        guest = browser_at(peer)
        for _ in range(5):
            assert guest.post(f"{API}/bug-reports", json=body).status_code == 201
    for admin in admins:
        told = db.scalar(
            select(func.count())
            .select_from(Notification)
            .where(Notification.user_id == admin.id, Notification.kind == "bug_report")
        )
        assert told == 5 * len(networks)
    assert db.scalar(select(func.count()).select_from(BugReport).where(BugReport.user_id.is_(None))) == 30
