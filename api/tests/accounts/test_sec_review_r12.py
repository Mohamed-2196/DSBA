"""The round 12 security review's re-check of SEC-11: the staff-name rule still reads a name with its spaces. The test
passes while the problem is still there."""

from __future__ import annotations

from collections.abc import Callable

from fastapi.testclient import TestClient

from app.models import User

API = "/api/v1"


def test_sec11_a_spaced_out_staff_word_is_still_a_display_name(
    client_for: Callable[..., TestClient], make_user: Callable[..., User]
) -> None:
    c = client_for(make_user(name="Sara Student"))
    assert c.patch(f"{API}/me", json={"displayName": "Admin"}).status_code == 422
    for name in ("A d m i n", "Ad-min", "D S B A Team", "Student R e p"):
        r = c.patch(f"{API}/me", json={"displayName": name})
        assert r.status_code == 200, r.text
        assert r.json()["displayName"] == name
