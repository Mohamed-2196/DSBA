"""Direct-to-S3 uploads: allowlists, presigned POSTs, checks on `complete`, and the pictures /media serves.

How a file gets in (docs/reviews/security-design.md, findings 6-8):
  1. POST /uploads checks the name, type and size against the purpose's allowlist and presigns a POST to a
     throwaway key, `incoming/<upload id>`, that only accepts the allowlisted type and the declared size.
  2. The browser POSTs the file straight to the bucket.
  3. POST /uploads/{id}/complete checks what actually arrived (size, type, the file's first bytes), then copies it
     server-side to its final key, `<purpose's prefix>/<uuid>/<safe name>` (library/, forum/, newsletter/, bugs/,
     board/ or notes/), and deletes the incoming object. No presigned policy ever allows writing a final key, so a
     checked file can't be swapped.

`Upload.storage_key` always names where the object is now: the incoming key while pending, the final key after."""

from __future__ import annotations

import re
import unicodedata
import uuid
from dataclasses import dataclass
from datetime import timedelta

from botocore.exceptions import ClientError
from sqlalchemy import Text, cast, or_, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.access import Box, Feature
from app.core.errors import ApiError, conflict, not_found
from app.core.links import career_logo_path, media_path
from app.core.time import utcnow
from app.models import (
    ForumReply,
    ForumThread,
    IssueStatus,
    Module,
    NewsletterIssue,
    PostStatus,
    Upload,
    UploadPurpose,
    UploadStatus,
    User,
)
from app.schemas.uploads import PresignedUpload, UploadCreate, UploadOut
from app.services import access, notebook_uploads, ratelimit
from app.services.forum.visibility import can_read_thread, moderates
from app.services.storage import INCOMING_PREFIX, Storage, error_code, get_storage, safe_file_name

UPLOADS_PER_HOUR = 20
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
_PNG = FileType("image/png", (), (b"\x89PNG\r\n\x1a\n",))
_JPEG = FileType("image/jpeg", ("image/jpg", "image/pjpeg"), (b"\xff\xd8\xff",))
_WEBP = FileType("image/webp", (), (b"RIFF",))  # plus "WEBP" at offset 8, see looks_right

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
    # Pictures (decision D9): a photo of a whiteboard, a scanned page. Previewed inline, like PDFs.
    "png": _PNG,
    "jpg": _JPEG,
    "jpeg": _JPEG,
    "webp": _WEBP,
}
IMAGE_TYPES: dict[str, FileType] = {
    "png": _PNG,
    "jpg": _JPEG,
    "jpeg": _JPEG,
    "webp": _WEBP,
    "gif": FileType("image/gif", (), (b"GIF87a", b"GIF89a")),
}
# Newsletter pictures, bug screenshots and organisation logos: still images only (no SVG, never a GIF).
PICTURE_TYPES: dict[str, FileType] = {"png": _PNG, "jpg": _JPEG, "jpeg": _JPEG, "webp": _WEBP}
ALLOWLISTS: dict[UploadPurpose, dict[str, FileType]] = {
    UploadPurpose.library: LIBRARY_TYPES,
    UploadPurpose.forum_image: IMAGE_TYPES,
    UploadPurpose.newsletter_image: PICTURE_TYPES,
    UploadPurpose.bug_screenshot: PICTURE_TYPES,
    UploadPurpose.board: LIBRARY_TYPES | IMAGE_TYPES,  # a card holds files and pictures
    UploadPurpose.note_file: LIBRARY_TYPES | IMAGE_TYPES,  # a note's pictures, files and the PDFs it writes over
    UploadPurpose.career_logo: PICTURE_TYPES,
    UploadPurpose.module_art: PICTURE_TYPES,
}
# Shown in the browser (PDF viewer, <img>): storage.INLINE_TYPES. Everything else downloads as an attachment.
IMAGE_CONTENT_TYPES = frozenset(t.content_type for t in IMAGE_TYPES.values())
# The purposes /media serves (as '/api/v1/media/<id>'): pictures, never library files.
IMAGE_PURPOSES = frozenset(
    {UploadPurpose.forum_image, UploadPurpose.newsletter_image, UploadPurpose.bug_screenshot, UploadPurpose.module_art}
)
# Where each purpose's checked files live in the bucket.
FINAL_PREFIXES: dict[UploadPurpose, str] = {
    UploadPurpose.library: "library",
    UploadPurpose.forum_image: "forum",
    UploadPurpose.newsletter_image: "newsletter",
    UploadPurpose.bug_screenshot: "bugs",
    UploadPurpose.board: "board",
    UploadPurpose.note_file: "notes",
    UploadPurpose.career_logo: "career",
    UploadPurpose.module_art: "modules",
}
# The box an upload of each purpose needs (None: any active account).
PURPOSE_BOXES: dict[UploadPurpose, Box | None] = {
    UploadPurpose.library: Box.library_upload,
    UploadPurpose.forum_image: Box.forum_post,
    UploadPurpose.newsletter_image: Box.newsletter_manage,
    UploadPurpose.bug_screenshot: None,
    UploadPurpose.board: None,
    UploadPurpose.note_file: None,
    UploadPurpose.career_logo: Box.career_edit,
    UploadPurpose.module_art: Box.content_edit,
}


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
    mb = s.max_image_mb if purpose in IMAGE_PURPOSES or purpose == UploadPurpose.career_logo else s.max_upload_mb
    return mb * 1024 * 1024


def media_url(upload_id: uuid.UUID) -> str:
    return media_path(upload_id)


def _final_key(up: Upload) -> str:
    """One final key per upload, so a repeated copy can only overwrite its own object, never add another."""
    return f"{FINAL_PREFIXES[up.purpose]}/{up.id}/{safe_file_name(up.file_name)}"


def _shown_at(up: Upload) -> str | None:
    """Where a checked picture is shown from: a picture's /media link, or a logo's /career/logos link."""
    if up.status == UploadStatus.pending:
        return None
    if up.purpose in IMAGE_PURPOSES:
        return media_url(up.id)
    if up.purpose == UploadPurpose.career_logo:
        return career_logo_path(up.id)
    return None


def to_out(up: Upload) -> UploadOut:
    return UploadOut.model_validate(
        {
            "upload_id": up.id,
            "status": up.status.value,
            "file_name": up.file_name,
            "content_type": up.content_type,
            "size_bytes": up.size_bytes,
            "media_url": _shown_at(up),
        }
    )


# ── POST /uploads ────────────────────────────────────────────────────────────────────────────


def _unsupported(purpose: UploadPurpose) -> ApiError:
    if purpose == UploadPurpose.forum_image:
        msg = "Use a PNG, JPEG, WebP or GIF image."
    elif purpose in IMAGE_PURPOSES:
        msg = "Use a PNG, JPEG or WebP image."
    elif purpose == UploadPurpose.career_logo:
        msg = "Use the logo as a PNG, JPEG or WebP picture."
    elif purpose == UploadPurpose.board:
        msg = (
            "Use a PDF, Word, Excel, PowerPoint, notebook (.ipynb), R script, text or CSV file, "
            "or a JPG, PNG, WebP or GIF picture."
        )
    elif purpose == UploadPurpose.note_file:
        msg = (
            "Use a picture (JPG, PNG, WebP or GIF), a PDF, or a Word, Excel, PowerPoint, notebook (.ipynb), R, "
            "text or CSV file."
        )
    else:
        msg = (
            "Use a PDF, Word, Excel, PowerPoint, notebook (.ipynb), R script, text or CSV file, "
            "or a JPG, PNG or WebP picture."
        )
    return ApiError(422, "unsupported_type", msg, fields={"fileName": msg})


def check_rate(db: Session, user: User, purpose: UploadPurpose) -> None:
    """UPLOADS_PER_HOUR per person (rows in the window, whatever became of them), notes' files apart: those have the
    hourly limit admins set (services/notebook_uploads.py). Holds the person's upload lock until the transaction
    ends: the caller inserts the new row in it."""
    if purpose == UploadPurpose.note_file:
        notebook_uploads.check_rate(db, user)
        return
    ratelimit.enforce(
        db,
        f"uploads:{user.id}",
        Upload.created_at,
        [Upload.user_id == user.id, Upload.purpose != UploadPurpose.note_file],
        limit=UPLOADS_PER_HOUR,
        window=timedelta(hours=1),
        message="You've uploaded a lot in the last hour. Try again in {}.",
    )


def _check_room(db: Session, user: User, purpose: UploadPurpose, size_bytes: int) -> None:
    """The purpose's own limits, before the file travels: at most a few of a student's files waiting for review
    (library; create_item checks again), and the bytes their boards and notebooks hold (board, note_file). Raises
    too_many_pending, storage_full or notes_full (409)."""
    from app.services import library, notes  # both import this module
    from app.services.board import files as board_files

    if purpose == UploadPurpose.library:
        library.check_pending_room(db, user)
    elif purpose == UploadPurpose.board:
        board_files.check_storage(db, user, size_bytes)
    elif purpose == UploadPurpose.note_file:
        notes.check_upload(db, user, size_bytes)


def create_upload(db: Session, user: User, body: UploadCreate, storage: Storage | None = None) -> PresignedUpload:
    """The upload row (pending) and its presigned POST. The rate limit and the purpose's room (_check_room()) are
    counted under the person's upload lock, so parallel requests are counted one after the other and can't all fit
    in the same room. The caller commits."""
    purpose = UploadPurpose(body.purpose)
    name = clean_file_name(body.file_name)
    ft = file_type_for(name, purpose)
    if ft is None or not ft.accepts(media_type(body.content_type)):
        raise _unsupported(purpose)
    limit = limit_bytes(purpose)
    if body.size_bytes > limit:
        msg = f"This file is too big: the limit is {limit // (1024 * 1024)} MB."
        raise ApiError(422, "too_large", msg, fields={"sizeBytes": msg})
    check_rate(db, user, purpose)  # takes the lock, held until the transaction ends
    _check_room(db, user, purpose, body.size_bytes)
    if purpose == UploadPurpose.note_file:
        notebook_uploads.record_upload(db, user, body.size_bytes)

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
    return PresignedUpload(
        upload_id=upload_id,
        url=post["url"],
        fields=post["fields"],
        expires_in=get_settings().upload_url_ttl_seconds,
        max_bytes=body.size_bytes,
    )


# ── POST /uploads/{id}/complete ──────────────────────────────────────────────────────────────


def looks_right(ft: FileType, head: bytes) -> bool:
    """Does the file start the way its type says? `head` is its first SNIFF_BYTES. (Text types are not checked: they
    are never shown inline.) Every way a file gets into the bucket checks it: uploads here, the Drive import too."""
    if ft.magic is None:
        return True
    if ft.content_type == "application/pdf":  # the header may follow a few junk bytes
        return b"%PDF-" in head
    if ft.content_type == "image/webp":
        return head[:4] == b"RIFF" and head[8:12] == b"WEBP"
    return any(head.startswith(m) for m in ft.magic)


def _mismatch(st: Storage, key: str, file_name: str) -> ApiError:
    """The file isn't what its name says (or not the size the browser announced): it is deleted. The message
    speaks of the name a student chose, not of anything 'declared' (student test ST-7)."""
    st.delete(key)
    ext = extension(file_name)
    what = f"a real .{ext} file" if ext else "the file it says it is"
    msg = f"This isn't {what}: what's inside doesn't match its name. Save or export it again, or choose another file."
    return ApiError(422, "mismatch", msg)


def _not_uploaded(message: str = "The file hasn't arrived yet. Upload it again.") -> ApiError:
    return conflict("not_uploaded", message)


# The features an upload belongs to: all of them must be on for the uploader.
PURPOSE_FEATURES: dict[UploadPurpose, tuple[Feature, ...]] = {
    UploadPurpose.library: (Feature.library, Feature.library_uploads),
    UploadPurpose.forum_image: (Feature.forum,),
    UploadPurpose.newsletter_image: (Feature.newsletter,),
    UploadPurpose.bug_screenshot: (),  # bug reports have no switch
    UploadPurpose.board: (Feature.board,),
    UploadPurpose.note_file: (Feature.notes,),
    UploadPurpose.career_logo: (Feature.career,),
    UploadPurpose.module_art: (),
}


def require_features(db: Session, user: User | None, purpose: UploadPurpose) -> None:
    """404 feature_off unless every feature an upload of `purpose` belongs to is on for the person."""
    for feature in PURPOSE_FEATURES[purpose]:
        access.require_feature(db, user, feature)


def require_box(user: User, purpose: UploadPurpose) -> None:
    """403 unless the person holds the box uploads of `purpose` need."""
    box = PURPOSE_BOXES[purpose]
    if box is not None:
        access.require(user, box)


def complete_upload(db: Session, user: User, upload_id: uuid.UUID, storage: Storage | None = None) -> UploadOut:
    """Checks what arrived and moves it to its final key. The caller commits.

    The row is locked until the transaction ends, so parallel calls for one upload run one after the other: the
    second waits, then sees the stored result instead of copying the file again (SEC-49)."""
    up = db.get(Upload, upload_id, with_for_update=True, populate_existing=True)
    if up is None or up.user_id != user.id:
        raise not_found("This upload doesn't exist.")
    require_features(db, user, up.purpose)
    if up.status != UploadStatus.pending:
        return to_out(up)  # already checked: a second call returns the stored result

    st = storage or get_storage()
    incoming = up.storage_key
    ft = file_type_for(up.file_name, up.purpose)
    max_size = min(up.size_bytes, limit_bytes(up.purpose))
    info = st.head(incoming)
    if info is None:
        raise _not_uploaded()
    if ft is None or not 1 <= info.size <= max_size or media_type(info.content_type) != up.content_type:
        raise _mismatch(st, incoming, up.file_name)

    # Copy first, then check the copy: no presigned policy can write a final key, so what passes here is exactly
    # what will be served, even if the uploader re-POSTs to incoming/ meanwhile (security review, SEC-13). Where the
    # store supports it, the copy is also tied to the version that was HEADed.
    final = _final_key(up)
    try:
        st.copy(incoming, final, up.content_type, if_match=info.etag)  # the allowlist's type, whatever was sent
    except ClientError as e:
        if error_code(e) in ("PreconditionFailed", "412"):
            raise _not_uploaded("The file changed while we checked it. Upload it again.") from None
        if error_code(e) in ("404", "NoSuchKey", "NotFound"):
            raise _not_uploaded() from None
        raise
    st.delete(incoming)
    stored = st.head(final)
    head = st.read_head(final, SNIFF_BYTES)
    if stored is None or head is None or not 1 <= stored.size <= max_size or not looks_right(ft, head):
        raise _mismatch(st, final, up.file_name)
    up.storage_key = final
    up.size_bytes = stored.size
    up.status = UploadStatus.uploaded
    up.completed_at = utcnow()
    return to_out(up)


# ── GET /media/{id} ──────────────────────────────────────────────────────────────────────────


def media_redirect_url(
    db: Session, upload_id: uuid.UUID, viewer: User | None = None, storage: Storage | None = None
) -> str:
    """A short-lived inline link to a picture: a forum image, a newsletter picture, a module's art or a bug
    screenshot. 404 for anything else (library files never go out this way) and for a picture the viewer may not see
    (can_view_image); feature_off while the picture's feature is off for the viewer."""
    up = db.get(Upload, upload_id)
    if up is None or up.purpose not in IMAGE_PURPOSES or up.status not in _SERVABLE:
        raise not_found("This image doesn't exist.")
    require_features(db, viewer, up.purpose)
    ft = _image_type(up)
    if ft is None or not can_view_image(db, up, viewer):
        raise not_found("This image doesn't exist.")
    st = storage or get_storage()
    return st.presigned_get(up.storage_key, file_name=up.file_name, content_type=ft.content_type, inline=True)


_SERVABLE = (UploadStatus.uploaded, UploadStatus.attached)


def _image_type(up: Upload) -> FileType | None:
    """The picture's allowlisted type, or None when the upload isn't a picture as the allowlist sees it."""
    ft = file_type_for(up.file_name, up.purpose)
    if ft is None or ft.content_type not in IMAGE_CONTENT_TYPES or up.content_type != ft.content_type:
        return None
    return ft


def shows_image(db: Session, up: Upload | None, viewer: User | None) -> bool:
    """Whether /media would show the viewer this picture (its feature aside): it is still there, a picture, and theirs
    to see. Lists use it so that they never point at a picture that isn't."""
    return (
        up is not None
        and up.purpose in IMAGE_PURPOSES
        and up.status in _SERVABLE
        and _image_type(up) is not None
        and can_view_image(db, up, viewer)
    )


def can_view_image(db: Session, up: Upload, viewer: User | None) -> bool:
    """Whether `viewer` may see the picture: its uploader always, and then by purpose (a bug screenshot: admins; a
    newsletter picture: people who manage the newsletter, and everyone once a published issue shows it; a module's
    art: people who edit modules, and everyone while a module students see shows it; a forum image: see
    _can_view_forum_image)."""
    if viewer is not None and up.user_id == viewer.id:
        return True
    if up.purpose == UploadPurpose.module_art:
        return access.can(viewer, Box.content_edit) or (
            up.status == UploadStatus.attached and on_visible_module(db, up.id)
        )
    if up.purpose == UploadPurpose.bug_screenshot:
        return access.is_admin(viewer)
    if up.purpose == UploadPurpose.newsletter_image:
        return access.can(viewer, Box.newsletter_manage) or (
            up.status == UploadStatus.attached and in_published_issue(db, up.id)
        )
    return _can_view_forum_image(db, up, viewer)


def on_visible_module(db: Session, upload_id: uuid.UUID) -> bool:
    """Whether a module students see shows the picture as its art."""
    found = db.scalar(select(Module.id).where(Module.art == media_path(upload_id), Module.hidden.is_(False)).limit(1))
    return found is not None


def in_published_issue(db: Session, upload_id: uuid.UUID) -> bool:
    """Whether a published issue shows the picture, as its cover art or a section's figure."""
    path = f"%{media_path(upload_id)}%"
    found = db.scalar(
        select(NewsletterIssue.id)
        .where(
            NewsletterIssue.status == IssueStatus.published,
            or_(cast(NewsletterIssue.cover, Text).like(path), cast(NewsletterIssue.sections, Text).like(path)),
        )
        .limit(1)
    )
    return found is not None


def _can_view_forum_image(db: Session, up: Upload, viewer: User | None) -> bool:
    """Moderators always. Everyone else while it is attached to a post they can read that still shows it: a visible
    thread, or a visible reply in a thread they can open. The author of a hidden thread can read it (decision D3), so
    they see its pictures, the other replies' too. Not before it is posted (the composer previews from the file
    itself), and not once the post is deleted or gone, or no longer shows it."""
    if moderates(viewer):
        return True
    if up.status != UploadStatus.attached:
        return False
    if up.reply_id is not None:
        reply = db.get(ForumReply, up.reply_id)
        if reply is None or reply.status != PostStatus.visible:
            return False
        thread = db.get(ForumThread, reply.thread_id)
        return thread is not None and can_read_thread(thread, viewer)
    if up.thread_id is not None:
        thread = db.get(ForumThread, up.thread_id)
        if thread is None or thread.status == PostStatus.deleted:
            return False
        return thread.status == PostStatus.visible or can_read_thread(thread, viewer)
    return False
