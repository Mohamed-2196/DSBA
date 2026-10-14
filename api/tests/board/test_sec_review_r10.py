"""Security review, rounds 5 to 9 (docs/reviews/security.md). Each test passes while its finding is real: fixing
the finding makes it fail, and then it should be turned around into a regression test."""

from __future__ import annotations

from collections.abc import Callable

from fastapi.testclient import TestClient

from app.models import Module, User
from tests.board.conftest import API
from tests.lessons import lesson_id

ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]


def test_sec32_turning_progress_off_keeps_and_still_serves_what_was_recorded(
    client_for: ClientFor, make_user: MakeUser, module: Module
) -> None:
    """Account says "Off: nothing about what you watch is saved", but turning it off deletes nothing."""
    c = client_for(make_user(tracks=True))
    lesson = lesson_id(module, 0, 0)
    assert c.put(f"{API}/me/progress/lessons/{lesson}", json={"watched": True}).status_code == 200
    assert c.patch(f"{API}/me", json={"preferences": {"trackProgress": False}}).status_code == 200
    # Off: new marks are refused...
    assert c.put(f"{API}/me/progress/lessons/{lesson_id(module, 0, 1)}", json={"watched": True}).status_code == 409
    # ...but the old ones are still kept, and still served.
    progress = c.get(f"{API}/me/progress").json()
    assert lesson in progress["watched"]
