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


def test_sec16_admin_identifiers_give_admin_back_at_every_sign_in(
    sign_in: SignIn, set_option: SetOption, db: Session
) -> None:
    """DSBA_ADMIN_IDENTIFIERS is applied at every sign-in, not once: an admin who took Admin away from that account
    (Access screen, step-up, audited) sees it come back the next time the person signs in."""
    set_option("admin_identifiers", ["founder@example.com"])
    set_option("otp_resend_seconds", 0)
    _, result = sign_in("founder@example.com")
    assert "admin" in [r["slug"] for r in result["user"]["roles"]]
    user = db.get(User, result["user"]["id"])
    assert user is not None
    student = access.role_by_slug(db, "student")
    assert student is not None
    access.set_roles(db, user, [student])
    db.commit()
    access.forget(db)
    assert not access.is_admin(user)
    _, again = sign_in("founder@example.com")
    assert "admin" in [r["slug"] for r in again["user"]["roles"]]


def test_sec16_the_export_leaves_out_the_address_a_daily_play_was_kept_from() -> None:
    """A guest play kept on sign-in stores the client's IP address (daily_plays.kept_ip) and when it was kept, but the
    account export has neither."""
    assert "kept_ip" in DailyPlay.__table__.columns
    assert "kept_at" in DailyPlay.__table__.columns
    assert "kept_ip" not in ExportDailyPlay.model_fields
    assert "kept_at" not in ExportDailyPlay.model_fields
