"""The migrations, checked on a throwaway database: what the baseline seeds and what the database refuses."""

from __future__ import annotations

import importlib.util
import json
import uuid
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any

import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import Connection, Engine, create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError

from app.schemas.career import CareerDoc
from app.seed.loader import read
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


def _before(cfg: Config, revision: str) -> str:
    """The revision that `revision` follows, so a test of one migration holds wherever the chain puts it."""
    down = ScriptDirectory.from_config(cfg).get_revision(revision).down_revision
    assert isinstance(down, str)
    return down


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
        features = ("forum", "library", "library.uploads", "newsletter", "calendar", "career", "grades")
        assert switches == dict.fromkeys(features, "everyone") | {
            "notes": "off",
            "board": "off",
            "board.plan": "off",
            "requests": "off",
            "forum.anonymous": "off",
            "forum.follow": "off",
            "newsletter.polls": "off",
            "career.seniors": "off",
            "noora": "off",
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


def test_mini_noora_and_the_daily_puzzles_are_switched_off_whatever_they_were(scratch: tuple[Config, Engine]) -> None:
    """0058 switches them off, roles dropped, on an install where they were on; the switches next to them stay as
    they were; going back gives Mini Noora her first setting and leaves the other two off."""
    cfg, engine = scratch
    command.upgrade(cfg, _before(cfg, "0058"))
    admin = uuid.uuid4()
    with engine.begin() as c:
        c.execute(text("INSERT INTO users (id, email) VALUES (:id, 'admin@example.com')"), {"id": admin})
        c.execute(
            text(
                "UPDATE feature_switches SET mode = 'everyone', updated_by = :id WHERE feature IN ('noora.ai', 'daily')"
            ),
            {"id": admin},
        )
        c.execute(
            text("UPDATE feature_switches SET mode = 'roles', updated_by = :id WHERE feature = 'noora'"), {"id": admin}
        )
        c.execute(
            text("INSERT INTO feature_switch_roles (feature, role_id) SELECT 'noora', id FROM roles WHERE slug = 'rep'")
        )
        c.execute(text("UPDATE feature_switches SET mode = 'everyone' WHERE feature = 'library.daily-question'"))
    command.upgrade(cfg, "0058")
    with engine.connect() as c:
        for feature in ("noora", "noora.ai", "daily"):
            assert _switch(c, feature) == ("off", None, [])
        kept = _switch(c, "library.daily-question")
        assert kept is not None
        assert kept[0] == "everyone"
    command.downgrade(cfg, _before(cfg, "0058"))
    with engine.connect() as c:
        assert _switch(c, "noora") == ("everyone", None, [])
        assert _switch(c, "noora.ai") == ("off", None, [])
        assert _switch(c, "daily") == ("off", None, [])


def test_time_stamps_are_switched_off_whatever_they_were(scratch: tuple[Config, Engine]) -> None:
    """0059 switches time stamps off, roles dropped, on an install where an admin had switched them on (no migration
    stores this switch); the switch next to them stays as it was; going back leaves them off."""
    cfg, engine = scratch
    command.upgrade(cfg, _before(cfg, "0059"))
    admin = uuid.uuid4()
    with engine.begin() as c:
        c.execute(text("INSERT INTO users (id, email) VALUES (:id, 'admin@example.com')"), {"id": admin})
        c.execute(
            text(
                "INSERT INTO feature_switches (feature, mode, updated_by, updated_at) "
                "VALUES ('modules.time-stamps', 'roles', :id, now())"
            ),
            {"id": admin},
        )
        c.execute(
            text(
                "INSERT INTO feature_switch_roles (feature, role_id) "
                "SELECT 'modules.time-stamps', id FROM roles WHERE slug = 'rep'"
            )
        )
        c.execute(text("UPDATE feature_switches SET mode = 'everyone' WHERE feature = 'modules.video-suggestions'"))
    command.upgrade(cfg, "0059")
    with engine.connect() as c:
        assert _switch(c, "modules.time-stamps") == ("off", None, [])
        kept = _switch(c, "modules.video-suggestions")
        assert kept is not None
        assert kept[0] == "everyone"
    command.downgrade(cfg, _before(cfg, "0059"))
    with engine.connect() as c:
        assert _switch(c, "modules.time-stamps") == ("off", None, [])


def test_plan_my_revision_is_stored_off_and_its_plans_and_unfinished_cards_go(scratch: tuple[Config, Engine]) -> None:
    """0060 stores the revision plans' switch off, roles dropped, also where a development install had switched every
    feature on, and removes every plan with its cards not done yet (cards done stay, without their plan; other cards
    stay as they were). The boards' own switch stays as it was. Going back removes the switch; the plans stay gone."""
    cfg, engine = scratch
    command.upgrade(cfg, _before(cfg, "0060"))
    ids = {
        "owner": uuid.uuid4(),
        "board": uuid.uuid4(),
        "todo": uuid.uuid4(),
        "done": uuid.uuid4(),
        "plan": uuid.uuid4(),
    }
    with engine.begin() as c:
        c.execute(text("UPDATE feature_switches SET mode = 'everyone' WHERE feature = 'board'"))
        c.execute(
            text(
                "INSERT INTO feature_switches (feature, mode, updated_by, updated_at) "
                "VALUES ('board.plan', 'roles', NULL, now())"
            )
        )
        c.execute(
            text(
                "INSERT INTO feature_switch_roles (feature, role_id) "
                "SELECT 'board.plan', id FROM roles WHERE slug = 'rep'"
            )
        )
        c.execute(text("INSERT INTO users (id, email) VALUES (:owner, 'planner@example.com')"), ids)
        c.execute(
            text(
                "INSERT INTO modules (id, name, short_name, year, description, position) "
                "VALUES ('plan-mod', 'Planned', 'P', 1, '', 1)"
            )
        )
        c.execute(
            text(
                "INSERT INTO boards (id, user_id, name, color, template, position) "
                "VALUES (:board, :owner, 'Exams', 'teal', 'study', 1)"
            ),
            ids,
        )
        c.execute(
            text(
                "INSERT INTO board_columns (id, board_id, name, done, position) VALUES "
                "(:todo, :board, 'To do', false, 1), (:done, :board, 'Done', true, 2)"
            ),
            ids,
        )
        c.execute(
            text(
                "INSERT INTO board_plans (id, user_id, module_id, exam_date, paper_every, board_id) "
                "VALUES (:plan, :owner, 'plan-mod', '2027-01-10', 3, :board)"
            ),
            ids,
        )
        for title, column, plan, done in (
            ("Planned, to do", "todo", True, False),
            ("Planned, done", "done", True, True),
            ("Own card", "todo", False, False),
        ):
            c.execute(
                text(
                    "INSERT INTO board_cards (id, user_id, board_id, column_id, position, title, priority, plan_id, "
                    "done_at) VALUES (gen_random_uuid(), :owner, :board, :column, 1, :title, 'none', :plan, "
                    "CASE WHEN :done THEN now() END)"
                ),
                {**ids, "column": ids[column], "title": title, "plan": ids["plan"] if plan else None, "done": done},
            )
    command.upgrade(cfg, "0060")
    with engine.connect() as c:
        assert _switch(c, "board.plan") == ("off", None, [])
        kept = _switch(c, "board")
        assert kept is not None
        assert kept[0] == "everyone"
        assert c.scalar(text("SELECT count(*) FROM board_plans")) == 0
        cards = c.execute(text("SELECT title, plan_id FROM board_cards ORDER BY title")).tuples().all()
        assert cards == [("Own card", None), ("Planned, done", None)]
    command.downgrade(cfg, _before(cfg, "0060"))
    with engine.connect() as c:
        assert _switch(c, "board.plan") is None


def test_boards_made_from_the_revision_template_become_study_boards_and_keep_their_columns(
    scratch: tuple[Config, Engine],
) -> None:
    """0039 offers five templates: a board made from "revision" keeps its columns and is marked as made from
    Study, and "revision" is refused from then on; going back allows it again."""
    cfg, engine = scratch
    before = _before(cfg, "0039")
    command.upgrade(cfg, before)
    ids = {"owner": uuid.uuid4(), "board": uuid.uuid4()}
    with engine.begin() as c:
        c.execute(text("INSERT INTO users (id, email) VALUES (:owner, 'board.owner@example.com')"), ids)
        c.execute(
            text(
                "INSERT INTO boards (id, user_id, name, color, template, position) "
                "VALUES (:board, :owner, 'Exams', 'teal', 'revision', 1)"
            ),
            ids,
        )
        c.execute(
            text(
                "INSERT INTO board_columns (id, board_id, name, done, position) "
                "VALUES (gen_random_uuid(), :board, 'To revise', false, 1)"
            ),
            ids,
        )
    command.upgrade(cfg, "0039")
    with engine.connect() as c:
        assert c.scalar(text("SELECT template FROM boards WHERE id = :board"), ids) == "study"
        assert c.scalar(text("SELECT name FROM board_columns WHERE board_id = :board"), ids) == "To revise"
    with pytest.raises(IntegrityError, match="ck_boards_template"), engine.begin() as c:
        c.execute(text("UPDATE boards SET template = 'revision' WHERE id = :board"), ids)
    command.downgrade(cfg, before)
    with engine.begin() as c:
        c.execute(text("UPDATE boards SET template = 'revision' WHERE id = :board"), ids)


def test_a_saved_career_document_gets_the_november_recheck_and_keeps_an_editors_own_changes(
    scratch: tuple[Config, Engine],
) -> None:
    """0062 removes Bahrain EDB, adds the four new employers once, fixes the changed entries and the CFA card, and
    lists further study, on a document saved before it; an editor's change to an entry it doesn't touch stays, and the
    version goes up. The result is a valid document."""
    cfg, engine = scratch
    command.upgrade(cfg, _before(cfg, "0062"))
    old = read("career")
    old["checkedOn"] = "2 October 2026"
    old["employers"] = [e for e in old["employers"] if e["id"] not in {"gulf-air", "iga", "sgb", "bcfc"}]
    old["employers"].insert(
        14,
        {
            "id": "bahrain-edb",
            "name": "Bahrain EDB",
            "mono": "EDB",
            "sector": "Public body",
            "offers": [{"type": "graduate", "name": "Graduate Trainee Programme"}],
            "tracks": ["business"],
            "why": "A one-year programme of practical work at the Economic Development Board.",
            "url": "https://www.bahrainedb.com/about-us/career-opportunities/graduate-trainee-programme",
            "cta": "programme",
        },
    )
    old["employers"][0]["why"] = "An editor's own words."
    del old["furtherStudy"]["options"]
    with engine.begin() as c:
        c.execute(
            text("INSERT INTO content_docs (key, data, version) VALUES ('career', CAST(:data AS jsonb), 3)"),
            {"data": json.dumps(old)},
        )
    command.upgrade(cfg, "0062")
    with engine.connect() as c:
        data, version = c.execute(text("SELECT data, version FROM content_docs WHERE key = 'career'")).one()
    doc = CareerDoc.model_validate(data)
    ids = [e.id for e in doc.employers]
    assert "bahrain-edb" not in ids
    assert ids[-4:] == ["gulf-air", "iga", "sgb", "bcfc"]
    assert len(ids) == len(set(ids))
    assert doc.checked_on == "8 November 2026"
    assert doc.employers[0].why == "An editor's own words."
    by_id = {e.id: e for e in doc.employers}
    assert str(by_id["sico"].url) == "https://sicobank.com/internship"
    assert "BIBF" not in by_id["cbb"].why
    assert doc.featured is not None
    assert "taking participants" not in doc.featured.badge
    google = next(x for x in doc.certs if x.id == "google-da")
    assert str(google.url).startswith("https://www.coursera.org/")
    assert doc.further_study is not None
    assert len(doc.further_study.options) == 6
    assert version == 4
    command.downgrade(cfg, _before(cfg, "0062"))
    with engine.connect() as c:
        assert c.scalar(text("SELECT data->>'checkedOn' FROM content_docs WHERE key = 'career'")) == "8 November 2026"


def _career_refresh() -> Callable[[dict[str, Any]], dict[str, Any]]:
    """0062's refresh(), loaded from its file (migration files aren't a package)."""
    path = Path(__file__).parents[2] / "migrations" / "versions" / "20261108_0062_career_refresh.py"
    spec = importlib.util.spec_from_file_location("career_refresh_0062", path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    refresh: Callable[[dict[str, Any]], dict[str, Any]] = module.refresh
    return refresh


def _seed_before_0062() -> dict[str, Any]:
    """The seed as it was before the re-check: EDB in, the four new employers out, the old notes and further study."""
    doc: dict[str, Any] = read("career")
    doc["employers"] = [e for e in doc["employers"] if e["id"] not in {"gulf-air", "iga", "sgb", "bcfc"}]
    doc["employers"].append(
        {
            "id": "bahrain-edb",
            "name": "Bahrain EDB",
            "mono": "EDB",
            "sector": "Public body",
            "offers": [{"type": "graduate", "name": "Graduate Trainee Programme"}],
            "tracks": ["business"],
            "why": "A one-year programme of practical work at the Economic Development Board.",
            "url": "https://www.bahrainedb.com/about-us/career-opportunities/graduate-trainee-programme",
            "cta": "programme",
        }
    )
    doc["employersNote"] = (
        "Every button opens the employer’s own careers or programme page in a new tab. Programmes open and close during the year and each sets its own entry rules, so check the page for current dates. The track tags are our guide to the kind of work, not a list of vacancies. Logos belong to their owners and are shown only to identify each organisation; DSBA Hub is not affiliated with or endorsed by any of them."  # noqa: E501, RUF001
    )
    doc["certNote"] = "Fees, exam dates and entry rules change, so check each official page before you plan around one."
    doc["furtherStudy"] = {
        "title": "Thinking about an MSc instead?",
        "body": "Most courses publish a minimum degree class and may ask about your maths and statistics modules. Check the entry rules early, and keep an eye on your projected class.",  # noqa: E501
        "action": {"to": "/grades", "label": "Open the grade calculator"},
    }
    return doc


def test_the_november_recheck_keeps_an_edited_document_valid_and_an_editors_own_words() -> None:
    """0062 on documents an editor changed: a new employer gets only the tracks the document has, EDB stays while the
    featured card shows its logo, an edited note or further-study text stays, and further study switched off stays
    off. Each result is a valid document, and running it twice changes nothing."""
    refresh = _career_refresh()
    seed = read("career")

    no_quant = _seed_before_0062()
    no_quant["tracks"] = [t for t in no_quant["tracks"] if t["id"] != "quant"]
    for e in no_quant["employers"]:
        e["tracks"] = [t for t in e["tracks"] if t != "quant"]
    out = refresh(no_quant)
    CareerDoc.model_validate(out)
    assert {e["id"]: e["tracks"] for e in out["employers"]}["sgb"] == ["tech"]

    edb_logo = _seed_before_0062()
    edb_logo["featured"]["logo"] = {"kind": "employer", "id": "bahrain-edb"}
    out = refresh(edb_logo)
    CareerDoc.model_validate(out)
    assert "bahrain-edb" in {e["id"] for e in out["employers"]}

    edited = _seed_before_0062()
    edited["certNote"] = "An editor's own note."
    edited["furtherStudy"]["body"] = "An editor's own text."
    out = refresh(edited)
    CareerDoc.model_validate(out)
    assert out["certNote"] == "An editor's own note."
    assert out["employersNote"] == seed["employersNote"]
    assert out["furtherStudy"]["body"] == "An editor's own text."
    assert out["furtherStudy"]["options"] == seed["furtherStudy"]["options"]

    off = _seed_before_0062()
    off["furtherStudy"] = None
    assert refresh(off)["furtherStudy"] is None

    plain = refresh(_seed_before_0062())
    assert plain["furtherStudy"] == seed["furtherStudy"]
    assert plain["certNote"] == seed["certNote"]
    assert refresh(plain) == plain
