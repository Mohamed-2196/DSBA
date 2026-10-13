"""Migrations that move data, checked on a throwaway database: what 0003 does to the email switches (decision D1)."""

from __future__ import annotations

import json
import uuid
from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError

from tests.conftest import ADMIN_URL

API_ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def scratch() -> Iterator[tuple[Config, Engine]]:
    name = f"dsba_migrate_{uuid.uuid4().hex[:10]}"
    admin = create_engine(ADMIN_URL, isolation_level="AUTOCOMMIT")
    with admin.connect() as c:
        c.execute(text(f'CREATE DATABASE "{name}"'))
    url = make_url(ADMIN_URL).set(database=name).render_as_string(hide_password=False)
    cfg = Config(str(API_ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(API_ROOT / "migrations"))
    cfg.attributes["database_url"] = url
    cfg.attributes["configure_logger"] = False
    engine = create_engine(url)
    try:
        yield cfg, engine
    finally:
        engine.dispose()
        with admin.connect() as c:
            c.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
        admin.dispose()


def _preferences(engine: Engine) -> dict[str, dict[str, bool]]:
    with engine.connect() as c:
        rows = c.execute(text("SELECT email, preferences FROM users")).tuples()
        return dict(rows.all())


def test_0003_gives_each_kind_of_email_its_own_switch(scratch: tuple[Config, Engine]) -> None:
    cfg, engine = scratch
    command.upgrade(cfg, "0002")
    before = {
        "all-on@example.com": {},
        "no-replies@example.com": {"email_notifications": False},
        "no-issues@example.com": {"newsletterEmails": False, "theme": True},
        "nothing@example.com": {"emailNotifications": False, "newsletter_emails": False},
        "explicit-on@example.com": {"email_notifications": True, "newsletter_emails": True},
    }
    with engine.begin() as c:
        for email, prefs in before.items():
            c.execute(
                text("INSERT INTO users (id, email, preferences) VALUES (:id, :email, CAST(:prefs AS jsonb))"),
                {"id": uuid.uuid4(), "email": email, "prefs": json.dumps(prefs)},
            )
    command.upgrade(cfg, "0003")
    off = {"email_replies": False, "email_answer_accepted": False, "email_upload_reviews": False}
    assert _preferences(engine) == {
        "all-on@example.com": {},
        "no-replies@example.com": off,
        "no-issues@example.com": {"theme": True, "email_new_issues": False},
        "nothing@example.com": {**off, "email_new_issues": False},
        "explicit-on@example.com": {},  # on is the default: nothing to store
    }
    command.downgrade(cfg, "0002")
    assert _preferences(engine) == {
        "all-on@example.com": {},
        "no-replies@example.com": {"email_notifications": False},
        "no-issues@example.com": {"theme": True, "newsletter_emails": False},
        "nothing@example.com": {"email_notifications": False, "newsletter_emails": False},
        "explicit-on@example.com": {},
    }


def test_0004_turns_the_deletion_marker_into_deleted_at(scratch: tuple[Config, Engine]) -> None:
    cfg, engine = scratch
    command.upgrade(cfg, "0003")
    rows = {
        "kept": ("visible", "Text"),
        "hidden-deleted": ("hidden", " "),
        "hidden": ("hidden", "Hidden text"),
        "deleted": ("deleted", ""),
    }
    with engine.begin() as c:
        for slug, (status, body) in rows.items():
            c.execute(
                text(
                    "INSERT INTO forum_threads (id, slug, title, body, category, status) "
                    "VALUES (:id, :slug, :slug, :body, 'general', :status)"
                ),
                {"id": uuid.uuid4(), "slug": slug, "body": body, "status": status},
            )
    command.upgrade(cfg, "0004")
    with engine.connect() as c:
        after = {
            slug: (status, body, deleted_at is not None)
            for slug, status, body, deleted_at in c.execute(
                text("SELECT slug, status, body, deleted_at FROM forum_threads")
            ).tuples()
        }
    assert after == {
        "kept": ("visible", "Text", False),
        "hidden-deleted": ("hidden", "", True),  # hidden, and its text deleted: unhiding gives a deleted thread
        "hidden": ("hidden", "Hidden text", False),
        "deleted": ("deleted", "", True),
    }
    command.downgrade(cfg, "0003")
    with engine.connect() as c:
        bodies = dict(c.execute(text("SELECT slug, body FROM forum_threads")).tuples().all())
    assert bodies["hidden-deleted"] == " "


def test_0006_has_the_database_check_kinds_types_reasons_and_cohorts(scratch: tuple[Config, Engine]) -> None:
    """Code quality review CQ-15: values the contract doesn't list, and cohorts outside 1-3, are refused by the
    database itself; a report is open unless it says otherwise. Undone by the downgrade."""
    cfg, engine = scratch
    command.upgrade(cfg, "0006")
    ids = {"thread": uuid.uuid4(), "user": uuid.uuid4()}
    with engine.begin() as c:
        c.execute(text("INSERT INTO users (id, email) VALUES (:user, 'reporter@example.com')"), ids)
        c.execute(
            text(
                "INSERT INTO forum_threads (id, slug, title, body, category, status) "
                "VALUES (:thread, 'a-thread', 'A thread', 'Text', 'general', 'visible')"
            ),
            ids,
        )
        c.execute(
            text(
                "INSERT INTO reports (id, reporter_id, target_type, target_id, reason) "
                "VALUES (gen_random_uuid(), :user, 'thread', :thread, 'spam')"
            ),
            ids,
        )
        assert c.execute(text("SELECT status FROM reports")).scalar_one() == "open"

    library = "INSERT INTO library_items (id, slug, source, kind, title, status, year) VALUES (gen_random_uuid(), "
    report = "INSERT INTO reports (id, reporter_id, target_type, target_id, reason, status) VALUES (gen_random_uuid(), "
    refused = {
        "ck_library_items_kind": f"{library}'novel', 'file', 'novel', 'A novel', 'pending', NULL)",
        "ck_library_items_year_range": f"{library}'year-4', 'file', 'notes', 'Notes', 'pending', 4)",
        "ck_calendar_events_type": "INSERT INTO calendar_events (id, date, title, type) "
        "VALUES ('a-party', '2026-10-13', 'A party', 'party')",
        "ck_reports_target_type": f"{report}:user, 'post', :thread, 'spam', 'dismissed')",
        "ck_reports_reason": f"{report}:user, 'thread', :thread, 'boring', 'dismissed')",
        "ck_forum_threads_author_year_range": "INSERT INTO forum_threads "
        "(id, slug, title, body, category, status, author_year) "
        "VALUES (gen_random_uuid(), 'year-0', 'Year 0', 'Text', 'general', 'visible', 0)",
        "ck_forum_replies_author_year_range": "INSERT INTO forum_replies (id, thread_id, body, status, author_year) "
        "VALUES (gen_random_uuid(), :thread, 'Text', 'visible', 9)",
    }
    for constraint, statement in refused.items():
        with pytest.raises(IntegrityError, match=constraint), engine.begin() as c:
            c.execute(text(statement), ids)

    command.downgrade(cfg, "0005")
    with engine.begin() as c:  # undone: the same rows go in
        for statement in refused.values():
            c.execute(text(statement), ids)
    with pytest.raises(IntegrityError, match="status"), engine.begin() as c:  # and a report needs its status again
        c.execute(
            text(
                "INSERT INTO reports (id, reporter_id, target_type, target_id, reason) "
                "VALUES (gen_random_uuid(), :user, 'thread', :thread, 'other')"
            ),
            ids,
        )
