"""Fixtures for the notes tests: notes switched on, and a module with lessons."""

from __future__ import annotations

import uuid
from collections.abc import Callable

import pytest
from sqlalchemy.orm import Session

from app.models import Module


@pytest.fixture(autouse=True)
def notes_on(set_feature: Callable[..., None]) -> None:
    """Notes arrive switched off: these tests switch them on for everyone."""
    set_feature("notes", "everyone")


@pytest.fixture
def module(db: Session) -> Module:
    """A module with two chapters: lessons 0:0, 0:1 and 1:0."""
    m = Module(
        id=f"notes-mod-{uuid.uuid4().hex[:6]}",
        unit_code="TS1000",
        name="Test module",
        short_name="Test",
        year=1,
        description="",
        resources={},
        chapters=[
            {"title": "One", "videos": [{"kind": "youtube", "id": "a"}, {"kind": "youtube", "id": "b"}]},
            {"title": "Two", "videos": [{"kind": "youtube", "id": "c"}]},
        ],
    )
    db.add(m)
    db.commit()
    return m
