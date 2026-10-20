"""Test harness shared by every area (owned by the lead; areas add their own fixtures in tests/<area>/conftest.py).

- A throw-away Postgres database per test run (DSBA_TEST_ADMIN_URL), migrated with Alembic; on pytest-xdist's
  workers (scripts/check.sh runs up to four) each worker makes its own.
- Each test runs inside a transaction that is rolled back afterwards: handlers' commits are savepoints.
- S3 is moto's in-process mock, its bucket made once for the run: a "browser upload" in a test is
  storage.client.put_object(...).
- One app serves every test (shared_app), with each test's own database session.
- client_for(user) gives a TestClient with the CSRF cookie and header set, signed in as `user` (or a guest). With a
  session the CSRF token is the one bound to it; after a sign-in or sign-out through the API, copy the new cookie
  into the header (as the web app does before every request).
"""

from __future__ import annotations

import os
import uuid
from collections.abc import Callable, Iterator, Sequence
from typing import Any

import pytest
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.testclient import TestClient
from moto import mock_aws
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.core.access import SwitchMode
from app.models import User

ADMIN_URL = os.environ.get("DSBA_TEST_ADMIN_URL", "postgresql+psycopg://dsba:dsba@127.0.0.1:5432/postgres")
HERE = os.path.dirname(__file__)


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line("markers", "own_app: the test adds routes, so it gets an app of its own (not shared)")


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
        "DSBA_S3_CREATE_BUCKET": "false",  # made once for the run (bucket below), not by every client's start-up
        "DSBA_EMAIL_BACKEND": "console",
        "DSBA_GOOGLE_CLIENT_ID": "",  # "Continue with Google" is off unless a test sets it up
        "DSBA_GOOGLE_CLIENT_SECRET": "",
        "DSBA_COMMIT_SHA": "",  # the commit /health reports: unknown, whatever the shell running the tests says
        "RAILWAY_GIT_COMMIT_SHA": "",
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


@pytest.fixture(scope="session")
def shared_app(settings_env: None) -> FastAPI:
    """The app the tests talk to. FastAPI prepares a route (its dependencies and response checks) the first time an
    app matches a request against it, so one app for the whole run prepares each route once, not once per test."""
    from app.main import create_app

    return create_app()


@pytest.fixture
def app(request: pytest.FixtureRequest, db: Session, bucket: None) -> Iterator[FastAPI]:
    """The app, with the test's own database session and the run's bucket. A test marked own_app adds routes, so it
    gets a new app."""
    from app.db import get_db
    from app.main import create_app

    own = request.node.get_closest_marker("own_app") is not None
    application: FastAPI = create_app() if own else request.getfixturevalue("shared_app")

    def _db() -> Iterator[Session]:
        yield db

    routes = len(application.router.routes)
    application.dependency_overrides[get_db] = _db
    yield application
    application.dependency_overrides.clear()
    assert own or len(application.router.routes) == routes, "this test adds routes: mark it @pytest.mark.own_app"


@pytest.fixture(scope="session")
def bucket(settings_env: None) -> None:
    """The run's bucket in moto, made once (the app's start-up makes it in development, not in the tests)."""
    from app.services.storage import get_storage

    get_storage().ensure_bucket(["http://testserver"])


@pytest.fixture
def storage(bucket: None):  # type: ignore[no-untyped-def]
    from app.services.storage import get_storage

    return get_storage()


@pytest.fixture
def make_user(db: Session) -> Callable[..., User]:
    """make_user(email=, name=, roles=, year=, tracks=, emails=, confirmed=, password=) -> a User holding these roles
    (slugs; Student by default), committed. An email address is made up if none is given. tracks=True: they keep their
    lesson progress. emails: their answer to the question about emails at sign-up (yes by default; None: not
    answered, so nothing is emailed to them). confirmed: Google vouched for the address (yes by default, as staff
    roles need it; False: an address typed at sign-up). password: the account's password (none by default)."""
    from app.core.time import utcnow
    from app.services import access, passwords

    def _make(
        *,
        email: str | None = None,
        name: str | None = "Test Student",
        roles: Sequence[str] = ("student",),
        year: int | None = 2,
        tracks: bool = False,
        emails: bool | None = True,
        confirmed: bool = True,
        password: str | None = None,
    ) -> User:
        if email is None:
            email = f"student-{uuid.uuid4().hex[:8]}@example.com"
        prefs: dict[str, bool] = {} if emails is None else {"notification_emails": emails}
        if tracks:
            prefs["track_progress"] = True
        u = User(
            email=email,
            display_name=name,
            year=year,
            preferences=prefs,
            email_confirmed_at=utcnow() if confirmed else None,
            password_hash=passwords.hash_password(password) if password is not None else None,
        )
        db.add(u)
        db.commit()
        access.give(db, u, *roles)
        db.commit()
        return u

    return _make


@pytest.fixture
def give_roles(db: Session) -> Callable[..., None]:
    """give_roles(user, "student", "newsletter-manager"): the person now holds exactly these roles (slugs)."""
    from app.services import access

    def _give(user: User, *slugs: str) -> None:
        roles = [access.role_by_slug(db, slug) for slug in slugs]
        access.set_roles(db, user, [r for r in roles if r is not None])
        db.commit()

    return _give


@pytest.fixture
def make_role(db: Session) -> Callable[..., Any]:
    """make_role("forum-helpers", Box.forum_moderate, badge="Helper"): a role with these boxes, committed."""
    from app.models import AccessRole, RoleBox
    from app.services import access

    def _make(slug: str, *boxes: Any, badge: str | None = None) -> AccessRole:
        role = AccessRole(slug=slug, name=slug.replace("-", " ").capitalize(), badge=badge, position=50)
        db.add(role)
        db.flush()
        db.add_all(RoleBox(role_id=role.id, box=str(box)) for box in boxes)
        db.commit()
        access.forget(db)
        return role

    return _make


@pytest.fixture
def set_feature(db: Session) -> Callable[..., None]:
    """set_feature("forum", "off"), or set_feature("calendar", "roles", ["content-manager"]): a switch, committed."""
    from app.core.access import Feature
    from app.services import access

    def _set(feature: str, mode: SwitchMode, roles: Sequence[str] = ()) -> None:
        ids = [r.id for r in (access.role_by_slug(db, slug) for slug in roles) if r is not None]
        access.store_switch(db, Feature(feature), mode, ids, by=None)
        db.commit()

    return _set


@pytest.fixture
def client_for(app: FastAPI, db: Session, storage: object) -> Iterator[Callable[..., TestClient]]:
    """client_for() -> a guest; client_for(user) -> signed in as user. Each call is a separate browser."""
    from app.core.security import hash_token, new_token
    from app.core.time import utcnow
    from app.models import UserSession

    clients: list[TestClient] = []

    def _client(user: User | None = None) -> TestClient:
        c = TestClient(app)
        c.__enter__()
        clients.append(c)
        if user is not None:
            from datetime import timedelta

            token = new_token()
            db.add(UserSession(user_id=user.id, token_hash=hash_token(token), expires_at=utcnow() + timedelta(days=1)))
            db.commit()
            c.cookies.set("dsba_session", token)
        c.get("/api/v1/auth/csrf")  # the CSRF cookie (bound to the session, when there is one)
        c.headers["X-CSRF-Token"] = c.cookies.get("dsba_csrf") or ""
        return c

    yield _client
    for c in clients:
        c.__exit__(None, None, None)


@pytest.fixture
def client(client_for: Callable[..., TestClient]) -> TestClient:
    return client_for()
