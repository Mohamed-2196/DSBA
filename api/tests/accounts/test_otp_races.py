"""Parallel requests against one code (security review finding 2), on real separate database connections.

The usual fixtures run every request in one rolled-back transaction, which cannot show a race; these tests commit
their own challenge row through a separate engine and delete it afterwards."""

from __future__ import annotations

import threading
import uuid
from collections.abc import Callable, Iterator
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

import pytest
from sqlalchemy import Engine, create_engine, delete
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.core.errors import ApiError
from app.core.time import utcnow
from app.models import Channel, OtpChallenge, OtpPurpose
from app.services import otp

PARALLEL = 20
CODE = "424242"


@pytest.fixture
def own_connections(engine: Engine) -> Iterator[sessionmaker[Session]]:
    separate = create_engine(engine.url.render_as_string(hide_password=False), poolclass=NullPool)
    yield sessionmaker(bind=separate, expire_on_commit=False, autoflush=False)
    separate.dispose()


@pytest.fixture
def challenge(own_connections: sessionmaker[Session]) -> Iterator[uuid.UUID]:
    cid = uuid.uuid4()
    now = utcnow()
    with own_connections() as s:
        s.add(
            OtpChallenge(
                id=cid,
                purpose=OtpPurpose.sign_in,
                channel=Channel.email,
                identifier=f"race-{cid.hex[:10]}@example.com",
                code_hash=otp.code_hash(cid, CODE),
                attempts=0,
                created_at=now,
                expires_at=now + timedelta(minutes=10),
            )
        )
        s.commit()
    yield cid
    with own_connections() as s:
        s.execute(delete(OtpChallenge).where(OtpChallenge.id == cid))
        s.commit()


def _race(sessions: sessionmaker[Session], attempt: Callable[[Session], str]) -> list[str]:
    start = threading.Barrier(PARALLEL)

    def one(_: int) -> str:
        with sessions() as s:
            start.wait()
            try:
                return attempt(s)
            except ApiError as e:
                return e.code

    with ThreadPoolExecutor(PARALLEL) as pool:
        return list(pool.map(one, range(PARALLEL)))


def test_parallel_wrong_codes_get_five_tries_in_all(
    own_connections: sessionmaker[Session], challenge: uuid.UUID
) -> None:
    def wrong(s: Session) -> str:
        otp.verify(s, challenge_id=challenge, code="000000", purpose=OtpPurpose.sign_in)
        return "ok"

    results = _race(own_connections, wrong)
    assert results.count("invalid_code") == 4
    assert results.count("too_many_attempts") == PARALLEL - 4
    with own_connections() as s:
        row = s.get(OtpChallenge, challenge)
        assert row is not None
        assert row.attempts == 5


def test_parallel_right_codes_sign_in_once(own_connections: sessionmaker[Session], challenge: uuid.UUID) -> None:
    def right(s: Session) -> str:
        otp.verify(s, challenge_id=challenge, code=CODE, purpose=OtpPurpose.sign_in)
        s.commit()  # as the handler does, with the new session
        return "ok"

    results = _race(own_connections, right)
    assert results.count("ok") == 1
    assert set(results) <= {"ok", "code_expired", "too_many_attempts"}
    with own_connections() as s:
        row = s.get(OtpChallenge, challenge)
        assert row is not None
        assert row.consumed_at is not None
        assert row.attempts <= 5
