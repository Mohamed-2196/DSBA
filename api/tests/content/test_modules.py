"""The module catalogue (GET /modules and /modules/{id}): order, cohorts, lesson and library counts."""

from __future__ import annotations

from collections.abc import Callable

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import ItemSource, ItemStatus, LibraryItem, Module
from app.seed.loader import read
from tests.content.conftest import API

Clients = Callable[..., TestClient]


def _item(slug: str, module_id: str, status: ItemStatus) -> LibraryItem:
    return LibraryItem(
        slug=slug,
        source=ItemSource.link,
        kind="notes",
        title=slug,
        module_id=module_id,
        url=f"https://drive.example.com/{slug}",
        status=status,
    )


def test_the_catalogue_in_programme_order(client_for: Clients, modules: dict[str, Module]) -> None:
    guest = client_for()
    every = guest.get(f"{API}/modules").json()
    expected = sorted(read("modules"), key=lambda m: (m.get("position", 0), m["id"]))
    assert [m["id"] for m in every] == [m["id"] for m in expected]
    for year in (1, 2, 3):
        ids = [m["id"] for m in guest.get(f"{API}/modules", params={"year": year}).json()]
        assert ids == [m["id"] for m in expected if m["year"] == year]
    assert guest.get(f"{API}/modules", params={"year": 4}).status_code == 422


def test_a_module_with_its_lessons_and_published_files(
    client_for: Clients, modules: dict[str, Module], db: Session
) -> None:
    spec = next(m for m in read("modules") if m.get("chapters"))
    db.add_all(
        [
            _item("published-a", spec["id"], ItemStatus.published),
            _item("published-b", spec["id"], ItemStatus.published),
            _item("pending", spec["id"], ItemStatus.pending),
            _item("removed", spec["id"], ItemStatus.removed),
        ]
    )
    db.commit()
    guest = client_for()
    detail = guest.get(f"{API}/modules/{spec['id']}").json()
    assert (detail["id"], detail["name"], detail["year"]) == (spec["id"], spec["name"], spec["year"])
    assert detail["libraryCount"] == 2  # published only
    assert detail["chapterCount"] == len(spec["chapters"]) == len(detail["chapters"])
    assert detail["lessonCount"] == sum(len(c.get("videos", [])) for c in spec["chapters"])
    summary = next(m for m in guest.get(f"{API}/modules").json() if m["id"] == spec["id"])
    assert summary == {k: v for k, v in detail.items() if k not in ("resources", "chapters")}
    r = guest.get(f"{API}/modules/no-such-module")
    assert (r.status_code, r.json()["error"]["message"]) == (404, "This module doesn't exist.")
