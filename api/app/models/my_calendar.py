"""A student's own calendar: the events they add for themselves, and what they keep off the programme calendar."""

from __future__ import annotations

import datetime as dt
import uuid
from datetime import datetime
from typing import get_args

from sqlalchemy import CheckConstraint, Date, ForeignKey, Index, SmallInteger, String, Text, Time, text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, check_in, created_ts, uuid_pk
from app.schemas.calendar import PersonalColour, Reminder, Repeat


class PersonalEvent(Base):
    """An event one student added for themselves. Nobody else sees it."""

    __tablename__ = "personal_events"
    __table_args__ = (
        Index("ix_personal_events_user_date", "user_id", "date"),
        # the reminder worker: events with a reminder (services/my_calendar.py send_reminders)
        Index("ix_personal_events_reminders", "date", postgresql_where=text("remind IS NOT NULL")),
        CheckConstraint("end_date IS NULL OR end_date >= date", name="end_after_start"),
        CheckConstraint("start_time IS NOT NULL OR end_time IS NULL", name="end_time_needs_start"),
        CheckConstraint("end_time IS NULL OR end_time > start_time", name="end_time_after_start"),
        CheckConstraint("repeat_until IS NULL OR repeat_until >= date", name="repeat_until_after_start"),
        check_in("colour", get_args(PersonalColour)),
        check_in("repeat", get_args(Repeat)),
        CheckConstraint("month_day IS NULL OR (repeat = 'monthly' AND month_day BETWEEN 29 AND 31)", name="month_day"),
        CheckConstraint(
            f"remind IS NULL OR remind IN ({', '.join(str(m) for m in get_args(Reminder))})", name="remind"
        ),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(160))
    date: Mapped[dt.date] = mapped_column(Date)
    end_date: Mapped[dt.date | None] = mapped_column(Date)  # an all-day event over several days
    start_time: Mapped[dt.time | None] = mapped_column(Time)  # Bahrain time; None: all day
    end_time: Mapped[dt.time | None] = mapped_column(Time)
    place: Mapped[str | None] = mapped_column(String(120))
    notes: Mapped[str | None] = mapped_column(Text)
    colour: Mapped[str] = mapped_column(String(16), default="violet", server_default="violet")
    repeat: Mapped[str] = mapped_column(String(12), default="none", server_default="none")
    repeat_until: Mapped[dt.date | None] = mapped_column(Date)
    # A monthly repeat's day of the month while `date` falls on a shorter month's last day instead: a repeat changed
    # from 28 February on keeps the 31st. None: `date`'s day.
    month_day: Mapped[int | None] = mapped_column(SmallInteger)
    # Days taken off a repeat ("delete only this one"), each one of its occurrence days.
    skipped: Mapped[list[dt.date]] = mapped_column(ARRAY(Date), default=list, server_default="{}")
    remind: Mapped[int | None] = mapped_column(SmallInteger)  # minutes before the start
    # The start of the last occurrence a reminder went out for: one reminder per occurrence.
    reminded_for: Mapped[datetime | None] = mapped_column()
    created_at: Mapped[datetime] = created_ts()
    updated_at: Mapped[datetime] = created_ts()


class CalendarPrefs(Base):
    """What one student keeps off their calendar, and their private feed's secret (a row once they change any)."""

    __tablename__ = "calendar_prefs"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    hidden_events: Mapped[list[str]] = mapped_column(ARRAY(String(120)), default=list, server_default="{}")
    hidden_modules: Mapped[list[str]] = mapped_column(ARRAY(String(64)), default=list, server_default="{}")
    hidden_types: Mapped[list[str]] = mapped_column(ARRAY(String(16)), default=list, server_default="{}")
    # The private feed: its address is derived from the salt (services/my_calendar.py feed_token) and found by the
    # address's SHA-256. A new salt is a new address; no salt: the feed is off.
    feed_salt: Mapped[str | None] = mapped_column(String(32))
    feed_hash: Mapped[str | None] = mapped_column(String(64), unique=True)
    updated_at: Mapped[datetime] = created_ts()
