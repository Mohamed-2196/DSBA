"""Direct-to-S3 uploads: allowlists, presigned POSTs, checks on `complete`, and forum images.

How a file gets in (docs/reviews/security-design.md, findings 6-8):
  1. POST /uploads checks the name, type and size against the purpose's allowlist and presigns a POST to a
     throwaway key, `incoming/<upload id>`, that only accepts the allowlisted type and the declared size.
  2. The browser POSTs the file straight to the bucket.
  3. POST /uploads/{id}/complete checks what actually arrived (size, type, the file's first bytes), then copies it
     server-side to its final key, `library/<uuid>/<safe name>` or `forum/<uuid>/<safe name>`, and deletes the
     incoming object. No presigned policy ever allows writing a final key, so a checked file can't be swapped.

`Upload.storage_key` always names where the object is now: the incoming key while pending, the final key after."""

from __future__ import annotations

import re
import unicodedata
import uuid
from dataclasses import dataclass
from datetime import timedelta

from botocore.exceptions import ClientError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.errors import ApiError, conflict, not_found, rate_limited
from app.core.time import utcnow
from app.models import Upload, UploadPurpose, UploadStatus, User
from app.schemas.uploads import PresignedUpload, UploadCreate, UploadOut
from app.services.storage import Storage, get_storage, safe_file_name

UPLOADS_PER_HOUR = 20
INCOMING_PREFIX = "incoming/"
SNIFF_BYTES = 1024


@dataclass(frozen=True)
class FileType:
    """An allowlisted extension: the type the object is stored and served with, the types a browser may declare
    for it, and how to recognise the file from its first bytes (None: not checked, attachment-only text)."""

    content_type: str
    aliases: tuple[str, ...] = ()
    magic: tuple[bytes, ...] | None = None

    def accepts(self, declared: str) -> bool:
        return declared == self.content_type or declared in self.aliases


_OOXML = (b"PK\x03\x04",)  # docx, xlsx, pptx are zip files
_OLE = (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1",)  # doc, xls, ppt
_JPEG = FileType("image/jpeg", ("image/jpg", "image/pjpeg"), (b"\xff\xd8\xff",))

# Never add image/svg+xml, text/html, XML or JavaScript types: PDFs and raster images are shown inline.
LIBRARY_TYPES: dict[str, FileType] = {
    "pdf": FileType("application/pdf", ("application/x-pdf",), (b"%PDF-",)),
    "docx": FileType("application/vnd.openxmlformats-officedocument.wordprocessingml.document", (), _OOXML),
    "doc": FileType("application/msword", (), _OLE),
    "xlsx": FileType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", (), _OOXML),
    "xls": FileType("application/vnd.ms-excel", (), _OLE),
    "pptx": FileType("application/vnd.openxmlformats-officedocument.presentationml.presentation", (), _OOXML),
    "ppt": FileType("application/vnd.ms-powerpoint", (), _OLE),
    # Browsers rarely know notebooks and R scripts: they may declare a generic type.
    "ipynb": FileType("application/x-ipynb+json", ("application/json", "application/octet-stream")),
    "r": FileType("text/x-r", ("text/x-r-source", "text/plain", "application/octet-stream")),
    "txt": FileType("text/plain"),
    "csv": FileType("text/csv", ("application/csv", "application/vnd.ms-excel", "text/plain")),
}
IMAGE_TYPES: dict[str, FileType] = {
    "png": FileType("image/png", (), (b"\x89PNG\r\n\x1a\n",)),
    "jpg": _JPEG,
    "jpeg": _JPEG,
    "webp": FileType("image/webp", (), (b"RIFF",)),  # plus "WEBP" at offset 8, see _looks_right
    "gif": FileType("image/gif", (), (b"GIF87a", b"GIF89a")),
}
ALLOWLISTS: dict[UploadPurpose, dict[str, FileType]] = {
    UploadPurpose.library: LIBRARY_TYPES,
    UploadPurpose.forum_image: IMAGE_TYPES,
}
# Shown in the browser (PDF viewer, <img>); everything else is downloaded as an attachment.
INLINE_TYPES = frozenset({"application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif"})
IMAGE_CONTENT_TYPES = frozenset(t.content_type for t in IMAGE_TYPES.values())

# The paths media_url() hands out, as a post refers to them (the forum attaches images it finds this way).
MEDIA_PATH_RE = re.compile(
    r"/api/v1/media/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?![0-9a-zA-Z/])"
)


# ── names and types ──────────────────────────────────────────────────────────────────────────


def clean_file_name(name: str) -> str:
    """The name as the student knows it, without folders ('C:\\fakepath\\x.pdf') or control characters."""
    base = re.split(r"[\\/]", name)[-1]
    base = "".join(ch for ch in base if unicodedata.category(ch)[0] != "C").strip()
    return base[:255] or "file"


def extension(file_name: str) -> str:
    stem, dot, ext = file_name.rpartition(".")
    return ext.lower() if dot and stem.strip() else ""


def media_type(value: str | None) -> str:
    """'Text/Plain; charset=utf-8' -> 'text/plain'."""
    return (value or "").split(";", 1)[0].strip().lower()


def file_type_for(file_name: str | None, purpose: UploadPurpose | None = None) -> FileType | None:
    """The allowlist entry for a file name's extension (any purpose unless one is given)."""
    if not file_name:
        return None
    ext = extension(file_name)
    if purpose is not None:
        return ALLOWLISTS[purpose].get(ext)
    return LIBRARY_TYPES.get(ext) or IMAGE_TYPES.get(ext)


def serve_type(file_name: str | None) -> str:
    """The Content-Type a stored file is served with: always the allowlist's, never what a browser declared."""
    ft = file_type_for(file_name)
    return ft.content_type if ft else "application/octet-stream"


def limit_bytes(purpose: UploadPurpose) -> int:
    s = get_settings()
    mb = s.max_image_mb if purpose == UploadPurpose.forum_image else s.max_upload_mb
    return mb * 1024 * 1024


def media_url(upload_id: uuid.UUID) -> str:
    return f"/api/v1/media/{upload_id}"


def _final_key(up: Upload) -> str:
    prefix = "forum" if up.purpose == UploadPurpose.forum_image else "library"
    return f"{prefix}/{uuid.uuid4()}/{safe_file_name(up.file_name)}"


def to_out(up: Upload) -> UploadOut:
    is_image = up.purpose == UploadPurpose.forum_image and up.status != UploadStatus.pending
    return UploadOut.model_validate(
        {
            "upload_id": up.id,
            "status": up.status.value,
            "file_name": up.file_name,
            "content_type": up.content_type,
            "size_bytes": up.size_bytes,
            "media_url": media_url(up.id) if is_image else None,
        }
    )


# ── POST /uploads ────────────────────────────────────────────────────────────────────────────


def _unsupported(purpose: UploadPurpose) -> ApiError:
    if purpose == UploadPurpose.forum_image:
        msg = "Use a PNG, JPEG, WebP or GIF image."
    else:
        msg = "Use a PDF, Word, Excel, PowerPoint, notebook (.ipynb), R script, text or CSV file."
    return ApiError(422, "unsupported_type", msg, fields={"fileName": msg})


def check_rate(db: Session, user: User) -> None:
    """20 uploads per user per hour (rows in the window, whatever became of them)."""
    since = utcnow() - timedelta(hours=1)
    count, oldest = db.execute(
        select(func.count(), func.min(Upload.created_at)).where(Upload.user_id == user.id, Upload.created_at > since)
    ).one()
    if count >= UPLOADS_PER_HOUR:
        wait = int((oldest + timedelta(hours=1) - utcnow()).total_seconds()) + 1 if oldest else 3600
        raise rate_limited(wait, "You've uploaded a lot in the last hour. Try again later.")


def create_upload(db: Session, user: User, body: UploadCreate, storage: Storage | None = None) -> PresignedUpload:
    purpose = UploadPurpose(body.purpose)
    name = clean_file_name(body.file_name)
    ft = file_type_for(name, purpose)
    if ft is None or not ft.accepts(media_type(body.content_type)):
        raise _unsupported(purpose)
    limit = limit_bytes(purpose)
    if body.size_bytes > limit:
        msg = f"This file is too big: the limit is {limit // (1024 * 1024)} MB."
        raise ApiError(422, "too_large", msg, fields={"sizeBytes": msg})
    check_rate(db, user)

    upload_id = uuid.uuid4()
    up = Upload(
        id=upload_id,
        user_id=user.id,
        purpose=purpose,
        storage_key=f"{INCOMING_PREFIX}{upload_id}",
        file_name=name,
        content_type=ft.content_type,  # the policy pins it: what the bucket stores is the allowlist's type
        size_bytes=body.size_bytes,
        status=UploadStatus.pending,
    )
    db.add(up)
    st = storage or get_storage()
    post = st.presigned_post(up.storage_key, ft.content_type, body.size_bytes)
    db.commit()
    return PresignedUpload(
        upload_id=upload_id,
        url=post["url"],
        fields=post["fields"],
        expires_in=get_settings().upload_url_ttl_seconds,
        max_bytes=body.size_bytes,
    )


# ── POST /uploads/{id}/complete ──────────────────────────────────────────────────────────────


def _first_bytes(st: Storage, key: str) -> bytes | None:
    try:
        r = st.client.get_object(Bucket=st.bucket, Key=key, Range=f"bytes=0-{SNIFF_BYTES - 1}")
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") in ("404", "NoSuchKey", "NotFound"):
            return None
        raise
    return r["Body"].read(SNIFF_BYTES)


def _looks_right(ft: FileType, head: bytes) -> bool:
    """Does the file start the way its type says? (Text types are not checked: they are never shown inline.)"""
    if ft.magic is None:
        return True
    if ft.content_type == "application/pdf":  # the header may follow a few junk bytes
        return b"%PDF-" in head
    if ft.content_type == "image/webp":
        return head[:4] == b"RIFF" and head[8:12] == b"WEBP"
    return any(head.startswith(m) for m in ft.magic)


def _mismatch(st: Storage, key: str) -> ApiError:
    st.delete(key)
    return ApiError(422, "mismatch", "This file doesn't match what was declared. Choose the file again.")


def _promote(st: Storage, src: str, dst: str, content_type: str) -> None:
    """Server-side copy of a checked object to its final key (the bytes never pass through the API).
    The type is set again from the allowlist (REPLACE), whatever the incoming object carried."""
    st.client.copy_object(
        Bucket=st.bucket,
        Key=dst,
        CopySource={"Bucket": st.bucket, "Key": src},
        MetadataDirective="REPLACE",
        ContentType=content_type,
    )


def complete_upload(db: Session, user: User, upload_id: uuid.UUID, storage: Storage | None = None) -> UploadOut:
    up = db.get(Upload, upload_id)
    if up is None or up.user_id != user.id:
        raise not_found("This upload doesn't exist.")
    if up.status != UploadStatus.pending:
        return to_out(up)  # already checked: a second call returns the stored result

    st = storage or get_storage()
    incoming = up.storage_key
    info = st.head(incoming)
    if info is None:
        raise conflict("not_uploaded", "The file hasn't arrived yet. Upload it again.")
    ft = file_type_for(up.file_name, up.purpose)
    too_big = info.size > min(up.size_bytes, limit_bytes(up.purpose))
    if ft is None or too_big or info.size < 1 or media_type(info.content_type) != up.content_type:
        raise _mismatch(st, incoming)
    head = _first_bytes(st, incoming)
    if head is None:
        raise conflict("not_uploaded", "The file hasn't arrived yet. Upload it again.")
    if not _looks_right(ft, head):
        raise _mismatch(st, incoming)

    final = _final_key(up)
    _promote(st, incoming, final, up.content_type)
    st.delete(incoming)
    up.storage_key = final
    up.size_bytes = info.size
    up.status = UploadStatus.uploaded
    up.completed_at = utcnow()
    db.commit()
    return to_out(up)


# ── GET /media/{id} ──────────────────────────────────────────────────────────────────────────


def media_redirect_url(db: Session, upload_id: uuid.UUID, storage: Storage | None = None) -> str:
    """A short-lived inline link to a forum image; 404 for anything else (library files never go out this way)."""
    up = db.get(Upload, upload_id)
    if (
        up is None
        or up.purpose != UploadPurpose.forum_image
        or up.status not in (UploadStatus.uploaded, UploadStatus.attached)
    ):
        raise not_found("This image doesn't exist.")
    ft = file_type_for(up.file_name, UploadPurpose.forum_image)
    if ft is None or ft.content_type not in IMAGE_CONTENT_TYPES or up.content_type != ft.content_type:
        raise not_found("This image doesn't exist.")
    st = storage or get_storage()
    return st.presigned_get(up.storage_key, file_name=up.file_name, inline=True, content_type=ft.content_type)
