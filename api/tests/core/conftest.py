"""Fixtures for the core tests: browsers at a chosen address, settings for one test, and people."""

from __future__ import annotations

from collections.abc import Callable, Iterator
from datetime import timedelta
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.core.security import hash_token, new_token
from app.core.time import utcnow
from app.models import Role, User, UserSession
from tests.core.helpers import API

BrowserAt = Callable[..., TestClient]
SetOption = Callable[[str, Any], None]


@pytest.fixture
def settings() -> Settings:
    return get_settings()


@pytest.fixture
def set_option(monkeypatch: pytest.MonkeyPatch, settings: Settings) -> SetOption:
    """Changes a setting for one test."""

    def _set(name: str, value: Any) -> None:
        assert name in type(settings).model_fields, f"no setting called {name}"
        monkeypatch.setattr(settings, name, value)

    return _set


@pytest.fixture
def browser_at(app: FastAPI, db: Session, storage: object) -> Iterator[BrowserAt]:
    """browser_at('203.0.113.5', user=None) -> a browser whose connection comes from that address (the direct peer),
    signed in as `user` when one is given."""
    made: list[TestClient] = []

    def _make(peer: str, user: User | None = None) -> TestClient:
        c = TestClient(app, client=(peer, 40000))
        c.__enter__()
        made.append(c)
        if user is not None:
            token = new_token()
            db.add(UserSession(user_id=user.id, token_hash=hash_token(token), expires_at=utcnow() + timedelta(days=1)))
            db.commit()
            c.cookies.set("dsba_session", token)
        c.get(f"{API}/auth/csrf")
        c.headers["X-CSRF-Token"] = c.cookies.get("dsba_csrf") or ""
        return c

    yield _make
    for c in made:
        c.__exit__(None, None, None)


@pytest.fixture
def student(make_user: Callable[..., User]) -> User:
    return make_user(name="Sara Student", year=2)


@pytest.fixture
def classmate(make_user: Callable[..., User]) -> User:
    return make_user(name="Omar Classmate", year=2)


@pytest.fixture
def moderator(make_user: Callable[..., User]) -> User:
    return make_user(name="Maryam Rep", role=Role.moderator, year=3)


@pytest.fixture
def admin(make_user: Callable[..., User]) -> User:
    return make_user(name="Ali Admin", role=Role.admin, year=None)
