"""Seniors who answer: Year 3 students list themselves, Career Navigator lists them, and "Ask" tells them."""

from __future__ import annotations

from collections.abc import Callable

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import User
from tests.community.helpers import API, notifications_for, settled

Client = Callable[..., TestClient]
SetFeature = Callable[..., None]
MINE = f"{API}/career/seniors/me"


def test_a_year_3_student_lists_themselves_pauses_and_leaves(
    client_for: Client, make_user: Callable[..., User], set_feature: SetFeature, db: Session
) -> None:
    set_feature("career.seniors", "everyone")
    reem = settled(db, make_user(name="Reem A.", year=3))
    me = client_for(reem)
    assert me.get(MINE).json() == {
        "eligible": True,
        "eligibleFrom": None,
        "listed": False,
        "topics": [],
        "note": "",
        "paused": False,
    }
    body = {"topics": ["internships", "jobs", "internships"], "note": "I did NBB's summer internship."}
    saved = me.put(MINE, json=body).json()
    assert (saved["listed"], saved["topics"]) == (True, ["internships", "jobs"])
    listed = client_for().get(f"{API}/career/seniors").json()
    assert listed == [
        {
            "user": {"id": str(reem.id), "displayName": "Reem A.", "year": 3, "badge": None},
            "topics": ["internships", "jobs"],
            "note": "I did NBB's summer internship.",
        }
    ]
    me.put(MINE, json={**body, "paused": True})
    assert client_for().get(f"{API}/career/seniors").json() == []
    assert me.delete(MINE).status_code == 204
    assert me.get(MINE).json()["listed"] is False


def test_only_year_3_may_list_themselves(client_for: Client, student: User, set_feature: SetFeature) -> None:
    set_feature("career.seniors", "everyone")
    assert client_for(student).get(MINE).json()["eligible"] is False
    r = client_for(student).put(MINE, json={"topics": ["msc"]})
    assert r.status_code == 403


def test_asking_a_senior_tells_them_and_respects_anonymity(
    client_for: Client, make_user: Callable[..., User], student: User, set_feature: SetFeature, db: Session
) -> None:
    set_feature("career.seniors", "everyone")
    set_feature("forum.anonymous", "everyone")
    reem = settled(db, make_user(name="Reem A.", year=3))
    client_for(reem).put(MINE, json={"topics": ["internships"]})
    ask = {"title": "How did you apply to NBB?", "seniorId": str(reem.id)}
    assert client_for(student).post(f"{API}/forum/threads", json=ask).status_code == 201
    quiet = client_for(student).post(f"{API}/forum/threads", json={**ask, "title": "Was it paid?", "anonymous": True})
    assert quiet.status_code == 201
    told = notifications_for(db, reem)
    by_title = {n.title: n for n in told}
    assert set(by_title) == {"Sara M. asked you a question", "A Year 2 student asked you a question"}
    assert by_title["A Year 2 student asked you a question"].actor_id is None
    assert all(n.kind == "senior_question" for n in told)


def test_a_paused_or_unknown_senior_cant_be_asked(
    client_for: Client, make_user: Callable[..., User], student: User, set_feature: SetFeature, db: Session
) -> None:
    set_feature("career.seniors", "everyone")
    reem = settled(db, make_user(name="Reem A.", year=3))
    client_for(reem).put(MINE, json={"topics": ["internships"], "paused": True})
    r = client_for(student).post(f"{API}/forum/threads", json={"title": "How did you apply?", "seniorId": str(reem.id)})
    assert (r.status_code, list(r.json()["error"]["fields"])) == (422, ["seniorId"])
    r = client_for(student).post(
        f"{API}/forum/threads", json={"title": "How did you apply?", "seniorId": str(student.id)}
    )
    assert r.status_code == 422


def test_the_listing_is_in_the_export(
    client_for: Client, make_user: Callable[..., User], set_feature: SetFeature, db: Session
) -> None:
    set_feature("career.seniors", "everyone")
    reem = settled(db, make_user(name="Reem A.", year=3))
    client_for(reem).put(MINE, json={"topics": ["msc"], "note": "MSc at LSE"})
    senior = client_for(reem).get(f"{API}/me/export").json()["senior"]
    assert (senior["topics"], senior["note"], senior["paused"]) == (["msc"], "MSc at LSE", False)
