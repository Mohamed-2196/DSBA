from __future__ import annotations

from fastapi.testclient import TestClient


def test_health(client: TestClient) -> None:
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "database": "ok", "storage": "ok", "version": "0.1.0"}


def test_unsafe_request_without_csrf_is_rejected(client: TestClient) -> None:
    r = client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": "wrong"})
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "csrf_failed"


def test_errors_have_one_shape(client: TestClient) -> None:
    r = client.get("/api/v1/nope")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "not_found"
    r = client.post("/api/v1/auth/otp", json={})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "invalid_input"
    assert "identifier" in r.json()["error"]["fields"]


def test_signed_in_client_reaches_protected_routes(client_for, make_user) -> None:  # type: ignore[no-untyped-def]
    user = make_user()
    c = client_for(user)
    r = c.get("/api/v1/me")
    assert r.status_code == 200
    assert r.json()["id"] == str(user.id)
    assert client_for().get("/api/v1/me").status_code == 401
