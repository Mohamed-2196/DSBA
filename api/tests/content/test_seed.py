from __future__ import annotations

from collections import Counter
from collections.abc import Callable

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

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
from app.seed.loader import load_all, module_links, read
from tests.content.conftest import API

Clients = Callable[..., TestClient]


def count(db: Session, model: type) -> int:
    return db.scalar(select(func.count()).select_from(model)) or 0


def test_seed_loads_everything_once(db: Session) -> None:
    expected_links = sum(len(list(module_links(m))) for m in read("modules"))
    first = load_all(db)
    db.commit()
    assert first == {"modules": 16, "calendar": 66, "newsletter": 2, "career": 1, "library": expected_links}
    assert expected_links == 51
    assert (count(db, Module), count(db, CalendarEvent), count(db, NewsletterIssue), count(db, ContentDoc)) == (
        16,
        66,
        2,
        1,
    )
    assert count(db, LibraryItem) == expected_links

    # run it again: modules are refreshed, nothing else is added
    second = load_all(db)
    db.commit()
    assert second == {"modules": 16, "calendar": 0, "newsletter": 0, "career": 0, "library": 0}
    assert count(db, CalendarEvent) == 66
    assert count(db, LibraryItem) == expected_links


def test_seeded_content_is_shaped_for_the_app(db: Session) -> None:
    load_all(db)
    db.commit()

    # calendar: ids, sample flags, modules
    events = {e.id: e for e in db.scalars(select(CalendarEvent))}
    sample = events["2026-10-11-advanced-stats-inferential-revision"]
    assert (sample.sample, sample.year, sample.module_id, sample.unit_code) == (
        True,
        2,
        "advanced-stats-inferential",
        "ST2134",
    )
    speech = events["2026-10-05-speech-day-event"]
    assert (speech.time, speech.place, speech.year, speech.sample) == ("12:30 PM", "Auditorium", None, False)
    assert sum(e.sample for e in events.values()) == 18

    # newsletter: drafts, sections as written but without the prototype's made-up reaction counts
    issues = {i.slug: i for i in db.scalars(select(NewsletterIssue))}
    assert set(issues) == {"pilot", "launch-edition"}
    launch = issues["launch-edition"]
    assert launch.status == IssueStatus.draft
    assert launch.published_at is None
    assert launch.editors == ["Hawra T.", "Zainab K.", "Hussain M."]
    assert launch.cover["tone"] == "navy"
    assert [s["id"] for s in launch.sections][:3] == ["cfa", "student-council", "speech-day"]
    assert all("reactions" not in s for i in issues.values() for s in i.sections)
    assert launch.sections[0]["figure"]["src"] == "demo/news/cfa-research-challenge.jpg"

    # career: the whole document
    career = db.get(ContentDoc, "career")
    assert career is not None
    assert career.data == read("career")

    # library: published links for the module and its year
    items = list(db.scalars(select(LibraryItem)))
    assert all(i.source == ItemSource.link and i.status == ItemStatus.published for i in items)
    assert all(i.url and i.url.startswith("https://") and i.published_at for i in items)
    by_slug = {i.slug: i for i in items}
    materials = by_slug["st2133-course-materials"]
    assert (materials.kind, materials.title, materials.module_id, materials.year) == (
        "course-materials",
        "Course materials",
        "advanced-stats-distribution",
        2,
    )
    # one folder for the VLE and older exams: one past-paper link, not two
    st2133 = [i for i in items if i.module_id == "advanced-stats-distribution"]
    assert Counter(i.kind for i in st2133) == {"course-materials": 1, "past-paper": 1, "notes": 1}
    assert by_slug["st2133-vle-and-older-exams"].title == "VLE and older exams"
    ec1002 = Counter(i.kind for i in items if i.module_id == "economics")
    assert ec1002 == {"course-materials": 1, "exercises": 1, "vle-materials": 1, "past-paper": 1, "notes": 2}
    assert by_slug["ec1002-past-exams"].title == "Past exams"
    assert by_slug["st2195-cheat-sheet"].kind == "cheat-sheet"
    # notes: "<Author>'s notes", or the note's own name (emoji dropped), credited to the author
    mahdi = by_slug["ec1002-mahdis-notes"]
    assert (mahdi.title, mahdi.author_name, mahdi.kind) == ("Mahdi's notes", "Mahdi", "notes")
    assert by_slug["mn1178-patrick-business-edition"].title == "Patrick: Business Edition"
    assert by_slug["mn1178-patrick-business-edition"].author_name is None
    assert by_slug["st2133-mohamed-study-guide"].author_name == "Mohamed"
    # the same note shared in two modules is in both
    assert {"st1215-product-and-sigma-notation", "st2134-product-and-sigma-notation"} <= set(by_slug)
    # Year 3 modules have no code: their slug uses the module id
    assert by_slug["machine-learning-vle-materials"].year == 3


def test_seed_keeps_what_moderators_changed(db: Session, client_for: Clients, make_user: Callable[..., User]) -> None:
    from app.models import Role

    load_all(db)
    db.commit()
    rep = client_for(make_user(name="Rep", role=Role.moderator))

    # edit and delete calendar dates; delete an issue; edit and remove library links
    assert rep.patch(f"{API}/calendar/events/2026-10-05-speech-day-event", json={"place": "Hall 2"}).status_code == 200
    assert rep.delete(f"{API}/calendar/events/2026-10-06-hub-launch-event").status_code == 204
    pilot = db.scalar(select(NewsletterIssue).where(NewsletterIssue.slug == "pilot"))
    assert pilot is not None
    assert rep.delete(f"{API}/newsletter/issues/{pilot.id}").status_code == 204
    launch = db.scalar(select(NewsletterIssue).where(NewsletterIssue.slug == "launch-edition"))
    assert launch is not None
    assert rep.patch(f"{API}/newsletter/issues/{launch.id}", json={"editors": ["Real Editor"]}).status_code == 200
    materials = db.scalar(select(LibraryItem).where(LibraryItem.slug == "ec1002-course-materials"))
    removed = db.scalar(select(LibraryItem).where(LibraryItem.slug == "ec1002-exercises"))
    moved = db.scalar(select(LibraryItem).where(LibraryItem.slug == "ec1002-past-exams"))
    assert materials is not None
    assert removed is not None
    assert moved is not None
    assert rep.patch(f"{API}/library/items/{materials.id}", json={"title": "Books and study guide"}).status_code == 200
    assert rep.delete(f"{API}/library/items/{removed.id}").status_code == 204
    assert rep.patch(f"{API}/library/items/{moved.id}", json={"moduleId": "econometrics"}).status_code == 200

    again = load_all(db)
    db.commit()
    assert again == {"modules": 16, "calendar": 0, "newsletter": 0, "career": 0, "library": 0}
    speech = db.get(CalendarEvent, "2026-10-05-speech-day-event")
    assert speech is not None
    assert speech.place == "Hall 2"
    assert db.get(CalendarEvent, "2026-10-06-hub-launch-event") is None
    assert db.scalar(select(NewsletterIssue).where(NewsletterIssue.slug == "pilot")) is None
    db.refresh(launch)
    assert launch.editors == ["Real Editor"]
    db.refresh(materials)
    assert materials.title == "Books and study guide"
    db.refresh(removed)
    assert removed.status == ItemStatus.removed
    assert count(db, LibraryItem) == 51


def test_the_seeded_library_is_public(db: Session, client_for: Clients) -> None:
    load_all(db)
    db.commit()
    guest = client_for()
    page = guest.get(f"{API}/library/items", params={"module_id": "business", "sort": "title"}).json()
    assert [i["title"] for i in page["items"]] == [
        "Course materials",
        "Exercises",
        "Feras full revision",
        "Past exams",
        "Patrick: Business Edition",
        "VLE materials",
    ]
    facets = guest.get(f"{API}/library/facets").json()
    assert facets["total"] == 51
    assert facets["byYear"] == {"1": 22, "2": 17, "3": 12}
    assert guest.get(f"{API}/newsletter/issues").json() == []  # drafts until a moderator publishes them
