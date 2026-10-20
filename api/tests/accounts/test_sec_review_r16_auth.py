"""Security review, round 16 (pre-launch audit): proofs for sign-in, accounts and the export.

Each test passes while the problem it shows is there."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import DailyPlay, User
from app.routers import auth as auth_router
from app.schemas.auth import ExportDailyPlay
from app.services import access
from tests.accounts.conftest import API, Outbox, SignIn

SetOption = Callable[[str, Any], None]


@pytest.fixture
def from_network(monkeypatch: pytest.MonkeyPatch) -> None:
    """Requests say which network they come from in an x-test-ip header (as a trusted proxy would)."""
    monkeypatch.setattr(auth_router, "client_ip", lambda request: request.headers.get("x-test-ip"))


def test_sec16_the_export_leaves_out_the_address_a_daily_play_was_kept_from() -> None:
    """A guest play kept on sign-in stores the client's IP address (daily_plays.kept_ip) and when it was kept, but the
    account export has neither."""
    assert "kept_ip" in DailyPlay.__table__.columns
    assert "kept_at" in DailyPlay.__table__.columns
    assert "kept_ip" not in ExportDailyPlay.model_fields
    assert "kept_at" not in ExportDailyPlay.model_fields
