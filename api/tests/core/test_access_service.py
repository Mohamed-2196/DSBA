"""Access read from the database: who holds what, the checks, the role writers, and the last admin."""

from __future__ import annotations

from collections.abc import Callable

import pytest
from sqlalchemy.orm import Session

from app.core.access import Box
from app.core.errors import ApiError
from app.models import RoleBox, User, UserStatus
from app.schemas.access import BoxKey, FeatureKey
from app.services import access, accounts
from tests.core.conftest import SetOption

MakeUser = Callable[..., User]
STUDENT_BOXES = {Box.forum_post, Box.library_upload, Box.newsletter_react, Box.reports_create}
REP = ("student", "rep")
ADMIN = ("student", "admin")


def slugs(user: User) -> tuple[str, ...]:
    return access.access_of(user).slugs


def test_people_get_their_roles_boxes(make_user: MakeUser) -> None:
    student, rep, boss = make_user(), make_user(roles=REP), make_user(roles=ADMIN)
    assert [slugs(student), slugs(rep), slugs(boss)] == [("student",), ("rep", "student"), ("admin", "student")]
    assert access.boxes_of(student) == STUDENT_BOXES
    assert access.can(rep, Box.forum_moderate)
    assert access.can(rep, Box.forum_post)
    assert not access.can(rep, Box.people_suspend)
    assert access.boxes_of(boss) == frozenset(Box)
    assert [access.is_admin(student), access.is_admin(rep), access.is_admin(boss)] == [False, False, True]
    assert access.boxes_of(None) == frozenset()


def test_a_suspended_account_keeps_its_roles_but_loses_its_boxes(make_user: MakeUser, db: Session) -> None:
    rep, boss = make_user(roles=REP), make_user(roles=ADMIN)
    rep.status = boss.status = UserStatus.suspended
    db.commit()
    assert access.boxes_of(rep) == frozenset()
    assert not access.is_admin(boss)
    assert access.access_of(rep).badge == "Student rep"  # the role stays, the powers go
    shown = accounts.public_user(rep)
    assert shown is not None
    assert shown.badge is None  # and nobody sees a badge it no longer stands for
    rep.status = UserStatus.active
    db.commit()
    restored = accounts.public_user(rep)
    assert restored is not None
    assert restored.badge == "Student rep"


def test_changes_apply_at_once(make_user: MakeUser, give_roles: Callable[..., None]) -> None:
    sara = make_user()
    assert not access.can(sara, Box.newsletter_manage)
    give_roles(sara, "student", "newsletter-manager")
    assert access.can(sara, Box.newsletter_manage)
    assert access.role_names(sara) == ["Student", "Newsletter manager"]
    give_roles(sara, "student")
    assert not access.can(sara, Box.newsletter_manage)


def test_keys_the_code_does_not_know_are_ignored(make_user: MakeUser, db: Session) -> None:
    student = access.role_by_slug(db, "student")
    assert student is not None
    db.add(RoleBox(role_id=student.id, box="forum.fly"))
    db.commit()
    access.forget(db)
    assert access.boxes_of(make_user()) == STUDENT_BOXES


def test_new_accounts_hold_student_and_admin_identifiers_also_hold_admin(db: Session, set_option: SetOption) -> None:
    set_option("admin_identifiers", ["boss@example.com"])
    plain, _ = accounts.user_for_sign_in(db, "email", "plain@example.com", None)
    boss, _ = accounts.user_for_sign_in(db, "email", "boss@example.com", None)
    db.commit()
    assert slugs(plain) == ("student",)
    assert slugs(boss) == ("admin", "student")


def test_the_last_active_admin_stays(make_user: MakeUser, db: Session) -> None:
    boss = make_user(roles=ADMIN)
    with pytest.raises(ApiError) as refused:
        access.ensure_admins_remain(db, boss)
    assert (refused.value.status, refused.value.code) == (409, "last_admin")
    second = make_user(roles=ADMIN)
    access.ensure_admins_remain(db, boss)  # another active admin: fine
    second.status = UserStatus.suspended
    db.commit()
    with pytest.raises(ApiError):
        access.ensure_admins_remain(db, boss)  # a suspended admin doesn't count


def test_the_contract_lists_every_box_and_feature() -> None:
    from typing import get_args

    from app.core.access import Feature

    assert set(get_args(BoxKey)) == {b.value for b in Box}
    assert set(get_args(FeatureKey)) == {f.value for f in Feature}
