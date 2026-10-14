"""Seniors who answer: Year 3 students who list themselves in Career Navigator's "Ask a senior" panel."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import ARRAY, Boolean, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, created_ts


class SeniorProfile(Base):
    """A senior's listing: the topics they answer on and a line about what they did. Paused: kept, but not listed."""

    __tablename__ = "senior_profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    topics: Mapped[list[str]] = mapped_column(ARRAY(String(32)), default=list, server_default="{}")
    note: Mapped[str] = mapped_column(String(140), default="", server_default="")
    paused: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    created_at: Mapped[datetime] = created_ts()
