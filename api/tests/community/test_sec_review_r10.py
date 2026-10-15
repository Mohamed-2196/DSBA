"""Who can answer as a senior: the year is the student's own say, so a new account that picks Year 3 waits 30 days,
and the line under their name can't pose as staff or carry a link."""

from __future__ import annotations

from collections.abc import Callable

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import User
from tests.community.helpers import API, settled

Client = Callable[..., TestClient]
MINE = f"{API}/career/seniors/me"


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
