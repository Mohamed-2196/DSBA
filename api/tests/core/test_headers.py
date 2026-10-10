"""Security headers on API answers (security review, findings 12 and 19)."""

from __future__ import annotations

from collections.abc import Callable

import httpx
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

from app.core.headers import API_CSP
from app.models import User
from tests.core.helpers import API

Clients = Callable[..., TestClient]


def _assert_protected(r: httpx.Response) -> None:
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["referrer-policy"] == "no-referrer"
    assert r.headers["x-frame-options"] == "DENY"
    csp = r.headers["content-security-policy"]
    assert csp == API_CSP
    assert "frame-ancestors 'none'" in csp
    assert "default-src 'none'" in csp


def test_every_kind_of_answer_is_protected(client_for: Clients, student: User) -> None:
    guest = client_for()
    for r in (
        guest.get(f"{API}/modules"),  # public JSON
        guest.get(f"{API}/nope"),  # 404
        guest.get(f"{API}/me"),  # 401
        guest.post(f"{API}/auth/logout", headers={"X-CSRF-Token": "wrong"}),  # the CSRF refusal
        client_for(student).get(f"{API}/me"),  # someone's own data
    ):
        _assert_protected(r)
        assert r.headers["cache-control"] == "no-store"


def test_handlers_may_choose_a_cache_policy_except_for_signed_in_json(
    app: FastAPI, client_for: Clients, student: User
) -> None:
    @app.get("/api/v1/_cached")
    def cached() -> JSONResponse:
        return JSONResponse({"ok": True}, headers={"Cache-Control": "public, max-age=60"})

    assert client_for().get(f"{API}/_cached").headers["cache-control"] == "public, max-age=60"
    assert client_for(student).get(f"{API}/_cached").headers["cache-control"] == "no-store"
    feed = client_for(student).get(f"{API}/calendar/feed.ics")  # not JSON: the feed's own policy stays
    assert feed.headers["cache-control"] == "public, max-age=900"
    _assert_protected(feed)


def test_the_development_docs_page_works_without_the_api_policy(client_for: Clients) -> None:
    r = client_for().get(f"{API}/docs")
    assert r.status_code == 200
    assert "content-security-policy" not in r.headers
    assert r.headers["x-content-type-options"] == "nosniff"
