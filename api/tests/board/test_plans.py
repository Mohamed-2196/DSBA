"""Revision plans on the study board: a module's unwatched lessons and some past papers, spread to the exam."""

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

from app.core.time import bahrain_today, utcnow
from app.models import BoardCard, BoardPlan, ItemSource, ItemStatus, LibraryItem, Module, User
from app.services import board as svc
from tests.board.conftest import API
from tests.lessons import lesson_id

ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]


def paper(db: Session, module: Module, exam_year: int, zone: str = "A", kind: str = "past-paper") -> LibraryItem:
    slug = f"paper-{uuid.uuid4().hex[:8]}"
    item = LibraryItem(
        slug=slug,
        source=ItemSource.link,
        kind=kind,
        title=f"{module.unit_code} {exam_year} Zone {zone}",
        module_id=module.id,
        year=module.year,
        url=f"https://drive.example.com/{slug}",
        exam_year=exam_year,
        zone=zone,
        status=ItemStatus.published,
        published_at=utcnow(),
    )
    db.add(item)
    db.commit()
    return item


def plan(c: TestClient, module: Module, days: int, **body: Any) -> dict[str, Any]:
    exam = (bahrain_today() + timedelta(days=days)).isoformat()
    r = c.post(f"{API}/board/plans", json={"moduleId": module.id, "examDate": exam, **body})
    assert r.status_code == 200, r.text
    made: dict[str, Any] = r.json()
    return made


def board(c: TestClient) -> dict[str, Any]:
    out: dict[str, Any] = c.get(f"{API}/board").json()
    return out


def test_spread_puts_the_cards_evenly_before_the_exam() -> None:
    today = dt.date(2026, 5, 1)
    cards = [BoardCard(id=uuid.uuid4()) for _ in range(4)]
    days = svc.spread(cards, dt.date(2026, 5, 3), today)
    assert [days[c.id].day for c in cards] == [1, 1, 2, 2]
    days = svc.spread(cards[:2], dt.date(2026, 5, 11), today)
    assert [days[c.id].day for c in cards[:2]] == [1, 6]
    assert svc.spread(cards, today, today) == {}


def test_papers_close_their_share_of_the_lessons() -> None:
    items = svc._interleave(["a", "b", "c", "d"], ["p1", "p2"])
    lessons_then = [("lesson", "a"), ("lesson", "b"), ("library_item", "p1")]
    assert items == [*lessons_then, ("lesson", "c"), ("lesson", "d"), ("library_item", "p2")]
    assert svc._interleave([], ["p"]) == [("library_item", "p")]


def test_a_plan_adds_unwatched_lessons_and_papers_and_spreads_them(
    client_for: ClientFor, make_user: MakeUser, module: Module, db: Session, set_feature: Callable[..., None]
) -> None:
    set_feature("library", "everyone")
    old, new = paper(db, module, 2022), paper(db, module, 2024)
    paper(db, module, 2023, kind="examiners-report")
    c = client_for(make_user())
    c.put(f"{API}/me/progress/lessons/{lesson_id(module, 0, 0)}", json={"watched": True})
    made = plan(c, module, 6, paperEvery=3)
    assert made["added"] == 4  # two lessons, two papers (6 days, one every 3)
    assert made["plan"] == {
        "moduleId": module.id,
        "moduleName": "Test",
        "examDate": (bahrain_today() + timedelta(days=6)).isoformat(),
        "paperEvery": 3,
        "left": 4,
        "done": 0,
        "daysLeft": 6,
    }
    got = board(c)
    assert got["plans"] == [made["plan"]]
    todo = [x for x in got["cards"] if x["column"] == "todo"]
    assert [x["title"] for x in todo] == ["Test: One, lesson 2", old.title, "Test: Two, lesson 1", new.title]
    assert all(x["planModuleId"] == module.id for x in todo)
    today = bahrain_today()
    assert [x["planDate"] for x in todo] == [(today + timedelta(days=d)).isoformat() for d in (0, 1, 3, 4)]
    assert todo[1]["link"]["kind"] == "past-paper"

    # watching a lesson ticks it off and the rest spread again
    c.put(f"{API}/me/progress/lessons/{lesson_id(module, 0, 1)}", json={"watched": True})
    got = board(c)
    todo = [x for x in got["cards"] if x["column"] == "todo"]
    assert [x["planDate"] for x in todo] == [(today + timedelta(days=d)).isoformat() for d in (0, 2, 4)]
    assert (got["plans"][0]["left"], got["plans"][0]["done"]) == (3, 1)
    assert next(x for x in got["cards"] if x["column"] == "done")["planDate"] is None

    # planning again keeps the cards, takes the new date and adds nothing twice
    again = plan(c, module, 10, paperEvery=2)
    assert again["added"] == 0
    assert again["plan"]["paperEvery"] == 2
    assert len(board(c)["plans"]) == 1


def test_a_plan_skips_what_is_already_on_the_board_and_papers_when_the_library_is_off(
    client_for: ClientFor, make_user: MakeUser, module: Module, db: Session, set_feature: Callable[..., None]
) -> None:
    set_feature("library", "off")
    paper(db, module, 2024)
    c = client_for(make_user())
    c.post(f"{API}/board/cards", json={"link": {"type": "lesson", "id": lesson_id(module, 1, 0)}})
    made = plan(c, module, 30)
    assert made["added"] == 2
    own = next(x for x in board(c)["cards"] if x["link"]["id"] == lesson_id(module, 1, 0))
    assert own["planModuleId"] is None
    assert own["planDate"] is None


def test_a_plan_needs_a_module_and_a_date_after_today(
    client_for: ClientFor, make_user: MakeUser, module: Module
) -> None:
    c = client_for(make_user())
    today = bahrain_today()
    for body, field in (
        ({"moduleId": "no-such-module", "examDate": (today + timedelta(days=5)).isoformat()}, "moduleId"),
        ({"moduleId": module.id, "examDate": today.isoformat()}, "examDate"),
        ({"moduleId": module.id, "examDate": (today + timedelta(days=400)).isoformat()}, "examDate"),
    ):
        r = c.post(f"{API}/board/plans", json=body)
        assert r.status_code == 422, body
        assert field in r.json()["error"]["fields"]
    r = c.post(f"{API}/board/plans", json={"moduleId": module.id, "examDate": "2027-01-01", "paperEvery": 0})
    assert r.status_code == 422
    guest = client_for().post(f"{API}/board/plans", json={"moduleId": module.id, "examDate": "2027-01-01"})
    assert guest.status_code == 401


def test_removing_a_plan_keeps_what_is_done(
    client_for: ClientFor, make_user: MakeUser, module: Module, db: Session
) -> None:
    user = make_user()
    c = client_for(user)
    plan(c, module, 9)
    c.put(f"{API}/me/progress/lessons/{lesson_id(module, 0, 0)}", json={"watched": True})
    other = client_for(make_user(name="Omar Classmate"))
    assert other.delete(f"{API}/board/plans/{module.id}").status_code == 404
    assert c.delete(f"{API}/board/plans/{module.id}").status_code == 204
    got = board(c)
    assert got["plans"] == []
    assert [(x["title"], x["column"], x["planModuleId"]) for x in got["cards"]] == [("Test: Limits", "done", None)]
    assert c.delete(f"{API}/board/plans/{module.id}").status_code == 404


def test_a_plan_must_fit_on_the_board_and_is_rate_limited(
    client_for: ClientFor, make_user: MakeUser, module: Module, db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    user = make_user()
    earlier = utcnow() - timedelta(hours=2)
    db.add_all(
        BoardCard(user_id=user.id, column="todo", position=float(i), title=f"{i}", created_at=earlier)
        for i in range(svc.MAX_CARDS - 2)
    )
    db.commit()
    c = client_for(user)
    r = c.post(f"{API}/board/plans", json={"moduleId": module.id, "examDate": "2027-01-01"})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "board_full"

    monkeypatch.setattr(svc, "PLAN_LIMIT", 1)
    busy = make_user()
    db.add(BoardPlan(user_id=busy.id, module_id=module.id, exam_date=dt.date(2027, 1, 1), paper_every=3))
    db.commit()
    r = client_for(busy).post(f"{API}/board/plans", json={"moduleId": module.id, "examDate": "2027-01-01"})
    assert r.status_code == 429


def test_plan_cards_do_not_count_against_adding_cards(
    client_for: ClientFor, make_user: MakeUser, module: Module, db: Session
) -> None:
    user = make_user()
    c = client_for(user)
    plan(c, module, 9)
    p = db.scalar(select(BoardPlan).where(BoardPlan.user_id == user.id))
    assert p is not None
    db.add_all(
        BoardCard(user_id=user.id, column="todo", position=100.0 + i, title=f"{i}", plan_id=p.id)
        for i in range(svc.CREATE_LIMIT)
    )
    db.commit()
    assert c.post(f"{API}/board/cards", json={"title": "Mine"}).status_code == 201


def test_the_export_holds_the_plans(client_for: ClientFor, make_user: MakeUser, module: Module) -> None:
    c = client_for(make_user())
    plan(c, module, 9)
    exported = c.get(f"{API}/me/export").json()
    assert [x["moduleId"] for x in exported["boardPlans"]] == [module.id]
    assert {x["planModuleId"] for x in exported["board"]} == {module.id}
