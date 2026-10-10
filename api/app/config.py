"""Settings, read from the environment (prefix DSBA_) and an optional .env file. See .env.example.

Production fails closed (security review, finding 5): with DSBA_ENV=production, get_settings() refuses to start
while anything only fit for development is left in place, and names every such setting (production_problems()).
A few defaults are safe in production on their own: Secure cookies with the __Host- prefix, and no bucket set-up
at start-up."""

from __future__ import annotations

import ipaddress
from functools import lru_cache
from typing import Annotated, Literal
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

IPNetwork = ipaddress.IPv4Network | ipaddress.IPv6Network

DEV_SECRET = "dev-insecure-secret-change-me"  # noqa: S105 - the public development value, refused in production
DEV_S3_ACCESS_KEY = "dsba"
DEV_S3_SECRET = "dsba-dev-secret"  # noqa: S105 - the development emulator's key, refused in production
DEV_EMAIL_FROM = "DSBA Hub <no-reply@dsba-hub.local>"
HOST_PREFIX = "__Host-"  # a cookie only its own host can set: Secure, Path=/ and no Domain
MIN_SECRET_LENGTH = 32


class ConfigError(RuntimeError):
    """The settings can't be used in this environment. `problems` holds one plain sentence per setting to fix."""

    def __init__(self, problems: list[str], *, production: bool = True) -> None:
        self.problems = problems
        lines = "\n".join(f"  - {p}" for p in problems)
        where = " in production" if production else ""
        super().__init__(f"DSBA Hub won't start{where} until these settings are fixed:\n{lines}")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="DSBA_", env_file=".env", extra="ignore")

    env: Literal["development", "test", "production"] = "development"
    # Signs OTP codes, CSRF tokens and anything else that needs a server secret. Required in production.
    secret_key: SecretStr = SecretStr(DEV_SECRET)
    database_url: str = "postgresql+psycopg://dsba:dsba@127.0.0.1:5432/dsba"
    # Origin(s) the web app is served from; CORS is only needed when the app and the API are on different origins.
    web_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://127.0.0.1:5173", "http://localhost:5173"]
    )
    # Public base URL of the web app, used in emails ("open the Hub").
    web_base_url: str = "http://127.0.0.1:5173"

    # Sessions. In production the cookies default to __Host-dsba_session and __Host-dsba_csrf, and Secure. The web
    # app reads the CSRF cookie by name (VITE_CSRF_COOKIE when it is built), so the two must agree.
    session_cookie: str = "dsba_session"
    csrf_cookie: str = "dsba_csrf"
    session_days: int = 30
    cookie_secure: bool = False  # True behind HTTPS (the default in production)
    cookie_domain: str | None = None

    # Client addresses (rate limits, sessions, the audit log). X-Forwarded-For is only read from a request whose
    # direct peer is one of these proxies (comma-separated addresses or CIDRs, e.g. the reverse proxy's address on
    # the Docker network). Empty (the default): the peer is the client.
    trusted_proxies: Annotated[list[IPNetwork], NoDecode] = Field(default_factory=list)

    # One-time codes
    otp_ttl_seconds: int = 600
    otp_max_attempts: int = 5
    otp_resend_seconds: int = 30
    otp_max_per_identifier_per_hour: int = 5
    otp_max_per_identifier_per_day: int = 10
    otp_max_per_ip_per_hour: int = 30
    # Phone numbers without a country code are read as numbers in this region.
    default_phone_region: str = "BH"

    # Email (one-time codes, notifications). backend: smtp | file | console
    email_backend: Literal["smtp", "file", "console"] = "console"
    email_from: str = DEV_EMAIL_FROM
    smtp_host: str = "127.0.0.1"
    smtp_port: int = 1025
    smtp_username: str | None = None
    smtp_password: SecretStr | None = None
    smtp_starttls: bool = False
    email_file_dir: str = "var/mail"

    # SMS (one-time codes). backend: console | file | twilio
    sms_backend: Literal["console", "file", "twilio"] = "console"
    sms_file_dir: str = "var/sms"
    twilio_account_sid: str | None = None
    twilio_auth_token: SecretStr | None = None
    twilio_from: str | None = None  # a phone number or a Messaging Service SID
    # Countries (ISO codes, comma-separated) whose mobile numbers get codes by text. Empty: no texts at all.
    sms_allowed_regions: Annotated[list[str], NoDecode] = Field(default_factory=lambda: ["BH"])
    # Texts the whole site may send (SMS pumping, finding 3). Over budget, codes by text pause; email keeps working.
    sms_max_per_hour: int = 50
    sms_max_per_day: int = 300

    # Object storage (S3 API: AWS S3 or MinIO; see docs/backend/DEPLOYMENT.md about Cloudflare R2)
    s3_endpoint_url: str | None = "http://127.0.0.1:9000"  # None = AWS
    # The endpoint browsers use for presigned URLs, when it differs from the one the API uses (Docker networks).
    s3_public_endpoint_url: str | None = None
    s3_region: str = "us-east-1"
    s3_access_key_id: str = DEV_S3_ACCESS_KEY
    s3_secret_access_key: SecretStr = SecretStr(DEV_S3_SECRET)
    s3_bucket: str = "dsba-hub"
    s3_force_path_style: bool = True
    # Create the bucket and set its CORS and lifecycle rules at start-up (development; False in production, where
    # `python -m app.cli setup-bucket` does it once).
    s3_create_bucket: bool = True
    upload_url_ttl_seconds: int = 300
    download_url_ttl_seconds: int = 300
    max_upload_mb: int = 50
    max_image_mb: int = 8

    # Backups (`python -m app.cli backup`). Without DSBA_BACKUP_BUCKET they go to the main bucket under
    # DSBA_BACKUP_PREFIX; give them their own bucket and a key of their own (DSBA_BACKUP_ACCESS_KEY_ID and
    # DSBA_BACKUP_SECRET_ACCESS_KEY) that the API never holds. The endpoint and region default to the main store's.
    backup_bucket: str | None = None
    backup_prefix: str = "backups/db/"
    backup_s3_endpoint_url: str | None = None
    backup_s3_region: str | None = None
    backup_access_key_id: str | None = None
    backup_secret_access_key: SecretStr | None = None
    # Server-side encryption of each dump: AES256 (SSE-S3), aws:kms (with DSBA_BACKUP_KMS_KEY_ID, or the bucket's
    # default key) or none (a store without SSE, like a MinIO without KMS).
    backup_sse: Literal["AES256", "aws:kms", "none"] = "AES256"
    backup_kms_key_id: str | None = None
    # The newest N dumps are kept and older ones deleted; 0 keeps them all (retention by a bucket lifecycle rule,
    # which a write-only backup key needs).
    backup_keep: int = Field(default=14, ge=0)

    # Comma-separated emails / phone numbers that become admins when they sign in (bootstrap).
    admin_identifiers: Annotated[list[str], NoDecode] = Field(default_factory=list)

    @field_validator(
        "s3_endpoint_url",
        "s3_public_endpoint_url",
        "cookie_domain",
        "backup_bucket",
        "backup_s3_endpoint_url",
        "backup_s3_region",
        "backup_access_key_id",
        "backup_secret_access_key",
        "backup_kms_key_id",
        mode="before",
    )
    @classmethod
    def _empty_is_none(cls, v: object) -> object:
        return None if v == "" else v

    @field_validator("web_origins", "admin_identifiers", "sms_allowed_regions", mode="before")
    @classmethod
    def _split_csv(cls, v: object) -> object:
        return _csv(v)

    @field_validator("web_origins")
    @classmethod
    def _no_wildcard_origin(cls, v: list[str]) -> list[str]:
        # CORS with credentials turns "*" into "reflect any origin": every site could call the API as the user.
        if any("*" in origin for origin in v):
            raise ValueError("DSBA_WEB_ORIGINS can't contain '*': list the web app's origins")
        return [origin.rstrip("/") for origin in v]

    @field_validator("sms_allowed_regions")
    @classmethod
    def _upper_regions(cls, v: list[str]) -> list[str]:
        return [r.upper() for r in v]

    @field_validator("trusted_proxies", mode="before")
    @classmethod
    def _networks(cls, v: object) -> object:
        """'10.0.0.5' and '10.0.0.0/24' alike, comma-separated (host bits are fine: '10.0.0.5/24' is its network)."""
        v = _csv(v)
        if isinstance(v, list):
            try:
                return [ipaddress.ip_network(x, strict=False) if isinstance(x, str) else x for x in v]
            except ValueError as e:
                raise ValueError(f"DSBA_TRUSTED_PROXIES: {e}") from None
        return v

    @model_validator(mode="after")
    def _production_defaults(self) -> Settings:
        """In production, what is unsafe by default in development is safe by default (unless set explicitly)."""
        if self.env == "production":
            given = self.model_fields_set
            if "session_cookie" not in given:
                self.session_cookie = f"{HOST_PREFIX}dsba_session"
            if "csrf_cookie" not in given:
                self.csrf_cookie = f"{HOST_PREFIX}dsba_csrf"
            if "cookie_secure" not in given:
                self.cookie_secure = True
            if "s3_create_bucket" not in given:
                self.s3_create_bucket = False
        return self

    @property
    def is_production(self) -> bool:
        return self.env == "production"

    def problems(self) -> list[str]:
        """What stops these settings from working in their environment, one plain sentence per problem.
        (Raised from here rather than from a validator: a ValidationError would print the input, secrets included.)"""
        problems: list[str] = []
        if (self.backup_access_key_id is None) != (self.backup_secret_access_key is None):
            problems.append(
                "DSBA_BACKUP_ACCESS_KEY_ID and DSBA_BACKUP_SECRET_ACCESS_KEY are set together, or not at all."
            )
        if self.is_production:
            problems.extend(self.production_problems())
        return problems

    def production_problems(self) -> list[str]:
        """Everything that makes these settings unfit for production, one plain sentence per problem."""
        problems: list[str] = []
        given = self.model_fields_set
        add = problems.append

        secret = self.secret_key.get_secret_value()
        if secret == DEV_SECRET or len(secret) < MIN_SECRET_LENGTH:
            add(
                "DSBA_SECRET_KEY must be a random string of at least 32 characters, not the development one "
                '(python -c "import secrets; print(secrets.token_urlsafe(48))").'
            )
        if "database_url" not in given:
            add("DSBA_DATABASE_URL is not set: the default is the development database.")

        # Cookies, origins and addresses
        if not self.cookie_secure:
            add("DSBA_COOKIE_SECURE must be true: the session cookie must only travel over HTTPS.")
        for name, value in (("DSBA_SESSION_COOKIE", self.session_cookie), ("DSBA_CSRF_COOKIE", self.csrf_cookie)):
            if not value.startswith(HOST_PREFIX):
                add(f"{name} must start with {HOST_PREFIX} (it is {value!r}), so that no other host can set it.")
        if self.cookie_domain:
            add("DSBA_COOKIE_DOMAIN must be empty: the cookies belong to the app's own host only.")
        if not self.web_origins:
            add("DSBA_WEB_ORIGINS is empty: list the web app's https:// origin.")
        for origin in self.web_origins:
            if not _is_https_url(origin):
                add(f"DSBA_WEB_ORIGINS has {origin!r}: every origin must be https://.")
        if not _is_https_url(self.web_base_url):
            add("DSBA_WEB_BASE_URL must be the app's https:// address (emails and texts link to it).")
        if any(net.prefixlen == 0 for net in self.trusted_proxies):
            add("DSBA_TRUSTED_PROXIES trusts every address: list only the reverse proxy's address or network.")

        # Object storage
        if not self.s3_bucket:
            add("DSBA_S3_BUCKET is empty.")
        key_id, key = self.s3_access_key_id, self.s3_secret_access_key.get_secret_value()
        if key_id in ("", DEV_S3_ACCESS_KEY) or key in ("", DEV_S3_SECRET):
            add("DSBA_S3_ACCESS_KEY_ID and DSBA_S3_SECRET_ACCESS_KEY must be set (not the development keys).")
        public = self.s3_public_endpoint_url or self.s3_endpoint_url
        if "s3_endpoint_url" not in given:
            add(
                "DSBA_S3_ENDPOINT_URL must be set: your store's endpoint, or empty for AWS S3 (the default is the "
                "development emulator)."
            )
        elif public is not None and not _is_https_url(public):
            add(
                "Browsers reach the bucket directly: DSBA_S3_PUBLIC_ENDPOINT_URL (or DSBA_S3_ENDPOINT_URL) must be "
                "https://."
            )
        if self.s3_create_bucket:
            add("DSBA_S3_CREATE_BUCKET must be false: set the bucket up once with `python -m app.cli setup-bucket`.")

        # Email and texts
        if self.email_backend != "smtp":
            add(
                f"DSBA_EMAIL_BACKEND must be smtp (it is {self.email_backend!r}): the console and file backends "
                "don't deliver sign-in codes."
            )
        elif "smtp_host" not in given:
            add(
                "DSBA_SMTP_HOST must be your mail provider's SMTP server (the default is the development mail catcher)."
            )
        if self.email_from == DEV_EMAIL_FROM:
            add("DSBA_EMAIL_FROM must be an address on your own domain, like 'DSBA Hub <no-reply@example.com>'.")
        if self.sms_allowed_regions:
            if self.sms_backend != "twilio":
                add(
                    f"DSBA_SMS_BACKEND must be twilio (it is {self.sms_backend!r}), or set DSBA_SMS_ALLOWED_REGIONS "
                    "to nothing to turn codes by text off."
                )
            elif not (self.twilio_account_sid and self.twilio_auth_token and self.twilio_from):
                add("DSBA_TWILIO_ACCOUNT_SID, DSBA_TWILIO_AUTH_TOKEN and DSBA_TWILIO_FROM must be set for texts.")
        return problems


def _csv(v: object) -> object:
    if isinstance(v, str):
        return [x.strip() for x in v.split(",") if x.strip()]
    return v


def _is_https_url(value: str) -> bool:
    try:
        parts = urlsplit(value)
    except ValueError:
        return False
    return parts.scheme == "https" and bool(parts.hostname)


def check(settings: Settings) -> Settings:
    """Raises ConfigError naming every problem (production: everything unsafe); returns the settings otherwise."""
    problems = settings.problems()
    if problems:
        raise ConfigError(problems, production=settings.is_production)
    return settings


@lru_cache
def get_settings() -> Settings:
    return check(Settings())
