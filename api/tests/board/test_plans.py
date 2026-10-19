"""Revision plans on a board: a module's unwatched lessons and some past papers, spread to the exam."""

from __future__ import annotations

import datetime as dt
from collections.abc import Callable
from datetime import timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.time import bahrain_today
from app.models import BoardCard, BoardColumn, BoardPlan, Chapter, Lesson, Module, User
from app.services.board import cards as cards_svc
from app.services.board import common
from app.services.board import plans as svc
from app.services.modules import lesson_name
from tests.board.conftest import API, column, first_board, make_board, move, paper
from tests.lessons import lesson_id

ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]


def plan(c: TestClient, module: Module, days: int, **body: Any) -> dict[str, Any]:
    exam = (bahrain_today() + timedelta(days=days)).isoformat()
    r = c.post(f"{API}/board-plans", json={"moduleId": module.id, "examDate": exam, **body})
    assert r.status_code == 200, r.text
    made: dict[str, Any] = r.json()
    return made


def board(c: TestClient) -> dict[str, Any]:
    """The first board, with "column" on each card: the name of its column."""
    out: dict[str, Any] = c.get(f"{API}/boards/{first_board(c)['id']}").json()
    names = {col["id"]: col["name"] for col in out["board"]["columns"]}
    for card in out["cards"]:
        card["column"] = names[card["columnId"]]
    return out


def test_a_plan_adds_unwatched_lessons_and_papers_and_spreads_them(
    client_for: ClientFor, make_user: MakeUser, module: Module, db: Session, set_feature: Callable[..., None]
) -> None:
    set_feature("library", "everyone")
    paper(db, module, 2022)
    new = paper(db, module, 2024)
    paper(db, module, 2023, kind="examiners-report")
    c = client_for(make_user(tracks=True))
    c.put(f"{API}/me/progress/lessons/{lesson_id(module, 0, 0)}", json={"watched": True})
    made = plan(c, module, 6, paperEvery=3)
    assert (made["added"], made["leftOut"]) == (4, 0)  # two lessons and both papers: under a week, a paper a day
    assert made["plan"] == {
        "moduleId": module.id,
        "moduleName": "Test",
        "boardId": first_board(c)["id"],
        "examDate": (bahrain_today() + timedelta(days=6)).isoformat(),
        "paperEvery": 3,
        "left": 4,
        "done": 0,
        "daysLeft": 6,
    }
    got = board(c)
    assert got["plans"] == [made["plan"]]
    assert c.get(f"{API}/boards").json()["plans"] == [made["plan"]]
    todo = [x for x in got["cards"] if x["column"] == "To do"]
    assert [x["title"] for x in todo] == [
        "TS1000 · One, video 2",
        "TS1000 · Two, video 1",
        "TS1000 past paper · 2022 · zone A",
        "TS1000 past paper · 2024 · zone A",
    ]
    assert all(x["planModuleId"] == module.id for x in todo)
    today = bahrain_today()
    # the papers on the last two days, the lessons spread before them
    assert [x["planDate"] for x in todo] == [(today + timedelta(days=d)).isoformat() for d in (0, 3, 4, 5)]
    assert todo[2]["link"]["kind"] == "past-paper"
    assert todo[2]["link"]["title"] == "TS1000 · 2022 · Zone A"  # the sitting, as the library names it (ST-59)
    assert [i["text"] for i in todo[2]["checklist"]] == list(svc.PAPER_STEPS)
    assert todo[0]["checklist"] == []
    assert todo[3]["link"]["id"] == str(new.id)  # the newest sitting is the last paper before the exam

    # watching a lesson ticks it off and the rest spread again
    c.put(f"{API}/me/progress/lessons/{lesson_id(module, 0, 1)}", json={"watched": True})
    got = board(c)
    todo = [x for x in got["cards"] if x["column"] == "To do"]
    assert [x["planDate"] for x in todo] == [(today + timedelta(days=d)).isoformat() for d in (0, 4, 5)]
    assert (got["plans"][0]["left"], got["plans"][0]["done"]) == (3, 1)
    assert next(x for x in got["cards"] if x["column"] == "Done")["planDate"] is None

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
    c.post(f"{API}/board-cards", json={"link": {"type": "lesson", "id": lesson_id(module, 1, 0)}})
    made = plan(c, module, 30)
    assert (made["added"], made["leftOut"]) == (2, 0)
    own = next(x for x in board(c)["cards"] if x["link"]["id"] == lesson_id(module, 1, 0))
    assert own["planModuleId"] is None
    assert own["planDate"] is None


def test_close_to_the_exam_a_plan_keeps_the_hard_chapters_and_skips_scored_papers(
    client_for: ClientFor, make_user: MakeUser, module: Module, db: Session, set_feature: Callable[..., None]
) -> None:
    set_feature("library", "everyone")
    old, scored = paper(db, module, 2022), paper(db, module, 2024)
    c = client_for(make_user())
    assert c.put(f"{API}/paper-scores/{scored.id}", json={"score": 68}).status_code == 200
    two = module.chapters[1].id
    made = plan(c, module, 1, focusChapters=[two])
    # one day: one paper and room for two lessons, the hard chapter's first
    assert (made["added"], made["leftOut"]) == (3, 1)
    todo = [x for x in board(c)["cards"] if x["column"] == "To do"]
    titles = ["TS1000 · Two, video 1", "TS1000 · Limits", "TS1000 past paper · 2022 · zone A"]
    assert [x["title"] for x in todo] == titles
    assert todo[2]["link"]["id"] == str(old.id)
    assert {x["planDate"] for x in todo} == {bahrain_today().isoformat()}


def test_a_class_recording_is_named_by_its_day() -> None:
    chapter = Chapter(title="Point estimation")
    url = "https://vc.bibf.com/playback/presentation/2.3/6579700419d6e7d39b414c4f1762334cd3738a01-1758094343105"
    assert lesson_name(Lesson(kind="bbb", url=url, chapter=chapter)) == "Point estimation: class of 17 Sep 2025"
    assert lesson_name(Lesson(kind="bbb", title="Revision", url=url, chapter=chapter)) == "Revision"


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
        r = c.post(f"{API}/board-plans", json=body)
        assert r.status_code == 422, body
        assert field in r.json()["error"]["fields"]
    r = c.post(f"{API}/board-plans", json={"moduleId": module.id, "examDate": "2027-01-01", "paperEvery": 0})
    assert r.status_code == 422
    guest = client_for().post(f"{API}/board-plans", json={"moduleId": module.id, "examDate": "2027-01-01"})
    assert guest.status_code == 401


def test_removing_a_plan_keeps_what_is_done(
    client_for: ClientFor, make_user: MakeUser, module: Module, db: Session
) -> None:
    user = make_user(tracks=True)
    c = client_for(user)
    plan(c, module, 9)
    c.put(f"{API}/me/progress/lessons/{lesson_id(module, 0, 0)}", json={"watched": True})
    other = client_for(make_user(name="Omar Classmate"))
    assert other.delete(f"{API}/board-plans/{module.id}").status_code == 404
    assert c.delete(f"{API}/board-plans/{module.id}").status_code == 204
    got = board(c)
    assert got["plans"] == []
    assert [(x["title"], x["column"], x["planModuleId"]) for x in got["cards"]] == [("TS1000 · Limits", "Done", None)]
    assert c.delete(f"{API}/board-plans/{module.id}").status_code == 404


def test_a_plan_must_fit_on_the_board_and_is_rate_limited(
    client_for: ClientFor, make_user: MakeUser, module: Module, db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(common, "MAX_CARDS", 2)
    monkeypatch.setattr(cards_svc, "MAX_CARDS", 2)
    c = client_for(make_user())
    r = c.post(f"{API}/board-plans", json={"moduleId": module.id, "examDate": "2027-01-01"})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "board_full"

    monkeypatch.setattr(svc, "PLAN_LIMIT", 1)
    busy = make_user()
    busy_c = client_for(busy)
    own = make_board(busy_c)
    db.add(
        BoardPlan(
            user_id=busy.id, board_id=own["id"], module_id=module.id, exam_date=dt.date(2027, 1, 1), paper_every=3
        )
    )
    db.commit()
    r = busy_c.post(f"{API}/board-plans", json={"moduleId": module.id, "examDate": "2027-01-01"})
    assert r.status_code == 429


def test_plan_cards_do_not_count_against_adding_cards(
    client_for: ClientFor, make_user: MakeUser, module: Module, db: Session
) -> None:
    user = make_user()
    c = client_for(user)
    plan(c, module, 9)
    p = db.scalar(select(BoardPlan).where(BoardPlan.user_id == user.id))
    assert p is not None
    col = db.scalar(select(BoardColumn).where(BoardColumn.board_id == p.board_id))
    assert col is not None
    db.add_all(
        BoardCard(
            user_id=user.id, board_id=p.board_id, column_id=col.id, position=100.0 + i, title=f"{i}", plan_id=p.id
        )
        for i in range(cards_svc.CREATE_LIMIT)
    )
    db.commit()
    assert c.post(f"{API}/board-cards", json={"title": "Mine"}).status_code == 201


def test_the_export_holds_the_plans(client_for: ClientFor, make_user: MakeUser, module: Module) -> None:
    c = client_for(make_user())
    plan(c, module, 9)
    exported = c.get(f"{API}/me/export").json()
    assert [x["moduleId"] for x in exported["boardPlans"]] == [module.id]
    assert {x["planModuleId"] for x in exported["boards"][0]["cards"]} == {module.id}


def test_a_plan_goes_to_the_board_asked_for_and_stays_there(
    client_for: ClientFor, make_user: MakeUser, module: Module
) -> None:
    c = client_for(make_user())
    make_board(c, "Everyday", "personal")
    exams = make_board(c, "Exams", "study")
    made = plan(c, module, 9, boardId=exams["id"])
    assert made["plan"]["boardId"] == exams["id"]
    got = c.get(f"{API}/boards/{exams['id']}").json()
    assert {x["columnId"] for x in got["cards"]} == {column(exams, "To do")}
    assert [p["moduleId"] for p in got["plans"]] == [module.id]
    assert plan(c, module, 12)["plan"]["boardId"] == exams["id"]  # planning again keeps its board
    # cards nearest done are first in the plan's days
    first, *_rest = got["cards"]
    move(c, got["cards"][-1], column(exams, "In progress"))
    again = {x["id"]: x for x in c.get(f"{API}/boards/{exams['id']}").json()["cards"]}
    assert again[got["cards"][-1]["id"]]["planDate"] == bahrain_today().isoformat()
    assert again[first["id"]]["planDate"] is not None
