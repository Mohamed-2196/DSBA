"""The access rules on their own, with no database: boxes from roles, badges, and switches."""

from __future__ import annotations

import uuid

from app.core.access import (
    ADMIN,
    BOXES,
    FEATURES,
    GUEST,
    REP,
    STUDENT,
    Box,
    Feature,
    RoleRef,
    SwitchState,
    build_access,
    effective_boxes,
    feature_on,
    known_boxes,
    known_feature,
)

STUDENT_BOXES = ["forum.post", "library.upload", "newsletter.react", "reports.create"]


def role(slug: str, *, badge: str | None = None, position: int = 10, name: str | None = None) -> RoleRef:
    return RoleRef(uuid.uuid4(), slug, name or slug.title(), badge, position)


def test_boxes_are_the_union_of_the_roles() -> None:
    student, news = role(STUDENT, position=2), role("newsletter-manager", badge="Newsletter", position=3)
    a = build_access([news, student], {student.id: STUDENT_BOXES, news.id: ["newsletter.manage"]})
    assert a.boxes == {
        Box.forum_post,
        Box.library_upload,
        Box.newsletter_react,
        Box.reports_create,
        Box.newsletter_manage,
    }
    assert a.has(Box.newsletter_manage)
    assert not a.has(Box.forum_moderate)
    assert not a.admin
    assert a.slugs == ("student", "newsletter-manager")  # role order: Admin, Rep, then by position


def test_admin_holds_every_box_whatever_is_stored() -> None:
    admin = role(ADMIN, badge="Admin")
    a = build_access([admin], {admin.id: []})
    assert a.boxes == frozenset(Box)
    assert a.admin


def test_keys_the_code_does_not_know_are_ignored() -> None:
    testers = role("testers")
    assert build_access([testers], {testers.id: ["forum.post", "forum.fly", ""]}).boxes == {Box.forum_post}
    assert known_boxes(["audit.read", "AUDIT.READ", "audit.read "]) == {Box.audit_read}
    assert known_feature("forum") is Feature.forum
    assert known_feature("teleport") is None


def test_a_suspended_account_has_no_boxes() -> None:
    rep = role(REP, badge="Student rep")
    a = build_access([rep], {rep.id: ["forum.moderate"]})
    assert effective_boxes(a, active=True) == {Box.forum_moderate}
    assert effective_boxes(a, active=False) == frozenset()


def test_the_badge_is_admins_then_reps_then_the_first_by_position() -> None:
    news = role("newsletter-manager", badge="Newsletter", position=3)
    content = role("content-manager", badge="Content", position=2)
    rep = role(REP, badge="Student rep", position=50)
    admin = role(ADMIN, badge="Admin", position=99)
    assert build_access([news, content], {}).badge == "Content"
    assert build_access([news, rep], {}).badge == "Student rep"
    assert build_access([rep, admin, news], {}).badge == "Admin"
    assert build_access([role(STUDENT)], {}).badge is None
    assert build_access([role(REP, badge=None, position=1), news], {}).badge == "Newsletter"
    assert GUEST.badge is None


def test_switches() -> None:
    testers, student = role("testers"), role(STUDENT)
    tester = build_access([student, testers], {})
    plain = build_access([student], {})
    admin = build_access([role(ADMIN)], {})
    some = SwitchState("roles", frozenset({testers.id}))
    assert feature_on(SwitchState("everyone"), GUEST, active=False)
    assert not feature_on(SwitchState("off"), plain, active=True)
    assert feature_on(some, tester, active=True)
    assert not feature_on(some, plain, active=True)
    assert not feature_on(some, GUEST, active=False)
    assert not feature_on(some, tester, active=False)  # suspended: like a guest (spec note 6)
    assert feature_on(SwitchState("off"), admin, active=True)  # admins see every feature
    assert not feature_on(SwitchState("off"), admin, active=False)  # but not while suspended
    assert not feature_on(None, plain, active=True)  # no switch stored: off (spec note 7)
    assert feature_on(None, admin, active=True)


def test_every_box_and_feature_has_its_words() -> None:
    assert set(BOXES) == set(Box)
    assert set(FEATURES) == set(Feature)
    for info in BOXES.values():
        assert info.label[0].isupper()
        assert info.refusal.endswith(".")
    for feature in FEATURES.values():
        assert feature.hides.endswith(".")
