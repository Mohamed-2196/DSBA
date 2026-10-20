from __future__ import annotations

from collections.abc import Callable, Iterator

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings

SetEnv = Callable[..., None]


def test_health(client: TestClient) -> None:
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "database": "ok", "storage": "ok", "version": "0.1.0", "commit": None}


@pytest.fixture
def deploy_env(monkeypatch: pytest.MonkeyPatch) -> Iterator[SetEnv]:
    """deploy_env(RAILWAY_GIT_COMMIT_SHA=...): the environment a deploy gives the API, read again."""

    def _set(**env: str) -> None:
        for name, value in env.items():
            monkeypatch.setenv(name, value)
        get_settings.cache_clear()

    yield _set
    get_settings.cache_clear()  # monkeypatch puts the environment back afterwards: the next read sees it


SHA = "1147bd1d0a4f2c3e5b6a7980c1d2e3f405162738"


@pytest.mark.parametrize(
    ("env", "commit"),
    [
        ({"RAILWAY_GIT_COMMIT_SHA": SHA.upper()}, SHA),  # Railway's, for a deploy from GitHub
        ({"RAILWAY_GIT_COMMIT_SHA": SHA, "DSBA_COMMIT_SHA": "c25b735"}, "c25b735"),  # set by hand, it wins
        ({"RAILWAY_GIT_COMMIT_SHA": SHA, "DSBA_COMMIT_SHA": ""}, SHA),  # an empty one doesn't hide Railway's
        ({"DSBA_COMMIT_SHA": " c25b735\n"}, "c25b735"),
        ({"DSBA_COMMIT_SHA": "feature/backend"}, None),  # not a commit hash: unknown
        ({"RAILWAY_GIT_COMMIT_SHA": "<script>alert(1)</script>"}, None),
        ({"RAILWAY_GIT_COMMIT_SHA": "c25b73"}, None),  # too short to name a commit
    ],
)
def test_health_reports_the_commit_the_api_runs(
    client: TestClient, deploy_env: SetEnv, env: dict[str, str], commit: str | None
) -> None:
    deploy_env(**env)
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    assert r.json()["commit"] == commit


def test_unsafe_request_without_csrf_is_rejected(client: TestClient) -> None:
    r = client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": "wrong"})
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "csrf_failed"


def test_errors_have_one_shape(client: TestClient) -> None:
    r = client.get("/api/v1/nope")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "not_found"
    r = client.post("/api/v1/auth/sign-in", json={})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "invalid_input"
    assert "email" in r.json()["error"]["fields"]


def test_signed_in_client_reaches_protected_routes(client_for, make_user) -> None:  # type: ignore[no-untyped-def]
    user = make_user()
    c = client_for(user)
    r = c.get("/api/v1/me")
    assert r.status_code == 200
    assert r.json()["id"] == str(user.id)
    assert client_for().get("/api/v1/me").status_code == 401
