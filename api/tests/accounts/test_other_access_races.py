"""SEC-66 under concurrency (COM-270): a request signed in when it started can't leave a working calendar link,
widget link or AI app behind a takeover, a reset link or a password change that finished meanwhile; and one that
already holds the account's lock is waited for, then its link is turned off.

These run on their own database connections (the `db` fixture is one connection), so the two 'requests' are real
transactions; each test deletes what it made."""

from __future__ import annotations

import threading
import time
import uuid
from collections.abc import Callable, Iterator
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import timedelta

import pytest
from mcp.server.auth.provider import AuthorizationParams
from mcp.shared.auth import OAuthClientInformationFull
from pydantic import AnyUrl
from sqlalchemy import Engine, create_engine, delete, or_, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.core.access import ADMIN, STUDENT
from app.core.errors import ApiError
from app.core.security import hash_token, new_token
from app.core.time import utcnow
from app.models import AiAppClient, AiAppConnection, AuditEntry, CalendarPrefs, PasswordReset, User, UserSession
from app.schemas.auth import PasswordChange, PasswordResetRequest
from app.services import access, my_calendar, passwords, signin
from app.services.ai_apps import consent, store
from app.services.google import GoogleIdentity

PASSWORD = "correct horse battery 66"
NEW_PASSWORD = "a new long phrase 66"


@pytest.fixture
def own_connections(engine: Engine) -> Iterator[sessionmaker[Session]]:
    separate = create_engine(engine.url.render_as_string(hide_password=False), poolclass=NullPool)
    yield sessionmaker(bind=separate, expire_on_commit=False, autoflush=False)
    separate.dispose()


@dataclass(frozen=True)
class Race:
    user_id: uuid.UUID
    admin_id: uuid.UUID
    intruder: uuid.UUID  # the session of the request that started before the change
    owner: uuid.UUID  # the session that changes the password
    email: str
    client_id: str


@pytest.fixture
def race(own_connections: sessionmaker[Session]) -> Iterator[Race]:
    """A student with an unconfirmed Gmail address (so Google can take it over), a password, two signed-in
    browsers, a calendar settings row, and an AI app registered; and an admin for reset links. Committed."""
    email = f"race-{uuid.uuid4().hex[:10]}@gmail.com"
    client_id = f"race-app-{uuid.uuid4().hex[:10]}"
    with own_connections() as s:
        student = User(
            email=email,
            display_name="Race Student",
            year=2,
            password_hash=passwords.hash_password(PASSWORD),
            preferences={},
        )
        admin = User(
            email=f"race-admin-{uuid.uuid4().hex[:10]}@gmail.com",
            display_name="Race Admin",
            year=2,
            email_confirmed_at=utcnow(),
            preferences={},
        )
        s.add_all([student, admin])
        s.flush()
        access.give(s, student, STUDENT)
        access.give(s, admin, ADMIN)
        sessions = []
        for _ in range(2):
            sess = UserSession(
                user_id=student.id, token_hash=hash_token(new_token()), expires_at=utcnow() + timedelta(1)
            )
            s.add(sess)
            sessions.append(sess)
        s.add(CalendarPrefs(user_id=student.id, hidden_events=[], hidden_modules=[], hidden_types=[], show_plan=False))
        info = OAuthClientInformationFull(
            client_id=client_id,
            client_name="Race App",
            redirect_uris=[AnyUrl("https://claude.ai/api/mcp/auth_callback")],
            token_endpoint_auth_method="none",
        )
        store.register_client(s, info, None)
        s.commit()
        made = Race(student.id, admin.id, sessions[0].id, sessions[1].id, email, client_id)
    yield made
    with own_connections() as s:
        # Audit entries outlive their users (actor_id is SET NULL), and another test on this worker's database would
        # find them; so they go first.
        ids = [made.user_id, made.admin_id]
        s.execute(
            delete(AuditEntry).where(or_(AuditEntry.actor_id.in_(ids), AuditEntry.target_id.in_([str(i) for i in ids])))
        )
        s.execute(delete(User).where(User.id.in_(ids)))
        s.execute(delete(AiAppClient).where(AiAppClient.client_id == made.client_id))
        s.commit()


# ── the change: each in its own transaction, committed ──────────────────────────────────────


def _password_change(s: Session, r: Race) -> None:
    user = s.get_one(User, r.user_id)
    body = PasswordChange(current_password=PASSWORD, new_password=NEW_PASSWORD)
    signin.set_password(s, user, s.get_one(UserSession, r.owner), body, None)
    s.commit()


def _reset_link(s: Session, r: Race) -> None:
    link = signin.issue_reset_link(s, s.get_one(User, r.admin_id), s.get_one(User, r.user_id), None)
    s.commit()
    token = link.url.split("#token=")[1]
    signin.use_reset_link(s, PasswordResetRequest(token=token, new_password=NEW_PASSWORD), None)
    s.commit()


def _takeover(s: Session, r: Race) -> None:
    identity = GoogleIdentity(sub=f"sub-{r.user_id}", email=r.email, google_owns_address=True)
    user, _ = signin.google_sign_in(s, identity, None)
    assert user.id == r.user_id
    s.commit()


CHANGES: dict[str, Callable[[Session, Race], None]] = {
    "password change": _password_change,
    "reset link": _reset_link,
    "takeover": _takeover,
}


# ── what the old browser's request makes ────────────────────────────────────────────────────


def _make_feed(s: Session, user: User, sess: UserSession, r: Race) -> None:
    my_calendar.new_feed(s, user, sess)
    s.flush()


def _make_widget(s: Session, user: User, sess: UserSession, r: Race) -> None:
    my_calendar.new_widget(s, user, sess)
    s.flush()


def _connect_ai_app(s: Session, user: User, sess: UserSession, r: Race) -> None:
    client = store.get_client(s, r.client_id)
    assert client is not None
    params = AuthorizationParams(
        state="st",
        scopes=[store.SCOPE],
        code_challenge="c" * 43,
        redirect_uri=AnyUrl("https://claude.ai/api/mcp/auth_callback"),
        redirect_uri_provided_explicitly=True,
        resource=None,
    )
    consent.answer(s, user, sess, consent.sign(client, params), allow=True)


ISSUERS: dict[str, Callable[[Session, User, UserSession, Race], None]] = {
    "calendar link": _make_feed,
    "widget link": _make_widget,
    "AI app": _connect_ai_app,
}


def _nothing_left(own_connections: sessionmaker[Session], r: Race) -> None:
    with own_connections() as s:
        prefs = s.get(CalendarPrefs, r.user_id)
        assert prefs is None or (prefs.feed_hash is None and prefs.widget_hash is None)
        assert s.scalar(select(AiAppConnection).where(AiAppConnection.user_id == r.user_id)) is None


@pytest.mark.parametrize("change", CHANGES)
@pytest.mark.parametrize("issuer", ISSUERS)
def test_a_request_from_before_the_change_makes_nothing(
    own_connections: sessionmaker[Session], race: Race, change: str, issuer: str
) -> None:
    """The old browser's request was signed in when it started (its user and session already read), then the change
    finished: the request is refused with 401 and no link or app is left working."""
    with own_connections() as old:
        user = old.get_one(User, race.user_id)
        sess = old.get_one(UserSession, race.intruder)  # what the route's dependencies read
        with own_connections() as s:
            CHANGES[change](s, race)
        with pytest.raises(ApiError) as refused:
            ISSUERS[issuer](old, user, sess, race)
        assert refused.value.status == 401
        old.rollback()
    _nothing_left(own_connections, race)


@pytest.mark.parametrize("settings_row", [True, False], ids=["settings row", "no settings row"])
@pytest.mark.parametrize("change", CHANGES)
@pytest.mark.parametrize("issuer", ["calendar link", "widget link"])
def test_a_link_being_made_is_waited_for_then_turned_off(
    own_connections: sessionmaker[Session], race: Race, change: str, issuer: str, settings_row: bool
) -> None:
    """The old browser's request holds the account's lock (making its link) when the change starts: the change waits
    for it, then turns the new link off. Also when the student had no calendar settings yet, so the request makes the
    row: there is no settings row to wait on, only the account's lock."""
    if not settings_row:
        with own_connections() as s:
            s.execute(delete(CalendarPrefs).where(CalendarPrefs.user_id == race.user_id))
            s.commit()
    with own_connections() as old:
        user = old.get_one(User, race.user_id)
        sess = old.get_one(UserSession, race.intruder)
        ISSUERS[issuer](old, user, sess, race)  # holds the lock, not committed yet

        def changing() -> None:
            with own_connections() as s:
                CHANGES[change](s, race)

        with ThreadPoolExecutor(1) as pool:
            done = pool.submit(changing)
            time.sleep(0.5)
            assert not done.done(), "the change didn't wait for the request holding the account's lock"
            old.commit()
            done.result(timeout=10)
    _nothing_left(own_connections, race)


def test_a_signed_out_session_makes_no_link(own_connections: sessionmaker[Session], race: Race) -> None:
    """hold_live reads the session again: one revoked since the request read it is refused."""
    with own_connections() as old:
        user = old.get_one(User, race.user_id)
        sess = old.get_one(UserSession, race.intruder)
        with own_connections() as s:
            s.get_one(UserSession, race.intruder).revoked_at = utcnow()
            s.commit()
        with pytest.raises(ApiError) as refused:
            my_calendar.new_feed(old, user, sess)
        assert refused.value.status == 401


# ── two recoveries at once: the account's lock comes before its reset links ────────────────────


class _Pause:
    """Stands in for a function a recovery calls part-way through: the first call (in the paused thread) says it got
    there and waits to be let go; later calls go straight through."""

    def __init__(self, real: Callable[..., object]) -> None:
        self.real = real
        self.reached = threading.Event()
        self.go = threading.Event()

    def __call__(self, *args: object, **kwargs: object) -> object:
        if not self.reached.is_set():
            self.reached.set()
            assert self.go.wait(10), "never let go"
        return self.real(*args, **kwargs)


def _overlap(
    own_connections: sessionmaker[Session], pause: _Pause, first: Callable[[Session], None], race: Race
) -> None:
    """`first` runs until `pause` (holding whatever locks it takes before that point), then a Google takeover starts
    and gets as far as it can; then `first` goes on. Both must finish: a deadlock aborts one of them (40P01, a 500)."""

    def running(change: Callable[[Session], None]) -> None:
        with own_connections() as s:
            change(s)
            s.commit()

    with ThreadPoolExecutor(2) as pool:
        one = pool.submit(running, first)
        assert pause.reached.wait(10)
        two = pool.submit(running, lambda s: _takeover(s, race))
        time.sleep(0.5)  # the takeover now waits on a lock `first` holds
        pause.go.set()
        one.result(timeout=15)
        two.result(timeout=15)


def _drop_settings_row(own_connections: sessionmaker[Session], race: Race) -> None:
    with own_connections() as s:
        s.execute(delete(CalendarPrefs).where(CalendarPrefs.user_id == race.user_id))
        s.commit()


@pytest.mark.parametrize("settings_row", [True, False], ids=["settings row", "no settings row"])
def test_a_reset_link_and_a_takeover_at_once_both_finish(
    own_connections: sessionmaker[Session], race: Race, settings_row: bool, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The student uses a reset link while Google takes the account over. The reset used to lock its link and then
    the account, the takeover the account and then the links, so each could wait on the other (COM-307)."""
    if not settings_row:
        _drop_settings_row(own_connections, race)
    with own_connections() as s:
        link = signin.issue_reset_link(s, s.get_one(User, race.admin_id), s.get_one(User, race.user_id), None)
        s.commit()
    token = link.url.split("#token=")[1]
    pause = _Pause(passwords.check_new)  # after the reset has found its link
    monkeypatch.setattr(passwords, "check_new", pause)

    def reset(s: Session) -> None:
        signin.use_reset_link(s, PasswordResetRequest(token=token, new_password=NEW_PASSWORD), None)

    _overlap(own_connections, pause, reset, race)
    with own_connections() as s:
        user = s.get_one(User, race.user_id)
        assert user.google_sub == f"sub-{race.user_id}"  # the takeover came second, so it has the last word
        assert user.password_hash is None
    _nothing_left(own_connections, race)


@pytest.mark.parametrize("settings_row", [True, False], ids=["settings row", "no settings row"])
def test_a_new_reset_link_and_a_takeover_at_once_both_finish(
    own_connections: sessionmaker[Session], race: Race, settings_row: bool, monkeypatch: pytest.MonkeyPatch
) -> None:
    """An admin makes a new reset link (retiring the open one) while Google takes the account over. Making the link
    used to lock the old link and then, adding the new one, wait on the account the takeover holds."""
    if not settings_row:
        _drop_settings_row(own_connections, race)
    with own_connections() as s:
        signin.issue_reset_link(s, s.get_one(User, race.admin_id), s.get_one(User, race.user_id), None)
        s.commit()
    pause = _Pause(new_token)  # after the old links are retired, before the new one is added
    monkeypatch.setattr("app.services.signin.new_token", pause)

    def new_link(s: Session) -> None:
        signin.issue_reset_link(s, s.get_one(User, race.admin_id), s.get_one(User, race.user_id), None)

    _overlap(own_connections, pause, new_link, race)
    with own_connections() as s:
        open_links = select(PasswordReset).where(PasswordReset.user_id == race.user_id, PasswordReset.used_at.is_(None))
        assert s.scalar(open_links) is None  # the takeover came second and retired the new link too
    _nothing_left(own_connections, race)
