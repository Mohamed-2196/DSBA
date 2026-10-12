"""Forum pictures. A browser uploads an image (POST /uploads, purpose forum_image) and the post refers to it as
/api/v1/media/<id>. When the post is saved, the author's own images it shows are attached to it (uploads.thread_id or
reply_id): the daily sweep keeps them, and /media serves them only while that post is visible (security review,
finding 8 and SEC-10). Images a post stops showing are released: back to 'uploaded', so the sweep removes them, unless
another post of their uploader still shows them."""

from __future__ import annotations

import uuid
from collections.abc import Iterable
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models import ForumReply, ForumThread, PostStatus, Upload, UploadPurpose, UploadStatus
from app.services.forum.rules import MAX_IMAGES_PER_POST
from app.services.forum.text import media_ids


def attach_images(
    db: Session,
    owner_id: uuid.UUID | None,
    body: str,
    *,
    thread_id: uuid.UUID | None = None,
    reply_id: uuid.UUID | None = None,
) -> None:
    """Forum images the post shows that its author uploaded become 'attached' to it: the daily sweep keeps them, and
    /media serves them only while the post is visible (finding 8). Pass the thread's id for a thread's body, the
    reply's id for a reply's."""
    ids = media_ids(body)
    if not ids or owner_id is None:
        return
    db.execute(
        update(Upload)
        .where(
            Upload.id.in_(ids),
            Upload.user_id == owner_id,
            Upload.purpose == UploadPurpose.forum_image,
            Upload.status == UploadStatus.uploaded,
        )
        .values(status=UploadStatus.attached, thread_id=thread_id, reply_id=reply_id)
        .execution_options(synchronize_session="fetch")
    )


def _post_showing(db: Session, image_id: uuid.UUID) -> tuple[uuid.UUID | None, uuid.UUID | None] | None:
    """A post of the image's uploader whose body shows it, a visible one first: (thread id, None) or
    (None, reply id). Like attaching, only the uploader's own posts count."""
    owner = select(Upload.user_id).where(Upload.id == image_id).scalar_subquery()
    pattern = f"%/api/v1/media/{image_id}%"
    thread_id = db.scalar(
        select(ForumThread.id)
        .where(ForumThread.author_id == owner, ForumThread.body.ilike(pattern))
        .order_by(ForumThread.status != PostStatus.visible, ForumThread.created_at)
        .limit(1)
    )
    if thread_id is not None:
        return thread_id, None
    reply_id = db.scalar(
        select(ForumReply.id)
        .where(ForumReply.author_id == owner, ForumReply.body.ilike(pattern))
        .order_by(ForumReply.status != PostStatus.visible, ForumReply.created_at)
        .limit(1)
    )
    return (None, reply_id) if reply_id is not None else None


def release_images(db: Session, ids: Iterable[uuid.UUID]) -> None:
    """Images a post no longer shows go back to 'uploaded' (the daily sweep deletes them), unless another post of
    their uploader shows them too: then they belong to that post. Call after the post's new body is in the
    session."""
    ids = list(ids)[:MAX_IMAGES_PER_POST]
    if not ids:
        return
    db.flush()
    for image_id in ids:
        post = _post_showing(db, image_id)
        values: dict[str, Any] = (
            {"status": UploadStatus.uploaded} if post is None else {"thread_id": post[0], "reply_id": post[1]}
        )
        db.execute(
            update(Upload)
            .where(
                Upload.id == image_id,
                Upload.purpose == UploadPurpose.forum_image,
                Upload.status == UploadStatus.attached,
            )
            .values(**values)
            .execution_options(synchronize_session="fetch")
        )
