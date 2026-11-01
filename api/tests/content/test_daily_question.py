"""GET /library/daily-question: a module's past question a day, from the chapters the student chose
(app/services/past_questions.py daily). The same for everyone who asks for those chapters that day, a different one the
next; none while the module has too few tagged questions; hidden modules and chapters stay out."""

from __future__ import annotations

import datetime as dt
import uuid
from collections.abc import Callable
from datetime import timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.time import utcnow
from app.models import Chapter, ItemStatus, LibraryItem, Module, PaperQuestion, User
from app.routers import library as library_router
from app.services.past_questions import DAILY_MIN_TAGS
from tests.content.conftest import API

Clients = Callable[..., TestClient]
SetFeature = Callable[..., None]
DAILY = f"{API}/library/daily-question"
TODAY = dt.date(2026, 10, 20)
EPOCH = dt.date(1970, 1, 1)


@pytest.fixture(autouse=True)
def today(monkeypatch: pytest.MonkeyPatch) -> dt.date:
    monkeypatch.setattr(library_router, "bahrain_today", lambda: TODAY)
    return TODAY


@pytest.fixture(autouse=True)
def questions_on(set_feature: SetFeature) -> None:
    for f in ("library.questions", "library.daily-question"):
        set_feature(f, "everyone")


def chapters_of(db: Session, module_id: str) -> list[str]:
    return list(db.scalars(select(Chapter.id).where(Chapter.module_id == module_id).order_by(Chapter.position)))


def tagged(db: Session, module_id: str, n: int, chapter: str | None = None) -> list[PaperQuestion]:
    """`n` tagged questions on a module's published past papers, three to a paper, all in one chapter (the first,
    unless one is given)."""
    chapter = chapter or chapters_of(db, module_id)[0]
    tags: list[PaperQuestion] = []
    for paper in range((n + 2) // 3):
        item = LibraryItem(
            slug=f"{module_id}-paper-{paper}-{uuid.uuid4().hex[:6]}",
            source="link",
            kind="past-paper",
            title=f"Paper {paper}",
            module_id=module_id,
            url="https://example.com/paper.pdf",
            status=ItemStatus.published,
            exam_year=2015 + paper,
            published_at=utcnow(),
        )
        db.add(item)
        db.flush()
        tags.extend(
            PaperQuestion(item_id=item.id, chapter_id=chapter, question=q, page=q)
            for q in range(1, min(3, n - len(tags)) + 1)
        )
    db.add_all(tags)
    db.commit()
    return tags


def daily(client: TestClient, module_id: str, chapters: list[str] | None = None) -> dict[str, Any]:
    params = {"module_id": module_id, **({"chapters": ",".join(chapters)} if chapters else {})}
    r = client.get(DAILY, params=params)
    assert r.status_code == 200, r.text
    out: dict[str, Any] = r.json()
    return out


def pick(tags: list[PaperQuestion], day: dt.date = TODAY) -> str:
    """The web app's rule too: the ids in order, by the day's number since 1970."""
    order = sorted(str(t.id) for t in tags)
    return order[(day - EPOCH).days % len(order)]


def test_a_modules_question_is_the_same_for_everyone_that_day(
    client_for: Clients, db: Session, modules: dict[str, Module], make_user: Callable[..., User]
) -> None:
    tags = tagged(db, "econometrics", 12)
    out = daily(client_for(), "econometrics")
    assert (out["offered"], out["pool"]) == (True, 12)
    assert out["question"]["id"] == pick(tags)
    assert out["question"]["paper"]["title"].startswith("Paper ")
    assert daily(client_for(make_user(year=2)), "econometrics")["question"]["id"] == pick(tags)


def test_it_changes_with_the_day(
    client_for: Clients, db: Session, modules: dict[str, Module], monkeypatch: pytest.MonkeyPatch
) -> None:
    tags = tagged(db, "econometrics", 11)
    first = daily(client_for(), "econometrics")["question"]["id"]
    monkeypatch.setattr(library_router, "bahrain_today", lambda: TODAY + timedelta(days=1))
    second = daily(client_for(), "econometrics")["question"]["id"]
    assert second != first
    assert second == pick(tags, TODAY + timedelta(days=1))


def test_the_chapters_chosen_are_the_ones_it_goes_round(
    client_for: Clients, db: Session, modules: dict[str, Module]
) -> None:
    first, second, third = chapters_of(db, "econometrics")[:3]
    in_first = tagged(db, "econometrics", 9, first)
    in_second = tagged(db, "econometrics", 4, second)

    out = daily(client_for(), "econometrics", [second])
    assert out["pool"] == 4
    assert out["question"]["id"] == pick(in_second)
    assert out["question"]["chapterId"] == second
    both = daily(client_for(), "econometrics", [first, second])
    assert (both["pool"], both["question"]["id"]) == (13, pick(in_first + in_second))
    # a chapter with no tagged questions: none to go round, but the module still has its question a day
    assert daily(client_for(), "econometrics", [third]) == {"question": None, "offered": True, "pool": 0}
    # a chapter of another module, or one that's gone, is passed over
    other = chapters_of(db, "mathematics")[0]
    assert daily(client_for(), "econometrics", [second, other, "gone1"])["pool"] == 4


def test_a_module_needs_enough_tagged_questions(client_for: Clients, db: Session, modules: dict[str, Module]) -> None:
    tags = tagged(db, "econometrics", DAILY_MIN_TAGS - 1)
    assert daily(client_for(), "econometrics") == {"question": None, "offered": False, "pool": 0}
    tags += tagged(db, "econometrics", 1)
    assert daily(client_for(), "econometrics")["question"]["id"] == pick(tags)


def test_hidden_modules_and_chapters_stay_out(
    client_for: Clients, db: Session, modules: dict[str, Module], admin: User
) -> None:
    first, second = chapters_of(db, "econometrics")[:2]
    tagged(db, "econometrics", 10, first)
    tagged(db, "econometrics", 5, second)
    db.get(Chapter, second).hidden = True  # type: ignore[union-attr]
    db.commit()
    assert daily(client_for(), "econometrics")["pool"] == 10
    assert daily(client_for(), "econometrics", [second])["pool"] == 0

    db.get(Module, "econometrics").hidden = True  # type: ignore[union-attr]
    db.commit()
    r = client_for().get(DAILY, params={"module_id": "econometrics"})
    assert (r.status_code, r.json()["error"]["code"]) == (422, "invalid_input")
    assert daily(client_for(admin), "econometrics")["pool"] == 15  # staff see hidden modules, as everywhere


@pytest.mark.parametrize(
    "params",
    [
        {},  # no module
        {"module_id": "no-such-module"},
        {"module_id": "econometrics", "chapters": "a,,b"},
        {"module_id": "econometrics", "chapters": "../etc"},
        {"module_id": "econometrics", "chapters": ",".join(f"c{i}" for i in range(41))},
    ],
)
def test_bad_requests_are_refused(client_for: Clients, modules: dict[str, Module], params: dict[str, str]) -> None:
    assert client_for().get(DAILY, params=params).status_code == 422


def test_it_follows_its_switches(
    client_for: Clients, db: Session, modules: dict[str, Module], set_feature: SetFeature
) -> None:
    tagged(db, "econometrics", 10)
    assert daily(client_for(), "econometrics")["question"] is not None
    for feature in ("library.daily-question", "library.questions", "library"):
        set_feature(feature, "off")
        r = client_for().get(DAILY, params={"module_id": "econometrics"})
        assert (r.status_code, r.json()["error"]["code"]) == (404, "feature_off"), feature
        set_feature(feature, "everyone")
