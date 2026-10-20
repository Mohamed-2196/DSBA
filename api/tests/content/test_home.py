"""GET /home: Home's first screen in one answer (app/services/home.py). Each part follows its feature's switch, the
year asked for, the student's papers and what they hid, and hidden modules; nothing in it is another student's."""

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
from app.models import CalendarEvent, CalendarPrefs, Chapter, ItemStatus, LibraryItem, Module, PaperQuestion, User
from app.services import home as home_service
from tests.content.conftest import API

Clients = Callable[..., TestClient]
SetFeature = Callable[..., None]
HOME = f"{API}/home"
# A day in the October exams, in Start here's weeks (from 14 September for six weeks).
TODAY = dt.date(2026, 10, 20)
QUESTION_SWITCHES = ("library.questions", "library.daily-question")


def day(n: int) -> dt.date:
    return TODAY + timedelta(days=n)


@pytest.fixture(autouse=True)
def today(monkeypatch: pytest.MonkeyPatch) -> dt.date:
    monkeypatch.setattr(home_service, "bahrain_today", lambda: TODAY)
    return TODAY


@pytest.fixture
def events(db: Session, modules: dict[str, Module]) -> dict[str, CalendarEvent]:
    rows = [
        CalendarEvent(id="past-exam", date=day(-3), title="Last week's exam", type="exam", year=2),
        CalendarEvent(
            id="y1-maths",
            date=day(2),
            time="09:00",
            place="Hall A",
            title="MT1186 exam",
            type="exam",
            year=1,
            module_id="mathematics",
        ),
        CalendarEvent(
            id="y2-inference",
            date=day(3),
            time="13:00",
            place="Hall B",
            title="ST2134 exam",
            type="exam",
            year=2,
            module_id="advanced-stats-inferential",
        ),
        CalendarEvent(
            id="y2-econometrics", date=day(10), title="EC2020 exam", type="exam", year=2, module_id="econometrics"
        ),
        CalendarEvent(
            id="y2-is", date=day(12), title="IS2184 exam", type="exam", year=2, module_id="information-systems"
        ),
        CalendarEvent(id="y3-mock", date=day(5), title="ML mock", type="mock", year=3, module_id="machine-learning"),
        CalendarEvent(
            id="y3-exam", date=day(8), title="ML exam", type="exam", year=3, module_id="machine-learning", sample=False
        ),
        CalendarEvent(id="everyone-deadline", date=day(6), title="UoL application deadline", type="deadline"),
        CalendarEvent(id="far-away", date=day(300), title="Next year's exam", type="exam", year=2),
    ]
    db.add_all(rows)
    db.commit()
    return {e.id: e for e in rows}


def tagged(db: Session, module_id: str, n: int) -> list[PaperQuestion]:
    """`n` tagged questions on a module's published past papers, three to a paper."""
    chapter = db.scalars(select(Chapter.id).where(Chapter.module_id == module_id).order_by(Chapter.position)).first()
    assert chapter is not None
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


@pytest.fixture
def questions_on(set_feature: SetFeature) -> None:
    for f in QUESTION_SWITCHES:
        set_feature(f, "everyone")


def get_home(client: TestClient, year: int, **params: str) -> dict[str, Any]:
    r = client.get(HOME, params={"year": year, **params})
    assert r.status_code == 200, r.text
    out: dict[str, Any] = r.json()
    return out


def ids(home: dict[str, Any]) -> list[str]:
    return [e["id"] for e in home["dates"]]


# ── who sees what ────────────────────────────────────────────────────────────────────────────


def test_a_guest_gets_the_years_first_screen_in_one_answer(
    client_for: Clients, events: dict[str, CalendarEvent], db: Session, questions_on: None
) -> None:
    tags = tagged(db, "mathematics", 12)
    home = get_home(client_for(), 1)

    assert home["site"]["homeBlocks"]
    assert "examWeek" in home["site"]
    assert client_for().get(f"{API}/site").json() == home["site"]
    assert client_for().get(f"{API}/modules/choices").json() == home["choices"]
    # the year's dates and everyone's, from today, never last week's or another year's
    assert ids(home) == ["y1-maths", "everyone-deadline"]
    assert home["nextExam"]["id"] == "y1-maths"
    assert (home["nextExam"]["time"], home["nextExam"]["place"]) == ("09:00", "Hall A")
    # the day's question: the same pick as the web app's (ids in order, by the day's number since 1970)
    order = sorted(str(t.id) for t in tags)
    assert home["dailyQuestion"]["id"] == order[(TODAY - dt.date(1970, 1, 1)).days % len(order)]
    assert home["dailyQuestion"]["paper"]["title"].startswith("Paper ")
    # Start here's weeks, for Year 1: the guides come along
    assert home["guides"]["startHere"]["title"]
    assert home["resultsDay"] is None
    assert home["shelf"] == {"newFiles": 0, "notes": None}


@pytest.mark.parametrize(
    ("year", "dates", "exam"),
    [
        (1, ["y1-maths", "everyone-deadline"], "y1-maths"),
        (2, ["y2-inference", "everyone-deadline", "y2-econometrics", "y2-is"], "y2-inference"),
        (3, ["y3-mock", "everyone-deadline", "y3-exam"], None),  # a mock comes first: no exam to count down to
    ],
)
def test_each_year_gets_its_own_dates_and_next_exam(
    client_for: Clients, events: dict[str, CalendarEvent], year: int, dates: list[str], exam: str | None
) -> None:
    home = get_home(client_for(), year)
    assert ids(home) == dates
    assert (home["nextExam"] or {}).get("id") == exam
    # Start here is Year 1's only
    assert (home["guides"] is not None) == (year == 1)


def test_a_students_papers_and_what_they_hid_shape_their_dates(
    client_for: Clients, events: dict[str, CalendarEvent], db: Session, make_user: Callable[..., User]
) -> None:
    sara = make_user(name="Sara Second", year=2)
    sara.papers = ["econometrics"]  # the Year 2 option: not Information Systems
    db.add(CalendarPrefs(user_id=sara.id, hidden_events=["y2-inference"], hidden_modules=[], hidden_types=[]))
    db.commit()

    home = get_home(client_for(sara), 2, picks="information-systems")  # a guest's picks never count for an account
    assert ids(home) == ["everyone-deadline", "y2-econometrics"]
    assert home["nextExam"]["id"] == "y2-econometrics"
    # another student, or a guest, sees the year's dates whatever Sara hid
    assert "y2-inference" in ids(get_home(client_for(make_user(year=2)), 2))
    assert "y2-inference" in ids(get_home(client_for(), 2))


def test_a_guests_picks_choose_their_papers(client_for: Clients, events: dict[str, CalendarEvent]) -> None:
    assert ids(get_home(client_for(), 2, picks="information-systems")) == ["y2-inference", "everyone-deadline", "y2-is"]
    # a module from another year counts for the year it was picked in only when it is the student's own (a guest's is
    # the year shown)
    assert "y1-maths" in ids(get_home(client_for(), 2, picks="mathematics"))


def test_the_notes_count_is_the_students_own(
    client_for: Clients, make_user: Callable[..., User], set_feature: SetFeature, modules: dict[str, Module]
) -> None:
    set_feature("notes", "everyone")
    sara, omar = make_user(year=2), make_user(year=2)
    for title in ("Week 1", "Week 2"):
        assert client_for(sara).post(f"{API}/notes", json={"title": title}).status_code == 201
    assert client_for(omar).post(f"{API}/notes", json={"title": "Mine"}).status_code == 201

    assert get_home(client_for(sara), 2)["shelf"]["notes"] == 2
    assert get_home(client_for(omar), 2)["shelf"]["notes"] == 1
    assert get_home(client_for(), 2)["shelf"]["notes"] is None


def test_new_files_count_what_students_shared_in_the_year_this_week(
    client_for: Clients, db: Session, make_user: Callable[..., User], modules: dict[str, Module]
) -> None:
    sara = make_user(year=2)

    def item(*, year: int = 2, days: int = 1, uploader: User | None = sara, module: str = "econometrics") -> None:
        db.add(
            LibraryItem(
                slug=f"file-{uuid.uuid4().hex[:8]}",
                source="link",
                kind="notes",
                title="Notes",
                module_id=module,
                year=year,
                url="https://example.com/notes",
                status=ItemStatus.published,
                uploaded_by=uploader.id if uploader else None,
                published_at=utcnow() - timedelta(days=days),
            )
        )

    item()
    item()
    item(days=8)  # last week's
    item(year=1, module="mathematics")  # another year's
    item(uploader=None)  # imported, not shared by a student
    item(module="information-systems")
    db.get(Module, "information-systems").hidden = True  # type: ignore[union-attr]
    db.commit()

    assert get_home(client_for(), 2)["shelf"]["newFiles"] == 2
    assert get_home(client_for(), 1)["shelf"]["newFiles"] == 1


# ── switches, hidden modules, no exam ────────────────────────────────────────────────────────


def test_switched_off_features_leave_their_parts_out(
    client_for: Clients,
    events: dict[str, CalendarEvent],
    db: Session,
    set_feature: SetFeature,
    questions_on: None,
    make_user: Callable[..., User],
) -> None:
    tagged(db, "advanced-stats-inferential", 10)
    sara = make_user(year=2)
    assert get_home(client_for(sara), 2)["dailyQuestion"] is not None

    set_feature("library.daily-question", "off")
    home = get_home(client_for(sara), 2)
    assert home["dailyQuestion"] is None
    assert home["nextExam"]["id"] == "y2-inference"
    set_feature("library.daily-question", "everyone")

    set_feature("library", "off")
    home = get_home(client_for(sara), 2)
    assert home["dailyQuestion"] is None
    assert home["shelf"]["newFiles"] is None

    set_feature("calendar", "off")
    home = get_home(client_for(sara), 2)
    assert home["dates"] == []
    assert home["nextExam"] is None
    assert home["resultsDay"] is None
    assert home["site"]["homeBlocks"]  # the rest of Home still comes

    set_feature("notes", "off")
    assert get_home(client_for(sara), 2)["shelf"]["notes"] is None


def test_a_hidden_modules_dates_and_questions_stay_off_home(
    client_for: Clients, events: dict[str, CalendarEvent], db: Session, questions_on: None
) -> None:
    tagged(db, "advanced-stats-inferential", 12)
    assert get_home(client_for(), 2)["dailyQuestion"] is not None

    db.get(Module, "advanced-stats-inferential").hidden = True  # type: ignore[union-attr]
    db.commit()
    home = get_home(client_for(), 2)
    assert "y2-inference" not in ids(home)
    assert home["nextExam"]["id"] == "y2-econometrics"
    assert home["dailyQuestion"] is None  # econometrics has no tagged questions


def test_no_exam_ahead_means_no_countdown_and_no_question(
    client_for: Clients, db: Session, modules: dict[str, Module], questions_on: None
) -> None:
    tagged(db, "econometrics", 12)
    db.add_all(
        [
            CalendarEvent(id="break", date=day(4), title="Mid-year break", type="break"),
            CalendarEvent(id="sample", date=day(5), title="EC2020 exam", type="exam", year=2, sample=True),
        ]
    )
    db.commit()
    home = get_home(client_for(), 2)
    assert ids(home) == ["break", "sample"]
    assert home["nextExam"] is None
    assert home["dailyQuestion"] is None


def test_the_daily_question_waits_for_the_six_weeks_and_enough_tags(
    client_for: Clients, db: Session, modules: dict[str, Module], questions_on: None
) -> None:
    exam = CalendarEvent(id="ec", date=day(50), title="EC2020 exam", type="exam", year=2, module_id="econometrics")
    db.add(exam)
    db.commit()
    tags = tagged(db, "econometrics", 9)
    assert get_home(client_for(), 2)["nextExam"]["id"] == "ec"
    assert get_home(client_for(), 2)["dailyQuestion"] is None  # 50 days ahead

    exam.date = day(42)
    db.commit()
    assert get_home(client_for(), 2)["dailyQuestion"] is None  # nine tags only

    tags += tagged(db, "econometrics", 1)
    first = get_home(client_for(), 2)["dailyQuestion"]["id"]
    assert first in {str(t.id) for t in tags}


def test_the_daily_question_changes_with_the_day(
    client_for: Clients, db: Session, events: dict[str, CalendarEvent], questions_on: None, monkeypatch: Any
) -> None:
    tagged(db, "advanced-stats-inferential", 11)
    today = get_home(client_for(), 2)["dailyQuestion"]["id"]
    monkeypatch.setattr(home_service, "bahrain_today", lambda: TODAY + timedelta(days=1))
    assert get_home(client_for(), 2)["dailyQuestion"]["id"] != today


# ── the guides ───────────────────────────────────────────────────────────────────────────────


def test_results_day_comes_with_its_date_for_the_guides_weeks(
    client_for: Clients, db: Session, modules: dict[str, Module], monkeypatch: Any
) -> None:
    db.add(CalendarEvent(id="results", date=day(-3), title="UoL results released", type="event"))
    db.commit()
    home = get_home(client_for(), 2)
    assert home["resultsDay"] == "results"
    assert home["guides"]["resultsDay"]["title"]

    monkeypatch.setattr(home_service, "bahrain_today", lambda: TODAY + timedelta(days=12))  # two weeks on
    home = get_home(client_for(), 2)
    assert home["resultsDay"] is None
    assert home["guides"] is None


def test_start_here_comes_only_in_its_weeks(client_for: Clients, monkeypatch: Any) -> None:
    assert get_home(client_for(), 1)["guides"] is not None
    monkeypatch.setattr(home_service, "bahrain_today", lambda: dt.date(2026, 12, 1))
    assert get_home(client_for(), 1)["guides"] is None
    monkeypatch.setattr(home_service, "bahrain_today", lambda: dt.date(2027, 9, 20))  # the next academic year's
    assert get_home(client_for(), 1)["guides"] is not None


# ── validation ───────────────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("params", [{}, {"year": "4"}, {"year": "2", "picks": "Not a module"}, {"year": "two"}])
def test_a_year_and_well_formed_picks_are_needed(client_for: Clients, params: dict[str, str]) -> None:
    r = client_for().get(HOME, params=params)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "invalid_input"
