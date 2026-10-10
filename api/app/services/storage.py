"""Object storage over the S3 API (AWS S3 or MinIO; Cloudflare R2 lacks presigned POST, see DEPLOYMENT.md).

Browsers upload and download straight from the bucket with presigned URLs; the API never streams file bodies.
The bucket stays private: every read goes through a short-lived presigned GET, which is shown in the browser
only for PDFs and allowlisted raster images and downloads as an attachment otherwise (finding 7). Uploads land
under incoming/, are checked, then copied to their final key (finding 6); a lifecycle rule clears what is left
under incoming/ after a day."""

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

# Shown inline (the PDF viewer, <img>). Never SVG, HTML, XML or anything that can run script on the bucket's origin.
INLINE_TYPES = frozenset({"application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif"})
INCOMING_PREFIX = "incoming/"  # where presigned uploads land before they are checked
INCOMING_RULE_ID = "dsba-expire-incoming"


@dataclass(frozen=True)
class ObjectInfo:
    size: int
    content_type: str | None
    etag: str | None = None  # names this version of the object (for conditional reads and copies)


def safe_file_name(name: str, max_len: int = 100) -> str:
    """'Week 3 - Notes (final).pdf' -> 'Week-3-Notes-final.pdf': ASCII letters, digits, '_' and single dashes, plus
    the extension. Safe in an object key and in a header; 'file' when nothing is left."""
    stem, dot, ext = name.rpartition(".")
    if not dot:
        stem, ext = name, ""

    def clean(x: str) -> str:
        x = unicodedata.normalize("NFKD", x).encode("ascii", "ignore").decode()
        x = re.sub(r"[^A-Za-z0-9_-]+", "-", x)
        return re.sub(r"-{2,}", "-", x).strip("-_")

    ext = re.sub(r"[^A-Za-z0-9]+", "", ext)[:10]
    room = max_len - (len(ext) + 1 if ext else 0)
    stem = clean(stem)[:room].rstrip("-_") or "file"
    return f"{stem}.{ext}" if ext else stem


def content_disposition(file_name: str, inline: bool = False) -> str:
    """RFC 6266: an ASCII fallback plus the UTF-8 name."""
    kind = "inline" if inline else "attachment"
    return f"{kind}; filename=\"{safe_file_name(file_name)}\"; filename*=UTF-8''{quote(file_name, safe='')}"


def s3_client(
    settings: Settings, *, endpoint_url: str | None, region: str, access_key_id: str, secret_access_key: str
) -> S3Client:
    cfg = Config(
        signature_version="s3v4",
        s3={"addressing_style": "path" if settings.s3_force_path_style else "auto"},
        retries={"max_attempts": 3, "mode": "standard"},
    )
    client: S3Client = boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        region_name=region,
        aws_access_key_id=access_key_id,
        aws_secret_access_key=secret_access_key,
        config=cfg,
    )
    return client


def error_code(e: ClientError) -> str:
    return str(e.response.get("Error", {}).get("Code", ""))


class Storage:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.bucket = settings.s3_bucket
        keys = {
            "region": settings.s3_region,
            "access_key_id": settings.s3_access_key_id,
            "secret_access_key": settings.s3_secret_access_key.get_secret_value(),
        }
        self.client = s3_client(settings, endpoint_url=settings.s3_endpoint_url, **keys)
        public = settings.s3_public_endpoint_url or settings.s3_endpoint_url
        self.public_client = (
            self.client if public == settings.s3_endpoint_url else s3_client(settings, endpoint_url=public, **keys)
        )

    # ── setup and health ──
    def ensure_bucket(self, cors_origins: list[str]) -> bool:
        """Creates the bucket when it is missing, lets the web app's origins POST uploads and GET files, and expires
        abandoned uploads (development at start-up; `python -m app.cli setup-bucket` in production).
        -> whether the store took the lifecycle rule."""
        try:
            self.client.head_bucket(Bucket=self.bucket)
        except ClientError:
            if self.settings.s3_endpoint_url is None and self.settings.s3_region != "us-east-1":
                self.client.create_bucket(
                    Bucket=self.bucket,
                    CreateBucketConfiguration={"LocationConstraint": self.settings.s3_region},  # type: ignore[typeddict-item]
                )
            else:
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
            log.info("bucket CORS not set (%s)", error_code(e))
        return self.ensure_lifecycle()

    def ensure_lifecycle(self) -> bool:
        """Objects under incoming/ expire after a day (uploads that were never completed), where the store supports
        lifecycle rules; the bucket's other rules are kept. -> False when the store refused."""
        try:
            current = self.client.get_bucket_lifecycle_configuration(Bucket=self.bucket).get("Rules", [])
        except ClientError as e:
            if error_code(e) != "NoSuchLifecycleConfiguration":
                log.info("bucket lifecycle rules not read (%s)", error_code(e))
                return False
            current = []
        rules: list[Any] = [r for r in current if r.get("ID") != INCOMING_RULE_ID]
        rules.append(
            {
                "ID": INCOMING_RULE_ID,
                "Filter": {"Prefix": INCOMING_PREFIX},
                "Status": "Enabled",
                "Expiration": {"Days": 1},
            }
        )
        try:
            self.client.put_bucket_lifecycle_configuration(Bucket=self.bucket, LifecycleConfiguration={"Rules": rules})
        except ClientError as e:
            log.info("bucket lifecycle rule not set (%s)", error_code(e))
            return False
        return True

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
            if error_code(e) in ("404", "NoSuchKey", "NotFound"):
                return None
            raise
        return ObjectInfo(size=int(r["ContentLength"]), content_type=r.get("ContentType"), etag=r.get("ETag"))

    def read_head(self, key: str, size: int, *, if_match: str | None = None) -> bytes | None:
        """The object's first `size` bytes, or None when it doesn't exist. With `if_match` (an ETag), only from that
        version of the object (ClientError PreconditionFailed otherwise)."""
        extra: dict[str, Any] = {"IfMatch": if_match} if if_match else {}
        try:
            r = self.client.get_object(Bucket=self.bucket, Key=key, Range=f"bytes=0-{max(size, 1) - 1}", **extra)
        except ClientError as e:
            if error_code(e) in ("404", "NoSuchKey", "NotFound"):
                return None
            raise
        data: bytes = r["Body"].read(size)
        return data

    def copy(self, src: str, dst: str, content_type: str, *, if_match: str | None = None) -> None:
        """Server-side copy inside the bucket (the bytes never pass through the API). The copy is stored with
        `content_type` (REPLACE), whatever the source object carried. With `if_match` (an ETag), only that version
        of the source is copied (PreconditionFailed otherwise; not every store checks it, so check the copy too)."""
        extra: dict[str, Any] = {"CopySourceIfMatch": if_match} if if_match else {}
        self.client.copy_object(
            Bucket=self.bucket,
            Key=dst,
            CopySource={"Bucket": self.bucket, "Key": src},
            MetadataDirective="REPLACE",
            ContentType=content_type,
            **extra,
        )

    # ── downloads ──
    def presigned_get(self, key: str, *, file_name: str, content_type: str, inline: bool = False) -> str:
        """A short-lived link that serves the object as `content_type`. It is shown in the browser only when
        `inline` is asked for and the type is a PDF or an allowlisted image; anything else downloads as an
        attachment named after `file_name`. Pass the type from the allowlist, never what a browser declared."""
        media = content_type.split(";", 1)[0].strip().lower() or "application/octet-stream"
        show = inline and media in INLINE_TYPES
        params: dict[str, Any] = {
            "Bucket": self.bucket,
            "Key": key,
            "ResponseContentType": media,
            "ResponseContentDisposition": content_disposition(file_name or "file", show),
        }
        return self.public_client.generate_presigned_url(
            "get_object", Params=params, ExpiresIn=self.settings.download_url_ttl_seconds
        )

    def put_bytes(self, key: str, data: bytes, content_type: str) -> None:
        """Server-side writes (seed files)."""
        self.client.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=content_type)

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=key)


@lru_cache
def get_storage() -> Storage:
    return Storage(get_settings())
