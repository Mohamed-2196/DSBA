"""Access: roles made of boxes, who holds which role, and the feature switches. The rules are in app/core/access.py,
the loading and the checks in app/services/access.py."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, Index, Integer, SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.access import SWITCH_MODES
from app.models.base import Base, check_in, created_ts, uuid_pk


class AccessRole(Base):
    """A named set of boxes. A built-in role can't be deleted. A locked one (Admin) can't be edited either."""

    __tablename__ = "roles"

    id: Mapped[uuid.UUID] = uuid_pk()
    slug: Mapped[str] = mapped_column(String(64), unique=True)  # from the name: app.core.text.unique_slug()
    name: Mapped[str] = mapped_column(String(40), unique=True)
    badge: Mapped[str | None] = mapped_column(String(24))  # shown next to its holders' names; None: no badge
    position: Mapped[int] = mapped_column(SmallInteger, default=100, server_default="100")
    built_in: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    locked: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")  # one more on every edit
    created_at: Mapped[datetime] = created_ts()
    updated_at: Mapped[datetime | None]


class RoleBox(Base):
    """A box a role ticks. `box` is a Box value; a key the code doesn't know is ignored when read."""

    __tablename__ = "role_boxes"

    role_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True)
    box: Mapped[str] = mapped_column(String(40), primary_key=True)


class RoleGrant(Base):
    """A person holds a role."""

    __tablename__ = "user_roles"
    __table_args__ = (
        Index("ix_user_roles_role", "role_id"),  # a role's holders, and deleting a role
        Index("ix_user_roles_given_by", "given_by"),  # account deletion (SET NULL)
    )

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    role_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True)
    given_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    given_at: Mapped[datetime] = created_ts()


class FeatureSwitch(Base):
    """Whether a feature is off, on for some roles, or on for everyone. `feature` is a Feature value; a key the code
    doesn't know is ignored when read, and a feature without a row is off."""

    __tablename__ = "feature_switches"
    __table_args__ = (
        check_in("mode", SWITCH_MODES),
        Index("ix_feature_switches_updated_by", "updated_by"),  # account deletion (SET NULL)
    )

    feature: Mapped[str] = mapped_column(String(40), primary_key=True)
    mode: Mapped[str] = mapped_column(String(10), default="everyone", server_default="everyone")
    updated_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    updated_at: Mapped[datetime | None]


class FeatureSwitchRole(Base):
    """A role a feature is on for, when its switch says "Some roles"."""

    __tablename__ = "feature_switch_roles"
    __table_args__ = (Index("ix_feature_switch_roles_role", "role_id"),)  # deleting a role

    feature: Mapped[str] = mapped_column(
        String(40), ForeignKey("feature_switches.feature", ondelete="CASCADE"), primary_key=True
    )
    role_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True)
