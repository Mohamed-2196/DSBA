"""Drift checks (code-quality review CQ-7): the migrations build exactly the schema the models describe, every
migration can be undone, and api/openapi.json (the web app's contract) is what the app serves."""

from __future__ import annotations

import json
import uuid
from pathlib import Path

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.engine import make_url

from app.main import create_app
from app.models import Base
from tests.conftest import ADMIN_URL

API_ROOT = Path(__file__).resolve().parents[2]


def test_the_migrations_build_the_models_schema(engine: Engine) -> None:
    """What `alembic check` does: the test database was migrated to head, so nothing may be left to generate."""
    with engine.connect() as conn:
        diff = compare_metadata(MigrationContext.configure(conn, opts={"compare_type": True}), Base.metadata)
    assert diff == [], "the models and the migrations differ: write a migration (alembic revision --autogenerate)"


def test_every_migration_can_be_undone_and_redone() -> None:
    name = f"dsba_drift_{uuid.uuid4().hex[:10]}"
    admin = create_engine(ADMIN_URL, isolation_level="AUTOCOMMIT")
    with admin.connect() as c:
        c.execute(text(f'CREATE DATABASE "{name}"'))
    try:
        cfg = Config(str(API_ROOT / "alembic.ini"))
        cfg.set_main_option("script_location", str(API_ROOT / "migrations"))
        cfg.attributes["database_url"] = make_url(ADMIN_URL).set(database=name).render_as_string(hide_password=False)
        cfg.attributes["configure_logger"] = False
        command.upgrade(cfg, "head")
        command.downgrade(cfg, "base")
        command.upgrade(cfg, "head")
    finally:
        with admin.connect() as c:
            c.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
        admin.dispose()


def test_openapi_json_is_what_the_app_serves() -> None:
    committed = json.loads((API_ROOT / "openapi.json").read_text(encoding="utf-8"))
    assert create_app().openapi() == committed, (
        "api/openapi.json is out of date: cd api && uv run --no-sync python -m app.cli openapi > openapi.json "
        "&& cd ../web && npm run api:types"
    )
