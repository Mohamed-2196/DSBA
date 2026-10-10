"""Fixtures for the forum and reports tests: a few modules and three people (helpers are in helpers.py)."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import pytest
from sqlalchemy.orm import Session

from app.models import Module, Role, User


@pytest.fixture
def modules(db: Session) -> dict[str, Module]:
    rows = [
        Module(id="mathematics", unit_code="MT1186", name="Mathematics 1", short_name="Maths", year=1, position=1),
        Module(
            id="advanced-stats-distribution",
            unit_code="ST2133",
            name="Advanced statistics: distribution theory",
            short_name="Distribution theory",
            year=2,
            position=2,
        ),
        Module(
            id="programming-data-science",
            unit_code="ST2195",
            name="Programming for data science",
            short_name="Programming",
            year=2,
            position=3,
        ),
        Module(id="machine-learning", unit_code=None, name="Machine learning", short_name="ML", year=3, position=4),
    ]
    db.add_all(rows)
    db.commit()
    return {m.id: m for m in rows}


@pytest.fixture
def student(make_user: Callable[..., Any]) -> User:
    user: User = make_user(name="Sara M.", year=2)
    return user


@pytest.fixture
def classmate(make_user: Callable[..., Any]) -> User:
    user: User = make_user(name="Ebrahim D.", year=2)
    return user


@pytest.fixture
def moderator(make_user: Callable[..., Any]) -> User:
    user: User = make_user(name="Student Rep", role=Role.moderator, year=3)
    return user
