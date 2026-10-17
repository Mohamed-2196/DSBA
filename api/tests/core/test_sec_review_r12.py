"""The round 12 security review's proof for the private calendar feed's address. The test passes while the problem
it names is still there."""

from __future__ import annotations

import logging
import threading
import time
from collections.abc import Callable, Iterator
from pathlib import Path

import httpx
import pytest
import uvicorn
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.models import User
from tests.core.helpers import API

ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]
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


def test_sec37_the_private_feeds_secret_is_written_to_the_apis_access_log(
    app: FastAPI,
    client_for: ClientFor,
    make_user: MakeUser,
    set_feature: Callable[..., None],
    uvicorn_loggers: None,
) -> None:
    """The image starts uvicorn without --no-access-log, so uvicorn's default logging writes every request line,
    path included, to the container's output: a calendar app polling a student's private feed puts the feed's
    secret there every few hours."""
    cmd = next(line for line in DOCKERFILE.read_text().splitlines() if line.startswith("CMD"))
    assert "uvicorn" in cmd
    assert "--no-access-log" not in cmd
    assert "--log-config" not in cmd

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
            r = calendar_app.get(f"http://127.0.0.1:{port}{feed}")
        assert r.status_code == 200, r.text
        assert "SUMMARY:Dentist" in r.text
    finally:
        server.should_exit = True
        thread.join(timeout=10)
    logged = [line for line in lines.lines if secret in line]
    assert logged, lines.lines
    assert f"GET {feed} HTTP/1.1" in logged[0]
