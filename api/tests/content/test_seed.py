"""The seed loader. Expectations come from the seed files themselves (code quality review CQ-7): a rep's request to
add a date or fix a title changes the data, never these tests. What is tested is how the files are loaded: once,
completely, and never over what moderators changed since."""

from __future__ import annotations

import datetime as dt
from collections import Counter
from collections.abc import Callable
from typing import Any, get_args

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.text import slugify
from app.models import (
    CalendarEvent,
    ContentDoc,
    IssueStatus,
    ItemSource,
    ItemStatus,
    LibraryItem,
    Module,
    NewsletterIssue,
    User,
)
from app.schemas.calendar import EventType
from app.schemas.career import CareerDoc
from app.schemas.newsletter import IssueCover, IssueSection
from app.seed.loader import load_all, module_links, read, seed_issue
from app.services.library import REFERENCE_PUBLISHED_AT
from tests.content.conftest import API

Clients = Callable[..., TestClient]


def count(db: Session, model: type) -> int:
    return db.scalar(select(func.count()).select_from(model)) or 0


def expected_links() -> int:
    return sum(len(list(module_links(m))) for m in read("modules"))


def first_load(db: Session) -> dict[str, int]:
    report = load_all(db)
    db.commit()
    return report


# ── the files ────────────────────────────────────────────────────────────────────────────────


def test_the_seed_files_hold_together() -> None:
    """What the loader relies on, checked on the files (no database)."""
    modules = read("modules")
    module_ids = [m["id"] for m in modules]
    assert len(set(module_ids)) == len(module_ids)
    assert all(m["year"] in (1, 2, 3) for m in modules)

    events = read("calendar")
    event_ids = [e["id"] for e in events]
    assert len(set(event_ids)) == len(event_ids)
    for e in events:
        assert e["type"] in get_args(EventType), e["id"]
        assert e.get("moduleId") in (None, *module_ids), e["id"]
        start = dt.date.fromisoformat(e["date"])
        assert e.get("endDate") is None or dt.date.fromisoformat(e["endDate"]) >= start, e["id"]

    issues = read("newsletter")
    assert len({i["slug"] for i in issues}) == len(issues)
    for raw in issues:
        body = seed_issue(raw)  # fits the API's schema (raises if not)
        assert [s.id for s in body.sections] == [s["id"] for s in raw["sections"]]

    career = CareerDoc.model_validate(read("career"))
    assert set(career.module_refs()) <= set(module_ids)


def test_module_links_rules() -> None:
    """How a module's resources become library links (synthetic modules: the rules, not the content)."""
    module: dict[str, Any] = {
        "id": "some-module",
        "name": "Some Module",
        "unitCode": "AB1234",
        "resources": {
            "materials": "https://drive.example.com/materials",
            "exercises": "https://drive.example.com/exercises",
            "exercisesNote": "Weekly problem sets.",
            "vle": "https://drive.example.com/papers",
            "olderExams": "https://drive.example.com/papers",
            "cheatSheet": "http://insecure.example.com/sheet",
        },
        "notes": [
            {"name": "\U0001f9fd\U0001f34d Patrick: Business Edition", "url": "https://drive.example.com/patrick"},
            {"name": "Mahdi", "author": "Mahdi", "url": "https://drive.example.com/mahdi"},
            {"name": "Revision pack", "author": "Sara", "url": "https://drive.example.com/pack"},
            {"name": "Same folder again", "url": "https://drive.example.com/materials"},
            {"name": "", "url": "https://drive.example.com/nameless"},
            {"name": "No link"},
        ],
    }
    links = list(module_links(module))
    assert [(link.kind, link.title, link.url.rsplit("/", 1)[1], link.author_name) for link in links] == [
        ("course-materials", "Course materials", "materials", None),
        ("exercises", "Exercises", "exercises", None),
        ("past-paper", "VLE and older exams", "papers", None),  # one folder for both: one link
        ("notes", "Patrick: Business Edition", "patrick", None),  # emoji dropped
        ("notes", "Mahdi's notes", "mahdi", "Mahdi"),
        ("notes", "Revision pack", "pack", "Sara"),
    ]  # http:// and repeated links are left out, and notes without a name or a link
    descriptions = [link.description for link in links]
    assert descriptions[0] == "The books and study guide for AB1234, in the shared folder."
    assert descriptions[1] == "Weekly problem sets."
    assert descriptions[3:] == ["Shared by a student.", "Shared by Mahdi.", "Shared by Sara."]

    module["resources"] = {
        "vle": "https://a.example.com/vle",
        "olderExams": "https://a.example.com/old",
        "exercises": "https://a.example.com/x",
    }
    assert [(link.kind, link.title, link.description) for link in module_links({**module, "notes": []})] == [
        ("exercises", "Exercises", "Practice questions for this module."),
        ("vle-materials", "VLE materials", "Papers and material from the VLE."),
        ("past-paper", "Past exams", "Older papers from earlier sittings."),
    ]


# ── loading ──────────────────────────────────────────────────────────────────────────────────


def test_seed_loads_everything_once(db: Session) -> None:
    files = {name: len(read(name)) for name in ("modules", "calendar", "newsletter")}
    links = expected_links()
    assert first_load(db) == {**files, "career": 1, "library": links}
    totals = (count(db, Module), count(db, CalendarEvent), count(db, NewsletterIssue), count(db, ContentDoc))
    assert totals == (files["modules"], files["calendar"], files["newsletter"], 1)
    assert count(db, LibraryItem) == links

    # run it again: modules are refreshed, nothing else is added
    again = load_all(db)
    db.commit()
    assert again == {"modules": files["modules"], "calendar": 0, "newsletter": 0, "career": 0, "library": 0}
    assert (count(db, CalendarEvent), count(db, NewsletterIssue), count(db, LibraryItem)) == (
        files["calendar"],
        files["newsletter"],
        links,
    )


def test_seeded_content_is_what_the_files_say(db: Session) -> None:
    first_load(db)

    # calendar: every date as written
    events = {e.id: e for e in db.scalars(select(CalendarEvent))}
    for e in read("calendar"):
        row = events[e["id"]]
        assert (row.date.isoformat(), row.end_date.isoformat() if row.end_date else None) == (
            e["date"],
            e.get("endDate"),
        )
        assert (row.title, row.type, row.year, row.time, row.place) == (
            e["title"],
            e["type"],
            e.get("year"),
            e.get("time"),
            e.get("place"),
        )
        assert (row.module_id, row.unit_code, row.sample) == (
            e.get("moduleId"),
            e.get("unitCode"),
            bool(e.get("sample")),
        )

    # newsletter: drafts in the API's shape
    issues = {i.slug: i for i in db.scalars(select(NewsletterIssue))}
    for raw in read("newsletter"):
        issue = issues[raw["slug"]]
        assert (issue.status, issue.published_at, issue.created_by) == (IssueStatus.draft, None, None)
        assert (issue.title, issue.number, issue.date.isoformat()) == (raw["title"], raw["number"], raw["date"])
        assert (issue.dek, issue.summary) == (raw.get("dek") or "", raw.get("summary") or "")
        assert issue.editors == raw["editors"]
        assert [s["id"] for s in issue.sections] == [s["id"] for s in raw["sections"]]
        assert all(IssueSection.model_validate(s) for s in issue.sections)
        assert IssueCover.model_validate(issue.cover)

    # career: the document, stored in the API's shape
    career = db.get(ContentDoc, "career")
    assert career is not None
    assert career.data == CareerDoc.model_validate(read("career")).model_dump(mode="json", by_alias=True)

    # library: one published link per module resource, in the module and its year, dated before anything uploaded
    items = list(db.scalars(select(LibraryItem)))
    assert all(i.source == ItemSource.link and i.status == ItemStatus.published for i in items)
    assert all(i.published_at == REFERENCE_PUBLISHED_AT for i in items)
    assert len({i.slug for i in items}) == len(items)
    by_place = {(i.module_id, i.url): i for i in items}
    modules = {m.id: m for m in db.scalars(select(Module))}
    for spec in read("modules"):
        module = modules[spec["id"]]
        for link in module_links(spec):
            item = by_place[(module.id, link.url)]
            assert (item.kind, item.title, item.description, item.author_name) == (
                link.kind,
                link.title,
                link.description,
                link.author_name,
            )
            assert item.year == module.year
            assert item.slug.startswith(slugify(module.unit_code or module.id))


def test_seed_keeps_what_moderators_changed(db: Session, client_for: Clients, make_user: Callable[..., User]) -> None:
    first_load(db)
    rep = client_for(make_user(name="Rep", roles=("student", "rep")))
    events = [e["id"] for e in read("calendar")]
    edited_event, deleted_event = events[0], events[1]
    slugs = [i["slug"] for i in read("newsletter")]
    assert len(slugs) >= 2, "this test edits one seeded issue and deletes another"
    edited_issue, deleted_issue = slugs[0], slugs[1]
    links = list(db.scalars(select(LibraryItem).order_by(LibraryItem.slug)))
    renamed, removed, moved = links[0], links[1], links[2]
    elsewhere = next(m for m in db.scalars(select(Module)) if m.id != moved.module_id)

    # edit and delete calendar dates; edit and delete issues; edit, remove and move library links
    assert rep.patch(f"{API}/calendar/events/{edited_event}", json={"place": "Hall 2"}).status_code == 200
    assert rep.delete(f"{API}/calendar/events/{deleted_event}").status_code == 204
    issue_ids = {i.slug: i.id for i in db.scalars(select(NewsletterIssue))}
    assert rep.delete(f"{API}/newsletter/issues/{issue_ids[deleted_issue]}").status_code == 204
    r = rep.patch(f"{API}/newsletter/issues/{issue_ids[edited_issue]}", json={"editors": ["Real Editor"]})
    assert r.status_code == 200
    assert rep.patch(f"{API}/library/items/{renamed.id}", json={"title": "Books and study guide"}).status_code == 200
    assert rep.delete(f"{API}/library/items/{removed.id}").status_code == 204
    assert rep.patch(f"{API}/library/items/{moved.id}", json={"moduleId": elsewhere.id}).status_code == 200
    career = {**read("career"), "checkedOn": "1 January 2027"}
    admin = client_for(make_user(name="Admin", roles=("student", "admin")))
    assert admin.put(f"{API}/career", json=career).status_code == 200

    again = load_all(db)
    db.commit()
    assert again == {"modules": len(read("modules")), "calendar": 0, "newsletter": 0, "career": 0, "library": 0}
    edited = db.get(CalendarEvent, edited_event)
    assert edited is not None
    assert edited.place == "Hall 2"
    assert db.get(CalendarEvent, deleted_event) is None
    assert db.scalar(select(NewsletterIssue).where(NewsletterIssue.slug == deleted_issue)) is None
    kept = db.scalar(select(NewsletterIssue).where(NewsletterIssue.slug == edited_issue))
    assert kept is not None
    db.refresh(kept)
    assert kept.editors == ["Real Editor"]
    for item in (renamed, removed, moved):
        db.refresh(item)
    assert renamed.title == "Books and study guide"
    assert removed.status == ItemStatus.removed
    assert moved.module_id == elsewhere.id
    assert count(db, LibraryItem) == expected_links()  # no copy of the moved or removed link
    doc = db.get(ContentDoc, "career")
    assert doc is not None
    db.refresh(doc)
    assert doc.data["checkedOn"] == "1 January 2027"


def test_the_seeded_library_is_public(db: Session, client_for: Clients) -> None:
    first_load(db)
    guest = client_for()
    spec = next(m for m in read("modules") if list(module_links(m)))
    page = guest.get(f"{API}/library/items", params={"module_id": spec["id"], "limit": 100}).json()
    assert Counter(i["title"] for i in page["items"]) == Counter(link.title for link in module_links(spec))
    years = {m["id"]: m["year"] for m in read("modules")}
    by_year = Counter(str(years[m["id"]]) for m in read("modules") for _ in module_links(m))
    facets = guest.get(f"{API}/library/facets").json()
    assert (facets["total"], facets["byYear"]) == (expected_links(), dict(by_year))
    assert guest.get(f"{API}/newsletter/issues").json() == []  # drafts until a moderator publishes them
