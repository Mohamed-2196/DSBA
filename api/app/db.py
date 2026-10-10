"""Database engine and sessions (SQLAlchemy 2, psycopg 3, synchronous)."""

from __future__ import annotations

from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings

# Every connection works in UTC, whatever the server's default (timestamps come back as UTC, and SQL that reads the
# session's time zone agrees with app.core.time.utcnow()). "Today in Bahrain" is computed explicitly.
CONNECT_ARGS = {"options": "-c timezone=UTC"}


@lru_cache
def get_engine() -> Engine:
    return create_engine(
        get_settings().database_url, pool_pre_ping=True, pool_size=10, max_overflow=10, connect_args=CONNECT_ARGS
    )


@lru_cache
def get_sessionmaker() -> sessionmaker[Session]:
    return sessionmaker(bind=get_engine(), autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """FastAPI dependency: one session per request. Handlers commit explicitly; anything uncommitted is rolled back."""
    db = get_sessionmaker()()
    try:
        yield db
    finally:
        db.close()
