"""What's missing, for the rep: Manage's Gaps screen, by box and by feature."""

from __future__ import annotations

import datetime as dt
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.time import bahrain_today
from app.models import (
    CalendarEvent,
    Chapter,
    ItemSource,
    ItemStatus,
    Lesson,
    LibraryItem,
    LibraryText,
    Module,
    RequestStatus,
    StudentRequest,
    TextStatus,
    User,
)
from tests.community.helpers import API

Client = Callable[..., TestClient]
ST2133 = "advanced-stats-distribution"


@pytest.fixture(autouse=True)
def switches_on(set_feature: Callable[..., None]) -> None:
    set_feature("requests", "everyone")


@pytest.fixture
def admin(make_user: Callable[..., Any]) -> User:
    user: User = make_user(name="Head Admin", roles=("student", "admin"))
    return user


def file(db: Session, kind: str, *, module: str = ST2133, year: int | None = 2023, session: str = "may") -> LibraryItem:
    item = LibraryItem(
        slug=f"{module}-{kind}-{year}-{session}",
        source=ItemSource.file,
        kind=kind,
        title=f"{module} {kind} {year}",
        module_id=module,
        storage_key="library/test.pdf",
        file_name="test.pdf",
        exam_year=year,
        exam_session=session if year else None,
        status=ItemStatus.published,
    )
    db.add(item)
    db.commit()
    return item


def gaps(client: TestClient) -> dict[str, Any]:
    r = client.get(f"{API}/admin/gaps")
    assert r.status_code == 200, r.text
    body: dict[str, Any] = r.json()
    return body


def test_students_can_not_see_the_gaps(client_for: Client, student: User) -> None:
    r = client_for(student).get(f"{API}/admin/gaps")

    assert r.status_code == 403


def test_sittings_missing_a_report_or_a_paper_scans_and_cheat_sheets(
    db: Session, client_for: Client, admin: User, modules: dict[str, Module]
) -> None:
    file(db, "past-paper", year=2023)  # no report
    file(db, "examiners-report", year=2022)  # no paper
    file(db, "past-paper", year=2021)
    file(db, "examiners-report", year=2021)  # complete
    scan = file(db, "past-paper", module="mathematics", year=2020)
    file(db, "examiners-report", module="mathematics", year=2020)
    db.add(LibraryText(item_id=scan.id, status=TextStatus.empty))
    file(db, "cheat-sheet", year=None)
    db.commit()

    library = gaps(client_for(admin))["library"]

    assert [(s["module"]["id"], s["examYear"], s["missing"]) for s in library["sittings"]] == [
        (ST2133, 2023, "report"),
        (ST2133, 2022, "paper"),
    ]
    assert [(s["slug"], s["text"]) for s in library["scans"]] == [(scan.slug, "empty")]
    assert ST2133 not in [m["id"] for m in library["noCheatSheet"]]
    assert "mathematics" in [m["id"] for m in library["noCheatSheet"]]


def test_modules_without_lessons_and_hidden_ones_left_out(
    db: Session, client_for: Client, admin: User, modules: dict[str, Module]
) -> None:
    modules["machine-learning"].hidden = True
    full, empty = (
        Chapter(id="c-full", module_id=ST2133, title="Full"),
        Chapter(id="c-empty", module_id=ST2133, title="Empty"),
    )
    db.add_all([full, empty])
    db.flush()
    db.add_all(
        [
            Lesson(id="l-1", module_id=ST2133, chapter_id="c-full", kind="youtube", video_id="abc"),
            Lesson(id="l-2", module_id=ST2133, chapter_id="c-full", kind="youtube", video_id="def", unavailable=True),
        ]
    )
    db.commit()

    lessons = {g["module"]["id"]: g for g in gaps(client_for(admin))["lessons"]}

    assert lessons[ST2133] | {"module": None} == {
        "module": None,
        "chapters": 2,
        "emptyChapters": 1,
        "lessons": 2,
        "unavailable": 1,
    }
    assert lessons["mathematics"]["lessons"] == 0
    assert "machine-learning" not in lessons


def test_unconfirmed_dates_and_exams_without_a_time_or_place(
    db: Session, client_for: Client, admin: User, modules: dict[str, Module]
) -> None:
    today = bahrain_today()
    db.add_all(
        [
            CalendarEvent(id="soon-sample", date=today + dt.timedelta(days=5), title="Mock", type="mock", sample=True),
            CalendarEvent(id="far-sample", date=today + dt.timedelta(days=60), title="Later", type="mock", sample=True),
            CalendarEvent(
                id="exam-bare", date=today + dt.timedelta(days=20), title="ST2133 exam", type="exam", time="9:00"
            ),
            CalendarEvent(
                id="exam-full",
                date=today + dt.timedelta(days=21),
                title="MT1186",
                type="exam",
                time="9:00",
                place="Hall",
            ),
            CalendarEvent(id="exam-past", date=today - dt.timedelta(days=1), title="Old", type="exam"),
        ]
    )
    db.commit()

    calendar = gaps(client_for(admin))["calendar"]

    assert [e["id"] for e in calendar["unconfirmed"]] == ["soon-sample"]
    assert [(e["id"], e["noTime"], e["noPlace"]) for e in calendar["examDetails"]] == [("exam-bare", False, True)]


def test_the_most_wanted_open_requests_first(
    db: Session, client_for: Client, admin: User, student: User, modules: dict[str, Module]
) -> None:
    for title, me_too, status in [
        ("A little wanted", 1, RequestStatus.open),
        ("Most wanted", 9, RequestStatus.planned),
        ("Done already", 20, RequestStatus.done),
    ]:
        db.add(StudentRequest(author_id=student.id, kind="paper", title=title, me_too_count=me_too, status=status))
    db.commit()

    requests = gaps(client_for(admin))["requests"]

    assert [(r["title"], r["meTooCount"]) for r in requests] == [("Most wanted", 9), ("A little wanted", 1)]


def test_each_part_follows_its_box_and_its_feature(
    client_for: Client, make_user: Callable[..., Any], set_feature: Callable[..., None], modules: dict[str, Module]
) -> None:
    content = make_user(name="Content Manager", roles=("student", "content-manager"))
    body = gaps(client_for(content))
    assert [k for k, part in body.items() if part is not None] == ["lessons", "calendar"]

    set_feature("calendar", "off")
    assert gaps(client_for(content))["calendar"] is None
