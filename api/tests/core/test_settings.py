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

from app import cli, main
from app.config import DEV_SECRET, ConfigError, Settings, check
from tests.core.conftest import SetOption

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
    return Settings(_env_file=None, **values)


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
        ({"trusted_proxies": ""}, "DSBA_TRUSTED_PROXIES is empty"),
        ({"otp_max_attempts": 6}, "DSBA_OTP_MAX_ATTEMPTS must be at most 5"),
        ({"otp_max_per_ip_per_hour": 1000}, "DSBA_OTP_MAX_PER_IP_PER_HOUR is above its default (30)"),
        ({"otp_max_per_identifier_per_hour": 6}, "DSBA_OTP_MAX_PER_IDENTIFIER_PER_HOUR is above its default"),
        ({"otp_max_per_identifier_per_day": 11}, "DSBA_OTP_MAX_PER_IDENTIFIER_PER_DAY is above its default"),
        ({"sms_max_per_hour": 1000}, "DSBA_SMS_MAX_PER_HOUR is above its default (50)"),
        ({"sms_max_per_day": 10000}, "DSBA_SMS_MAX_PER_DAY is above its default (300)"),
        ({"email_max_per_day": 10000}, "DSBA_EMAIL_MAX_PER_DAY is above its default (3000)"),
        ({"email_signups_max_per_hour": 1000}, "DSBA_EMAIL_SIGNUPS_MAX_PER_HOUR is above its default (100)"),
        ({"otp_max_per_ipv6_site_per_hour": 1000}, "DSBA_OTP_MAX_PER_IPV6_SITE_PER_HOUR is above its default (120)"),
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


def test_raised_limits_pass_only_on_purpose_and_lower_ones_always() -> None:
    raised = {"otp_max_per_ip_per_hour": 1000, "sms_max_per_hour": 1000, "sms_max_per_day": 10000}
    assert len(production(**raised).problems()) == 3
    assert production(**raised, allow_raised_limits=True).problems() == []
    assert production(otp_max_per_ip_per_hour=10, sms_max_per_day=50, otp_max_attempts=3).problems() == []
    # on purpose or not, more wrong tries per code make codes guessable
    assert len(production(otp_max_attempts=1000, allow_raised_limits=True).problems()) == 1


def test_nothing_set_names_every_problem_at_once() -> None:
    with pytest.raises(ConfigError) as e:
        check(Settings(_env_file=None, env="production"))
    message = str(e.value)
    assert message.startswith("DSBA Hub won't start in production until these settings are fixed:")
    for name in ("DSBA_SECRET_KEY", "DSBA_DATABASE_URL", "DSBA_WEB_ORIGINS", "DSBA_S3_ENDPOINT_URL"):
        assert name in message
    assert "DSBA_EMAIL_BACKEND" in message
    assert "DSBA_SMS_BACKEND" in message
    assert len(e.value.problems) >= 8


def test_development_settings_are_not_checked_but_wildcard_origins_never_pass() -> None:
    assert Settings(_env_file=None).problems() == []
    for origins in ("*", "https://hub.example.com,*", "https://*.example.com"):
        with pytest.raises(ValidationError, match="can't contain"):
            Settings(_env_file=None, web_origins=origins)


def test_docs_and_schema_are_off_in_production(monkeypatch: pytest.MonkeyPatch, client: TestClient) -> None:
    assert client.get("/api/v1/docs").status_code == 200  # development and tests keep them
    monkeypatch.setattr(main, "get_settings", production)
    with TestClient(main.create_app()) as prod:
        assert prod.get("/api/v1/docs").status_code == 404
        assert prod.get("/api/v1/openapi.json").status_code == 404
        assert prod.get("/api/v1/health").status_code == 200


def _run(env: dict[str, str], *args: str) -> subprocess.CompletedProcess[str]:
    base = {k: v for k, v in os.environ.items() if not k.startswith("DSBA_")}
    # The timeout only stops a hang: importing the whole app can take a minute on a machine busy with other tests.
    return subprocess.run(  # noqa: S603 - this interpreter, fixed arguments
        [sys.executable, *args], cwd=API_ROOT, env={**base, **env}, capture_output=True, text=True, timeout=300
    )


def test_the_api_refuses_to_start_with_unsafe_production_settings() -> None:
    done = _run({"DSBA_ENV": "production"}, "-c", "import app.main")
    assert done.returncode != 0
    assert "ConfigError" in done.stderr
    assert "- DSBA_SECRET_KEY must be a random string" in done.stderr
    assert "- DSBA_EMAIL_BACKEND must be smtp" in done.stderr


def test_dev_login_is_refused_in_production(set_option: SetOption, capsys: pytest.CaptureFixture[str]) -> None:
    set_option("env", "production")
    assert cli.main(["dev-login", "someone@example.com"]) == 1
    out = capsys.readouterr()
    assert "dev-login is disabled in production" in out.err
    assert out.out == ""


TEXTS_ONLY = {  # what compose.prod.yaml gives the text worker
    k: GOOD[k]
    for k in (
        "env",
        "database_url",
        "s3_endpoint_url",
        "s3_region",
        "s3_access_key_id",
        "s3_secret_access_key",
        "s3_bucket",
    )
}


def test_the_text_worker_is_checked_for_the_database_and_the_bucket_only() -> None:
    worker = Settings(_env_file=None, **TEXTS_ONLY)
    assert worker.texts_problems() == []
    assert len(worker.problems()) >= 5  # the API refuses to start with them: no secret key, mail, origins...
    nothing = Settings(_env_file=None, env="production")
    assert [p.split()[0] for p in nothing.texts_problems()] == [
        "DSBA_DATABASE_URL",
        "DSBA_S3_ACCESS_KEY_ID",
        "DSBA_S3_ENDPOINT_URL",
    ]


def test_the_text_worker_starts_with_only_its_settings_and_the_api_does_not(monkeypatch: pytest.MonkeyPatch) -> None:
    for name, value in TEXTS_ONLY.items():
        monkeypatch.setenv(f"DSBA_{name.upper()}", str(value))
    sessions, storage = cli.texts_worker()
    assert (sessions.kw["bind"].url.database, storage.bucket) == ("dsba", "dsba-hub")
    with pytest.raises(ConfigError, match="DSBA_SECRET_KEY must be a random string"):
        check(Settings())  # what the API starts with
    monkeypatch.delenv("DSBA_DATABASE_URL")
    with pytest.raises(ConfigError) as refused:
        cli.texts_worker()
    assert refused.value.problems == ["DSBA_DATABASE_URL is not set: the default is the development database."]


def test_the_daily_jobs_are_checked_for_what_they_hold_only() -> None:
    """SEC-57: backup and sweep get only the settings they use in production, so only those are checked."""
    db = GOOD["database_url"]
    backup = Settings(
        _env_file=None,
        env="production",
        role="backup",
        database_url=db,
        backup_bucket="dsba-backups",
        backup_access_key_id="AKIABACKUPEXAMPLE",
        backup_secret_access_key="a-backup-secret",
    )
    assert backup.problems() == []
    no_key = Settings(_env_file=None, env="production", role="backup", database_url=db)
    assert any("DSBA_BACKUP_BUCKET" in p for p in no_key.problems())
    sweep = Settings(
        _env_file=None,
        env="production",
        role="sweep",
        database_url=db,
        s3_endpoint_url="",
        s3_access_key_id="AKIAEXAMPLEEXAMPLE",
        s3_secret_access_key="an-example-secret-access-key",
    )
    assert sweep.problems() == []
    assert Settings(_env_file=None, env="production", role="sweep").problems()  # no database, no bucket


def test_the_api_never_starts_as_a_job(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(main, "get_settings", lambda: Settings(_env_file=None, role="sweep"))
    with pytest.raises(ConfigError, match="DSBA_ROLE"):
        main.create_app()
