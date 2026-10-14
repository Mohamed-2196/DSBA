"""Files and comments on cards.

A file comes in through the upload flow (POST /uploads with purpose 'board', the browser's POST to the bucket, then
/uploads/{id}/complete) and is attached to a card here: it becomes 'attached' with the card's id, so the daily sweep
keeps it. Only its owner can open it (GET /board-files/{id}: a short-lived link, shown in the browser for pictures
and PDFs). Deleting it removes the object at once; deleting its card or board leaves it without a card, and the
sweep deletes it. The files on one student's cards take at most MAX_STORAGE_BYTES."""

from __future__ import annotations

import uuid
from datetime import timedelta

from botocore.exceptions import BotoCoreError, ClientError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import ApiError, conflict, not_found
from app.models import BoardCard, BoardComment, Upload, UploadPurpose, UploadStatus, User
from app.schemas.board import BoardCardDetail, CardAttachment, CardComment, CommentCreate
from app.services import ratelimit
from app.services.board.boards import storage_used
from app.services.board.cards import card_out, file_url
from app.services.board.common import MAX_ATTACHMENTS, MAX_COMMENTS, MAX_STORAGE_BYTES
from app.services.storage import Storage, get_storage
from app.services.uploads import IMAGE_CONTENT_TYPES, file_type_for

COMMENT_LIMIT = 120
COMMENT_WINDOW = timedelta(hours=1)
FILE_GONE = "This file isn't on the card any more."


def _mb(n: int) -> str:
    return f"{n / (1024 * 1024):.0f} MB"


def check_storage(db: Session, user: User, adding: int) -> None:
    """409 storage_full when `adding` more bytes would pass MAX_STORAGE_BYTES. POST /uploads checks it before the
    file travels."""
    used = storage_used(db, user.id)
    if used + adding > MAX_STORAGE_BYTES:
        left = max(0, MAX_STORAGE_BYTES - used)
        raise conflict(
            "storage_full",
            f"Files on your cards can take {_mb(MAX_STORAGE_BYTES)} and {_mb(left)} is left. "
            "Delete files you no longer need, then try again.",
        )


def _attachment(up: Upload) -> CardAttachment:
    return CardAttachment.model_validate(
        {
            "id": up.id,
            "file_name": up.file_name,
            "content_type": up.content_type,
            "size_bytes": up.size_bytes,
            "image": up.content_type in IMAGE_CONTENT_TYPES,
            "url": file_url(up.id),
            "created_at": up.completed_at or up.created_at,
        }
    )


def detail(db: Session, user: User, card: BoardCard) -> BoardCardDetail:
    """The card with its files (in the order they were added) and comments (oldest first)."""
    files = db.scalars(
        select(Upload)
        .where(Upload.card_id == card.id, Upload.purpose == UploadPurpose.board)
        .order_by(Upload.completed_at, Upload.created_at)
    )
    comments = db.scalars(select(BoardComment).where(BoardComment.card_id == card.id).order_by(BoardComment.created_at))
    return BoardCardDetail.model_validate(
        {
            **card_out(db, user, card).model_dump(),
            "attachments": [_attachment(u) for u in files],
            "comments": [
                CardComment.model_validate({"id": c.id, "body": c.body, "created_at": c.created_at}) for c in comments
            ],
        }
    )


def attach(db: Session, user: User, card: BoardCard, upload_id: uuid.UUID) -> CardAttachment:
    """Attaches the student's checked board upload to the card. 404 for an upload that isn't theirs or isn't a
    board file; 409 not_uploaded while it hasn't been checked; 409 limit_reached at MAX_ATTACHMENTS. Attaching it
    again to the same card changes nothing."""
    up = db.get(Upload, upload_id)
    if up is None or up.user_id != user.id or up.purpose != UploadPurpose.board:
        raise not_found("This upload doesn't exist.")
    if up.status == UploadStatus.attached:
        if up.card_id == card.id:
            return _attachment(up)
        raise not_found("This upload doesn't exist.")
    if up.status != UploadStatus.uploaded:
        raise conflict("not_uploaded", "The file hasn't arrived yet. Upload it again.")
    count = db.scalar(select(func.count()).select_from(Upload).where(Upload.card_id == card.id)) or 0
    if count >= MAX_ATTACHMENTS:
        raise conflict("limit_reached", f"A card holds {MAX_ATTACHMENTS} files. Delete one first.")
    up.status = UploadStatus.attached
    up.card_id = card.id
    if card.cover_id is None and up.content_type in IMAGE_CONTENT_TYPES:
        card.cover_id = up.id  # the first picture becomes the cover
    return _attachment(up)


def _card_file(db: Session, card: BoardCard, upload_id: uuid.UUID) -> Upload:
    up = db.get(Upload, upload_id)
    if up is None or up.card_id != card.id or up.purpose != UploadPurpose.board:
        raise not_found(FILE_GONE)
    return up


def detach(db: Session, card: BoardCard, upload_id: uuid.UUID, storage: Storage | None = None) -> None:
    """Deletes the file from the bucket, then its row; a cover that was this file goes too."""
    up = _card_file(db, card, upload_id)
    try:
        (storage or get_storage()).delete(up.storage_key)
    except (BotoCoreError, ClientError) as e:
        raise ApiError(
            503, "storage_unavailable", "We couldn't delete the file just now. Try again in a few minutes."
        ) from e
    if card.cover_id == up.id:
        card.cover_id = None
    db.delete(up)


def file_link(db: Session, user: User, upload_id: uuid.UUID, storage: Storage | None = None) -> str:
    """A short-lived link to one of the student's card files: shown in the browser for a picture or a PDF,
    downloaded otherwise. 404 for anyone else's, and for a file no longer on a card."""
    up = db.get(Upload, upload_id)
    if (
        up is None
        or up.user_id != user.id
        or up.purpose != UploadPurpose.board
        or up.status != UploadStatus.attached
        or up.card_id is None
    ):
        raise not_found(FILE_GONE)
    ft = file_type_for(up.file_name, UploadPurpose.board)
    if ft is None:
        raise not_found(FILE_GONE)
    st = storage or get_storage()
    return st.presigned_get(up.storage_key, file_name=up.file_name, content_type=ft.content_type, inline=True)


def add_comment(db: Session, user: User, card: BoardCard, body: CommentCreate) -> CardComment:
    """409 limit_reached at MAX_COMMENTS on a card; 429 after COMMENT_LIMIT comments in an hour."""
    ratelimit.enforce(
        db,
        f"board-comments:{user.id}",
        BoardComment.created_at,
        [BoardComment.card_id.in_(select(BoardCard.id).where(BoardCard.user_id == user.id))],
        limit=COMMENT_LIMIT,
        window=COMMENT_WINDOW,
        message="You've written a lot of comments. Try again in {}.",
    )
    count = db.scalar(select(func.count()).select_from(BoardComment).where(BoardComment.card_id == card.id)) or 0
    if count >= MAX_COMMENTS:
        raise conflict("limit_reached", f"A card holds {MAX_COMMENTS} comments. Delete some first.")
    comment = BoardComment(card_id=card.id, body=body.body)
    db.add(comment)
    db.flush()
    db.refresh(comment)
    return CardComment.model_validate({"id": comment.id, "body": comment.body, "created_at": comment.created_at})


def delete_comment(db: Session, card: BoardCard, comment_id: uuid.UUID) -> None:
    comment = db.get(BoardComment, comment_id)
    if comment is None or comment.card_id != card.id:
        raise not_found("This comment isn't on the card any more.")
    db.delete(comment)
