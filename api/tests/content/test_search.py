from __future__ import annotations

from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.time import utcnow
from app.models import (
    ForumThread,
    IssueStatus,
    ItemSource,
    ItemStatus,
    LibraryItem,
    NewsletterIssue,
    PostStatus,
    User,
)
from app.seed.loader import load_all
from app.services.search import plain_text, snippet, words
from tests.content.conftest import API

Clients = Callable[..., TestClient]


@pytest.fixture
def content(db: Session, student: User) -> None:
    load_all(db)
    launch = db.scalar(select(NewsletterIssue).where(NewsletterIssue.slug == "launch-edition"))
    assert launch is not None
    launch.status = IssueStatus.published
    launch.published_at = utcnow()
    db.add_all(
        [
            ForumThread(
                slug="how-do-i-find-the-mgf-of-a-gamma-distribution",
                title="How do I find the MGF of a gamma distribution?",
                body="I keep getting **stuck** on [question 3](https://example.com/q3). Any `tips` for the *MGF*?",
                category="year-2",
                module_id="advanced-stats-distribution",
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
        "ST2133 · Course materials",
        "ST2133 · Past paper",
        "ST2133 · Students\u2019 notes",
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
        "events": [],
    }
    assert guest.get(f"{API}/search").status_code == 422
    assert guest.get(f"{API}/search", params={"q": "x", "types": "people"}).status_code == 422
    assert guest.get(f"{API}/search", params={"q": "x", "limit": 21}).status_code == 422


def test_sample_dates_say_so(content: None, client_for: Clients) -> None:
    hits = search(client_for(), "machine learning mock", types=["event"])["events"]
    assert titles(hits) == ["Machine Learning mock exam"]
    assert hits[0]["snippet"] == "Sample date, not confirmed yet."


def test_text_helpers() -> None:
    assert words("ST2133: what's the MGF?!") == ["st2133", "what", "s", "the", "mgf"]
    md = "# Title\n\n> quote\n- item one\n![graph](/api/v1/media/x) see [docs](https://x.y) and `code`"
    assert plain_text(md) == "Title quote item one graph see docs and code"
    text = "word " * 50 + "needle " + "word " * 50
    cut = snippet(text, ["needle"], radius=20)
    assert cut is not None
    assert cut.startswith("…")
    assert cut.endswith("…")
    assert "needle" in cut
    assert snippet("short text", ["absent"]) == "short text"
    assert snippet(None, ["x"]) is None
