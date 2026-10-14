"""You asked, we did (IDEA-38): the requests done in the last 30 days, the latest answered first, behind its switch."""

from __future__ import annotations

import datetime as dt
from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.time import BAHRAIN, bahrain_today, utcnow
from app.models import RequestStatus, StudentRequest, User
from tests.community.helpers import API

Client = Callable[..., TestClient]


@pytest.fixture(autouse=True)
def switches_on(set_feature: Callable[..., None]) -> None:
    set_feature("requests", "everyone")
    set_feature("requests.done", "everyone")


def make(
    db: Session,
    author: User,
    title: str,
    *,
    status: RequestStatus = RequestStatus.done,
    answered: dt.datetime | None = None,
    me_too: int = 0,
    removed: bool = False,
) -> StudentRequest:
    req = StudentRequest(
        author_id=author.id,
        kind="paper",
        title=title,
        status=status,
        answered_at=answered,
        me_too_count=me_too,
        removed_at=utcnow() if removed else None,
    )
    db.add(req)
    db.commit()
    return req


def days_ago(n: int) -> dt.datetime:
    return dt.datetime.combine(bahrain_today() - dt.timedelta(days=n), dt.time(12), tzinfo=BAHRAIN)


def test_lists_the_requests_done_in_the_last_30_days_latest_first(
    db: Session, client_for: Client, student: User
) -> None:
    make(db, student, "MT1186 2019 paper", answered=days_ago(20), me_too=4)
    make(db, student, "ST2133 notes", answered=days_ago(1), me_too=1)
    make(db, student, "Too old to list", answered=days_ago(30))
    make(db, student, "Still open", status=RequestStatus.open, answered=days_ago(2))
    make(db, student, "Declined", status=RequestStatus.declined, answered=days_ago(2))
    make(db, student, "Removed", answered=days_ago(2), removed=True)

    r = client_for().get(f"{API}/requests/done")

    assert r.status_code == 200, r.text
    body = r.json()
    assert [i["title"] for i in body["items"]] == ["ST2133 notes", "MT1186 2019 paper"]
    assert [i["meTooCount"] for i in body["items"]] == [1, 4]
    assert body["total"] == 2
    assert body["until"] == bahrain_today().isoformat()
    assert body["since"] == (bahrain_today() - dt.timedelta(days=29)).isoformat()


def test_an_issue_asks_for_the_30_days_up_to_its_date(db: Session, client_for: Client, student: User) -> None:
    make(db, student, "Before the issue", answered=days_ago(40))
    make(db, student, "After the issue", answered=days_ago(1))
    until = (bahrain_today() - dt.timedelta(days=35)).isoformat()

    body = client_for().get(f"{API}/requests/done", params={"until": until}).json()

    assert [i["title"] for i in body["items"]] == ["Before the issue"]


def test_limit_caps_the_list_but_not_the_total(db: Session, client_for: Client, student: User) -> None:
    for n in range(3):
        make(db, student, f"Done request {n}", answered=days_ago(n))

    body = client_for().get(f"{API}/requests/done", params={"limit": 2}).json()

    assert len(body["items"]) == 2
    assert body["total"] == 3


def test_switched_off_it_is_gone(set_feature: Callable[..., None], client_for: Client, student: User) -> None:
    set_feature("requests.done", "off")

    r = client_for(student).get(f"{API}/requests/done")

    assert r.status_code == 404
    assert r.json()["error"]["code"] == "feature_off"
