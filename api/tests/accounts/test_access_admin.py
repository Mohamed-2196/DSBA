"""What admins change on the Access screen: roles, people's roles and switches.
- Every change is audited, and the people it touches are told.
- A non-admin never gets in, whatever boxes they hold.
- Concurrent changes can't undo each other, and can't leave the hub without an admin."""

from __future__ import annotations

import threading
import uuid
from collections.abc import Callable, Iterator
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, delete, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.core.access import Box, Feature
from app.core.errors import ApiError
from app.core.time import utcnow
from app.models import AccessRole, AuditEntry, Notification, RoleBox, User, UserStatus
from app.schemas.access import RoleUpdate
from app.services import access, accounts, roles
from tests.accounts.conftest import API, Outbox, sync_csrf

ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]
ADMIN = ("student", "admin")


@pytest.fixture
def boss(make_user: MakeUser) -> User:
    return make_user(email="head@example.com", name="Head Admin", roles=ADMIN)


def role_id(db: Session, slug: str) -> str:
    role = access.role_by_slug(db, slug)
    assert role is not None
    return str(role.id)


def test_admins_make_a_role_and_give_it(client_for: ClientFor, make_user: MakeUser, boss: User, db: Session) -> None:
    c = client_for(boss)
    made = c.post(f"{API}/admin/roles", json={"name": "Events team", "badge": "Events", "boxes": ["calendar.manage"]})
    assert made.status_code == 201, made.text
    role = made.json()
    assert {k: role[k] for k in ("slug", "name", "badge", "boxes", "holders", "builtIn", "locked", "version")} == {
        "slug": "events-team",
        "name": "Events team",
        "badge": "Events",
        "boxes": ["calendar.manage"],
        "holders": 0,
        "builtIn": False,
        "locked": False,
        "version": 1,
    }
    sara = make_user(name="Sara Student")
    given = c.put(f"{API}/admin/users/{sara.id}/roles", json={"roleIds": [role_id(db, "student"), role["id"]]})
    assert given.status_code == 200, given.text
    assert [r["slug"] for r in given.json()["roles"]] == ["student", "events-team"]
    assert access.can(sara, Box.calendar_manage)
    note = db.scalar(select(Notification).where(Notification.user_id == sara.id))
    assert note is not None
    assert (note.title, note.body) == ("Your roles changed", "You now hold: Student, Events team.")
    actions = db.scalars(select(AuditEntry.action).where(AuditEntry.actor_id == boss.id)).all()
    assert sorted(actions) == ["role.create", "user.roles"]
    catalogue = c.get(f"{API}/admin/roles").json()
    assert [r["slug"] for r in catalogue["roles"]] == [
        "admin",
        "rep",
        "student",
        "newsletter-manager",
        "content-manager",
        "events-team",
    ]
    assert next(r for r in catalogue["roles"] if r["slug"] == "events-team")["holders"] == 1
    assert len(catalogue["boxes"]) == len(Box)
    assert catalogue["boxes"][0] == {
        "key": "forum.post",
        "area": "Forum",
        "label": "Start threads, reply, vote, accept answers and edit your own posts",
    }


def test_role_names_are_unique_whatever_the_case(client_for: ClientFor, boss: User) -> None:
    c = client_for(boss)
    assert c.post(f"{API}/admin/roles", json={"name": "Events team", "boxes": []}).status_code == 201
    taken = c.post(f"{API}/admin/roles", json={"name": "events TEAM", "boxes": []})
    assert taken.status_code == 422
    assert taken.json()["error"]["fields"] == {"name": "Another role already has this name."}


def test_the_admin_role_is_locked_and_built_in_roles_stay(
    client_for: ClientFor, make_user: MakeUser, boss: User, db: Session
) -> None:
    c = client_for(boss)
    locked = c.patch(f"{API}/admin/roles/{role_id(db, 'admin')}", json={"version": 1, "badge": "Boss"})
    assert (locked.status_code, locked.json()["error"]["code"]) == (409, "role_locked")
    kept = c.delete(f"{API}/admin/roles/{role_id(db, 'student')}")
    assert (kept.status_code, kept.json()["error"]["code"]) == (409, "role_locked")
    sara = make_user(name="Sara Student", roles=("student", "newsletter-manager"))
    assert c.delete(f"{API}/admin/roles/{role_id(db, 'newsletter-manager')}").status_code == 204
    access.forget(db)
    assert not access.can(sara, Box.newsletter_manage)
    note = db.scalar(select(Notification).where(Notification.user_id == sara.id))
    assert note is not None
    assert note.body == "The Newsletter manager role was removed from the hub."


def test_editing_a_role_needs_the_version_you_loaded(client_for: ClientFor, boss: User, db: Session) -> None:
    c = client_for(boss)
    rep = role_id(db, "rep")
    first = c.patch(f"{API}/admin/roles/{rep}", json={"version": 1, "boxes": ["forum.moderate"]})
    assert first.status_code == 200, first.text
    assert (first.json()["version"], first.json()["boxes"]) == (2, ["forum.moderate"])
    stale = c.patch(f"{API}/admin/roles/{rep}", json={"version": 1, "badge": "Rep"})
    assert (stale.status_code, stale.json()["error"]["code"]) == (409, "role_changed")
    assert c.get(f"{API}/admin/roles").json()["roles"][1]["boxes"] == ["forum.moderate"]  # the first save stands
    entry = db.scalar(select(AuditEntry).where(AuditEntry.action == "role.update"))
    assert entry is not None
    assert entry.data["before"]["boxes"] == [
        "calendar.manage",
        "forum.moderate",
        "library.manage",
        "newsletter.manage",
        "stats.view",
    ]
    assert entry.data["after"]["boxes"] == ["forum.moderate"]


def test_holding_every_box_is_not_being_an_admin(
    client_for: ClientFor,
    make_user: MakeUser,
    make_role: Callable[..., Any],
    give_roles: Callable[..., None],
    db: Session,
) -> None:
    everything = make_role("everything", *Box)
    climber, sara = make_user(name="Climber"), make_user(name="Sara Student")
    give_roles(climber, "student", "everything")
    admin_role, student_role = role_id(db, "admin"), role_id(db, "student")
    c = client_for(climber)
    for method, path, body in [
        ("GET", "/admin/roles", None),
        ("POST", "/admin/roles", {"name": "Climbers", "boxes": []}),
        ("PATCH", f"/admin/roles/{student_role}", {"version": 1, "boxes": []}),
        ("PATCH", f"/admin/roles/{everything.id}", {"version": 1, "badge": "Boss"}),  # their own role
        ("DELETE", f"/admin/roles/{everything.id}", None),
        ("PUT", f"/admin/users/{climber.id}/roles", {"roleIds": [admin_role]}),
        ("PUT", f"/admin/users/{sara.id}/roles", {"roleIds": [admin_role]}),
        ("GET", "/admin/features", None),
        ("PUT", "/admin/features/forum", {"mode": "off"}),
    ]:
        r = c.request(method, f"{API}{path}", json=body)
        assert (r.status_code, r.json()["error"]["message"]) == (403, "Only admins can do this."), (method, path)
    itself = c.patch(f"{API}/admin/users/{climber.id}", json={"status": "suspended"})  # people.suspend, on themselves
    assert (itself.status_code, itself.json()["error"]["code"]) == (409, "cannot_change_self")
    access.forget(db)
    assert access.access_of(climber).slugs == ("student", "everything")
    assert not access.access_of(sara).admin
    assert access.feature_on(db, None, Feature.forum)
    assert access.role_by_slug(db, "climbers") is None
    db.refresh(everything)
    assert everything.badge is None
    assert db.scalar(select(AuditEntry).where(AuditEntry.actor_id == climber.id)) is None


def test_nobody_changes_their_own_roles(client_for: ClientFor, boss: User, db: Session) -> None:
    r = client_for(boss).put(f"{API}/admin/users/{boss.id}/roles", json={"roleIds": [role_id(db, "student")]})
    assert (r.status_code, r.json()["error"]["code"]) == (409, "cannot_change_self")
    assert access.is_admin(boss)


def test_admins_flip_switches(client_for: ClientFor, make_user: MakeUser, boss: User, db: Session) -> None:
    c = client_for(boss)
    listed = c.get(f"{API}/admin/features").json()
    assert [f["feature"] for f in listed] == [f.value for f in Feature]
    assert listed[0] == {
        "feature": "forum",
        "label": "Forum",
        "hides": "Every thread, reply and forum picture.",
        "mode": "everyone",
        "roleIds": [],
    }
    some = c.put(f"{API}/admin/features/calendar", json={"mode": "roles", "roleIds": [role_id(db, "rep")]})
    assert some.status_code == 200, some.text
    assert (some.json()["mode"], some.json()["roleIds"]) == ("roles", [role_id(db, "rep")])
    assert not access.feature_on(db, make_user(name="Sara Student"), Feature.calendar)
    entry = db.scalar(select(AuditEntry).where(AuditEntry.action == "feature.switch"))
    assert entry is not None
    assert entry.data == {
        "feature": "calendar",
        "from": "everyone",
        "to": "roles",
        "roles": ["Rep"],
        "actorName": "Head Admin",
    }
    nobody = c.put(f"{API}/admin/features/calendar", json={"mode": "roles", "roleIds": []})
    assert nobody.json()["error"]["fields"] == {"roleIds": "Choose at least one role."}
    unknown = c.put(f"{API}/admin/features/calendar", json={"mode": "roles", "roleIds": [str(uuid.uuid4())]})
    assert unknown.status_code == 422
    assert c.put(f"{API}/admin/features/teleport", json={"mode": "off"}).status_code == 422


def test_sixty_changes_in_ten_minutes_is_the_limit(client_for: ClientFor, boss: User, db: Session) -> None:
    now = utcnow()
    db.add_all(
        AuditEntry(actor_id=boss.id, action="role.update", data={}, created_at=now - timedelta(minutes=1))
        for _ in range(60)
    )
    db.commit()
    r = client_for(boss).put(f"{API}/admin/features/forum", json={"mode": "everyone"})
    assert r.status_code == 429
    assert r.json()["error"]["message"].startswith("That's a lot of changes at once.")


def test_the_catalogue_ignores_keys_the_code_does_not_know(client_for: ClientFor, boss: User, db: Session) -> None:
    student = access.role_by_slug(db, "student")
    assert student is not None
    db.add(RoleBox(role_id=student.id, box="forum.fly"))
    db.commit()
    shown = next(r for r in client_for(boss).get(f"{API}/admin/roles").json()["roles"] if r["slug"] == "student")
    assert shown["boxes"] == ["forum.post", "library.upload", "newsletter.react", "reports.create"]


# ── at the same moment, on separate connections ───────────────────────────────────────────


@pytest.fixture
def own_connections(engine: Engine) -> Iterator[sessionmaker[Session]]:
    separate = create_engine(engine.url.render_as_string(hide_password=False), poolclass=NullPool)
    yield sessionmaker(bind=separate, expire_on_commit=False, autoflush=False)
    separate.dispose()


def _race(sessions: sessionmaker[Session], attempt: Callable[[Session, int], None]) -> list[str]:
    start = threading.Barrier(2)

    def one(i: int) -> str:
        with sessions() as s:
            start.wait()
            try:
                attempt(s, i)
                s.commit()
                return "ok"
            except ApiError as e:
                s.rollback()
                return e.code

    with ThreadPoolExecutor(2) as pool:
        return list(pool.map(one, range(2)))


def _people(sessions: sessionmaker[Session], *names: str) -> list[uuid.UUID]:
    with sessions() as s:
        made = [User(email=f"race-{uuid.uuid4().hex[:8]}@example.com", display_name=name) for name in names]
        s.add_all(made)
        s.flush()
        for person in made:
            access.give(s, person, "student", "admin")
        s.commit()
        return [p.id for p in made]


def _clean(sessions: sessionmaker[Session], ids: list[uuid.UUID], role: uuid.UUID | None = None) -> None:
    with sessions() as s:
        s.execute(delete(AuditEntry).where(AuditEntry.actor_id.in_(ids)))
        s.execute(delete(Notification).where(Notification.user_id.in_(ids)))
        s.execute(delete(User).where(User.id.in_(ids)))
        if role is not None:
            s.execute(delete(AccessRole).where(AccessRole.id == role))
        s.commit()


def test_two_admins_taking_admin_from_each_other_leave_one(own_connections: sessionmaker[Session]) -> None:
    a, b = _people(own_connections, "Admin A", "Admin B")
    with own_connections() as s:
        student = access.role_by_slug(s, "student")
        assert student is not None
        student_id = student.id

    def demote(s: Session, i: int) -> None:
        actor, target = (s.get(User, a), s.get(User, b)) if i == 0 else (s.get(User, b), s.get(User, a))
        assert actor is not None
        assert target is not None
        roles.set_user_roles(s, actor, target, [student_id], None)

    try:
        assert sorted(_race(own_connections, demote)) == ["last_admin", "ok"]
        with own_connections() as s:
            admins = [p for p in (s.get(User, a), s.get(User, b)) if p is not None and access.is_admin(p)]
            assert len(admins) == 1
    finally:
        _clean(own_connections, [a, b])


def test_two_admins_saving_the_same_role_at_once(own_connections: sessionmaker[Session]) -> None:
    (boss,) = _people(own_connections, "Race Admin")
    with own_connections() as s:
        made = AccessRole(slug=f"race-{uuid.uuid4().hex[:8]}", name=f"Race {uuid.uuid4().hex[:8]}", position=60)
        s.add(made)
        s.commit()
        race_role = made.id
    saves = [{"version": 1, "boxes": ["calendar.manage"]}, {"version": 1, "boxes": ["career.edit"]}]

    def save(s: Session, i: int) -> None:
        actor = s.get(User, boss)
        assert actor is not None
        roles.update_role(s, actor, race_role, RoleUpdate.model_validate(saves[i]), None)

    try:
        assert sorted(_race(own_connections, save)) == ["ok", "role_changed"]
        with own_connections() as s:
            stored = s.scalars(select(RoleBox.box).where(RoleBox.role_id == race_role)).all()
            assert list(stored) in (["calendar.manage"], ["career.edit"])
            saved = s.get(AccessRole, race_role)
            assert saved is not None
            assert saved.version == 2
    finally:
        _clean(own_connections, [boss], race_role)


def test_two_last_admins_deleting_their_accounts_at_once_leave_one(
    own_connections: sessionmaker[Session], storage: Any
) -> None:
    """Security review AD-7: deleting your own account is refused while you're the last active admin."""
    a, b = _people(own_connections, "Admin A", "Admin B")

    def leave(s: Session, i: int) -> None:
        me = s.get(User, (a, b)[i])
        assert me is not None
        accounts.delete_account(s, me, storage)

    try:
        assert sorted(_race(own_connections, leave)) == ["last_admin", "ok"]
        with own_connections() as s:
            assert len([p for p in (s.get(User, a), s.get(User, b)) if p is not None]) == 1
    finally:
        _clean(own_connections, [a, b])


# ── the security review's rules (AD-1, AD-3, AD-4, AD-7, AD-9) ─────────────────────────────────


def _step_up(c: TestClient, outbox: Outbox, to: str) -> None:
    started = c.post(f"{API}/me/step-up", json={})
    assert started.status_code == 202, started.text
    code = outbox.to(to)[-1].code
    done = c.post(f"{API}/me/step-up/verify", json={"challengeId": started.json()["challengeId"], "code": code})
    sync_csrf(c)  # a new session comes with a new CSRF cookie
    assert done.status_code == 200, done.text


def test_admin_changes_need_a_recent_step_up(
    client_for: ClientFor,
    make_user: MakeUser,
    boss: User,
    db: Session,
    older_sessions: Callable[..., None],
    outbox: Outbox,
) -> None:
    """AD-1: a stolen admin session, however old, can't give roles, edit them or flip switches without a code."""
    sara = make_user(name="Sara Student")
    writes: list[tuple[str, str, dict[str, Any] | None]] = [
        ("POST", "/admin/roles", {"name": "Events team", "boxes": []}),
        ("PATCH", f"/admin/roles/{role_id(db, 'rep')}", {"version": 1, "badge": "Rep team"}),
        ("DELETE", f"/admin/roles/{role_id(db, 'content-manager')}", None),
        ("PUT", f"/admin/users/{sara.id}/roles", {"roleIds": [role_id(db, "student"), role_id(db, "rep")]}),
        ("PUT", "/admin/features/forum", {"mode": "off"}),
    ]
    c = client_for(boss)
    older_sessions()
    for method, path, body in writes:
        r = c.request(method, f"{API}{path}", json=body)
        assert (r.status_code, r.json()["error"]["code"]) == (403, "step_up_required"), (method, path)
    assert c.get(f"{API}/admin/roles").status_code == 200  # reading needs no code
    assert c.get(f"{API}/admin/features").status_code == 200
    access.forget(db)
    assert db.scalar(select(AuditEntry).where(AuditEntry.actor_id == boss.id)) is None
    assert access.role_by_slug(db, "content-manager") is not None
    assert access.access_of(sara).slugs == ("student",)
    assert access.feature_on(db, None, Feature.forum)

    _step_up(c, outbox, "head@example.com")
    for method, path, body in writes:
        r = c.request(method, f"{API}{path}", json=body)
        assert r.status_code in (200, 201, 204), (method, path, r.text)
    access.forget(db)
    assert access.access_of(sara).slugs == ("rep", "student")
    assert not access.feature_on(db, None, Feature.forum)


def test_the_student_role_holds_student_boxes_only(client_for: ClientFor, boss: User, db: Session) -> None:
    """AD-3: every new account gets Student, so one wrong tick there would give a manager box to anyone who signs
    up."""
    c = client_for(boss)
    student = role_id(db, "student")
    for box in ("people.suspend", "library.manage", "audit.read"):
        r = c.patch(f"{API}/admin/roles/{student}", json={"version": 1, "boxes": ["forum.post", box]})
        assert r.status_code == 422, (box, r.text)
        assert r.json()["error"]["fields"] == {
            "boxes": "Every new account gets this role, so it can hold only the student-level boxes."
        }
    shown = next(r for r in c.get(f"{API}/admin/roles").json()["roles"] if r["slug"] == "student")
    assert (shown["boxes"], shown["version"]) == (
        ["forum.post", "library.upload", "newsletter.react", "reports.create"],
        1,
    )
    fewer = c.patch(f"{API}/admin/roles/{student}", json={"version": 1, "boxes": ["forum.post", "reports.create"]})
    assert fewer.status_code == 200, fewer.text
    assert fewer.json()["boxes"] == ["forum.post", "reports.create"]
    other = c.post(f"{API}/admin/roles", json={"name": "Events team", "boxes": ["people.suspend"]})
    assert other.status_code == 201  # other roles may hold any box


def test_badges_cant_pass_for_staff(client_for: ClientFor, boss: User, db: Session) -> None:
    """AD-4: a custom role's badge can't read as a staff word, look-alike letters included, or copy another role's
    badge."""
    c = client_for(boss)
    staff = {"badge": "This badge is kept for the Hub's staff. Choose another one."}
    for badge in ("Admin", "Student rep", "\N{GREEK CAPITAL LETTER ALPHA}dmin", "ADM1N", "Moderator", "DSBA team"):
        r = c.post(f"{API}/admin/roles", json={"name": "Helpers", "badge": badge})
        assert (r.status_code, r.json()["error"]["fields"]) == (422, staff), badge
    taken = c.post(f"{API}/admin/roles", json={"name": "Helpers", "badge": "content"})
    assert taken.json()["error"]["fields"] == {"badge": "Another role already shows this badge."}
    made = c.post(f"{API}/admin/roles", json={"name": "Helpers", "badge": "Helper"})
    assert made.status_code == 201, made.text
    renamed = c.patch(f"{API}/admin/roles/{made.json()['id']}", json={"version": 1, "badge": "Admin team"})
    assert (renamed.status_code, renamed.json()["error"]["fields"]) == (422, staff)
    reps = c.patch(f"{API}/admin/roles/{role_id(db, 'rep')}", json={"version": 1, "badge": "Student reps"})
    assert reps.status_code == 200, reps.text  # Rep's own badge may say so
    access.forget(db)
    helpers = access.role_by_slug(db, "helpers")
    assert helpers is not None
    assert helpers.badge == "Helper"


def test_suspended_admins_and_people_without_roles_get_nothing(
    client_for: ClientFor, make_user: MakeUser, db: Session
) -> None:
    """AD-9: a suspended admin, and a signed-in person with no roles, can't read or change roles or switches."""
    make_user(name="Other Admin", roles=ADMIN)
    suspended = make_user(name="Suspended Admin", roles=ADMIN)
    suspended.status = UserStatus.suspended
    db.commit()
    nobody = make_user(name="No Roles", roles=())
    for person in (suspended, nobody):
        c = client_for(person)
        for method, path, body in [
            ("GET", "/admin/roles", None),
            ("POST", "/admin/roles", {"name": "Mine", "boxes": ["people.suspend"]}),
            ("PUT", f"/admin/users/{person.id}/roles", {"roleIds": [role_id(db, "admin")]}),
            ("PUT", "/admin/features/forum", {"mode": "off"}),
        ]:
            r = c.request(method, f"{API}{path}", json=body)
            assert r.status_code == 403, (person.display_name, method, path)
    access.forget(db)
    assert access.role_by_slug(db, "mine") is None
    assert access.access_of(nobody).slugs == ()


def test_deleting_a_held_role_is_recorded_with_what_it_gave(
    client_for: ClientFor, make_user: MakeUser, boss: User, db: Session
) -> None:
    """AD-9: the log keeps the deleted role's boxes, and how many people lost it."""
    make_user(name="Sara Student", roles=("student", "content-manager"))
    c = client_for(boss)
    assert c.delete(f"{API}/admin/roles/{role_id(db, 'content-manager')}").status_code == 204
    entry = db.scalar(select(AuditEntry).where(AuditEntry.action == "role.delete"))
    assert entry is not None
    assert entry.data == {
        "name": "Content manager",
        "badge": "Content",
        "position": 4,
        "boxes": ["calendar.manage", "career.edit"],
        "holders": 1,
        "actorName": "Head Admin",
    }


def test_the_last_admin_cant_delete_their_account(
    client_for: ClientFor, make_user: MakeUser, boss: User, db: Session
) -> None:
    """AD-7: the hub keeps at least one active admin, deleting accounts included."""
    c = client_for(boss)
    refused = c.delete(f"{API}/me")
    assert (refused.status_code, refused.json()["error"]["code"]) == (409, "last_admin")
    assert db.get(User, boss.id) is not None
    make_user(name="Second Admin", roles=ADMIN)
    assert c.delete(f"{API}/me").status_code == 204
