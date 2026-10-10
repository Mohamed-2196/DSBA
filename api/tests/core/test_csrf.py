"""CSRF tokens are bound to the session (security review, finding 14); the cookies' names are configurable."""

from __future__ import annotations

import re
from collections.abc import Callable, Iterator

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.security import csrf_token_for
from app.models import User
from app.services import mailer
from tests.core.conftest import SetOption
from tests.core.helpers import API

READ_ALL = f"{API}/notifications/read-all"  # an unsafe request that changes nothing much


@pytest.fixture
def browser(app: FastAPI, storage: object) -> Iterator[Callable[..., TestClient]]:
    """browser(cookies, csrf_header, base_url='http://testserver') -> a TestClient holding exactly these cookies."""
    made: list[TestClient] = []

    def _make(cookies: dict[str, str], header: str | None = None, base_url: str = "http://testserver") -> TestClient:
        c = TestClient(app, base_url=base_url, cookies=cookies)
        c.__enter__()
        made.append(c)
        if header is not None:
            c.headers["X-CSRF-Token"] = header
        return c

    yield _make
    for c in made:
        c.__exit__(None, None, None)


def _set_cookies(r: httpx.Response, name: str) -> list[str]:
    return [h for h in r.headers.get_list("set-cookie") if h.startswith(f"{name}=")]


def _value(set_cookie: str) -> str:
    return set_cookie.split(";", 1)[0].split("=", 1)[1]


def test_a_session_accepts_only_its_own_token(
    client_for: Callable[..., TestClient], browser: Callable[..., TestClient], student: User
) -> None:
    c = client_for(student)
    session = c.cookies["dsba_session"]
    bound = csrf_token_for(session)
    assert c.cookies["dsba_csrf"] == bound
    assert c.post(READ_ALL).status_code == 204

    # a cookie planted by another site under the same domain, echoed in the header: double submit alone would pass
    planted = browser({"dsba_session": session, "dsba_csrf": "planted-by-a-sibling-site"}, "planted-by-a-sibling-site")
    r = planted.post(READ_ALL)
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "csrf_failed"
    fresh = _set_cookies(r, "dsba_csrf")  # the refusal hands back the right cookie: the web app retries once
    assert [_value(h) for h in fresh] == [bound]
    assert browser({"dsba_session": session, "dsba_csrf": bound}, bound).post(READ_ALL).status_code == 204

    # the token of another session doesn't pass either
    other = csrf_token_for("some-other-session-token")
    assert browser({"dsba_session": session, "dsba_csrf": other}, other).post(READ_ALL).status_code == 403


def test_any_answer_brings_the_cookie_in_step_with_the_session(
    client_for: Callable[..., TestClient], browser: Callable[..., TestClient], student: User
) -> None:
    session = client_for(student).cookies["dsba_session"]
    stale = browser({"dsba_session": session, "dsba_csrf": "from-before-sign-in"})
    r = stale.get(f"{API}/me")
    assert r.status_code == 200
    assert [_value(h) for h in _set_cookies(r, "dsba_csrf")] == [csrf_token_for(session)]
    in_step = browser({"dsba_session": session, "dsba_csrf": csrf_token_for(session)})
    assert _set_cookies(in_step.get(f"{API}/me"), "dsba_csrf") == []  # nothing to change


def test_sign_in_binds_the_token_and_sign_out_replaces_it(
    client_for: Callable[..., TestClient], monkeypatch: pytest.MonkeyPatch
) -> None:
    sent: list[str] = []
    monkeypatch.setattr(mailer, "send_email", lambda to, subject, text, html=None: sent.append(text))
    c = client_for()
    guest_token = c.cookies["dsba_csrf"]
    start = c.post(f"{API}/auth/otp", json={"identifier": "bound@example.com"})  # no session: plain double submit
    assert start.status_code == 202, start.text
    code = re.search(r"\b(\d{6})\b", sent[-1])
    assert code is not None
    r = c.post(f"{API}/auth/otp/verify", json={"challengeId": start.json()["challengeId"], "code": code.group(1)})
    assert r.status_code == 200, r.text
    session = _value(_set_cookies(r, "dsba_session")[0])
    assert [_value(h) for h in _set_cookies(r, "dsba_csrf")] == [csrf_token_for(session)]  # one cookie: the bound one

    assert c.post(READ_ALL).status_code == 403  # the header still holds the guest token
    c.headers["X-CSRF-Token"] = c.cookies["dsba_csrf"]
    assert c.post(READ_ALL).status_code == 204

    out = c.post(f"{API}/auth/logout")
    assert out.status_code == 204
    after = [_value(h) for h in _set_cookies(out, "dsba_csrf")]
    assert len(after) == 1
    assert after[0] not in (guest_token, csrf_token_for(session))


def test_cookie_names_come_from_the_settings(set_option: SetOption, browser: Callable[..., TestClient]) -> None:
    set_option("session_cookie", "__Host-dsba_session")
    set_option("csrf_cookie", "__Host-dsba_csrf")
    set_option("cookie_secure", True)
    c = browser({}, base_url="https://testserver")
    r = c.get(f"{API}/auth/csrf")
    (cookie,) = _set_cookies(r, "__Host-dsba_csrf")
    attributes = [a.strip().lower() for a in cookie.split(";")[1:]]
    assert "secure" in attributes
    assert "path=/" in attributes
    assert not any(a.startswith("domain") for a in attributes)
    assert _set_cookies(r, "dsba_csrf") == []
    c.headers["X-CSRF-Token"] = c.cookies["__Host-dsba_csrf"]
    assert c.post(f"{API}/auth/otp", json={"identifier": "host-prefix@example.com"}).status_code == 202
    c.headers["X-CSRF-Token"] = "something-else"
    assert c.post(f"{API}/auth/otp", json={"identifier": "host-prefix@example.com"}).status_code == 403
