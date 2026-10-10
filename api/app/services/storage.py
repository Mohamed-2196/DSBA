"""Object storage over the S3 API (AWS S3, Cloudflare R2, MinIO, ...).

Browsers upload and download straight from the bucket with presigned URLs; the API never streams file bodies.
The bucket stays private: every read goes through a short-lived presigned GET."""

from __future__ import annotations

import logging
import re
import unicodedata
from dataclasses import dataclass
from functools import lru_cache
from typing import TYPE_CHECKING, Any
from urllib.parse import quote

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from app.config import Settings, get_settings

if TYPE_CHECKING:
    from mypy_boto3_s3 import S3Client

log = logging.getLogger("dsba.storage")


@dataclass(frozen=True)
class ObjectInfo:
    size: int
    content_type: str | None


def safe_file_name(name: str, max_len: int = 100) -> str:
    """'Week 3 - Notes (final).pdf' -> 'Week-3-Notes-final.pdf': safe in an object key and in a header."""
    stem, dot, ext = name.rpartition(".")
    if not dot:
        stem, ext = name, ""

    def clean(x: str) -> str:
        x = unicodedata.normalize("NFKD", x).encode("ascii", "ignore").decode()
        return re.sub(r"[^A-Za-z0-9_-]+", "-", x).strip("-_")

    ext = re.sub(r"[^A-Za-z0-9]+", "", ext)[:10]
    stem = (clean(stem) or "file")[: max_len - (len(ext) + 1 if ext else 0)]
    return f"{stem}.{ext}" if ext else stem


def content_disposition(file_name: str, inline: bool = False) -> str:
    """RFC 6266: an ASCII fallback plus the UTF-8 name."""
    kind = "inline" if inline else "attachment"
    return f"{kind}; filename=\"{safe_file_name(file_name)}\"; filename*=UTF-8''{quote(file_name, safe='')}"


class Storage:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.bucket = settings.s3_bucket
        cfg = Config(
            signature_version="s3v4",
            s3={"addressing_style": "path" if settings.s3_force_path_style else "auto"},
            retries={"max_attempts": 3, "mode": "standard"},
        )
        common: dict[str, Any] = {
            "region_name": settings.s3_region,
            "aws_access_key_id": settings.s3_access_key_id,
            "aws_secret_access_key": settings.s3_secret_access_key.get_secret_value(),
            "config": cfg,
        }
        self.client: S3Client = boto3.client("s3", endpoint_url=settings.s3_endpoint_url, **common)
        public = settings.s3_public_endpoint_url or settings.s3_endpoint_url
        self.public_client: S3Client = (
            self.client if public == settings.s3_endpoint_url else boto3.client("s3", endpoint_url=public, **common)
        )

    # ── setup and health ──
    def ensure_bucket(self, cors_origins: list[str]) -> None:
        try:
            self.client.head_bucket(Bucket=self.bucket)
        except ClientError:
            self.client.create_bucket(Bucket=self.bucket)
            log.info("created bucket %s", self.bucket)
        try:  # browsers POST uploads and GET files straight from the bucket
            self.client.put_bucket_cors(
                Bucket=self.bucket,
                CORSConfiguration={
                    "CORSRules": [
                        {
                            "AllowedOrigins": cors_origins,
                            "AllowedMethods": ["GET", "POST", "HEAD"],
                            "AllowedHeaders": ["*"],
                            "ExposeHeaders": ["ETag"],
                            "MaxAgeSeconds": 3600,
                        }
                    ]
                },
            )
        except ClientError as e:  # MinIO configures CORS server-wide instead
            log.info("bucket CORS not set (%s)", e.response.get("Error", {}).get("Code"))

    def ping(self) -> bool:
        try:
            self.client.head_bucket(Bucket=self.bucket)
        except Exception:  # a health check: any failure means "down"
            return False
        return True

    # ── uploads ──
    def presigned_post(self, key: str, content_type: str, max_bytes: int) -> dict[str, Any]:
        """-> {"url", "fields"}: the browser POSTs a multipart form with `fields` and then the file as `file`."""
        return self.public_client.generate_presigned_post(
            Bucket=self.bucket,
            Key=key,
            Fields={"Content-Type": content_type},
            Conditions=[{"Content-Type": content_type}, ["content-length-range", 1, max_bytes]],
            ExpiresIn=self.settings.upload_url_ttl_seconds,
        )

    def head(self, key: str) -> ObjectInfo | None:
        try:
            r = self.client.head_object(Bucket=self.bucket, Key=key)
        except ClientError as e:
            if e.response.get("Error", {}).get("Code") in ("404", "NoSuchKey", "NotFound"):
                return None
            raise
        return ObjectInfo(size=int(r["ContentLength"]), content_type=r.get("ContentType"))

    # ── downloads ──
    def presigned_get(
        self, key: str, *, file_name: str | None = None, inline: bool = False, content_type: str | None = None
    ) -> str:
        params: dict[str, Any] = {"Bucket": self.bucket, "Key": key}
        if file_name:
            params["ResponseContentDisposition"] = content_disposition(file_name, inline)
        if content_type:
            params["ResponseContentType"] = content_type
        return self.public_client.generate_presigned_url(
            "get_object", Params=params, ExpiresIn=self.settings.download_url_ttl_seconds
        )

    def put_bytes(self, key: str, data: bytes, content_type: str) -> None:
        """Server-side writes (backups, seed files)."""
        self.client.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=content_type)

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=key)


@lru_cache
def get_storage() -> Storage:
    return Storage(get_settings())
