"""Turning lesson progress off: nothing new is saved, and what was saved before is kept but hidden until the person
turns it on again."""

from __future__ import annotations

from collections.abc import Callable

from fastapi.testclient import TestClient

from app.models import Module, User
from tests.board.conftest import API
from tests.lessons import lesson_id

ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]


def test_progress_off_hides_what_was_recorded_and_on_brings_it_back(
    client_for: ClientFor, make_user: MakeUser, module: Module
) -> None:
    c = client_for(make_user(tracks=True))
    lesson = lesson_id(module, 0, 0)
    assert c.put(f"{API}/me/progress/lessons/{lesson}", json={"watched": True}).status_code == 200
    assert c.put(f"{API}/me/progress/resume", json={"lessonId": lesson}).status_code == 200
    assert c.patch(f"{API}/me", json={"preferences": {"trackProgress": False}}).status_code == 200
    # Off: new marks are refused, and the old ones aren't served.
    assert c.put(f"{API}/me/progress/lessons/{lesson_id(module, 0, 1)}", json={"watched": True}).status_code == 409
    assert c.get(f"{API}/me/progress").json() == {"watched": {}, "last": {}}
    # A card for the lesson doesn't jump to Done on hidden progress.
    card = c.post(f"{API}/board-cards", json={"link": {"type": "lesson", "id": lesson}})
    assert card.status_code == 201, card.text
    assert card.json()["doneAt"] is None
    # The export still holds everything stored about the person.
    assert lesson in c.get(f"{API}/me/export").json()["progress"]["watched"]
    # On again: it comes back.
    assert c.patch(f"{API}/me", json={"preferences": {"trackProgress": True}}).status_code == 200
    progress = c.get(f"{API}/me/progress").json()
    assert lesson in progress["watched"]
    assert progress["last"][module.id]["lessonId"] == lesson
