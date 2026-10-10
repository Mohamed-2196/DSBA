"""Settings, read from the environment (prefix DSBA_) and an optional .env file. See .env.example."""

from __future__ import annotations

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="DSBA_", env_file=".env", extra="ignore")

    env: Literal["development", "test", "production"] = "development"
    # Signs OTP codes and anything else that needs a server secret. Required in production.
    secret_key: SecretStr = SecretStr("dev-insecure-secret-change-me")
    database_url: str = "postgresql+psycopg://dsba:dsba@127.0.0.1:5432/dsba"
    # Origin(s) the web app is served from; CORS is only needed when the app and the API are on different origins.
    web_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://127.0.0.1:5173", "http://localhost:5173"]
    )
    # Public base URL of the web app, used in emails ("open the Hub").
    web_base_url: str = "http://127.0.0.1:5173"

    # Sessions
    session_cookie: str = "dsba_session"
    csrf_cookie: str = "dsba_csrf"
    session_days: int = 30
    cookie_secure: bool = False  # True behind HTTPS (production)
    cookie_domain: str | None = None

    # One-time codes
    otp_ttl_seconds: int = 600
    otp_max_attempts: int = 5
    otp_resend_seconds: int = 30
    otp_max_per_identifier_per_hour: int = 5
    otp_max_per_ip_per_hour: int = 30
    # Phone numbers without a country code are read as numbers in this region.
    default_phone_region: str = "BH"

    # Email (one-time codes, notifications). backend: smtp | file | console
    email_backend: Literal["smtp", "file", "console"] = "console"
    email_from: str = "DSBA Hub <no-reply@dsba-hub.local>"
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

    # Object storage (S3 API: AWS S3, Cloudflare R2, MinIO, ...)
    s3_endpoint_url: str | None = "http://127.0.0.1:9000"  # None = AWS
    # The endpoint browsers use for presigned URLs, when it differs from the one the API uses (Docker networks).
    s3_public_endpoint_url: str | None = None
    s3_region: str = "us-east-1"
    s3_access_key_id: str = "dsba"
    s3_secret_access_key: SecretStr = SecretStr("dsba-dev-secret")
    s3_bucket: str = "dsba-hub"
    s3_force_path_style: bool = True
    s3_create_bucket: bool = True  # create the bucket at startup when it is missing (dev)
    upload_url_ttl_seconds: int = 900
    download_url_ttl_seconds: int = 300
    max_upload_mb: int = 50
    max_image_mb: int = 8

    # Comma-separated emails / phone numbers that become admins when they sign in (bootstrap).
    admin_identifiers: Annotated[list[str], NoDecode] = Field(default_factory=list)

    # Trust X-Forwarded-For from the reverse proxy for client IPs (rate limits, audit).
    trust_proxy_headers: bool = False

    @field_validator("s3_endpoint_url", "s3_public_endpoint_url", "cookie_domain", mode="before")
    @classmethod
    def _empty_is_none(cls, v: object) -> object:
        return None if v == "" else v

    @field_validator("web_origins", "admin_identifiers", mode="before")
    @classmethod
    def _split_csv(cls, v: object) -> object:
        if isinstance(v, str):
            return [x.strip() for x in v.split(",") if x.strip()]
        return v

    @property
    def is_production(self) -> bool:
        return self.env == "production"


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    if s.is_production and s.secret_key.get_secret_value().startswith("dev-insecure"):
        raise RuntimeError("DSBA_SECRET_KEY must be set in production")
    return s
