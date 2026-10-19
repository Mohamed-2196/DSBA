"""The module catalogue (GET /modules and /modules/{id}): order, cohorts, lesson and library counts."""

from __future__ import annotations

from collections.abc import Callable

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.time import utcnow
from app.models import ItemSource, ItemStatus, LibraryItem, Module, User
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


def test_the_choices_inside_a_year_are_the_grade_rules_and_need_no_calculator(
    client_for: Clients, modules: dict[str, Module], set_feature: Callable[..., None]
) -> None:
    """Your papers' Year 2 option and electives, and how many to pick, as the grades calculator's rules have them;
    served while the calculator is switched off too."""
    set_feature("grades", "off")
    r = client_for().get(f"{API}/modules/choices")
    assert r.status_code == 200, r.text
    assert [(c["kind"], c["year"], c["pick"], [o["id"] for o in c["options"]]) for c in r.json()] == [
        ("option", 2, 1, ["econometrics", "information-systems", "abstract-maths"]),
        ("electives", 3, 2, ["microeconomics", "asset-pricing", "marketing-management", "further-maths-economists"]),
    ]
    assert r.json()[0]["options"][2] == {"id": "abstract-maths", "moduleId": None, "label": "Abstract Mathematics"}


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
    assert summary == {k: v for k, v in detail.items() if k not in ("shelves", "chapters")}
    r = guest.get(f"{API}/modules/no-such-module")
    assert (r.status_code, r.json()["error"]["message"]) == (404, "This module doesn't exist.")


def test_library_counts_follow_the_library_switch(
    client_for: Clients,
    modules: dict[str, Module],
    db: Session,
    set_feature: Callable[..., None],
    make_user: Callable[..., User],
) -> None:
    """With the library off, a module's library count is None for whoever can't see the library."""
    spec = next(m for m in read("modules") if m.get("chapters"))
    db.add(_item("published-a", spec["id"], ItemStatus.published))
    db.commit()
    set_feature("library", "off")
    guest = client_for()
    assert guest.get(f"{API}/modules/{spec['id']}").json()["libraryCount"] is None
    assert {m["libraryCount"] for m in guest.get(f"{API}/modules").json()} == {None}
    boss = client_for(make_user(name="Head Admin", roles=("student", "admin")))
    assert boss.get(f"{API}/modules/{spec['id']}").json()["libraryCount"] == 1  # admins see every feature


def test_the_module_count_the_shelves_and_the_list_agree(
    client_for: Clients, modules: dict[str, Module], db: Session
) -> None:
    """Student test ST-34: a second copy of a file (the same bytes) is counted nowhere, and a link counts
    everywhere, so the Files tab's number, its shelves and the module's library list say the same."""
    spec = next(m for m in read("modules") if m.get("chapters"))

    def paper(slug: str, digest: str | None, kind: str = "past-paper") -> LibraryItem:
        return LibraryItem(
            slug=slug,
            source=ItemSource.file,
            kind=kind,
            title=slug,
            module_id=spec["id"],
            storage_key=f"library/{slug}.pdf",
            file_name=f"{slug}.pdf",
            content_type="application/pdf",
            size_bytes=10,
            content_hash=digest,
            status=ItemStatus.published,
            published_at=utcnow(),
        )

    db.add(paper("first-copy", "abc"))
    db.commit()
    db.add_all(
        [
            paper("second-copy", "abc"),  # the same bytes, added later: a duplicate
            paper("odd-one", None, kind="other"),
            _item("notes-link", spec["id"], ItemStatus.published),
        ]
    )
    db.commit()
    guest = client_for()
    detail = guest.get(f"{API}/modules/{spec['id']}").json()
    listed = guest.get(f"{API}/library/items", params={"module_id": spec["id"]}).json()
    shelves = {s["kind"]: s["files"] for s in detail["shelves"]}
    assert shelves == {"past-paper": 1, "notes": 1, "other": 1}
    assert detail["libraryCount"] == listed["total"] == sum(shelves.values()) == 3
    summary = next(m for m in guest.get(f"{API}/modules").json() if m["id"] == spec["id"])
    assert summary["libraryCount"] == 3


def test_the_same_file_in_two_modules_is_listed_in_both(
    client_for: Clients, modules: dict[str, Module], db: Session
) -> None:
    """Student test ST-46: a textbook shared in one module and again in another shows in each module; a second
    copy counts as a duplicate only within the same module."""
    first, second = [m for m in read("modules") if m.get("chapters")][:2]

    def book(slug: str, module_id: str) -> LibraryItem:
        return LibraryItem(
            slug=slug,
            source=ItemSource.file,
            kind="notes",
            title=slug,
            module_id=module_id,
            storage_key=f"library/{slug}.pdf",
            file_name=f"{slug}.pdf",
            content_type="application/pdf",
            size_bytes=10,
            content_hash="same-bytes",
            status=ItemStatus.published,
            published_at=utcnow(),
        )

    db.add(book("textbook-first", first["id"]))
    db.commit()
    db.add_all([book("textbook-second", second["id"]), book("textbook-again", first["id"])])
    db.commit()
    guest = client_for()
    for module, slugs in ((first, {"textbook-first"}), (second, {"textbook-second"})):
        listed = guest.get(f"{API}/library/items", params={"module_id": module["id"]}).json()
        assert {i["slug"] for i in listed["items"]} == slugs
