"""Security review, rounds 5 to 9 (docs/reviews/security.md). Each test passes while its finding is real: fixing
the finding makes it fail, and then it should be turned around into a regression test."""

from __future__ import annotations

from collections.abc import Callable

from fastapi.testclient import TestClient

from app.models import User
from tests.community.helpers import API

Client = Callable[..., TestClient]


def test_sec35_a_first_year_says_they_are_in_year_3_and_is_listed_as_a_senior(
    client_for: Client, make_user: Callable[..., User], set_feature: Callable[..., None]
) -> None:
    """The year is the student's own say, so "Ask a senior" lists anyone who picks Year 3, with any line they like."""
    set_feature("career.seniors", "everyone")
    me = client_for(make_user(name="New Student", year=1))
    assert me.patch(f"{API}/me", json={"year": 3}).status_code == 200
    body = {"topics": ["internships"], "note": "I did NBB's summer internship. DM me."}
    assert me.put(f"{API}/career/seniors/me", json=body).status_code == 200
    [listed] = client_for().get(f"{API}/career/seniors").json()
    assert (listed["user"]["displayName"], listed["note"]) == ("New Student", body["note"])
