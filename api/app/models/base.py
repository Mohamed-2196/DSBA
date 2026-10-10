"""Declarative base, naming convention and shared column helpers."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Enum, MetaData, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

NAMING = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING)
    type_annotation_map = {
        datetime: DateTime(timezone=True),
        dict[str, Any]: JSONB,
        list[Any]: JSONB,
        uuid.UUID: UUID(as_uuid=True),
    }


def uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(primary_key=True, default=uuid.uuid4)


def created_ts() -> Mapped[datetime]:
    return mapped_column(server_default=func.now(), nullable=False)


def str_enum(e: type[enum.Enum], length: int = 20) -> Enum:
    """A VARCHAR + CHECK constraint holding the enum's values (not a native Postgres enum: easy to extend)."""
    return Enum(
        e, native_enum=False, create_constraint=True, length=length, values_callable=lambda x: [m.value for m in x]
    )


SLUG = String(120)
