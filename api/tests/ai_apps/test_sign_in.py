"""Signing an AI app in as a student: OAuth 2.1 with PKCE and dynamic registration (the MCP SDK's routes over the
Hub's store), the student's yes on the Hub's page, read-only tokens, refresh, revocation, the switch, the limit.
Without a token the MCP server answers nothing: less than a guest sees on the site."""

from __future__ import annotations

from collections.abc import Callable
from datetime import timedelta
from typing import Any

import pytest
from sqlalchemy import inspect, select, update
from sqlalchemy.orm import Session

from app.core.time import utcnow
from app.models import AiAppCall, AiAppCode, AiAppConnection, AiAppToken, UserStatus
from app.services.ai_apps import store
from tests.ai_apps.conftest import API, MCP, RESOURCE, AiApp, ClientFor, Connect, MakeUser, query


def test_without_a_token_nothing_answers_and_the_app_is_told_where_to_sign_in(ai_app: Callable[[], AiApp]) -> None:
    app = ai_app()
    for method in ("initialize", "tools/list"):
        r = app.rpc(None, method, {} if method == "tools/list" else None)
        assert r.status_code == 401
        assert (
            'resource_metadata="http://127.0.0.1:5173/.well-known/oauth-protected-resource/api/mcp"'
            in (r.headers["www-authenticate"])
        )
    call = app.rpc(None, "tools/call", {"name": "get_file", "arguments": {"file": "anything"}})
    assert call.status_code == 401
    assert app.rpc("not-a-token", "tools/list").status_code == 401


def test_discovery_points_at_the_hub_s_own_sign_in(ai_app: Callable[[], AiApp]) -> None:
    c = ai_app().c
    resource = c.get("/.well-known/oauth-protected-resource/api/mcp").json()
    assert resource["resource"] == RESOURCE
    assert resource["authorization_servers"] == [RESOURCE]
    assert resource["scopes_supported"] == ["hub:read"]
    meta = c.get("/.well-known/oauth-authorization-server/api/mcp").json()
    assert meta == c.get(f"{MCP}/.well-known/oauth-authorization-server").json()
    assert meta["authorization_endpoint"] == f"{RESOURCE}/authorize"
    assert meta["registration_endpoint"] == f"{RESOURCE}/register"
    assert meta["code_challenge_methods_supported"] == ["S256"]
    assert meta["scopes_supported"] == ["hub:read"]


def test_the_whole_flow_gives_a_read_only_token_for_this_server(
    connect: Connect, make_user: MakeUser, client_for: ClientFor, db: Session
) -> None:
    student = make_user(name="Sara Student")
    app, tokens = connect(student)
    assert tokens["scope"] == "hub:read"
    assert tokens["expires_in"] == int(store.ACCESS_TTL.total_seconds())
    listed = app.rpc(tokens["access_token"], "tools/list")
    assert listed.status_code == 200
    found = listed.json()["result"]["tools"]
    assert sorted(t["name"] for t in found) == ["get_file", "get_passage", "get_question", "list_modules", "search"]
    assert all(t["annotations"]["readOnlyHint"] and not t["annotations"]["destructiveHint"] for t in found)
    assert {r.scopes for r in db.scalars(select(AiAppToken))} == {"hub:read"}
    apps = client_for(student).get(f"{API}/ai-apps").json()
    assert [(a["appName"], a["redirectHost"]) for a in apps] == [("Claude", "claude.ai")]


def test_the_only_scope_is_read(ai_app: Callable[[], AiApp]) -> None:
    app = ai_app()
    refused = app.register(scope="hub:read hub:write")
    assert refused.status_code == 400
    assert refused.json()["error"] == "invalid_client_metadata"
    assert app.register().status_code == 201
    r = app.authorize(scope="hub:write")
    assert r.status_code == 302
    assert query(r.headers["location"])["error"] == "invalid_scope"


def test_a_token_for_another_server_is_refused(ai_app: Callable[[], AiApp]) -> None:
    app = ai_app()
    app.register()
    r = app.authorize(resource="https://example.com/mcp")
    assert r.status_code == 302
    assert query(r.headers["location"])["error"] == "invalid_target"


def test_saying_no_sends_the_app_away_with_nothing(
    ai_app: Callable[[], AiApp], client_for: ClientFor, make_user: MakeUser, db: Session
) -> None:
    app = ai_app()
    app.register()
    request = query(app.authorize().headers["location"])["request"]
    r = client_for(make_user()).post(f"{API}/ai-apps/consent", json={"request": request, "allow": False})
    back = query(r.json()["redirectUrl"])
    assert back["error"] == "access_denied"
    assert back["state"] == "st-1"
    assert db.scalar(select(AiAppConnection)) is None


def test_the_consent_page_needs_a_signed_in_student_and_a_real_request(
    ai_app: Callable[[], AiApp], client_for: ClientFor, make_user: MakeUser
) -> None:
    app = ai_app()
    app.register(client_name="Claude\n<b>totally the Hub</b>" + "x" * 300)
    location = app.authorize().headers["location"]
    assert location.startswith("http://127.0.0.1:5173/connect-ai?request=")
    request = query(location)["request"]
    assert client_for().get(f"{API}/ai-apps/consent", params={"request": request}).status_code == 401
    assert client_for().post(f"{API}/ai-apps/consent", json={"request": request, "allow": True}).status_code == 401
    student = client_for(make_user())
    asked = student.get(f"{API}/ai-apps/consent", params={"request": request}).json()
    assert asked["redirectHost"] == "claude.ai"
    assert "\n" not in asked["appName"]
    assert len(asked["appName"]) == store.APP_NAME_MAX
    assert asked["alreadyConnected"] is False
    forged = request[:-4] + ("AAAA" if not request.endswith("AAAA") else "BBBB")
    bad = student.get(f"{API}/ai-apps/consent", params={"request": forged})
    assert bad.status_code == 422
    # the yes is an ordinary write: without the CSRF header it is refused
    del student.headers["X-CSRF-Token"]
    assert student.post(f"{API}/ai-apps/consent", json={"request": request, "allow": True}).status_code == 403


def test_a_code_works_once_and_only_with_its_verifier(
    ai_app: Callable[[], AiApp], client_for: ClientFor, make_user: MakeUser
) -> None:
    app = ai_app()
    app.register()
    request = query(app.authorize().headers["location"])["request"]
    answer = client_for(make_user()).post(f"{API}/ai-apps/consent", json={"request": request, "allow": True})
    code = query(answer.json()["redirectUrl"])["code"]
    wrong = app.token(code, verifier="x" * 50)
    assert wrong.status_code == 400
    assert wrong.json()["error"] == "invalid_grant"
    assert app.token(code).status_code == 400  # spent by the first try


def test_another_app_cant_use_the_code(ai_app: Callable[[], AiApp], client_for: ClientFor, make_user: MakeUser) -> None:
    app, thief = ai_app(), ai_app()
    app.register()
    thief.register()
    request = query(app.authorize().headers["location"])["request"]
    answer = client_for(make_user()).post(f"{API}/ai-apps/consent", json={"request": request, "allow": True})
    code = query(answer.json()["redirectUrl"])["code"]
    assert thief.token(code, verifier=app.verifier).status_code == 400


def test_refresh_rotates_and_the_old_refresh_token_is_spent(connect: Connect, make_user: MakeUser) -> None:
    app, tokens = connect(make_user())
    fresh = app.refresh(tokens["refresh_token"])
    assert fresh.status_code == 200, fresh.text
    new = fresh.json()
    assert new["refresh_token"] != tokens["refresh_token"]
    assert app.rpc(new["access_token"], "tools/list").status_code == 200
    assert app.refresh(tokens["refresh_token"]).status_code == 400


def test_removing_the_app_in_settings_signs_it_out_at_once(
    connect: Connect, make_user: MakeUser, client_for: ClientFor, db: Session
) -> None:
    student = make_user()
    app, tokens = connect(student)
    browser = client_for(student)
    [connected] = browser.get(f"{API}/ai-apps").json()
    assert client_for(make_user()).delete(f"{API}/ai-apps/{connected['id']}").status_code == 404  # not theirs
    assert browser.delete(f"{API}/ai-apps/{connected['id']}").status_code == 204
    assert app.rpc(tokens["access_token"], "tools/list").status_code == 401
    assert app.refresh(tokens["refresh_token"]).status_code == 400
    assert db.scalar(select(AiAppToken)) is None
    assert browser.get(f"{API}/ai-apps").json() == []


def test_an_app_can_sign_itself_out(connect: Connect, make_user: MakeUser) -> None:
    app, tokens = connect(make_user())
    assert app.revoke(tokens["access_token"]).status_code == 200
    assert app.rpc(tokens["access_token"], "tools/list").status_code == 401
    assert app.refresh(tokens["refresh_token"]).status_code == 400


def test_an_expired_token_is_refused(connect: Connect, make_user: MakeUser, db: Session) -> None:
    app, tokens = connect(make_user())
    db.execute(update(AiAppToken).where(AiAppToken.kind == "access").values(expires_at=utcnow() - timedelta(seconds=1)))
    db.commit()
    assert app.rpc(tokens["access_token"], "tools/list").status_code == 401


def test_switched_off_or_suspended_the_tokens_stop_working(
    connect: Connect, make_user: MakeUser, set_feature: Callable[..., None], db: Session, client_for: ClientFor
) -> None:
    student = make_user()
    app, tokens = connect(student)
    set_feature("mcp", "off")
    assert app.rpc(tokens["access_token"], "tools/list").status_code == 401
    assert client_for(student).get(f"{API}/ai-apps").json()["error"]["code"] == "feature_off"
    set_feature("mcp", "everyone")
    assert app.rpc(tokens["access_token"], "tools/list").status_code == 200
    student.status = UserStatus.suspended
    db.commit()
    assert app.rpc(tokens["access_token"], "tools/list").status_code == 401


def test_the_switch_on_for_some_roles_only(
    connect: Connect,
    make_user: MakeUser,
    set_feature: Callable[..., None],
    ai_app: Callable[[], AiApp],
    client_for: ClientFor,
) -> None:
    set_feature("mcp", "roles", ["rep"])
    rep = make_user(roles=("student", "rep"))
    app, tokens = connect(rep)
    assert app.rpc(tokens["access_token"], "tools/list").status_code == 200
    other = ai_app()
    other.register()
    request = query(other.authorize().headers["location"])["request"]
    r = client_for(make_user()).get(f"{API}/ai-apps/consent", params={"request": request})
    assert r.status_code == 404


def test_each_student_s_calls_are_limited(
    connect: Connect, make_user: MakeUser, monkeypatch: pytest.MonkeyPatch, modules: Any
) -> None:
    monkeypatch.setattr(store, "CALLS_PER_WINDOW", 2)
    app, tokens = connect(make_user())
    assert not app.call(tokens["access_token"], "list_modules")["isError"]
    assert not app.call(tokens["access_token"], "list_modules")["isError"]
    third = app.call(tokens["access_token"], "list_modules")
    assert third["isError"]
    assert "answered a lot" in third["content"][0]["text"]
    other_app, other_tokens = connect(make_user())
    assert not other_app.call(other_tokens["access_token"], "list_modules")["isError"]  # per student


def test_nothing_an_app_asks_is_kept(connect: Connect, make_user: MakeUser, db: Session, modules: Any) -> None:
    app, tokens = connect(make_user())
    app.call(tokens["access_token"], "search", query="hypothesis testing secret words")
    assert {c.key for c in inspect(AiAppCall).columns} == {"id", "user_id", "created_at"}
    assert db.scalar(select(AiAppCall)) is not None
    assert db.scalar(select(AiAppCode)) is None  # the code was spent


def test_registering_is_limited_per_address(ai_app: Callable[[], AiApp], monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(store, "REGISTRATIONS_PER_HOUR", 2)
    app = ai_app()
    assert app.register().status_code == 201
    assert app.register().status_code == 201
    r = app.register()
    assert r.status_code == 400
    assert "Too many" in r.json()["error_description"]
