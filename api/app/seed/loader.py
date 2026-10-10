"""Loads the reference content (exported from the prototype into app/seed/data/*.json). Owner: content agent.

Idempotent: running it again adds what is missing and never overwrites what moderators changed through the API
(modules are the exception: they have no editing API, so the seed is their source of truth)."""

from __future__ import annotations

from sqlalchemy.orm import Session


def load_all(db: Session, only: str | None = None) -> dict[str, int]:
    """-> {section: rows inserted or updated}. Sections: modules, calendar, newsletter, career, library."""
    raise NotImplementedError
