"""Site-wide search. The module catalogue comes from the seed; everything else is made here, so editing the seeded
calendar, library or newsletter never breaks these tests (code quality review CQ-7)."""

from __future__ import annotations

import datetime as dt
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.text import snippet
from app.core.time import utcnow
from app.models import (
    CalendarEvent,
    ForumThread,
    IssueStatus,
    ItemSource,
    ItemStatus,
    LibraryItem,
    Module,
    NewsletterIssue,
    PostStatus,
    User,
)
from app.services.forum.text import to_plain_text
from app.services.search import words
from tests.content.conftest import API

Clients = Callable[..., TestClient]
ST2133 = "advanced-stats-distribution"


def _link(slug: str, title: str, kind: str, module_id: str = ST2133, year: int = 2) -> LibraryItem:
    return LibraryItem(
        slug=slug,
        source=ItemSource.link,
        kind=kind,
        title=title,
        module_id=module_id,
        year=year,
        url=f"https://drive.example.com/{slug}",
        status=ItemStatus.published,
        published_at=utcnow(),
    )


def _issue(slug: str, number: int, title: str, date: dt.date, text: str, status: IssueStatus) -> NewsletterIssue:
    return NewsletterIssue(
        slug=slug,
        number=number,
        title=title,
        date=date,
        cover={"tone": "navy", "lines": []},
        dek="The first issue of the year.",
        summary="",
        editors=["The editors"],
        sections=[{"id": "story", "title": "Our story", "blocks": [{"type": "p", "text": text, "lead": False}]}],
        status=status,
        published_at=utcnow() if status == IssueStatus.published else None,
    )


@pytest.fixture
def content(db: Session, student: User, modules: dict[str, Module]) -> None:
    db.add_all(
        [
            ForumThread(
                slug="how-do-i-find-the-mgf-of-a-gamma-distribution",
                title="How do I find the MGF of a gamma distribution?",
                body="I keep getting **stuck** on [question 3](https://example.com/q3). Any `tips` for the *MGF*?",
                category="year-2",
                module_id=ST2133,
                author_id=student.id,
                reply_count=1,
            ),
            ForumThread(
                slug="hidden-gamma-spam",
                title="Cheap gamma distribution answers",
                body="spam",
                category="general",
                author_id=student.id,
                status=PostStatus.hidden,
            ),
            LibraryItem(
                slug="pending-gamma-notes",
                source=ItemSource.file,
                kind="notes",
                title="Gamma distribution notes",
                status=ItemStatus.pending,
                uploaded_by=student.id,
            ),
            _link("st2133-course-materials", "Course materials", "course-materials"),
            _link("st2133-past-exams", "Past exams", "past-paper"),
            _link("st2133-saras-notes", "Sara's notes", "notes"),
            _link("ec1002-course-materials", "Course materials", "course-materials", "economics", 1),
            CalendarEvent(
                id="2026-10-30-advanced-stats-distribution-exam",
                date=dt.date(2026, 10, 30),
                title="ST2133 Distribution Theory (October exam)",
                type="exam",
                year=2,
                module_id=ST2133,
                unit_code="ST2133",
            ),
            CalendarEvent(
                id="2026-12-01-machine-learning-mock",
                date=dt.date(2026, 12, 1),
                title="Machine Learning mock exam",
                type="mock",
                year=3,
                module_id="machine-learning",
                sample=True,
            ),
            _issue(
                "launch-edition",
                1,
                "Launch edition",
                dt.date(2026, 10, 6),
                "Our team reached the final of the CFA Research Challenge in Dubai.",
                IssueStatus.published,
            ),
            _issue("pilot", 0, "The pilot", dt.date(2026, 9, 1), "Testing testing, one two.", IssueStatus.draft),
        ]
    )
    db.commit()


def search(client: TestClient, q: str, **params: Any) -> dict[str, Any]:
    r = client.get(f"{API}/search", params={"q": q, **params})
    assert r.status_code == 200, r.text
    body: dict[str, Any] = r.json()
    return body


def titles(hits: list[dict[str, Any]]) -> list[str]:
    return [h["title"] for h in hits]


def test_one_search_box_for_everything(content: None, client_for: Clients) -> None:
    res = search(client_for(), "distribution theo", limit=20)
    assert res["query"] == "distribution theo"
    assert titles(res["modules"]) == ["Advanced Statistics: Distribution Theory"]
    module = res["modules"][0]
    assert (module["type"], module["id"], module["url"], module["meta"]) == (
        "module",
        "advanced-stats-distribution",
        "/modules/advanced-stats-distribution",
        "ST2133 · Year 2",
    )
    assert module["snippet"]
    # library items match through their module's name
    assert {h["meta"] for h in res["library"]} == {
        "Course materials · ST2133",
        "Past paper · ST2133",
        "Students\u2019 notes · ST2133",
    }
    assert all(h["url"].startswith("/library/st2133-") for h in res["library"])
    # events by title (the October exam names the module)
    event = next(h for h in res["events"] if "October exam" in h["title"])
    assert event["url"] == "/calendar?date=2026-10-30&event=2026-10-30-advanced-stats-distribution-exam"
    assert event["meta"] == "Exam · Year 2"
    assert event["date"].startswith("2026-10-30T00:00:00")


def test_threads_are_found_with_plain_snippets_and_hidden_ones_never(content: None, client_for: Clients) -> None:
    res = search(client_for(), "mgf gam")
    assert titles(res["threads"]) == ["How do I find the MGF of a gamma distribution?"]
    hit = res["threads"][0]
    assert hit["url"] == "/forum/how-do-i-find-the-mgf-of-a-gamma-distribution"
    assert hit["meta"] == "ST2133 · 1 reply"
    assert hit["snippet"] == "I keep getting stuck on question 3. Any tips for the MGF?"
    everything = search(client_for(), "gamma", limit=20)
    assert "Cheap gamma distribution answers" not in titles(everything["threads"])
    assert "Gamma distribution notes" not in titles(everything["library"])  # pending: not public


def test_issues_are_found_by_their_copy_once_published(content: None, client_for: Clients) -> None:
    res = search(client_for(), "research challenge")
    assert titles(res["issues"]) == ["Launch edition"]
    hit = res["issues"][0]
    assert (hit["url"], hit["meta"]) == ("/newsletter/launch-edition", "Issue 01 · 6 Oct 2026")
    assert "Research Challenge" in hit["snippet"]
    assert search(client_for(), "testing testing")["issues"] == []  # the pilot is still a draft


def test_module_aliases_prefixes_and_types(content: None, client_for: Clients) -> None:
    guest = client_for()
    assert "Introduction to Mathematical Statistics" in titles(search(guest, "stats")["modules"])
    assert titles(search(guest, "metrics")["modules"]) == ["Elements of Econometrics"]
    assert titles(search(guest, "econometr")["modules"]) == ["Elements of Econometrics"]
    assert titles(search(guest, "EC20")["modules"]) == ["Elements of Econometrics"]

    only_modules = search(guest, "econometrics", types=["module"])
    assert only_modules["modules"]
    assert not (only_modules["events"])
    assert not (only_modules["library"])
    assert len(search(guest, "course", types=["library"], limit=2)["library"]) == 2
    assert search(guest, "++") == {
        "query": "++",
        "threads": [],
        "library": [],
        "issues": [],
        "modules": [],
        "lessons": [],
        "events": [],
    }
    assert guest.get(f"{API}/search").status_code == 422
    assert guest.get(f"{API}/search", params={"q": "x", "types": "people"}).status_code == 422
    assert guest.get(f"{API}/search", params={"q": "x", "limit": 21}).status_code == 422


def test_dates_not_confirmed_yet_say_so(content: None, client_for: Clients) -> None:
    hits = search(client_for(), "machine learning mock", types=["event"])["events"]
    assert titles(hits) == ["Machine Learning mock exam"]
    assert hits[0]["snippet"] == "Not confirmed yet."  # not "sample date" (ui-ux review UX-13)


def test_thread_snippets_read_as_in_the_forum(db: Session, content: None, student: User, client_for: Clients) -> None:
    """One way to turn a post into plain text (code quality review CQ-6): the forum's. And a thread without a module
    is placed by its category's label, from the forum's taxonomy."""
    body = (
        "## Revision plan\n\n![timetable](/api/v1/media/0b5a3f4e-8c1d-4c55-9a51-3d1c1c2b9e10)\n\n"
        "1. Read *chapter 4*\n2. Try the ==quiz== at [the VLE](https://vle.example.com)\n\n```r\nsummary(fit)\n```"
    )
    db.add(
        ForumThread(
            slug="zebrafinch-revision-plan",
            title="Zebrafinch revision plan",
            body=body,
            category="study-groups",
            author_id=student.id,
        )
    )
    db.commit()
    hit = search(client_for(), "zebrafinch")["threads"][0]
    assert hit["meta"] == "Study groups · 0 replies"
    assert hit["snippet"] == snippet(to_plain_text(body, image_alt=True), ["zebrafinch"])
    assert "timetable" in hit["snippet"]  # a picture leaves its description
    assert "##" not in hit["snippet"]
    assert "](" not in hit["snippet"]


def test_text_helpers() -> None:
    assert words("ST2133: what's the MGF?!") == ["st2133", "what", "s", "the", "mgf"]
    text = "word " * 50 + "needle " + "word " * 50
    cut = snippet(text, ["needle"], radius=20)
    assert cut is not None
    assert cut.startswith("…")
    assert cut.endswith("…")
    assert "needle" in cut
    assert snippet("short text", ["absent"]) == "short text"
    assert snippet(None, ["x"]) is None


def test_search_leaves_out_what_is_switched_off(
    client_for: Callable[..., TestClient],
    make_user: Callable[..., User],
    set_feature: Callable[..., None],
    db: Session,
) -> None:
    from tests.core.helpers import new_thread

    db.add(CalendarEvent(id="2026-11-01-st2133-exam", date=dt.date(2026, 11, 1), title="ST2133 exam", type="exam"))
    db.commit()
    student, boss = make_user(name="Sara Student"), make_user(name="Head Admin", roles=("student", "admin"))
    new_thread(client_for(student), "Past papers please", title="ST2133 revision plan")

    def found(person: User | None) -> tuple[int, int]:
        r = client_for(person).get(f"{API}/search", params={"q": "ST2133"}).json()
        return len(r["threads"]), len(r["events"])

    assert found(student) == (1, 1)
    set_feature("calendar", "off")
    set_feature("forum", "roles", ["rep"])
    assert found(student) == (0, 0)
    assert found(None) == (0, 0)
    assert found(boss) == (1, 1)  # admins see every feature
