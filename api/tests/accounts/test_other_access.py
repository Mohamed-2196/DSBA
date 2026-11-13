"""A sign-in change ends the account's other access, not only its sessions (SEC-66): a Google takeover, a reset link
and a password change also turn off the private calendar and widget feeds and disconnect AI apps; linking Google
disconnects AI apps. And Google takes over an unconfirmed account only for an address Google owns (SEC-68)."""

from __future__ import annotations

from collections.abc import Callable
from datetime import timedelta
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.time import utcnow
from app.models import AiAppConnection, User
from app.services import signin
from tests.accounts.conftest import API, PASSWORD, GoogleSignIn, Outbox, sign_in_with
from tests.accounts.test_google import _error
from tests.ai_apps.conftest import AiApp, query

ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]


@pytest.fixture(autouse=True)
def _mcp_on(set_feature: Callable[..., None]) -> None:
    set_feature("mcp", "everyone")


def _connect_ai_app(app: FastAPI, browser: TestClient) -> tuple[AiApp, dict[str, Any]]:
    ai = AiApp(TestClient(app).__enter__())
    assert ai.register().status_code == 201
    request = query(ai.authorize().headers["location"])["request"]
    answer = browser.post(f"{API}/ai-apps/consent", json={"request": request, "allow": True})
    assert answer.status_code == 200, answer.text
    tokens = ai.token(query(answer.json()["redirectUrl"])["code"])
    assert tokens.status_code == 200, tokens.text
    return ai, tokens.json()


def _feeds(browser: TestClient) -> tuple[str, str]:
    cal = browser.post(f"{API}/calendar/mine/feed")
    widget = browser.post(f"{API}/calendar/mine/widget")
    assert cal.status_code == 200, cal.text
    assert widget.status_code == 200, widget.text
    return cal.json()["feedPath"], widget.json()["widgetPath"]


def _all_cut_off(
    client_for: ClientFor, feeds: tuple[str, str], ai: AiApp, tokens: dict[str, Any], db: Session, user: User
) -> None:
    anon = client_for()
    assert anon.get(feeds[0]).status_code == 404
    assert anon.get(feeds[1]).status_code == 404
    assert ai.rpc(tokens["access_token"], "tools/list").status_code == 401
    assert ai.refresh(tokens["refresh_token"]).status_code == 400
    assert db.scalar(select(AiAppConnection).where(AiAppConnection.user_id == user.id)) is None


def test_a_google_takeover_ends_the_squatters_feeds_and_ai_apps(
    app: FastAPI, google_sign_in: GoogleSignIn, make_user: MakeUser, client_for: ClientFor, db: Session
) -> None:
    squatter = make_user(email="sec66-owner@gmail.com", password=PASSWORD, confirmed=False, name="Squatter")
    theirs = client_for(squatter)
    feeds = _feeds(theirs)
    ai, tokens = _connect_ai_app(app, theirs)

    owner = client_for()
    assert _error(google_sign_in(owner, sub="sub-sec66", email="sec66-owner@gmail.com")) is None
    assert owner.get(f"{API}/me").json()["id"] == str(squatter.id)
    day = (utcnow() + timedelta(days=3)).date().isoformat()
    made = owner.post(f"{API}/calendar/mine/events", json={"title": "SEC66 clinic appointment", "date": day})
    assert made.status_code == 201, made.text

    _all_cut_off(client_for, feeds, ai, tokens, db, squatter)
    # The owner can turn the feeds on again, at new addresses.
    again = _feeds(owner)
    assert again != feeds
    ics = client_for().get(again[0])
    assert ics.status_code == 200
    assert "SEC66 clinic appointment" in ics.text


def test_a_reset_link_ends_feeds_and_ai_apps(
    app: FastAPI, make_user: MakeUser, client_for: ClientFor, db: Session, outbox: Outbox, deliver: Any
) -> None:
    victim = make_user(email="sec66-reset@gmail.com", password=PASSWORD)
    intruder = client_for(victim)  # someone who had the password
    feeds = _feeds(intruder)
    ai, tokens = _connect_ai_app(app, intruder)

    admin = make_user(email="sec66-admin@example.com", roles=["admin"])
    link = signin.issue_reset_link(db, admin, victim, None)
    db.commit()
    token = link.url.split("#token=")[1]
    r = client_for().post(f"{API}/auth/password-reset", json={"token": token, "newPassword": "a new long phrase 66"})
    assert r.status_code == 200, r.text
    assert intruder.get(f"{API}/me").status_code == 401

    _all_cut_off(client_for, feeds, ai, tokens, db, victim)
    deliver()
    (notice,) = outbox.to("sec66-reset@gmail.com")
    assert "and your calendar link, widget link and AI apps disconnected" in notice.text


def test_a_password_change_ends_feeds_and_ai_apps_but_keeps_this_browser(
    app: FastAPI, make_user: MakeUser, client_for: ClientFor, db: Session, outbox: Outbox, deliver: Any
) -> None:
    student = make_user(email="sec66-change@gmail.com", password=PASSWORD)
    intruder = client_for(student)
    feeds = _feeds(intruder)
    ai, tokens = _connect_ai_app(app, intruder)

    mine = client_for()
    assert sign_in_with(mine, "sec66-change@gmail.com").status_code == 200
    r = mine.put(f"{API}/me/password", json={"currentPassword": PASSWORD, "newPassword": "a new long phrase 66"})
    assert r.status_code == 200, r.text
    assert intruder.get(f"{API}/me").status_code == 401
    assert mine.get(f"{API}/me").status_code == 200

    _all_cut_off(client_for, feeds, ai, tokens, db, student)
    deliver()
    (notice,) = outbox.to("sec66-change@gmail.com")
    assert "and your calendar link, widget link and AI apps disconnected" in notice.text


def test_linking_google_disconnects_ai_apps(
    app: FastAPI, google_sign_in: GoogleSignIn, make_user: MakeUser, client_for: ClientFor, db: Session
) -> None:
    student = make_user(email="sec66-link@example.com", password=PASSWORD, confirmed=False)
    c = client_for(student)
    ai, tokens = _connect_ai_app(app, c)
    r = google_sign_in(c, return_to="/account", path="/me/google", sub="sub-link", email="sec66-link@gmail.com")
    assert _error(r) is None
    assert c.get(f"{API}/me").json()["googleLinked"] is True
    assert ai.rpc(tokens["access_token"], "tools/list").status_code == 401
    assert ai.refresh(tokens["refresh_token"]).status_code == 400
    assert db.scalar(select(AiAppConnection).where(AiAppConnection.user_id == student.id)) is None


# ── SEC-68: Google takes over only an address it owns ────────────────────────────────────────


def test_google_doesnt_take_over_an_address_it_doesnt_own(
    google_sign_in: GoogleSignIn, make_user: MakeUser, client_for: ClientFor, db: Session
) -> None:
    holder = make_user(email="owner@outlook.com", password=PASSWORD, confirmed=False, name="Holder")
    theirs = client_for(holder)
    c = client_for()
    r = google_sign_in(c, sub="sub-outlook", email="owner@outlook.com")  # email_verified, no hd
    assert _error(r) == "email_taken"
    assert c.get(f"{API}/me").status_code == 401
    assert theirs.get(f"{API}/me").status_code == 200  # unchanged: still signed in, password kept
    db.expire_all()
    assert holder.google_sub is None
    assert holder.email_confirmed_at is None
    assert sign_in_with(client_for(), "owner@outlook.com").status_code == 200


def test_google_doesnt_take_over_when_hd_is_another_domain(
    google_sign_in: GoogleSignIn, make_user: MakeUser, client_for: ClientFor
) -> None:
    make_user(email="someone@student.example.edu", password=PASSWORD, confirmed=False)
    r = google_sign_in(client_for(), sub="sub-other-hd", email="someone@student.example.edu", hd="example.edu")
    assert _error(r) == "email_taken"


@pytest.mark.parametrize(
    ("email", "hd"),
    [("owner@googlemail.com", None), ("owner@bibf.example.com", "bibf.example.com"), ("owner@GMAIL.com", None)],
)
def test_google_takes_over_an_address_it_owns(
    google_sign_in: GoogleSignIn, make_user: MakeUser, client_for: ClientFor, email: str, hd: str | None
) -> None:
    squatter = make_user(email=email.lower(), password=PASSWORD, confirmed=False)
    c = client_for()
    assert _error(google_sign_in(c, sub="sub-owns", email=email, hd=hd)) is None
    assert c.get(f"{API}/me").json()["id"] == str(squatter.id)


def test_google_still_signs_up_any_new_verified_address(google_sign_in: GoogleSignIn, client_for: ClientFor) -> None:
    c = client_for()
    assert _error(google_sign_in(c, sub="sub-new-outlook", email="new@outlook.com")) is None
    assert c.get(f"{API}/me").json()["email"] == "new@outlook.com"
