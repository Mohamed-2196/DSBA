"""Requests from students: asking, me too, the queue's order, the reps' answers and their notifications, removal,
reports, the switch and the limits."""

from __future__ import annotations

from collections.abc import Callable
from datetime import timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.time import utcnow
from app.models import AuditEntry, Module, Notification, StudentRequest, User, UserStatus
from app.services import accounts
from tests.community.helpers import API

Client = Callable[..., TestClient]
PAPER = {"kind": "paper", "title": "ST2133 past papers from 2019", "details": "The zone B ones, please."}


@pytest.fixture(autouse=True)
def requests_on(set_feature: Callable[..., None]) -> None:
    set_feature("requests", "everyone")


def ask(client: TestClient, **fields: Any) -> dict[str, Any]:
    r = client.post(f"{API}/requests", json={**PAPER, **fields})
    assert r.status_code == 201, r.text
    data: dict[str, Any] = r.json()
    return data


def notifications(db: Session, user: User) -> list[Notification]:
    return list(
        db.scalars(select(Notification).where(Notification.user_id == user.id, Notification.kind == "request_update"))
    )


def test_ask_and_read(client_for: Client, student: User, modules: dict[str, Module]) -> None:
    made = ask(client_for(student), moduleId="advanced-stats-distribution", title="  ST2133   past papers  ")
    assert made["title"] == "ST2133 past papers"
    assert (made["status"], made["mine"], made["meTooCount"], made["meToo"]) == ("open", True, 0, False)
    assert made["moduleTitle"] == "Advanced statistics: distribution theory"
    assert made["author"]["displayName"] == "Sara M."
    guest = client_for().get(f"{API}/requests/{made['id']}")
    assert guest.status_code == 200
    assert guest.json()["mine"] is False
    listed = client_for().get(f"{API}/requests").json()
    assert [r["id"] for r in listed["items"]] == [made["id"]]


def test_what_a_request_must_be(client_for: Client, student: User) -> None:
    c = client_for(student)
    assert c.post(f"{API}/requests", json={**PAPER, "title": "pls"}).status_code == 422
    assert c.post(f"{API}/requests", json={**PAPER, "title": "!!!!!!!"}).status_code == 422
    assert c.post(f"{API}/requests", json={**PAPER, "kind": "money"}).status_code == 422
    unknown = c.post(f"{API}/requests", json={**PAPER, "moduleId": "astrology"})
    assert unknown.status_code == 422
    assert "moduleId" in unknown.json()["error"]["fields"]


def test_guests_and_suspended_accounts_only_read(client_for: Client, student: User, db: Session) -> None:
    made = ask(client_for(student))
    assert client_for().post(f"{API}/requests", json=PAPER).status_code == 401
    assert client_for().put(f"{API}/requests/{made['id']}/me-too").status_code == 401
    student.status = UserStatus.suspended
    db.commit()
    c = client_for(student)
    assert c.post(f"{API}/requests", json=PAPER).status_code == 403
    assert c.get(f"{API}/requests/{made['id']}").status_code == 200


def test_me_too_orders_the_list_and_own_requests_come_first(
    client_for: Client, student: User, classmate: User, make_user: Callable[..., User]
) -> None:
    first = ask(client_for(classmate), title="Notes for machine learning")
    second = ask(client_for(classmate), title="Exam dates for year 3")
    mine = ask(client_for(student), title="A dark mode for the library")
    others = [client_for(make_user(name=f"Student {n}")) for n in range(2)]
    for c in others:
        r = c.put(f"{API}/requests/{second['id']}/me-too")
        assert r.status_code == 200, r.text
        assert r.json()["meToo"] is True
    again = others[0].put(f"{API}/requests/{second['id']}/me-too")  # twice changes nothing
    assert again.json()["meTooCount"] == 2
    assert client_for(student).put(f"{API}/requests/{first['id']}/me-too").json()["meTooCount"] == 1

    def order(c: TestClient, **query: Any) -> list[str]:
        return [r["id"] for r in c.get(f"{API}/requests", params=query).json()["items"]]

    assert order(client_for()) == [second["id"], first["id"], mine["id"]]
    assert order(client_for(student)) == [mine["id"], second["id"], first["id"]]
    assert order(client_for(), sort="newest") == [mine["id"], second["id"], first["id"]]
    assert order(client_for(student), mine="true") == [mine["id"]]
    assert order(client_for(), mine="true") == []
    taken = others[1].delete(f"{API}/requests/{second['id']}/me-too")
    assert (taken.json()["meTooCount"], taken.json()["meToo"]) == (1, False)
    own = client_for(student).put(f"{API}/requests/{mine['id']}/me-too")
    assert (own.status_code, own.json()["error"]["code"]) == (409, "own_request")


def test_filters_and_search(client_for: Client, student: User, moderator: User) -> None:
    paper = ask(client_for(student), title="Past papers for econometrics")
    feature = ask(client_for(student), kind="feature", title="A timetable export to Google Calendar")
    client_for(moderator).post(f"{API}/requests/{feature['id']}/answer", json={"status": "planned"})

    def ids(**query: Any) -> list[str]:
        return [r["id"] for r in client_for().get(f"{API}/requests", params=query).json()["items"]]

    assert ids(kind="paper") == [paper["id"]]
    assert ids(status="planned") == [feature["id"]]
    assert ids(q="econometr") == [paper["id"]]
    assert client_for().get(f"{API}/requests", params={"kind": "money"}).status_code == 422


def test_similar_requests(client_for: Client, student: User) -> None:
    made = ask(client_for(student), title="Past papers for econometrics")
    ask(client_for(student), kind="event", title="Add the graduation date")
    hits = client_for().get(f"{API}/requests/similar", params={"q": "econometrics 2021 papers"}).json()
    assert [h["id"] for h in hits] == [made["id"]]
    assert client_for().get(f"{API}/requests/similar", params={"q": "for the"}).json() == []
    assert client_for().get(f"{API}/requests/similar", params={"q": "econ:* & !"}).json()[0]["id"] == made["id"]


def test_answers_notify_the_requester_and_the_me_toos(
    client_for: Client, student: User, classmate: User, moderator: User, make_user: Callable[..., User], db: Session
) -> None:
    made = ask(client_for(student))
    client_for(classmate).put(f"{API}/requests/{made['id']}/me-too")
    bystander = make_user(name="Not Interested")
    rep = client_for(moderator)
    r = rep.post(f"{API}/requests/{made['id']}/answer", json={"status": "planned", "reply": "Asking the tutor."})
    assert r.status_code == 200, r.text
    assert (r.json()["status"], r.json()["reply"]) == ("planned", "Asking the tutor.")
    assert r.json()["answeredBy"]["displayName"] == "Student Rep"
    for person in (student, classmate):
        told = notifications(db, person)
        assert [n.url for n in told] == [f"/requests/{made['id']}"]
        assert told[0].title == "Request planned: ST2133 past papers from 2019"
    assert notifications(db, bystander) == []
    rep.post(f"{API}/requests/{made['id']}/answer", json={"status": "planned", "reply": "Still asking."})
    assert len(notifications(db, student)) == 1  # the same status: nobody is told again
    entries = db.scalars(select(AuditEntry).where(AuditEntry.action == "request.status")).all()
    assert [(e.data["from"], e.data["to"], e.data["told"]) for e in entries] == [
        ("open", "planned", 2),
        ("planned", "planned", 0),
    ]


def test_declining_needs_a_reason_and_closes_me_too(
    client_for: Client, student: User, classmate: User, moderator: User
) -> None:
    made = ask(client_for(student))
    rep = client_for(moderator)
    refused = rep.post(f"{API}/requests/{made['id']}/answer", json={"status": "declined", "reply": "   "})
    assert (refused.status_code, list(refused.json()["error"]["fields"])) == (422, ["reply"])
    ok = rep.post(f"{API}/requests/{made['id']}/answer", json={"status": "declined", "reply": "Not allowed to share."})
    assert ok.status_code == 200
    closed = client_for(classmate).put(f"{API}/requests/{made['id']}/me-too")
    assert (closed.status_code, closed.json()["error"]["code"]) == (409, "request_closed")


def test_only_handlers_answer_and_remove(
    client_for: Client, student: User, classmate: User, moderator: User, db: Session
) -> None:
    made = ask(client_for(student))
    for c in (client_for(student), client_for(classmate)):
        assert c.post(f"{API}/requests/{made['id']}/answer", json={"status": "done"}).status_code == 403
        assert c.delete(f"{API}/requests/{made['id']}").status_code == 403
    assert client_for(moderator).delete(f"{API}/requests/{made['id']}").status_code == 204
    assert client_for().get(f"{API}/requests/{made['id']}").status_code == 404
    assert client_for().get(f"{API}/requests").json()["total"] == 0
    entry = db.scalars(select(AuditEntry).where(AuditEntry.action == "request.remove")).one()
    assert entry.data["title"] == PAPER["title"]
    moderator.status = UserStatus.suspended
    db.commit()
    other = ask(client_for(student), title="Another request for notes")
    assert client_for(moderator).delete(f"{API}/requests/{other['id']}").status_code == 403


def test_reports_reach_the_people_who_handle_requests(
    client_for: Client,
    student: User,
    classmate: User,
    moderator: User,
    make_role: Callable[..., Any],
    make_user: Callable[..., User],
    give_roles: Callable[..., None],
) -> None:
    made = ask(client_for(student))
    report = {"targetType": "request", "targetId": made["id"], "reason": "spam"}
    assert client_for(classmate).post(f"{API}/reports", json=report).status_code == 204
    queue = client_for(moderator).get(f"{API}/admin/reports").json()["items"]
    assert [(r["targetType"], r["targetUrl"], r["targetStatus"]) for r in queue] == [
        ("request", f"/requests/{made['id']}", "open")
    ]
    make_role("forum-helpers", "forum.moderate")
    helper = make_user(name="Forum Helper", roles=())
    give_roles(helper, "forum-helpers")
    assert client_for(helper).get(f"{API}/admin/reports").json()["items"] == []  # not their queue
    stats = client_for(moderator).get(f"{API}/admin/stats").json()
    assert stats["openRequests"] == 1


def test_switched_off(
    client_for: Client,
    student: User,
    moderator: User,
    make_user: Callable[..., User],
    set_feature: Callable[..., None],
    db: Session,
) -> None:
    made = ask(client_for(student))
    set_feature("requests", "off")
    for c in (client_for(), client_for(student), client_for(moderator)):
        r = c.get(f"{API}/requests")
        assert (r.status_code, r.json()["error"]["code"]) == (404, "feature_off")
    assert client_for(student).post(f"{API}/requests", json=PAPER).status_code == 404
    report = {"targetType": "request", "targetId": made["id"], "reason": "spam"}
    assert client_for(student).post(f"{API}/reports", json=report).status_code == 404
    assert client_for(moderator).get(f"{API}/admin/stats").json()["openRequests"] is None
    boss = client_for(make_user(name="Head Admin", roles=("student", "admin")))  # admins see every feature
    answered = boss.post(f"{API}/requests/{made['id']}/answer", json={"status": "done"})
    assert answered.status_code == 200, answered.text
    assert notifications(db, student) == []  # nobody is told about a switched-off feature


def test_five_requests_a_day(client_for: Client, student: User, db: Session) -> None:
    c = client_for(student)
    for n in range(5):
        ask(c, title=f"Request number {n}")
    limited = c.post(f"{API}/requests", json=PAPER)
    assert (limited.status_code, limited.json()["error"]["code"]) == (429, "rate_limited")
    db.execute(update(StudentRequest).values(created_at=utcnow() - timedelta(days=1, minutes=1)))
    db.commit()
    assert c.post(f"{API}/requests", json=PAPER).status_code == 201


def test_export_and_deletion(client_for: Client, student: User, classmate: User, db: Session, storage: Any) -> None:
    made = ask(client_for(student))
    client_for(classmate).put(f"{API}/requests/{made['id']}/me-too")
    export = client_for(classmate).get(f"{API}/me/export").json()
    assert export["meToos"] == [made["id"]]
    assert [r["title"] for r in client_for(student).get(f"{API}/me/export").json()["requests"]] == [PAPER["title"]]
    accounts.delete_account(db, classmate, storage)
    assert client_for().get(f"{API}/requests/{made['id']}").json()["meTooCount"] == 0
