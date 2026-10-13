"""Fixtures for the study board's tests: the board switched on, a module with lessons and a calendar date."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import date

import pytest
from sqlalchemy.orm import Session

from app.models import CalendarEvent, Module

API = "/api/v1"


@pytest.fixture(autouse=True)
def board_on(set_feature: Callable[..., None]) -> None:
    """The board arrives switched off; these tests switch it on for everyone unless they say otherwise."""
    set_feature("board", "everyone")


@pytest.fixture
def module(db: Session) -> Module:
    """Lessons <id>:0:0 ("Limits"), <id>:0:1 (no title) and <id>:1:0."""
    m = Module(
        id=f"board-mod-{uuid.uuid4().hex[:6]}",
        unit_code="TS1000",
        name="Test module",
        short_name="Test",
        year=1,
        description="",
        resources={},
        chapters=[
            {
                "title": "One",
                "videos": [{"kind": "youtube", "id": "a", "title": "Limits"}, {"kind": "youtube", "id": "b"}],
            },
            {"title": "Two", "videos": [{"kind": "youtube", "id": "c"}]},
        ],
    )
    db.add(m)
    db.commit()
    return m


@pytest.fixture
def event(db: Session) -> CalendarEvent:
    e = CalendarEvent(
        id=f"2026-11-0{uuid.uuid4().int % 9 + 1}-coursework",
        title="Coursework due",
        type="deadline",
        date=date(2026, 11, 2),
    )
    db.add(e)
    db.commit()
    return e
