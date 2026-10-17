"""The seed loader. Expectations come from the seed files themselves (code quality review CQ-7): a rep's request to
add a date or fix a title changes the data, never these tests. What is tested is how the files are loaded: once,
completely, and never over what moderators changed since."""

from __future__ import annotations

import datetime as dt
from collections.abc import Callable
from typing import Any, get_args

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    CalendarEvent,
    ContentDoc,
    DailyGuessWord,
    DailyItem,
    DailyTheme,
    DriveFolder,
    IssueStatus,
    LibraryItem,
    Module,
    NewsletterIssue,
    User,
)
from app.schemas.calendar import EventType
from app.schemas.career import CareerDoc
from app.schemas.newsletter import IssueCover, IssueSection
from app.seed.loader import daily_guess_words, load_all, module_folders, read, seed_issue
from tests.content.conftest import API

Clients = Callable[..., TestClient]


def count(db: Session, model: type) -> int:
    return db.scalar(select(func.count()).select_from(model)) or 0


def expected_folders() -> int:
    return sum(len(list(module_folders(m))) for m in read("modules"))


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


def test_module_folders_rules() -> None:
    """How a module's resources become the Drive folders the import reads (synthetic modules: the rules)."""
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
    folders = list(module_folders(module))
    assert [(f.kind, f.title, f.url.rsplit("/", 1)[1], f.author_name) for f in folders] == [
        ("course-materials", "Course materials", "materials", None),
        ("exercises", "Exercises", "exercises", None),
        ("past-paper", "VLE and older exams", "papers", None),  # one folder for both: read once
        ("notes", "Patrick: Business Edition", "patrick", None),  # emoji dropped
        ("notes", "Mahdi's notes", "mahdi", "Mahdi"),
        ("notes", "Revision pack", "pack", "Sara"),
    ]  # http:// and repeated links are left out, and notes without a name or a link

    module["resources"] = {
        "vle": "https://a.example.com/vle",
        "olderExams": "https://a.example.com/old",
        "exercises": "https://a.example.com/x",
    }
    assert [(f.kind, f.title) for f in module_folders({**module, "notes": []})] == [
        ("exercises", "Exercises"),
        ("vle-materials", "VLE materials"),
        ("past-paper", "Past exams"),
    ]


# ── loading ──────────────────────────────────────────────────────────────────────────────────


def test_seed_loads_everything_once(db: Session) -> None:
    files = {name: len(read(name)) for name in ("modules", "calendar", "newsletter")}
    folders = expected_folders()
    themes = len(read("daily/themes"))
    assert first_load(db) == {**files, "career": 1, "drive-folders": folders, "daily": themes}
    totals = (count(db, Module), count(db, CalendarEvent), count(db, NewsletterIssue), count(db, ContentDoc))
    assert totals == (files["modules"], files["calendar"], files["newsletter"], 1)
    assert (count(db, DriveFolder), count(db, LibraryItem)) == (folders, 0)  # the library holds no Drive links
    # Daily: the themes, out of the rotation until they have puzzles, and the guess list; no puzzles (they're kept
    # out of the repository)
    assert (count(db, DailyTheme), count(db, DailyGuessWord), count(db, DailyItem)) == (
        themes,
        len(daily_guess_words()),
        0,
    )
    assert not db.scalar(select(func.count()).select_from(DailyTheme).where(DailyTheme.in_rotation))

    # run it again: nothing is added, and the modules stay as they are
    again = load_all(db)
    db.commit()
    assert again == {"modules": 0, "calendar": 0, "newsletter": 0, "career": 0, "drive-folders": 0, "daily": 0}
    assert (count(db, CalendarEvent), count(db, NewsletterIssue), count(db, DriveFolder)) == (
        files["calendar"],
        files["newsletter"],
        folders,
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

    # Drive folders: one per module resource and shared notes, for the import only
    rows = {(f.module_id, f.url): f for f in db.scalars(select(DriveFolder))}
    for spec in read("modules"):
        for folder in module_folders(spec):
            folder_row = rows[(spec["id"], folder.url)]
            expected = (folder.kind, folder.title, folder.author_name)
            assert (folder_row.kind, folder_row.title, folder_row.author_name) == expected


def test_seed_keeps_what_moderators_changed(db: Session, client_for: Clients, make_user: Callable[..., User]) -> None:
    first_load(db)
    rep = client_for(make_user(name="Rep", roles=("student", "rep")))
    events = [e["id"] for e in read("calendar")]
    edited_event, deleted_event = events[0], events[1]
    slugs = [i["slug"] for i in read("newsletter")]
    assert len(slugs) >= 2, "this test edits one seeded issue and deletes another"
    edited_issue, deleted_issue = slugs[0], slugs[1]

    # edit and delete calendar dates; edit and delete issues
    assert rep.patch(f"{API}/calendar/events/{edited_event}", json={"place": "Hall 2"}).status_code == 200
    assert rep.delete(f"{API}/calendar/events/{deleted_event}").status_code == 204
    issue_ids = {i.slug: i.id for i in db.scalars(select(NewsletterIssue))}
    assert rep.delete(f"{API}/newsletter/issues/{issue_ids[deleted_issue]}").status_code == 204
    r = rep.patch(f"{API}/newsletter/issues/{issue_ids[edited_issue]}", json={"editors": ["Real Editor"]})
    assert r.status_code == 200
    career = {**read("career"), "checkedOn": "1 January 2027"}
    admin = client_for(make_user(name="Admin", roles=("student", "admin")))
    assert admin.put(f"{API}/career", json={"version": 1, "data": career}).status_code == 200

    again = load_all(db)
    db.commit()
    assert again == {"modules": 0, "calendar": 0, "newsletter": 0, "career": 0, "drive-folders": 0, "daily": 0}
    edited = db.get(CalendarEvent, edited_event)
    assert edited is not None
    assert edited.place == "Hall 2"
    assert db.get(CalendarEvent, deleted_event) is None
    assert db.scalar(select(NewsletterIssue).where(NewsletterIssue.slug == deleted_issue)) is None
    kept = db.scalar(select(NewsletterIssue).where(NewsletterIssue.slug == edited_issue))
    assert kept is not None
    db.refresh(kept)
    assert kept.editors == ["Real Editor"]
    doc = db.get(ContentDoc, "career")
    assert doc is not None
    db.refresh(doc)
    assert doc.data["checkedOn"] == "1 January 2027"


def test_the_seeded_library_is_empty_until_the_import(db: Session, client_for: Clients) -> None:
    """The seed gives the import its folders; students get files, never a link to Drive."""
    first_load(db)
    guest = client_for()
    assert guest.get(f"{API}/library/items", params={"limit": 100}).json()["items"] == []
    assert guest.get(f"{API}/library/facets").json()["total"] == 0
    assert guest.get(f"{API}/newsletter/issues").json() == []  # drafts until a moderator publishes them
