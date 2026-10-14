"""Fixtures for the notes tests: notes switched on, and a module with lessons."""

from __future__ import annotations

import uuid
from collections.abc import Callable

import pytest
from sqlalchemy.orm import Session

from app.models import Module
from tests.lessons import chapters


@pytest.fixture(autouse=True)
def notes_on(set_feature: Callable[..., None]) -> None:
    """Notes arrive switched off: these tests switch them on for everyone."""
    set_feature("notes", "everyone")


@pytest.fixture
def module(db: Session) -> Module:
    """A module with two chapters: lessons 0:0, 0:1 and 1:0."""
    m_id = f"notes-mod-{uuid.uuid4().hex[:6]}"
    m = Module(
        id=m_id,
        unit_code="TS1000",
        name="Test module",
        short_name="Test",
        year=1,
        description="",
        resources={},
        chapters=chapters(
            m_id,
            [
                {
                    "title": "One",
                    "videos": [{"kind": "youtube", "video_id": "a"}, {"kind": "youtube", "video_id": "b"}],
                },
                {"title": "Two", "videos": [{"kind": "youtube", "video_id": "c"}]},
            ],
        ),
    )
    db.add(m)
    db.commit()
    return m
