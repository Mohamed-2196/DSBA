"""Bad input is a 4xx, never a 500 (security review SEC-5, code-quality CQ-8); every 500 still has the headers."""

from __future__ import annotations

from collections.abc import Callable

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.security import DB
from app.models import User
from tests.core.helpers import API

Clients = Callable[..., TestClient]


@pytest.mark.parametrize(
    "path",
    [
        "/modules/%00",
        "/library/items/%00",
        "/newsletter/issues/%00",
        "/library/items?module_id=%00",
        "/calendar/events?module_id=%00",
        "/search?q=a%00b",
        "/forum/threads?q=%0d%0aSet-Cookie:x",
    ],
)
def test_control_characters_in_the_address_are_a_bad_request(client_for: Clients, path: str) -> None:
    r = client_for().get(f"{API}{path}")
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "bad_request"
    assert r.headers["x-content-type-options"] == "nosniff"


def test_offsets_have_an_upper_bound(client_for: Clients) -> None:
    c = client_for()
    for path in ("/forum/threads", "/library/items"):
        r = c.get(f"{API}{path}", params={"offset": "99999999999999999999"})
        assert r.status_code == 422
        assert "offset" in r.json()["error"]["fields"]
        assert c.get(f"{API}{path}", params={"offset": 100_000}).status_code == 200


def test_a_value_the_database_refuses_is_invalid_input(app: FastAPI, client_for: Clients, student: User) -> None:
    @app.post("/api/v1/_store")
    def store(db: DB, body: dict[str, str]) -> None:
        db.execute(text("SELECT CAST(:value AS text)"), {"value": body["value"]})

    assert client_for().post(f"{API}/_store", json={"value": "a\u0000b"}).status_code == 422
    r = client_for(student).put(f"{API}/me/progress/resume", json={"moduleId": "a\u0000b", "chapter": 0, "video": 0})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "invalid_input"


def test_an_unhandled_error_keeps_the_headers(app: FastAPI) -> None:
    @app.get("/api/v1/_boom")
    def boom() -> None:
        raise RuntimeError("boom")

    with TestClient(app, raise_server_exceptions=False) as c:
        r = c.get(f"{API}/_boom")
    assert r.status_code == 500
    assert r.json() == {"error": {"code": "internal", "message": "Something went wrong on our side."}}
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["cache-control"] == "no-store"
    assert "frame-ancestors 'none'" in r.headers["content-security-policy"]
