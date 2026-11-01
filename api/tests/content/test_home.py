"""GET /home: Home's first screen in one answer (app/services/home.py). Each part follows its feature's switch, the
year asked for, the student's papers and what they hid, and hidden modules; nothing in it is another student's."""

from __future__ import annotations

import datetime as dt
from collections.abc import Callable
from datetime import timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import CalendarEvent, CalendarPrefs, Module, User
from app.services import home as home_service
from tests.content.conftest import API

Clients = Callable[..., TestClient]
SetFeature = Callable[..., None]
HOME = f"{API}/home"
# A day in the October exams.
TODAY = dt.date(2026, 10, 20)


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


def get_home(client: TestClient, year: int, **params: str) -> dict[str, Any]:
    r = client.get(HOME, params={"year": year, **params})
    assert r.status_code == 200, r.text
    out: dict[str, Any] = r.json()
    return out


def ids(home: dict[str, Any]) -> list[str]:
    return [e["id"] for e in home["dates"]]


# ── who sees what ────────────────────────────────────────────────────────────────────────────


def test_a_guest_gets_the_years_first_screen_in_one_answer(
    client_for: Clients, events: dict[str, CalendarEvent]
) -> None:
    home = get_home(client_for(), 1)

    assert home["site"]["homeBlocks"]
    assert "examWeek" in home["site"]
    assert client_for().get(f"{API}/site").json() == home["site"]
    assert client_for().get(f"{API}/modules/choices").json() == home["choices"]
    # the year's dates and everyone's, from today, never last week's or another year's
    assert ids(home) == ["y1-maths", "everyone-deadline"]
    assert home["nextExam"]["id"] == "y1-maths"
    assert (home["nextExam"]["time"], home["nextExam"]["place"]) == ("09:00", "Hall A")
    # no results date in the last weeks: no guides
    assert (home["resultsDay"], home["guides"]) == (None, None)
    assert home["shelf"] == {"notes": None}


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
    assert home["guides"] is None  # no guide's card is due


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


@pytest.fixture
def resit(db: Session, events: dict[str, CalendarEvent]) -> CalendarEvent:
    """MT1186's resit tomorrow, before the main sitting the fixture has in two days."""
    e = CalendarEvent(
        id="y1-maths-resit", date=day(1), title="MT1186 resit", type="exam", year=1, module_id="mathematics", resit=True
    )
    db.add(e)
    db.commit()
    return e


def test_a_resit_counts_down_for_the_next_year_never_the_modules_own(
    client_for: Clients, resit: CalendarEvent, make_user: Callable[..., User], db: Session
) -> None:
    year1 = get_home(client_for(), 1)
    assert "y1-maths-resit" not in ids(year1)
    assert year1["nextExam"]["id"] == "y1-maths"  # the main sitting, though the resit comes first
    year2 = get_home(client_for(), 2)
    assert ids(year2)[0] == "y1-maths-resit"
    assert (year2["nextExam"]["id"], year2["nextExam"]["resit"]) == ("y1-maths-resit", True)
    # Year 2 papers don't hide Year 1's resits
    assert "y1-maths-resit" in ids(get_home(client_for(), 2, picks="information-systems"))
    # a Year 1 student resitting MT1186 has it, and counts down to it first
    retaking = make_user(name="Retaking", year=1)
    retaking.resits = ["mathematics"]
    db.commit()
    home = get_home(client_for(retaking), 1)
    assert ids(home)[:2] == ["y1-maths-resit", "y1-maths"]
    assert home["nextExam"]["id"] == "y1-maths-resit"


def test_a_final_year_resit_is_only_for_those_resitting(
    client_for: Clients, events: dict[str, CalendarEvent], make_user: Callable[..., User], db: Session
) -> None:
    db.add(
        CalendarEvent(
            id="y3-resit", date=day(1), title="ML resit", type="exam", year=3, module_id="machine-learning", resit=True
        )
    )
    retaking = make_user(name="Retaking", year=3)
    retaking.resits = ["machine-learning"]
    db.commit()
    assert all("y3-resit" not in ids(get_home(client_for(), y)) for y in (1, 2, 3))
    assert "y3-resit" not in ids(get_home(client_for(make_user(year=3)), 3))
    assert get_home(client_for(retaking), 3)["nextExam"]["id"] == "y3-resit"


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


# ── switches, hidden modules, no exam ────────────────────────────────────────────────────────


def test_switched_off_features_leave_their_parts_out(
    client_for: Clients, events: dict[str, CalendarEvent], set_feature: SetFeature, make_user: Callable[..., User]
) -> None:
    sara = make_user(year=2)
    set_feature("library", "off")
    assert get_home(client_for(sara), 2)["nextExam"]["id"] == "y2-inference"

    set_feature("calendar", "off")
    home = get_home(client_for(sara), 2)
    assert home["dates"] == []
    assert home["nextExam"] is None
    assert home["resultsDay"] is None
    assert home["site"]["homeBlocks"]  # the rest of Home still comes

    set_feature("notes", "off")
    assert get_home(client_for(sara), 2)["shelf"]["notes"] is None


def test_a_hidden_modules_dates_stay_off_home(
    client_for: Clients, events: dict[str, CalendarEvent], db: Session
) -> None:
    db.get(Module, "advanced-stats-inferential").hidden = True  # type: ignore[union-attr]
    db.commit()
    home = get_home(client_for(), 2)
    assert "y2-inference" not in ids(home)
    assert home["nextExam"]["id"] == "y2-econometrics"


def test_no_exam_ahead_means_no_countdown(client_for: Clients, db: Session, modules: dict[str, Module]) -> None:
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


# ── the guides ───────────────────────────────────────────────────────────────────────────────


def test_results_day_comes_with_its_date_for_the_guides_weeks(
    client_for: Clients, db: Session, modules: dict[str, Module], monkeypatch: Any
) -> None:
    db.add_all(
        [
            CalendarEvent(id="results", date=day(-3), title="UoL Results Released", type="event"),
            CalendarEvent(id="older", date=day(-5), title="UoL results released", type="event"),
            CalendarEvent(id="next", date=day(80), title="UoL results released", type="event"),
            CalendarEvent(id="other", date=day(-1), title="Careers fair", type="event"),
        ]
    )
    db.commit()
    home = get_home(client_for(), 2)
    assert home["resultsDay"] == "results"  # the latest one up to today, whatever the case of its title
    assert home["guides"]["resultsDay"]["title"]

    monkeypatch.setattr(home_service, "bahrain_today", lambda: TODAY + timedelta(days=10))  # its last day of two weeks
    assert get_home(client_for(), 2)["resultsDay"] == "results"
    monkeypatch.setattr(home_service, "bahrain_today", lambda: TODAY + timedelta(days=11))
    home = get_home(client_for(), 2)
    assert home["resultsDay"] is None
    assert home["guides"] is None


# ── validation ───────────────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("params", [{}, {"year": "4"}, {"year": "2", "picks": "Not a module"}, {"year": "two"}])
def test_a_year_and_well_formed_picks_are_needed(client_for: Clients, params: dict[str, str]) -> None:
    r = client_for().get(HOME, params=params)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "invalid_input"
