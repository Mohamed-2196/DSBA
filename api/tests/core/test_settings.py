"""Production fails closed (security review, finding 5): unsafe settings stop the API, naming each problem."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app import main
from app.config import DEV_SECRET, ConfigError, Settings, check

API_ROOT = Path(__file__).resolve().parents[2]
REMOVE = object()
GOOD: dict[str, Any] = {
    "env": "production",
    "secret_key": "k" * 48,
    "database_url": "postgresql+psycopg://dsba:a-long-password@db:5432/dsba",
    "web_origins": "https://hub.example.com",
    "web_base_url": "https://hub.example.com",
    "trusted_proxies": "172.30.0.10",
    "s3_endpoint_url": "",  # AWS S3
    "s3_region": "eu-central-1",
    "s3_access_key_id": "AKIAEXAMPLEEXAMPLE",
    "s3_secret_access_key": "an-example-secret-access-key",
    "s3_bucket": "dsba-hub",
    "email_backend": "smtp",
    "smtp_host": "smtp.example.com",
    "smtp_port": 587,
    "email_from": "DSBA Hub <no-reply@example.com>",
    "sms_backend": "twilio",
    "twilio_account_sid": "AC0123456789",
    "twilio_auth_token": "a-twilio-token",
    "twilio_from": "MG0123456789",
}


@pytest.fixture(autouse=True)
def clean_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Only what a test passes counts (not the DSBA_* variables the test session runs with)."""
    for name in [k for k in os.environ if k.startswith("DSBA_")]:
        monkeypatch.delenv(name)


def production(**changes: Any) -> Settings:
    values = {k: v for k, v in {**GOOD, **changes}.items() if v is not REMOVE}
    return Settings(_env_file=None, **values)  # type: ignore[call-arg]


def test_good_production_settings_start() -> None:
    s = production()
    assert s.problems() == []
    assert check(s) is s
    # safe by default in production
    assert (s.session_cookie, s.csrf_cookie) == ("__Host-dsba_session", "__Host-dsba_csrf")
    assert s.cookie_secure is True
    assert s.s3_create_bucket is False


@pytest.mark.parametrize(
    ("changes", "problem"),
    [
        ({"secret_key": DEV_SECRET}, "DSBA_SECRET_KEY must be a random string"),
        ({"secret_key": "too-short"}, "DSBA_SECRET_KEY must be a random string"),
        ({"database_url": REMOVE}, "DSBA_DATABASE_URL is not set"),
        ({"cookie_secure": False}, "DSBA_COOKIE_SECURE must be true"),
        ({"session_cookie": "dsba_session"}, "DSBA_SESSION_COOKIE must start with __Host-"),
        ({"csrf_cookie": "dsba_csrf"}, "DSBA_CSRF_COOKIE must start with __Host-"),
        ({"cookie_domain": "example.com"}, "DSBA_COOKIE_DOMAIN must be empty"),
        ({"web_origins": ""}, "DSBA_WEB_ORIGINS is empty"),
        ({"web_origins": "https://hub.example.com,http://hub.example.com"}, "'http://hub.example.com': every origin"),
        ({"web_base_url": "http://hub.example.com"}, "DSBA_WEB_BASE_URL must be the app's https://"),
        ({"trusted_proxies": "0.0.0.0/0"}, "DSBA_TRUSTED_PROXIES trusts every address"),
        ({"s3_bucket": ""}, "DSBA_S3_BUCKET is empty"),
        ({"s3_access_key_id": "dsba"}, "DSBA_S3_ACCESS_KEY_ID and DSBA_S3_SECRET_ACCESS_KEY must be set"),
        ({"s3_secret_access_key": "dsba-dev-secret"}, "DSBA_S3_ACCESS_KEY_ID and DSBA_S3_SECRET_ACCESS_KEY"),
        ({"s3_endpoint_url": REMOVE}, "DSBA_S3_ENDPOINT_URL must be set"),
        ({"s3_endpoint_url": "http://minio:9000"}, "DSBA_S3_PUBLIC_ENDPOINT_URL (or DSBA_S3_ENDPOINT_URL) must be"),
        ({"s3_create_bucket": True}, "DSBA_S3_CREATE_BUCKET must be false"),
        ({"email_backend": "console"}, "DSBA_EMAIL_BACKEND must be smtp (it is 'console')"),
        ({"email_backend": "file"}, "DSBA_EMAIL_BACKEND must be smtp (it is 'file')"),
        ({"smtp_host": REMOVE}, "DSBA_SMTP_HOST must be your mail provider's"),
        ({"email_from": REMOVE}, "DSBA_EMAIL_FROM must be an address on your own domain"),
        ({"sms_backend": "console"}, "DSBA_SMS_BACKEND must be twilio (it is 'console')"),
        ({"sms_backend": "file"}, "DSBA_SMS_BACKEND must be twilio (it is 'file')"),
        ({"twilio_auth_token": REMOVE}, "DSBA_TWILIO_ACCOUNT_SID, DSBA_TWILIO_AUTH_TOKEN and DSBA_TWILIO_FROM"),
        ({"backup_access_key_id": "only-half"}, "DSBA_BACKUP_ACCESS_KEY_ID and DSBA_BACKUP_SECRET_ACCESS_KEY"),
    ],
)
def test_each_unsafe_setting_is_named(changes: dict[str, Any], problem: str) -> None:
    s = production(**changes)
    problems = s.problems()
    assert len(problems) == 1, problems
    assert problem in problems[0]
    with pytest.raises(ConfigError) as e:
        check(s)
    assert e.value.problems == problems
    assert problem in str(e.value)


def test_minio_behind_https_and_texts_turned_off_are_fine() -> None:
    s = production(
        s3_endpoint_url="http://minio:9000",
        s3_public_endpoint_url="https://files.example.com",
        sms_backend="console",
        sms_allowed_regions="",
    )
    assert s.problems() == []


def test_nothing_set_names_every_problem_at_once() -> None:
    with pytest.raises(ConfigError) as e:
        check(Settings(_env_file=None, env="production"))  # type: ignore[call-arg]
    message = str(e.value)
    assert message.startswith("DSBA Hub won't start in production until these settings are fixed:")
    for name in ("DSBA_SECRET_KEY", "DSBA_DATABASE_URL", "DSBA_WEB_ORIGINS", "DSBA_S3_ENDPOINT_URL"):
        assert name in message
    assert "DSBA_EMAIL_BACKEND" in message
    assert "DSBA_SMS_BACKEND" in message
    assert len(e.value.problems) >= 8


def test_development_settings_are_not_checked_but_wildcard_origins_never_pass() -> None:
    assert Settings(_env_file=None).problems() == []  # type: ignore[call-arg]
    for origins in ("*", "https://hub.example.com,*", "https://*.example.com"):
        with pytest.raises(ValidationError, match="can't contain"):
            Settings(_env_file=None, web_origins=origins)  # type: ignore[call-arg]


def test_docs_and_schema_are_off_in_production(monkeypatch: pytest.MonkeyPatch, client: TestClient) -> None:
    assert client.get("/api/v1/docs").status_code == 200  # development and tests keep them
    monkeypatch.setattr(main, "get_settings", production)
    with TestClient(main.create_app()) as prod:
        assert prod.get("/api/v1/docs").status_code == 404
        assert prod.get("/api/v1/openapi.json").status_code == 404
        assert prod.get("/api/v1/health").status_code == 200


def _run(env: dict[str, str], *args: str) -> subprocess.CompletedProcess[str]:
    base = {k: v for k, v in os.environ.items() if not k.startswith("DSBA_")}
    return subprocess.run(  # noqa: S603 - this interpreter, fixed arguments
        [sys.executable, *args], cwd=API_ROOT, env={**base, **env}, capture_output=True, text=True, timeout=60
    )


def test_the_api_refuses_to_start_with_unsafe_production_settings() -> None:
    done = _run({"DSBA_ENV": "production"}, "-c", "import app.main")
    assert done.returncode != 0
    assert "ConfigError" in done.stderr
    assert "- DSBA_SECRET_KEY must be a random string" in done.stderr
    assert "- DSBA_EMAIL_BACKEND must be smtp" in done.stderr


def test_dev_login_is_refused_in_production() -> None:
    env = {f"DSBA_{k.upper()}": str(v) for k, v in GOOD.items()}
    done = _run(env, "-m", "app.cli", "dev-login", "someone@example.com")
    assert done.returncode == 1
    assert "dev-login is disabled in production" in done.stderr
    assert done.stdout == ""
