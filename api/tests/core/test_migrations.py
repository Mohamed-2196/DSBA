"""The baseline migration, checked on a throwaway database: what it seeds and what the database refuses."""

from __future__ import annotations

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


def test_the_baseline_seeds_the_roles_and_every_switch(scratch: tuple[Config, Engine]) -> None:
    cfg, engine = scratch
    command.upgrade(cfg, "head")
    with engine.connect() as c:
        roles = c.execute(text("SELECT slug, name, badge, built_in, locked FROM roles ORDER BY position")).tuples()
        assert roles.all() == [
            ("admin", "Admin", "Admin", True, True),
            ("rep", "Rep", "Student rep", True, False),
            ("student", "Student", None, True, False),
            ("newsletter-manager", "Newsletter manager", "Newsletter", False, False),
            ("content-manager", "Content manager", "Content", False, False),
        ]
        boxes = c.execute(
            text(
                "SELECT r.slug, string_agg(b.box, ',' ORDER BY b.box) FROM roles r "
                "LEFT JOIN role_boxes b ON b.role_id = r.id GROUP BY r.slug"
            )
        ).tuples()
        assert dict(boxes.all()) == {
            "admin": None,
            "content-manager": "calendar.manage,career.edit",
            "newsletter-manager": "newsletter.manage",
            "rep": "calendar.manage,forum.moderate,library.manage,newsletter.manage,requests.manage,stats.view",
            "student": "forum.post,library.upload,newsletter.react,reports.create",
        }
        switches = dict(c.execute(text("SELECT feature, mode FROM feature_switches")).tuples().all())
        features = ("forum", "library", "library.uploads", "newsletter", "calendar", "career", "grades", "noora")
        assert switches == dict.fromkeys(features, "everyone") | {"notes": "off", "board": "off", "requests": "off"}


def test_the_database_refuses_what_the_contract_does_not_list(scratch: tuple[Config, Engine]) -> None:
    """Kinds, types, reasons, cohorts and switch modes are checked by the database itself (code quality review
    CQ-15), and a report is open unless it says otherwise."""
    cfg, engine = scratch
    command.upgrade(cfg, "head")
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
        "ck_feature_switches_mode": "UPDATE feature_switches SET mode = 'maybe' WHERE feature = 'forum'",
    }
    for constraint, statement in refused.items():
        with pytest.raises(IntegrityError, match=constraint), engine.begin() as c:
            c.execute(text(statement), ids)
