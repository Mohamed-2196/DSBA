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


def test_a_new_account_that_picks_year_3_isnt_listed_as_a_senior(
    client_for: Client, make_user: Callable[..., User], set_feature: Callable[..., None]
) -> None:
    set_feature("career.seniors", "everyone")
    me = client_for(make_user(name="New Student", year=1))
    assert me.patch(f"{API}/me", json={"year": 3}).status_code == 200
    mine = me.get(MINE).json()
    assert mine["eligible"] is False
    assert mine["eligibleFrom"] is not None
    body = {"topics": ["internships"], "note": "I did NBB's summer internship. DM me."}
    r = me.put(MINE, json=body)
    assert r.status_code == 403
    assert "30 days" in r.json()["error"]["message"]
    assert client_for().get(f"{API}/career/seniors").json() == []


def test_a_listing_drops_out_while_the_account_is_new(
    client_for: Client, make_user: Callable[..., User], set_feature: Callable[..., None], db: Session
) -> None:
    """A listing made by a settled account isn't shown for one whose age no longer qualifies (a reset clock)."""
    set_feature("career.seniors", "everyone")
    reem = settled(db, make_user(name="Reem A.", year=3))
    assert client_for(reem).put(MINE, json={"topics": ["msc"]}).status_code == 200
    assert len(client_for().get(f"{API}/career/seniors").json()) == 1
    settled(db, reem, days=2)
    assert client_for().get(f"{API}/career/seniors").json() == []


def test_a_seniors_line_cant_pose_as_staff_or_carry_a_link(
    client_for: Client, make_user: Callable[..., User], set_feature: Callable[..., None], db: Session
) -> None:
    set_feature("career.seniors", "everyone")
    me = client_for(settled(db, make_user(name="Reem A.", year=3)))
    for note in ("Student rep: ask me about resits", "Codes changed, see dsba-hub-login.com"):
        r = me.put(MINE, json={"topics": ["msc"], "note": note})
        assert (r.status_code, list(r.json()["error"]["fields"])) == (422, ["note"]), note
    assert me.put(MINE, json={"topics": ["msc"], "note": "DSBA 2025, then an MSc at LSE"}).status_code == 200
