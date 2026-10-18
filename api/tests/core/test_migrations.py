"""The migrations, checked on a throwaway database: what the baseline seeds and what the database refuses."""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import Connection, Engine, create_engine, text
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


def test_the_baseline_seeds_what_the_api_needs(scratch: tuple[Config, Engine]) -> None:
    """The roles and their boxes, every switch, Mini Noora's limits, and the forum's categories and tags."""
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
            "content-manager": "calendar.manage,career.edit,content.edit,guides.edit",
            "newsletter-manager": "newsletter.manage",
            "rep": (
                "calendar.manage,forum.moderate,guides.edit,library.manage,newsletter.manage,requests.manage,"
                "stats.view,summary.share"
            ),
            "student": "forum.post,library.upload,newsletter.react,reports.create",
        }
        switches = dict(c.execute(text("SELECT feature, mode FROM feature_switches")).tuples().all())
        features = ("forum", "library", "library.uploads", "newsletter", "calendar", "career", "grades", "noora")
        assert switches == dict.fromkeys(features, "everyone") | {
            "notes": "off",
            "board": "off",
            "requests": "off",
            "forum.anonymous": "off",
            "forum.follow": "off",
            "newsletter.polls": "off",
            "career.seniors": "off",
            "noora.ai": "off",
            "library.questions": "off",
            "summary": "off",
            "requests.autoclose": "off",
            "forum.help-below": "off",
            "modules.video-suggestions": "off",
            "library.daily-question": "off",
            "requests.done": "off",
            "daily": "off",
        }
        limits = c.execute(text("SELECT id, daily_questions, monthly_budget_cents FROM noora_limits")).tuples()
        assert limits.all() == [(1, 30, 2500)]
        categories = c.execute(
            text("SELECT id, short, year, icon FROM forum_categories WHERE NOT retired ORDER BY position")
        ).tuples()
        assert categories.all() == [
            ("year-1", "Year 1", 1, None),
            ("year-2", "Year 2", 2, None),
            ("year-3", "Year 3", 3, None),
            ("study-groups", "Study group", None, "people"),
            ("general", "General", None, "chat"),
        ]
        tags = c.execute(text("SELECT id FROM forum_tags WHERE NOT retired ORDER BY position")).scalars()
        assert tags.all() == [
            "exam-prep",
            "past-papers",
            "coursework",
            "formula-sheet",
            "r",
            "python",
            "excel",
            "exams",
            "calculators",
            "module-choice",
            "campus",
            "lost-and-found",
        ]


def test_the_database_refuses_what_the_contract_does_not_list(scratch: tuple[Config, Engine]) -> None:
    """Kinds, types, reasons, cohorts and switch modes are checked by the database itself, and a report is open
    unless it says otherwise."""
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
    paper = (
        "INSERT INTO library_items (id, slug, source, kind, title, status, exam_year, exam_session, zone) "
        "VALUES (gen_random_uuid(), 'a-paper', 'file', 'past-paper', 'A paper', 'published', "
    )
    request = "INSERT INTO requests (id, kind, title, exam_year, zone) VALUES (gen_random_uuid(), 'paper', 'A paper', "
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
        # a sitting: an exam year from 1990 to 2100, the May or October session, zone A, B or RTC
        "ck_library_items_exam_year_range": f"{paper}1989, 'may', 'A')",
        "ck_library_items_exam_session": f"{paper}2024, 'june', 'A')",
        "ck_library_items_zone": f"{paper}2024, 'may', 'C')",
        "ck_requests_exam_year_range": f"{request}2101, 'B')",
        "ck_requests_zone": f"{request}2024, 'ZA')",
        "ck_users_zone": "UPDATE users SET zone = 'C' WHERE id = :user",
    }
    for constraint, statement in refused.items():
        with pytest.raises(IntegrityError, match=constraint), engine.begin() as c:
            c.execute(text(statement), ids)


def _switch(c: Connection, feature: str) -> tuple[str, uuid.UUID | None, list[str]] | None:
    """A switch's mode, who last set it, and the roles it is on for; None when there is no such switch."""
    row = c.execute(text("SELECT mode, updated_by FROM feature_switches WHERE feature = :f"), {"f": feature}).first()
    if row is None:
        return None
    roles = c.execute(
        text(
            "SELECT r.slug FROM feature_switch_roles s JOIN roles r ON r.id = s.role_id WHERE s.feature = :f "
            "ORDER BY r.slug"
        ),
        {"f": feature},
    ).scalars()
    return row.mode, row.updated_by, list(roles)


def test_the_suggested_videos_switch_keeps_its_mode_and_roles_under_its_name(scratch: tuple[Config, Engine]) -> None:
    """0034 names the switch like the others, modules.video-suggestions, and keeps what an admin set; going back
    gives it its earlier name with the same setting."""
    cfg, engine = scratch
    command.upgrade(cfg, "0033")
    admin = uuid.uuid4()
    with engine.begin() as c:
        c.execute(text("INSERT INTO users (id, email) VALUES (:id, 'admin@example.com')"), {"id": admin})
        c.execute(
            text("UPDATE feature_switches SET mode = 'roles', updated_by = :id WHERE feature = 'video_suggestions'"),
            {"id": admin},
        )
        c.execute(
            text(
                "INSERT INTO feature_switch_roles (feature, role_id) "
                "SELECT 'video_suggestions', id FROM roles WHERE slug IN ('content-manager', 'rep')"
            )
        )
    set_by_admin = ("roles", admin, ["content-manager", "rep"])
    command.upgrade(cfg, "0034")
    with engine.connect() as c:
        assert _switch(c, "modules.video-suggestions") == set_by_admin
        assert _switch(c, "video_suggestions") is None
    command.downgrade(cfg, "0033")
    with engine.connect() as c:
        assert _switch(c, "video_suggestions") == set_by_admin
        assert _switch(c, "modules.video-suggestions") is None
