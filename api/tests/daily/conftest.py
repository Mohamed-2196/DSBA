"""Fixtures for Daily's tests: the feature switched on, and helpers to play."""

from __future__ import annotations

from collections.abc import Callable

import pytest

API = "/api/v1"


@pytest.fixture(autouse=True)
def daily_on(set_feature: Callable[..., None]) -> None:
    """Daily arrives switched off; these tests switch it on for everyone."""
    set_feature("daily", "everyone")
