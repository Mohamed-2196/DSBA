"""Test harness shared by every area (owned by the lead; areas add their own fixtures in tests/<area>/conftest.py).

- A throw-away Postgres database per test run (DSBA_TEST_ADMIN_URL), migrated with Alembic.
- Each test runs inside a transaction that is rolled back afterwards: handlers' commits are savepoints.
- S3 is moto's in-process mock: a "browser upload" in a test is storage.client.put_object(...).
- client_for(user) gives a TestClient with the CSRF cookie and header set, signed in as `user` (or a guest).
"""

from __future__ import annotations

import os
import uuid
from collections.abc import Callable, Iterator

import pytest
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.testclient import TestClient
from moto import mock_aws
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

ADMIN_URL = os.environ.get("DSBA_TEST_ADMIN_URL", "postgresql+psycopg://dsba:dsba@127.0.0.1:5432/postgres")
HERE = os.path.dirname(__file__)


@pytest.fixture(scope="session")
def database_url() -> Iterator[str]:
    name = f"dsba_test_{uuid.uuid4().hex[:10]}"
    admin = create_engine(ADMIN_URL, isolation_level="AUTOCOMMIT")
    with admin.connect() as c:
        c.execute(text(f'CREATE DATABASE "{name}"'))
    url = make_url(ADMIN_URL).set(database=name).render_as_string(hide_password=False)
    cfg = Config(os.path.join(HERE, "..", "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(HERE, "..", "migrations"))
    cfg.attributes["database_url"] = url
    cfg.attributes["configure_logger"] = False
    command.upgrade(cfg, "head")
    yield url
    with admin.connect() as c:
        c.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
    admin.dispose()


@pytest.fixture(scope="session", autouse=True)
def settings_env(database_url: str) -> Iterator[None]:
    env = {
        "DSBA_ENV": "test",
        "DSBA_DATABASE_URL": database_url,
        "DSBA_SECRET_KEY": "test-secret-key",
        "DSBA_S3_ENDPOINT_URL": "",
        "DSBA_S3_BUCKET": "dsba-test",
        "DSBA_S3_ACCESS_KEY_ID": "testing",
        "DSBA_S3_SECRET_ACCESS_KEY": "testing",
        "DSBA_EMAIL_BACKEND": "console",
        "DSBA_SMS_BACKEND": "console",
        "AWS_DEFAULT_REGION": "us-east-1",
    }
    old = {k: os.environ.get(k) for k in env}
    os.environ.update(env)
    _clear_caches()
    with mock_aws():
        yield
    for k, v in old.items():
        if v is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = v
    _clear_caches()


def _clear_caches() -> None:
    from app.config import get_settings
    from app.db import get_engine, get_sessionmaker
    from app.services.storage import get_storage

    for f in (get_settings, get_engine, get_sessionmaker, get_storage):
        f.cache_clear()


@pytest.fixture(scope="session")
def engine(settings_env: None) -> Engine:
    from app.db import get_engine

    return get_engine()


@pytest.fixture
def db(engine: Engine) -> Iterator[Session]:
    conn = engine.connect()
    trans = conn.begin()
    session = Session(bind=conn, join_transaction_mode="create_savepoint", expire_on_commit=False, autoflush=False)
    try:
        yield session
    finally:
        session.close()
        trans.rollback()
        conn.close()


@pytest.fixture
def app(db: Session) -> Iterator[FastAPI]:
    from app.db import get_db
    from app.main import create_app

    application = create_app()

    def _db() -> Iterator[Session]:
        yield db

    application.dependency_overrides[get_db] = _db
    yield application
    application.dependency_overrides.clear()


@pytest.fixture
def storage(settings_env: None):  # type: ignore[no-untyped-def]
    from app.services.storage import get_storage

    s = get_storage()
    s.ensure_bucket(["http://testserver"])
    return s


@pytest.fixture
def make_user(db: Session) -> Callable[..., object]:
    from app.models import Role, User

    def _make(
        *,
        email: str | None = None,
        phone: str | None = None,
        name: str | None = "Test Student",
        role: Role = Role.student,
        year: int | None = 2,
    ) -> User:
        if email is None and phone is None:
            email = f"student-{uuid.uuid4().hex[:8]}@example.com"
        u = User(email=email, phone=phone, display_name=name, role=role, year=year)
        db.add(u)
        db.commit()
        return u

    return _make


@pytest.fixture
def client_for(app: FastAPI, db: Session, storage: object) -> Iterator[Callable[..., TestClient]]:
    """client_for() -> a guest; client_for(user) -> signed in as user. Each call is a separate browser."""
    from app.core.security import hash_token, new_token
    from app.core.time import utcnow
    from app.models import UserSession

    clients: list[TestClient] = []

    def _client(user: object | None = None) -> TestClient:
        c = TestClient(app)
        c.__enter__()
        clients.append(c)
        c.get("/api/v1/auth/csrf")
        c.headers["X-CSRF-Token"] = c.cookies.get("dsba_csrf") or ""
        if user is not None:
            from datetime import timedelta

            token = new_token()
            db.add(UserSession(user_id=user.id, token_hash=hash_token(token), expires_at=utcnow() + timedelta(days=1)))  # type: ignore[attr-defined]
            db.commit()
            c.cookies.set("dsba_session", token)
        return c

    yield _client
    for c in clients:
        c.__exit__(None, None, None)


@pytest.fixture
def client(client_for: Callable[..., TestClient]) -> TestClient:
    return client_for()
