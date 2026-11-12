"""Rate my CV, in Career Navigator: the CVs a student keeps, each with its latest rating (app/services/career_cv.py)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import ForeignKey, Index, SmallInteger, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, created_ts, uuid_pk


class CvReview(Base):
    """One CV a student uploaded (its file is the upload, purpose 'cv', seen by its owner only) and its latest rating:
    the score out of 100, the role it was matched against and how well it fits, and every check behind them
    (`result`). Its text is kept so rating it for another role needs no second reading of the file. Deleting the
    upload deletes the review; the student's account going deletes both, and the file."""

    __tablename__ = "cv_reviews"
    __table_args__ = (Index("ix_cv_reviews_user_created", "user_id", "created_at"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    upload_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("uploads.id", ondelete="CASCADE"), unique=True)
    role_id: Mapped[str] = mapped_column(String(64))
    score: Mapped[int] = mapped_column(SmallInteger)
    fit: Mapped[int] = mapped_column(SmallInteger)  # percent of the role's skills the CV names
    result: Mapped[dict[str, Any]] = mapped_column(default=dict)
    text: Mapped[str] = mapped_column(Text)
    pages: Mapped[int] = mapped_column(SmallInteger)
    created_at: Mapped[datetime] = created_ts()
    rated_at: Mapped[datetime] = created_ts()
