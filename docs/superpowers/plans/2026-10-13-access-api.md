# Access: roles and feature switches (API) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every power in the API comes from roles made of boxes, and every feature from a switch. Both are kept in the
database, changed by admins and enforced on every request.

**Architecture:**
- **`app/core/access.py`** holds the fixed lists (boxes, features, switch modes) and the rules as pure functions.
- **`app/models/access.py`** holds five tables. People have roles; `users` has no role column.
- **`app/services/access.py`** loads a person's roles once per database session and answers `can(user, box)`,
  `is_admin(user)` and `feature_on(db, user, feature)`.
- **Route dependencies:** `requires(box)`, `requires_any(...)`, `requires_admin()` and `needs_feature(feature)` in
  `app/core/security.py`.
- **An admin router** manages roles, people's roles and the switches.

**Tech Stack:** FastAPI, SQLAlchemy 2 (sync, psycopg 3), Alembic, Pydantic v2; pytest with a throwaway Postgres and
moto; uv; Python 3.12.

**Spec:** `docs/superpowers/specs/2026-10-13-access-roles-and-feature-switches-design.md`. Read it before Task 1.

**Branch:**
- This plan and the web plan run on one branch, `round4/access`. It merges into `feature/backend` only after the web
  plan's tasks are done too.
- The app isn't released, so nothing here exists to keep today's web app or today's databases working:
  - the API's shapes change in Task 2;
  - `scripts/check.sh web` fails on types from Task 2 on, and the web plan fixes it;
  - the migrations are squashed into one baseline.
- Every task leaves `scripts/check.sh api` green.

## Spec notes

Decisions where the spec was silent, or said too little to build from:

1. **One baseline migration seeds the ready-made roles and the switches**, rather than `python -m app.cli seed`.
   - The API can't run without them. Every check reads `role_boxes`, every new account gets Student, and a feature
     without a switch row is off. So every database built by `alembic upgrade head` has to have them: production, a
     local stack, and each pytest database.
   - `seed` loads optional reference content, and the API container reruns it on every start. Seeding roles there
     would overwrite what admins changed.
2. **Concurrent edits to a role.** `PATCH /admin/roles/{id}` carries the `version` the admin loaded. A stale version
   answers 409 `role_changed` instead of silently undoing another admin's change. This adds a fifth error code to
   the spec's four.
3. **The catalogue comes with the roles.** `GET /admin/roles` returns each box's key, area and label, and
   `GET /admin/features` each feature's label and what switching it off hides. The web plan doesn't hard-code them.
4. **`GET /features` answers for whoever calls.** A guest gets the Everyone features, which is the spec's case. A
   signed-in person gets their own, the same list as `/me.features`.
5. **Deleting your own thread, reply or library item** needs no box. A person can always take their own words and
   files down. `forum.post` covers starting threads, replying, voting, accepting an answer and editing your own posts.
6. **A suspended person sees only Everyone features,** like a guest. Some-roles features need an active account.
7. **A feature with no row in `feature_switches` is off.** Every feature the code knows gets its row from a
   migration.
8. **Role names are unique, ignoring case.** The service checks this and answers 422 on `name`.
9. **Audit actions:** `role.create`, `role.update`, `role.delete`, `user.roles` and `feature.switch`.
10. **The people list.** People with `people.suspend` see it without emails or phone numbers. Admins see them.
11. **A rate limit on admin changes.** Changes to roles, people's roles and switches are limited to 60 per admin per
    10 minutes.
12. **`cannot_change_self` covers people's roles too.** Nobody changes their own roles or status. Another admin has to.
13. **The reports queue follows the boxes.**
    - `forum.moderate` sees and closes thread and reply reports.
    - `library.manage` sees and closes library reports.
    - Admins see every report, and are the only ones who see who reported it.
14. **The CLI.** `set-role IDENTIFIER ROLE...` makes the account hold exactly those roles, given as slugs (student,
    rep, newsletter-manager, content-manager, admin, or a custom one). `dev-login ID --role SLUG` signs in an account
    holding Student and that role. The e2e suite's rep signs in with `--role rep`.

## Global Constraints

- **Code:**
  - Python 3.12, mypy strict, ruff and ruff format clean, lines up to 120.
  - Routes are plain `def`. Services never commit; routers do.
- **Comments and docstrings** describe the code as it is now. They never tell its history: no "replaces", "used to",
  "previously", "legacy", "kept for", "moved from" or "old".
- **Copy:** plain, short, sentence case. An error says what happened and what to do next.
- **Errors:**
  - Raise them through `app/core/errors.py`.
  - Every new code goes into `ErrorCode` (`app/schemas/common.py`) with a comment saying when it happens.
- **Writes:**
  - Every write is CSRF-checked by the middleware.
  - Admins' and managers' changes are recorded with `record()` (`app/services/audit.py`).
  - Notifications go through `notify()`.
- **Hiding:**
  - Anything hidden or switched off answers 404 for whoever may not see it.
  - Switched off is `feature_off`, with the message "This part of the hub is switched off right now."
- **The contract.** After any request or response change, commit both files together:
  ```sh
  cd api && uv run --no-sync python -m app.cli openapi > openapi.json && cd ../web && npm run api:types
  ```
  `web/src/api/schema.d.ts` is regenerated, even while the web app doesn't compile against it yet.
- **Migrations.** Task 2 makes the single baseline, `0001_initial`. Any later model change in this branch regenerates
  that baseline, never a second migration, because nothing is released. The drift tests must pass.
- **Made-up people only** in code, tests and fixtures: `*@example.com`.
- **Box keys:** `forum.post`, `library.upload`, `newsletter.react`, `reports.create`, `forum.moderate`,
  `library.manage`, `newsletter.manage`, `calendar.manage`, `career.edit`, `stats.view`, `people.suspend`,
  `audit.read`.
- **Feature keys:** `forum`, `library`, `library.uploads`, `newsletter`, `calendar`, `career`, `grades`, `noora`.
- **Ready-made roles:**

  | Slug | Name | Badge | Position | Kind | Boxes |
  | --- | --- | --- | --- | --- | --- |
  | `admin` | Admin | Admin | 0 | locked | every box |
  | `rep` | Rep | Student rep | 1 | built in | `forum.moderate`, `library.manage`, `newsletter.manage`, `calendar.manage`, `stats.view` |
  | `student` | Student | none | 2 | built in | `forum.post`, `library.upload`, `newsletter.react`, `reports.create` |
  | `newsletter-manager` | Newsletter manager | Newsletter | 3 | | `newsletter.manage` |
  | `content-manager` | Content manager | Content | 4 | | `calendar.manage`, `career.edit` |
- **Every task ends with** `scripts/check.sh api` passing, run in the background. Don't commit until it does.

## Review Focus

These are the inputs most likely to hurt someone that the spec implies but no feature test would meet by chance.
Each one is pinned by a test in the task named.

1. **Climbing.** A non-admin who holds every box tries to:
   - edit or create roles;
   - give roles, to someone else or to themselves;
   - flip switches;
   - change someone's email;
   - see who reported something;
   - suspend an admin.

   Each attempt is refused, and nothing changes. (Task 4)
2. **The last admin.** Two admins take Admin from each other at the same moment, or `set-role` takes it from the only
   admin. One active admin always remains, and the loser gets 409 `last_admin`. (Tasks 2 and 4)
3. **A suspended person who holds Rep or Admin.**
   - Every manager endpoint answers 403.
   - Hidden posts, pending files and drafts answer 404.
   - Some-roles features disappear.
   - Their badge still shows.

   (Tasks 2 and 3)
4. **A switched-off feature,** for anyone but an admin:
   - Direct calls answer 404 `feature_off`. That covers reads, writes, calendar feeds and forum pictures.
   - Search leaves it out.
   - A notification that points into it still lists, while its target answers 404. (Tasks 3 and 6)
5. **Stale keys in the database.** A box or feature key the code no longer knows is ignored everywhere. It never
   breaks `/me`, the roles catalogue or a check. (Tasks 1, 2 and 4)
6. **Two admins saving the same role at once.** The second save gets `role_changed` instead of quietly undoing the
   first. (Task 4)

## Before Task 1

Use the repo's skills `db-migration` and `fastapi-endpoint` (`.claude/skills/`) for their conventions. Work in a worktree
of your own:

```sh
cd /Users/mohamed/dsba-hub && git worktree add ../dsba-access -b round4/access feature/backend
cd ../dsba-access/api && uv sync && cd ../web && npm ci
```

Postgres runs in Docker at 127.0.0.1:5432 (compose service `db`). Each pytest run makes its own database.

---

### Task 1: The access core

**Files:**
- Create: `api/app/core/access.py`
- Test: `api/tests/core/test_access_core.py`

**Interfaces:**
- **Consumes:** nothing.
- **Produces** (later tasks import these from `app.core.access`):
  - role slugs: `ADMIN = "admin"`, `REP = "rep"`, `STUDENT = "student"`,
    `NEWSLETTER_MANAGER = "newsletter-manager"`, `CONTENT_MANAGER = "content-manager"`;
  - `SwitchMode = Literal["off", "roles", "everyone"]` and `SWITCH_MODES: tuple[SwitchMode, ...]`;
  - `class Box(enum.StrEnum)` and `class Feature(enum.StrEnum)`, with the values in Global Constraints;
  - `BoxInfo(area: str, label: str, refusal: str)` with `BOXES: dict[Box, BoxInfo]`, and
    `FeatureInfo(label: str, hides: str)` with `FEATURES: dict[Feature, FeatureInfo]`;
  - `@dataclass(frozen=True) RoleRef(id: uuid.UUID, slug: str, name: str, badge: str | None, position: int)`;
  - `@dataclass(frozen=True) Access(roles: tuple[RoleRef, ...] = (), boxes: frozenset[Box] = frozenset())`, with
    the properties `admin`, `role_ids`, `slugs` and `badge`, and the method `has(box) -> bool`;
  - `GUEST = Access()`;
  - `known_boxes(keys: Iterable[str]) -> frozenset[Box]` and `known_feature(key: str) -> Feature | None`;
  - `build_access(roles: Iterable[RoleRef], role_boxes: Mapping[uuid.UUID, Iterable[str]]) -> Access`;
  - `effective_boxes(access: Access, *, active: bool) -> frozenset[Box]`;
  - `@dataclass(frozen=True) SwitchState(mode: SwitchMode, role_ids: frozenset[uuid.UUID] = frozenset())`;
  - `feature_on(state: SwitchState | None, access: Access, *, active: bool) -> bool`.

- [ ] **Step 1: Write the failing tests**

Create `api/tests/core/test_access_core.py`:

```python
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
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `cd api && uv run --no-sync pytest tests/core/test_access_core.py -q`
Expected: FAIL at collection with `ModuleNotFoundError: No module named 'app.core.access'`.

- [ ] **Step 3: Write `api/app/core/access.py`**

```python
"""Who may do what, and which features are on: the fixed lists and the rules, with no database (decisions D11, D12).

- A box is one power, such as "publish the newsletter". The code checks boxes, never role names.
- A role is a named set of boxes, kept in the database and edited by admins. Admin holds every box, now and later.
- A person may do what every box of all their roles allows. A suspended account has none: it reads like a guest.
- A switch says whether a feature exists for someone: off, on for some roles, or on for everyone. Admins see every
  feature, so they can try one before switching it on.

app/services/access.py loads a person's roles and the switches from the database and applies these rules."""

from __future__ import annotations

import enum
import uuid
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Literal, NamedTuple

# The ready-made roles the code knows by slug (the baseline migration creates them).
ADMIN = "admin"
REP = "rep"
STUDENT = "student"
NEWSLETTER_MANAGER = "newsletter-manager"
CONTENT_MANAGER = "content-manager"

SwitchMode = Literal["off", "roles", "everyone"]
SWITCH_MODES: tuple[SwitchMode, ...] = ("off", "roles", "everyone")


class Box(enum.StrEnum):
    forum_post = "forum.post"
    library_upload = "library.upload"
    newsletter_react = "newsletter.react"
    reports_create = "reports.create"
    forum_moderate = "forum.moderate"
    library_manage = "library.manage"
    newsletter_manage = "newsletter.manage"
    calendar_manage = "calendar.manage"
    career_edit = "career.edit"
    stats_view = "stats.view"
    people_suspend = "people.suspend"
    audit_read = "audit.read"


class Feature(enum.StrEnum):
    forum = "forum"
    library = "library"
    library_uploads = "library.uploads"  # uploads only: the library stays readable
    newsletter = "newsletter"
    calendar = "calendar"
    career = "career"
    grades = "grades"  # the web app's grades calculator: nothing in the API
    noora = "noora"  # Mini Noora, in the web app: nothing in the API


class BoxInfo(NamedTuple):
    area: str
    label: str  # what the box allows, for the admin screen
    refusal: str  # the 403 message when it's missing


BOXES: dict[Box, BoxInfo] = {
    Box.forum_post: BoxInfo(
        "Forum",
        "Start threads, reply, vote, accept answers and edit your own posts",
        "Your account can't post in the forum. Contact a student rep.",
    ),
    Box.library_upload: BoxInfo(
        "Library", "Upload files for review", "Your account can't upload to the library. Contact a student rep."
    ),
    Box.newsletter_react: BoxInfo(
        "Newsletter", "React to issues", "Your account can't react to the newsletter. Contact a student rep."
    ),
    Box.reports_create: BoxInfo(
        "Reports", "Report a post or a file", "Your account can't report posts or files. Contact a student rep."
    ),
    Box.forum_moderate: BoxInfo(
        "Forum",
        "Hide, lock and remove threads and replies, and handle forum reports",
        "Only people who moderate the forum can do this.",
    ),
    Box.library_manage: BoxInfo(
        "Library",
        "Review uploads, add links, edit and remove items, and handle library reports",
        "Only people who manage the library can do this.",
    ),
    Box.newsletter_manage: BoxInfo(
        "Newsletter",
        "Write, edit, publish and delete issues",
        "Only people who manage the newsletter can do this.",
    ),
    Box.calendar_manage: BoxInfo(
        "Calendar", "Add, edit and delete events", "Only people who manage the calendar can do this."
    ),
    Box.career_edit: BoxInfo(
        "Career Navigator", "Edit Career Navigator", "Only people who edit Career Navigator can do this."
    ),
    Box.stats_view: BoxInfo("Hub", "See the hub's numbers", "Only people who can see the hub's numbers can do this."),
    Box.people_suspend: BoxInfo(
        "People",
        "See the people list, and suspend and restore accounts",
        "Only people who manage accounts can do this.",
    ),
    Box.audit_read: BoxInfo("People", "Read the audit log", "Only people who can read the audit log can do this."),
}


class FeatureInfo(NamedTuple):
    label: str
    hides: str  # what switching it off hides, for the admin screen


FEATURES: dict[Feature, FeatureInfo] = {
    Feature.forum: FeatureInfo("Forum", "Every thread, reply and forum picture."),
    Feature.library: FeatureInfo("Library", "Every file and link in the library, and uploads to it."),
    Feature.library_uploads: FeatureInfo("Library uploads", "Uploading to the library. It stays readable."),
    Feature.newsletter: FeatureInfo("Newsletter", "Every issue and its reactions."),
    Feature.calendar: FeatureInfo("Calendar", "The calendar, its feeds and its events in search."),
    Feature.career: FeatureInfo("Career Navigator", "Career Navigator."),
    Feature.grades: FeatureInfo("Grades calculator", "The grades calculator."),
    Feature.noora: FeatureInfo("Mini Noora", "Mini Noora, the hub's helper."),
}


@dataclass(frozen=True)
class RoleRef:
    id: uuid.UUID
    slug: str
    name: str
    badge: str | None
    position: int


def _role_order(role: RoleRef) -> tuple[int, int, str]:
    """Admin first, then Rep, then the others in the order admins set (by name when two share a place)."""
    return ({ADMIN: 0, REP: 1}.get(role.slug, 2), role.position, role.name.casefold())


@dataclass(frozen=True)
class Access:
    """A person's roles, in role order, and the boxes they give, before the account's status is applied."""

    roles: tuple[RoleRef, ...] = ()
    boxes: frozenset[Box] = frozenset()

    @property
    def admin(self) -> bool:
        """Holds the Admin role (whether the account is active is the caller's to check)."""
        return any(r.slug == ADMIN for r in self.roles)

    @property
    def role_ids(self) -> frozenset[uuid.UUID]:
        return frozenset(r.id for r in self.roles)

    @property
    def slugs(self) -> tuple[str, ...]:
        return tuple(r.slug for r in self.roles)

    @property
    def badge(self) -> str | None:
        """The badge next to the person's name: the first role in role order that has one."""
        return next((r.badge for r in self.roles if r.badge), None)

    def has(self, box: Box) -> bool:
        return box in self.boxes


GUEST = Access()


def known_boxes(keys: Iterable[str]) -> frozenset[Box]:
    """The boxes among `keys`. A key the code doesn't know is ignored."""
    values = {b.value: b for b in Box}
    return frozenset(values[k] for k in keys if k in values)


def known_feature(key: str) -> Feature | None:
    """The feature `key` names, or None for a key the code doesn't know."""
    values = {f.value: f for f in Feature}
    return values.get(key)


def build_access(roles: Iterable[RoleRef], role_boxes: Mapping[uuid.UUID, Iterable[str]]) -> Access:
    """A person's access from their roles and each role's stored box keys. Admin holds every box, whatever is stored."""
    ordered = tuple(sorted(roles, key=_role_order))
    if any(r.slug == ADMIN for r in ordered):
        return Access(ordered, frozenset(Box))
    boxes: set[Box] = set()
    for r in ordered:
        boxes |= known_boxes(role_boxes.get(r.id, ()))
    return Access(ordered, frozenset(boxes))


def effective_boxes(access: Access, *, active: bool) -> frozenset[Box]:
    """What the person may do now: their boxes, or none while their account is suspended (security review, 4)."""
    return access.boxes if active else frozenset()


@dataclass(frozen=True)
class SwitchState:
    mode: SwitchMode
    role_ids: frozenset[uuid.UUID] = frozenset()  # the roles it's on for, when mode is "roles"


def feature_on(state: SwitchState | None, access: Access, *, active: bool) -> bool:
    """Whether a feature exists for this person.
    - Active admins see every feature.
    - A feature with no switch stored is off.
    - "Some roles" needs an active account holding one of them: a suspended account reads like a guest."""
    if active and access.admin:
        return True
    if state is None or state.mode == "off":
        return False
    if state.mode == "everyone":
        return True
    return active and bool(access.role_ids & state.role_ids)
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `cd api && uv run --no-sync pytest tests/core/test_access_core.py -q`
Expected: `7 passed`.

Run: `cd api && uv run --no-sync ruff check app/core/access.py tests/core/test_access_core.py && uv run --no-sync ruff format --check app/core/access.py tests/core/test_access_core.py && uv run --no-sync mypy app/core/access.py tests/core/test_access_core.py`
Expected: no errors. If `ruff format --check` reports a file, run `ruff format` on it and read the diff.

- [ ] **Step 5: Commit**

```bash
git add api/app/core/access.py api/tests/core/test_access_core.py
git commit -m "Access core: boxes, features, roles and switches as pure rules (R-1, R-10)"
```

---

### Task 2: People hold roles: the tables, one baseline migration, and boxes on every guarded route

This task is large on purpose. Removing `users.role` and the role checks touches every area, and the suite only goes
green again once all of them check boxes. Work through the steps in order, and run the area's tests after each one.

**Files:**
- Create:
  - `api/app/models/access.py`
  - `api/app/services/access.py`
  - `api/app/schemas/access.py`
  - `api/migrations/versions/20261013_0001_initial.py`
- Delete: every other file in `api/migrations/versions/` (0001 to 0006).
- Modify, application:
  - `api/app/models/user.py` and `api/app/models/__init__.py`: no `role` column, and no `Role` enum.
  - `api/app/core/errors.py` and `api/app/schemas/common.py`: error codes, and `UserPublic.badge`.
  - `api/app/schemas/auth.py` (`Me`) and `api/app/schemas/moderation.py` (`AdminUser`, `AdminUserUpdate`).
  - `api/app/core/security.py`: `requires`, `requires_any` and `requires_admin`, and no moderator or admin
    helpers.
  - `api/app/routers/forum.py` and `api/app/services/forum/visibility.py`, `threads.py`, `replies.py` and
    `views.py`.
  - `api/app/routers/library.py` and `api/app/services/library.py`.
  - `api/app/routers/uploads.py` and `api/app/services/uploads.py`.
  - `api/app/routers/newsletter.py` and `api/app/services/newsletter.py`.
  - `api/app/routers/calendar.py`, `api/app/routers/content.py` and `api/app/routers/reports.py`.
  - `api/app/services/reports.py`, `api/app/routers/admin.py` and `api/app/routers/me.py`.
  - `api/app/services/accounts.py` and `api/app/cli.py`.
- Modify, the web side's e2e suite: `web/e2e/support.ts` and `web/e2e/auth.setup.ts`.
- Modify, tests:
  - `api/tests/conftest.py`: `make_user(roles=...)`, `give_roles` and `make_role`.
  - Every test that passed `role=Role.…` or read `role`. Step 15 lists them.
- Test, new:
  - `api/tests/core/test_access_service.py`
  - `api/tests/core/test_access_matrix.py`
  - `api/tests/community/test_forum_access.py`
  - `api/tests/content/test_library_access.py`
- Test, rewritten: `api/tests/core/test_migrations.py`, `api/tests/core/test_roles.py` and the set-role test in
  `api/tests/core/test_cli.py`.
- Contract: `api/openapi.json` and `web/src/api/schema.d.ts`.

**Interfaces:**
- **Consumes:** everything Task 1 produced.
- **Produces, models:** `AccessRole` (table `roles`), `RoleBox` (`role_boxes`), `RoleGrant` (`user_roles`),
  `FeatureSwitch` (`feature_switches`) and `FeatureSwitchRole` (`feature_switch_roles`), all from `app.models`.
- **Produces, `app.services.access`:**
  - `access_of(user, db=None) -> Access`, `prefetch(db, users) -> None` and `forget(db) -> None`;
  - `is_active(user) -> bool`, `boxes_of(user) -> frozenset[Box]`, `can(user, box) -> bool` and
    `is_admin(user) -> bool`;
  - `require(user, box) -> None`, which raises 403 with the box's message;
  - `role_by_slug(db, slug) -> AccessRole | None`;
  - `give(db, user, *slugs, by=None)`, `set_roles(db, user, roles: Iterable[AccessRole], *, by=None)` and
    `role_names(user) -> list[str]`;
  - `ensure_admins_remain(db, losing: User) -> None`, which raises 409 `last_admin`.
- **Produces, `app.core.security`:**
  - `requires(box) -> Any`;
  - `requires_any(*boxes, refusal: str) -> Any`;
  - `requires_admin() -> Any`, which refuses with 403 "Only admins can do this."
- **Produces, `app.schemas.access`:** `BoxKey` and `FeatureKey` (Literals matching the enums), and
  `RoleSummary(id, slug, name, badge)`.
- **Produces, shapes:**
  - `Me` gains `roles: list[RoleSummary]` and `boxes: list[BoxKey]`, and has no `role`;
  - `UserPublic` has `badge: str | None` and no `role`;
  - `AdminUser` has `roles: list[RoleSummary]` and no `role`;
  - `AdminUserUpdate` keeps `status`, `email` and `phone`.
- **Produces, test fixtures:**
  - `make_user(..., roles: Sequence[str] = ("student",))`;
  - `give_roles(user, *slugs)`: exactly these roles;
  - `make_role(slug, *boxes, badge=None) -> AccessRole`.

- [ ] **Step 1: Write the failing tests: the service and the guarded routes**

Create `api/tests/core/test_access_service.py`:

```python
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
```

Create `api/tests/core/test_access_matrix.py`:

```python
"""Every route a box guards, four ways:
- a guest gets 401;
- someone holding every other box gets 403 with that box's message;
- someone holding only that box gets past the guard;
- a suspended holder gets 403.

Then the two areas where boxes decide what a person sees: the reports queue and the people list."""

from __future__ import annotations

import uuid
from collections.abc import Callable, Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.access import BOXES, Box
from app.models import User, UserStatus
from tests.core.helpers import API, new_thread, share_pdf

ClientFor = Callable[..., TestClient]
Holder = Callable[[frozenset[Box]], User]
NOTHING = uuid.UUID(int=1)  # an id nothing has: a route that lets you in answers 404 or 422, never 403

GUARDED: list[tuple[str, str, Box]] = [
    ("POST", "/forum/threads", Box.forum_post),
    ("PUT", f"/forum/threads/{NOTHING}/vote", Box.forum_post),
    ("POST", f"/forum/threads/{NOTHING}/replies", Box.forum_post),
    ("PUT", f"/forum/replies/{NOTHING}/vote", Box.forum_post),
    ("POST", f"/forum/threads/{NOTHING}/moderate", Box.forum_moderate),
    ("POST", f"/forum/replies/{NOTHING}/moderate", Box.forum_moderate),
    ("POST", "/library/items", Box.library_upload),
    ("POST", "/library/links", Box.library_manage),
    ("POST", f"/library/items/{NOTHING}/review", Box.library_manage),
    ("PUT", f"/newsletter/issues/{NOTHING}/sections/intro/reactions/like", Box.newsletter_react),
    ("POST", "/newsletter/issues", Box.newsletter_manage),
    ("PATCH", f"/newsletter/issues/{NOTHING}", Box.newsletter_manage),
    ("POST", f"/newsletter/issues/{NOTHING}/publish", Box.newsletter_manage),
    ("DELETE", f"/newsletter/issues/{NOTHING}", Box.newsletter_manage),
    ("POST", "/calendar/events", Box.calendar_manage),
    ("PATCH", "/calendar/events/2026-01-01-nothing", Box.calendar_manage),
    ("DELETE", "/calendar/events/2026-01-01-nothing", Box.calendar_manage),
    ("PUT", "/career", Box.career_edit),
    ("GET", "/admin/stats", Box.stats_view),
    ("GET", "/admin/users", Box.people_suspend),
    ("PATCH", f"/admin/users/{NOTHING}", Box.people_suspend),
    ("GET", "/admin/audit", Box.audit_read),
    ("POST", "/reports", Box.reports_create),
]


@pytest.fixture
def holder(
    make_user: Callable[..., User], make_role: Callable[..., Any], give_roles: Callable[..., None]
) -> Iterator[Holder]:
    """holder(boxes) -> a person whose only role holds exactly these boxes."""
    made = iter(range(1, 1000))

    def _holder(boxes: frozenset[Box]) -> User:
        n = next(made)
        role = make_role(f"holder-{n}", *boxes)
        person = make_user(name=f"Holder {n}", roles=())
        give_roles(person, role.slug)
        return person

    yield _holder


@pytest.mark.parametrize(("method", "path", "box"), GUARDED, ids=[f"{m} {p}" for m, p, _ in GUARDED])
def test_each_guarded_route_needs_its_box(
    method: str, path: str, box: Box, client_for: ClientFor, holder: Holder, db: Session
) -> None:
    body: dict[str, Any] | None = {} if method in ("POST", "PUT", "PATCH") else None
    assert client_for().request(method, f"{API}{path}", json=body).status_code == 401
    others = client_for(holder(frozenset(Box) - {box})).request(method, f"{API}{path}", json=body)
    assert others.status_code == 403, others.text
    assert others.json()["error"]["message"] == BOXES[box].refusal
    owner = holder(frozenset({box}))
    allowed = client_for(owner).request(method, f"{API}{path}", json=body)
    assert allowed.status_code != 403, allowed.text
    owner.status = UserStatus.suspended
    db.commit()
    assert client_for(owner).request(method, f"{API}{path}", json=body).status_code == 403


def test_the_reports_queue_follows_the_boxes(
    client_for: ClientFor, holder: Holder, make_user: Callable[..., User], storage: Any
) -> None:
    boss = make_user(name="Head Admin", roles=("student", "admin"))
    thread = new_thread(client_for(make_user(name="Sara Student")), "Report me")
    item = share_pdf(client_for(boss), storage, title="Report me too")
    reporter = client_for(make_user(name="Omar Reporter"))
    for target_type, target in (("thread", thread), ("library_item", item)):
        made = reporter.post(f"{API}/reports", json={"targetType": target_type, "targetId": target["id"], "reason": "spam"})
        assert made.status_code == 201, made.text
    forum, library = holder(frozenset({Box.forum_moderate})), holder(frozenset({Box.library_manage}))

    def queue(person: User) -> list[tuple[str, Any]]:
        items = client_for(person).get(f"{API}/admin/reports").json()["items"]
        return [(r["targetType"], r["reporter"]) for r in items]

    assert queue(forum) == [("thread", None)]  # who reported is for admins only
    assert queue(library) == [("library_item", None)]
    everything = client_for(boss).get(f"{API}/admin/reports").json()["items"]
    assert sorted(r["targetType"] for r in everything) == ["library_item", "thread"]
    assert {r["reporter"]["displayName"] for r in everything} == {"Omar Reporter"}
    thread_report = next(r["id"] for r in everything if r["targetType"] == "thread")
    closing = client_for(library).post(f"{API}/admin/reports/{thread_report}/resolve", json={"status": "dismissed"})
    assert closing.status_code == 404  # not their queue
    neither = client_for(holder(frozenset({Box.career_edit}))).get(f"{API}/admin/reports")
    assert neither.status_code == 403
    assert neither.json()["error"]["message"] == "Only people who moderate the forum or manage the library can do this."


def test_suspending_without_admin_powers(
    client_for: ClientFor, holder: Holder, make_user: Callable[..., User], db: Session
) -> None:
    keeper = holder(frozenset({Box.people_suspend}))
    student = make_user(name="Sara Student", email="sara@example.com")
    boss = make_user(name="Head Admin", roles=("student", "admin"))
    c = client_for(keeper)
    listed = c.get(f"{API}/admin/users").json()["items"]
    assert listed
    assert all(p["email"] is None and p["phone"] is None for p in listed)  # no contact details (spec note 10)
    assert c.patch(f"{API}/admin/users/{student.id}", json={"status": "suspended"}).status_code == 200
    refused = c.patch(f"{API}/admin/users/{boss.id}", json={"status": "suspended"})
    assert (refused.status_code, refused.json()["error"]["message"]) == (403, "Only admins can suspend an admin.")
    itself = c.patch(f"{API}/admin/users/{keeper.id}", json={"status": "suspended"})
    assert itself.json()["error"]["code"] == "cannot_change_self"
    recovery = c.patch(f"{API}/admin/users/{student.id}", json={"email": "taken.over@example.com"})
    assert (recovery.status_code, recovery.json()["error"]["message"]) == (403, "Only admins can do this.")
    db.refresh(student)
    assert student.email == "sara@example.com"
    assert any(p["email"] == "sara@example.com" for p in client_for(boss).get(f"{API}/admin/users").json()["items"])
```

- [ ] **Step 2: Write the failing tests: what the boxes show in the forum and the library**

Create `api/tests/community/test_forum_access.py`:

```python
"""In the forum, forum.post is for writing and forum.moderate for the reps' powers, held through any role. Deleting
your own words needs no box."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from fastapi.testclient import TestClient

from app.core.access import Box
from app.models import User
from tests.core.helpers import API, new_thread

ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]
POSTING = "Your account can't post in the forum. Contact a student rep."


def test_writing_needs_forum_post(
    client_for: ClientFor, make_user: MakeUser, give_roles: Callable[..., None], student: User
) -> None:
    t = new_thread(client_for(student), "Is the MGF unique?")
    reader = make_user(name="Only Reads", roles=("newsletter-manager",))
    c = client_for(reader)
    created = c.post(f"{API}/forum/threads", json={"title": "Can I post now?", "body": "Hello"})
    assert (created.status_code, created.json()["error"]["message"]) == (403, POSTING)
    assert c.get(f"{API}/forum/threads/{t['slug']}").status_code == 200  # reading needs no box


def test_without_forum_post_you_can_still_delete_your_own_words(
    client_for: ClientFor, give_roles: Callable[..., None], student: User
) -> None:
    t = new_thread(client_for(student), "Mine to take down")
    give_roles(student, "newsletter-manager")
    c = client_for(student)
    edited = c.patch(f"{API}/forum/threads/{t['id']}", json={"title": "Edited title"})
    assert (edited.status_code, edited.json()["error"]["message"]) == (403, POSTING)
    assert c.delete(f"{API}/forum/threads/{t['id']}").status_code == 204


def test_moderating_comes_from_the_box_through_any_role(
    client_for: ClientFor,
    make_user: MakeUser,
    make_role: Callable[..., Any],
    give_roles: Callable[..., None],
    student: User,
) -> None:
    t = new_thread(client_for(student), "Pin me")
    url = f"{API}/forum/threads/{t['id']}/moderate"
    make_role("forum-helpers", Box.forum_moderate)
    make_role("library-team", Box.library_manage)
    helper, librarian = make_user(name="Forum Helper"), make_user(name="Library Helper")
    give_roles(helper, "student", "forum-helpers")
    give_roles(librarian, "student", "library-team")
    assert client_for(helper).post(url, json={"pinned": True}).status_code == 200
    assert client_for(librarian).post(url, json={"pinned": True}).status_code == 403
    assert client_for(helper).post(url, json={"status": "hidden"}).status_code == 200
    assert client_for(helper).get(f"{API}/forum/threads/{t['slug']}").status_code == 200
    assert client_for(librarian).get(f"{API}/forum/threads/{t['slug']}").status_code == 404
```

Create `api/tests/content/test_library_access.py`:

```python
"""In the library, library.upload is for sharing, and library.manage for reviewing and for seeing what waits for
review, held through any role."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from fastapi.testclient import TestClient

from app.core.access import Box
from app.models import User
from tests.core.helpers import API, PDF, share_pdf

ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]
PDF_UPLOAD = {"purpose": "library", "fileName": "notes.pdf", "contentType": "application/pdf", "sizeBytes": len(PDF)}


def test_sharing_needs_library_upload(client_for: ClientFor, make_user: MakeUser, storage: Any) -> None:
    reader = make_user(name="Only Reads", roles=("newsletter-manager",))
    refused = client_for(reader).post(f"{API}/uploads", json=PDF_UPLOAD)
    assert refused.status_code == 403
    assert refused.json()["error"]["message"] == "Your account can't upload to the library. Contact a student rep."


def test_reviewing_comes_from_the_box_through_any_role(
    client_for: ClientFor,
    make_user: MakeUser,
    make_role: Callable[..., Any],
    give_roles: Callable[..., None],
    storage: Any,
) -> None:
    pending = share_pdf(client_for(make_user(name="Sara Student")), storage, title="Waiting for review")
    make_role("library-team", Box.library_manage)
    make_role("forum-helpers", Box.forum_moderate)
    librarian, helper = make_user(name="Library Helper"), make_user(name="Forum Helper")
    give_roles(librarian, "student", "library-team")
    give_roles(helper, "student", "forum-helpers")
    url = f"{API}/library/items/{pending['id']}"
    assert client_for(helper).get(url).status_code == 404  # a pending file is for the library's managers
    assert client_for(helper).post(f"{url}/review", json={"decision": "publish"}).status_code == 403
    assert client_for(librarian).get(url).status_code == 200
    assert client_for(librarian).post(f"{url}/review", json={"decision": "publish"}).status_code == 200
    assert client_for().get(url).status_code == 200
    assert share_pdf(client_for(librarian), storage, title="Straight in")["status"] == "published"
```

- [ ] **Step 3: Run them and watch them fail**

Run: `cd api && uv run --no-sync pytest tests/core/test_access_service.py tests/core/test_access_matrix.py tests/community/test_forum_access.py tests/content/test_library_access.py -q`
Expected: FAIL at collection. `app.services.access` and `app.schemas.access` don't exist yet, and neither do the
fixtures `make_role` and `give_roles`.

- [ ] **Step 4: The models**

Create `api/app/models/access.py`:

```python
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
```

In `api/app/models/user.py`:
- delete `class Role(enum.StrEnum)` and its three members;
- delete the `role: Mapped[Role] = ...` line in `User`.

In `api/app/models/__init__.py`:
- add `from app.models.access import AccessRole, FeatureSwitch, FeatureSwitchRole, RoleBox, RoleGrant`;
- import `Channel, OtpChallenge, OtpPurpose, User, UserSession, UserStatus` from `app.models.user` (no `Role`);
- in `__all__`, add the five new names and remove `"Role"`, keeping the list alphabetical.

- [ ] **Step 5: One baseline migration**

Delete the six migrations, then generate the baseline from the models against an empty database:

```sh
cd api
git rm migrations/versions/20261010_0001_initial_schema.py migrations/versions/20261010_0002_upload_posts.py \
  migrations/versions/20261012_0003_email_outbox.py migrations/versions/20261013_0004_indexes_and_deletions.py \
  migrations/versions/20261013_0005_library_import_key.py migrations/versions/20261013_0006_cq15_indexes_and_checks.py
ls migrations/versions   # must list nothing but __pycache__, if anything
docker compose -p dsba-hub exec -T db psql -U dsba -d postgres \
  -c 'DROP DATABASE IF EXISTS dsba_baseline' -c 'CREATE DATABASE dsba_baseline OWNER dsba'
DSBA_DATABASE_URL=postgresql+psycopg://dsba:dsba@127.0.0.1:5432/dsba_baseline \
  uv run --no-sync alembic revision --autogenerate --rev-id 0001 -m "initial"
docker compose -p dsba-hub exec -T db psql -U dsba -d postgres -c 'DROP DATABASE dsba_baseline'
```

Alembic writes `migrations/versions/20261013_0001_initial.py`. Read the whole file, then fix it:
1. **The docstring.** Replace the generated one with:

```python
"""the whole schema, with the ready-made roles and every feature's switch

Revision ID: 0001
Revises:
Create Date: 2026-10-13 12:00:00

The roles and switches are seeded here, not by `python -m app.cli seed`. The API can't run without them, so every
database built by `alembic upgrade head` has them. And `seed`, which the API container runs on every start, never
touches what admins have changed since.
"""
```

2. **What autogenerate leaves out.** Compare the file with the models, model by model.
   - Computed columns must be `sa.Computed(...)` with the same expression as the model. These are the
     `search_vector` columns of `forum_threads`, `forum_replies`, `library_items` and `newsletter_issues`.
   - GIN indexes must keep `postgresql_using="gin"`.
   - Partial indexes must keep `postgresql_where=...`. One is `ix_notifications_user_unread`.
   - Server defaults must be there.
   - Every `CheckConstraint` from `check_in()` and `year_range()` must be there, plus the enum CHECKs that
     `str_enum()` makes.
3. **Seeding.** Add these constants below the revision identifiers:

```python
ROLES = [  # slug, name, badge, position, built_in, locked
    ("admin", "Admin", "Admin", 0, True, True),
    ("rep", "Rep", "Student rep", 1, True, False),
    ("student", "Student", None, 2, True, False),
    ("newsletter-manager", "Newsletter manager", "Newsletter", 3, False, False),
    ("content-manager", "Content manager", "Content", 4, False, False),
]
BOXES = {  # Admin holds every box without listing them
    "student": ("forum.post", "library.upload", "newsletter.react", "reports.create"),
    "rep": ("forum.moderate", "library.manage", "newsletter.manage", "calendar.manage", "stats.view"),
    "newsletter-manager": ("newsletter.manage",),
    "content-manager": ("calendar.manage", "career.edit"),
}
FEATURES = ("forum", "library", "library.uploads", "newsletter", "calendar", "career", "grades", "noora")
```

   Then call `_seed()` as the last line of `upgrade()`, and add it below:

```python
def _seed() -> None:
    conn = op.get_bind()
    for slug, name, badge, position, built_in, locked in ROLES:
        conn.execute(
            sa.text(
                "INSERT INTO roles (id, slug, name, badge, position, built_in, locked) "
                "VALUES (gen_random_uuid(), :slug, :name, :badge, :position, :built_in, :locked)"
            ),
            {"slug": slug, "name": name, "badge": badge, "position": position, "built_in": built_in, "locked": locked},
        )
    for slug, boxes in BOXES.items():
        for box in boxes:
            conn.execute(
                sa.text("INSERT INTO role_boxes (role_id, box) SELECT id, :box FROM roles WHERE slug = :slug"),
                {"slug": slug, "box": box},
            )
    for feature in FEATURES:
        conn.execute(
            sa.text("INSERT INTO feature_switches (feature, mode) VALUES (:feature, 'everyone')"), {"feature": feature}
        )
```

   `downgrade()` drops every table, as autogenerate wrote it. Check that it also drops the indexes it created.

4. **Check it.** Run `uv run --no-sync alembic heads`. Expected: `0001 (head)`.

- [ ] **Step 6: The migration tests**

`api/tests/core/test_migrations.py` tests migrations that no longer exist. Delete these:
- `test_0003_gives_each_kind_of_email_its_own_switch`;
- `test_0004_turns_the_deletion_marker_into_deleted_at`;
- the `_preferences` helper, and the `json` import only it used (ruff reports it);
- `test_0006_has_the_database_check_kinds_types_reasons_and_cohorts`.

Then add these two, which use the `scratch` fixture the file already has:

```python
def test_the_baseline_seeds_the_roles_and_every_switch(scratch: tuple[Config, Engine]) -> None:
    cfg, engine = scratch
    command.upgrade(cfg, "head")
    with engine.connect() as c:
        roles = c.execute(text("SELECT slug, name, badge, built_in, locked FROM roles ORDER BY position")).tuples()
        assert roles.all() == [
            ("admin", "Admin", "Admin", True, True),
            ("rep", "Rep", "Student rep", True, False),
            ("student", "Student", None, True, False),
            ("newsletter-manager", "Newsletter manager", "Newsletter", False, False),
            ("content-manager", "Content manager", "Content", False, False),
        ]
        boxes = c.execute(
            text(
                "SELECT r.slug, string_agg(b.box, ',' ORDER BY b.box) FROM roles r "
                "LEFT JOIN role_boxes b ON b.role_id = r.id GROUP BY r.slug"
            )
        ).tuples()
        assert dict(boxes.all()) == {
            "admin": None,
            "content-manager": "calendar.manage,career.edit",
            "newsletter-manager": "newsletter.manage",
            "rep": "calendar.manage,forum.moderate,library.manage,newsletter.manage,stats.view",
            "student": "forum.post,library.upload,newsletter.react,reports.create",
        }
        switches = dict(c.execute(text("SELECT feature, mode FROM feature_switches")).tuples().all())
        features = ("forum", "library", "library.uploads", "newsletter", "calendar", "career", "grades", "noora")
        assert switches == dict.fromkeys(features, "everyone")


def test_the_database_refuses_what_the_contract_does_not_list(scratch: tuple[Config, Engine]) -> None:
    """Kinds, types, reasons, cohorts and switch modes are checked by the database itself (code quality review
    CQ-15), and a report is open unless it says otherwise."""
    cfg, engine = scratch
    command.upgrade(cfg, "head")
    ids = {"thread": uuid.uuid4(), "user": uuid.uuid4()}
    with engine.begin() as c:
        c.execute(text("INSERT INTO users (id, email) VALUES (:user, 'reporter@example.com')"), ids)
        c.execute(
            text(
                "INSERT INTO forum_threads (id, slug, title, body, category, status) "
                "VALUES (:thread, 'a-thread', 'A thread', 'Text', 'general', 'visible')"
            ),
            ids,
        )
        c.execute(
            text(
                "INSERT INTO reports (id, reporter_id, target_type, target_id, reason) "
                "VALUES (gen_random_uuid(), :user, 'thread', :thread, 'spam')"
            ),
            ids,
        )
        assert c.execute(text("SELECT status FROM reports")).scalar_one() == "open"
    library = "INSERT INTO library_items (id, slug, source, kind, title, status, year) VALUES (gen_random_uuid(), "
    report = "INSERT INTO reports (id, reporter_id, target_type, target_id, reason, status) VALUES (gen_random_uuid(), "
    refused = {
        "ck_library_items_kind": f"{library}'novel', 'file', 'novel', 'A novel', 'pending', NULL)",
        "ck_library_items_year_range": f"{library}'year-4', 'file', 'notes', 'Notes', 'pending', 4)",
        "ck_calendar_events_type": "INSERT INTO calendar_events (id, date, title, type) "
        "VALUES ('a-party', '2026-10-13', 'A party', 'party')",
        "ck_reports_target_type": f"{report}:user, 'post', :thread, 'spam', 'dismissed')",
        "ck_reports_reason": f"{report}:user, 'thread', :thread, 'boring', 'dismissed')",
        "ck_forum_threads_author_year_range": "INSERT INTO forum_threads "
        "(id, slug, title, body, category, status, author_year) "
        "VALUES (gen_random_uuid(), 'year-0', 'Year 0', 'Text', 'general', 'visible', 0)",
        "ck_forum_replies_author_year_range": "INSERT INTO forum_replies (id, thread_id, body, status, author_year) "
        "VALUES (gen_random_uuid(), :thread, 'Text', 'visible', 9)",
        "ck_feature_switches_mode": "UPDATE feature_switches SET mode = 'maybe' WHERE feature = 'forum'",
    }
    for constraint, statement in refused.items():
        with pytest.raises(IntegrityError, match=constraint), engine.begin() as c:
            c.execute(text(statement), ids)
```

Run: `cd api && uv run --no-sync pytest tests/core/test_migrations.py tests/core/test_drift.py -q`
Expected: all pass. `test_the_migrations_build_the_models_schema` proves the baseline matches the models, and
`test_every_migration_can_be_undone_and_redone` proves its `downgrade()`. Any difference the drift test lists is a
step 5 fix.

- [ ] **Step 7: Rebuild your local database from the baseline**

The running stack's database was built by the deleted migrations. The stack is shared, so tell the lead before you
run this.

```sh
cd /Users/mohamed/dsba-access   # the worktree: the api container then mounts this branch's code
docker compose up -d --build api mail
docker compose exec -T db psql -U dsba -d postgres \
  -c 'DROP DATABASE IF EXISTS dsba WITH (FORCE)' -c 'CREATE DATABASE dsba OWNER dsba'
docker compose exec -T api alembic upgrade head
docker compose exec -T api python -m app.cli seed
docker compose restart api mail
```

Expected: `alembic upgrade head` prints `Running upgrade  -> 0001, initial`, and `seed` prints a count per content
type. Pytest needs none of this: each run builds its own database.

- [ ] **Step 8: The shapes: `api/app/schemas/access.py`, `common.py`, `auth.py` and `moderation.py`**

Create `api/app/schemas/access.py`:

```python
"""Access on the wire: box and feature keys as the contract lists them, and a role as people see it."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from app.schemas.common import ApiModel

BoxKey = Literal[
    "forum.post",
    "library.upload",
    "newsletter.react",
    "reports.create",
    "forum.moderate",
    "library.manage",
    "newsletter.manage",
    "calendar.manage",
    "career.edit",
    "stats.view",
    "people.suspend",
    "audit.read",
]
FeatureKey = Literal["forum", "library", "library.uploads", "newsletter", "calendar", "career", "grades", "noora"]


class RoleSummary(ApiModel):
    id: UUID
    slug: str
    name: str
    badge: str | None
```

In `api/app/schemas/common.py`:
- delete `Role = Literal["student", "moderator", "admin"]`;
- in `UserPublic`, replace `role: Role` with
  `badge: str | None  # their roles' badge ("Student rep", "Admin"...), or None`;
- add to the end of `ErrorCode`, after `"too_many_pending"`:

```python
    # access: roles and feature switches (R-1, R-10)
    "feature_off",  # 404: the feature is switched off for this person (admins see every feature)
    "last_admin",  # 409: the hub needs at least one active admin
    "role_locked",  # 409: the Admin role can't change, and a built-in role can't be deleted
    "role_changed",  # 409: another admin changed the role since it was loaded: load it again
```

In `api/app/schemas/auth.py`:
- remove `Role` from the `from app.schemas.common import ...` line;
- add `from app.schemas.access import BoxKey, RoleSummary`;
- in `Me`, replace `role: Role` with:

```python
    roles: list[RoleSummary]  # in role order: Admin, Rep, then the others
    boxes: list[BoxKey]  # what the person may do now: none while the account is suspended
```

In `api/app/schemas/moderation.py`:
- remove `Role` from its `app.schemas.common` import;
- add `from app.schemas.access import RoleSummary`;
- in `AdminUser`, replace `role: Role` with `roles: list[RoleSummary]`;
- in `AdminUserUpdate`, delete the `role` field and replace its docstring with:

```python
    """Only the fields sent change. `status` needs people.suspend; only admins suspend or restore an admin. `email`
    and `phone` are the account-recovery action (security review SEC-9), for admins only: they replace the account's
    address (`null` removes it; one must stay), end every session of the account, send a notice to the address that
    was replaced or removed, and are audited (`user.identifier`)."""
```

In `api/app/core/errors.py`, after `forbidden()`:

```python
def feature_off() -> ApiError:
    """404 feature_off: the feature is switched off for this person (an admin's choice on the Access screen)."""
    return ApiError(404, "feature_off", "This part of the hub is switched off right now.")
```

- [ ] **Step 9: The service: `api/app/services/access.py`**

```python
"""Access read from the database: a person's roles and the checks the API makes with them. The rules are in
app/core/access.py.

A database session keeps what it loaded (in Session.info), so a request reads a person's roles once. Every change to
roles or grants calls forget(). Each request has a session of its own, so a change applies from the next request on
(spec, rule 5)."""

from __future__ import annotations

import uuid
from collections.abc import Iterable

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session, object_session

from app.core.access import ADMIN, BOXES, GUEST, Access, Box, RoleRef, build_access, effective_boxes
from app.core.errors import conflict, forbidden
from app.models import AccessRole, RoleBox, RoleGrant, User, UserStatus
from app.services import ratelimit

ACCESS_KEY = "dsba.access"  # Session.info: {user id: Access}

# ── reading ─────────────────────────────────────────────────────────────────────────────────


def _cache(db: Session) -> dict[uuid.UUID, Access]:
    cache: dict[uuid.UUID, Access] = db.info.setdefault(ACCESS_KEY, {})
    return cache


def forget(db: Session) -> None:
    """Drops what this session loaded about roles. Call it after any change to roles or grants."""
    db.info.pop(ACCESS_KEY, None)


def prefetch(db: Session, users: Iterable[User | None]) -> None:
    """Loads the roles of everyone in `users` who isn't loaded yet, in two queries (lists of authors call this)."""
    cache = _cache(db)
    ids = {u.id for u in users if u is not None and u.id not in cache}
    if not ids:
        return
    rows = (
        db.execute(
            select(
                RoleGrant.user_id, AccessRole.id, AccessRole.slug, AccessRole.name, AccessRole.badge, AccessRole.position
            )
            .join(AccessRole, AccessRole.id == RoleGrant.role_id)
            .where(RoleGrant.user_id.in_(ids))
        )
        .tuples()
        .all()
    )
    role_ids = {row[1] for row in rows}
    boxes: dict[uuid.UUID, list[str]] = {}
    if role_ids:
        for role_id, box in db.execute(select(RoleBox.role_id, RoleBox.box).where(RoleBox.role_id.in_(role_ids))):
            boxes.setdefault(role_id, []).append(box)
    roles: dict[uuid.UUID, list[RoleRef]] = {user_id: [] for user_id in ids}
    for user_id, role_id, slug, name, badge, position in rows:
        roles[user_id].append(RoleRef(role_id, slug, name, badge, position))
    for user_id, refs in roles.items():
        cache[user_id] = build_access(refs, boxes)


def access_of(user: User | None, db: Session | None = None) -> Access:
    """The person's roles and the boxes they give, before the account's status is applied. A guest's for None."""
    if user is None:
        return GUEST
    session = db or object_session(user)
    if session is None:  # an object no session loaded: it holds nothing
        return GUEST
    cache = _cache(session)
    if user.id not in cache:
        prefetch(session, [user])
    return cache[user.id]


def is_active(user: User | None) -> bool:
    return user is not None and user.status == UserStatus.active


def boxes_of(user: User | None) -> frozenset[Box]:
    """What the person may do now: none for a guest or a suspended account."""
    return effective_boxes(access_of(user), active=is_active(user))


def can(user: User | None, box: Box) -> bool:
    return box in boxes_of(user)


def require(user: User | None, box: Box) -> None:
    """403 with the box's message unless the person holds `box` (for checks that depend on the request body)."""
    if not can(user, box):
        raise forbidden(BOXES[box].refusal)


def is_admin(user: User | None) -> bool:
    """Holds Admin with an active account: the admin-only powers (roles, switches, account recovery, reporters)."""
    return is_active(user) and access_of(user).admin


def role_names(user: User) -> list[str]:
    """The person's roles by name, in role order: how the audit log records them."""
    return [r.name for r in access_of(user).roles]


# ── changing ────────────────────────────────────────────────────────────────────────────────


def role_by_slug(db: Session, slug: str) -> AccessRole | None:
    return db.scalar(select(AccessRole).where(AccessRole.slug == slug))


def give(db: Session, user: User, *slugs: str, by: User | None = None) -> None:
    """Gives the person these roles. Roles they hold already stay as they are. No audit: callers record it."""
    for slug in slugs:
        role = role_by_slug(db, slug)
        if role is None:
            raise LookupError(f"no role {slug!r}")
        db.execute(
            pg_insert(RoleGrant)
            .values(user_id=user.id, role_id=role.id, given_by=by.id if by else None)
            .on_conflict_do_nothing()
        )
    forget(db)


def set_roles(db: Session, user: User, roles: Iterable[AccessRole], *, by: User | None = None) -> None:
    """The person now holds exactly these roles. No audit: callers record it."""
    wanted = {r.id for r in roles}
    db.execute(delete(RoleGrant).where(RoleGrant.user_id == user.id, RoleGrant.role_id.not_in(wanted)))
    for role_id in wanted:
        db.execute(
            pg_insert(RoleGrant)
            .values(user_id=user.id, role_id=role_id, given_by=by.id if by else None)
            .on_conflict_do_nothing()
        )
    forget(db)


def ensure_admins_remain(db: Session, losing: User) -> None:
    """409 last_admin when `losing`, about to lose Admin or be suspended, is the only active admin. It takes a lock
    first, so two admins demoting each other at the same moment can't both succeed."""
    ratelimit.lock(db, "access:admins")
    others = db.scalar(
        select(func.count())
        .select_from(RoleGrant)
        .join(AccessRole, AccessRole.id == RoleGrant.role_id)
        .join(User, User.id == RoleGrant.user_id)
        .where(AccessRole.slug == ADMIN, User.status == UserStatus.active, User.id != losing.id)
    )
    if not others:
        raise conflict("last_admin", "The hub needs at least one active admin. Make someone else an admin first.")
```

- [ ] **Step 10: The route dependencies: `api/app/core/security.py`**

- Remove `Role` from `from app.models import Role, User, UserSession, UserStatus`.
- Delete `is_moderator`, `is_admin`, `get_moderator` and `get_admin`, and the shorthands `Moderator` and `Admin`.
- Add `Any` to the `typing` import, `from app.core.access import Box` and `from app.services import access`.

Then add, after `get_active_user`:

```python
def requires(box: Box) -> Any:
    """A route dependency: an active account with a profile that holds `box`, else 403 with the box's message.

        def publish(..., user: Annotated[User, requires(Box.newsletter_manage)]) -> ..."""

    def dependency(user: Annotated[User, Depends(get_active_user)]) -> User:
        access.require(user, box)
        return user

    return Depends(dependency)


def requires_any(*boxes: Box, refusal: str) -> Any:
    """A route dependency: an active account with a profile that holds at least one of `boxes`, else 403 `refusal`."""

    def dependency(user: Annotated[User, Depends(get_active_user)]) -> User:
        if not any(access.can(user, box) for box in boxes):
            raise forbidden(refusal)
        return user

    return Depends(dependency)


def requires_admin() -> Any:
    """A route dependency for the admin-only powers: an active admin with a profile, else 403."""

    def dependency(user: Annotated[User, Depends(get_active_user)]) -> User:
        if not access.is_admin(user):
            raise forbidden("Only admins can do this.")
        return user

    return Depends(dependency)
```

- [ ] **Step 11: The forum by boxes**

`api/app/services/forum/visibility.py`:
- replace `from app.core.security import is_moderator` with `from app.core.access import BOXES, Box` and
  `from app.services import access`;
- add `forbidden` to its `app.core.errors` import;
- add these two above `can_see_thread`:

```python
def moderates(user: User | None) -> bool:
    """Holds forum.moderate with an active account: sees hidden posts, edits and deletes anyone's, hides and locks."""
    return access.can(user, Box.forum_moderate)


def may_change(user: User, mine: bool, other: str) -> None:
    """The author, while they may post, or anyone who moderates the forum. Otherwise 403: `other` for someone else's
    post, and the posting message for your own."""
    if (mine and access.can(user, Box.forum_post)) or moderates(user):
        return
    raise forbidden(BOXES[Box.forum_post].refusal if mine else other)
```

- then replace each `is_moderator(viewer)` with `moderates(viewer)`, in `can_see_thread`, `can_see_reply` and
  `listed`.

In `threads.py`, `replies.py` and `views.py`, remove `from app.core.security import is_moderator`, and import
`moderates` from `app.services.forum.visibility` (plus `may_change` in `threads.py` and `replies.py`). Then:

| File | Function | Change |
| --- | --- | --- |
| `threads.py` | `update_thread` | The two-line author-or-moderator check becomes `may_change(user, mine, "You can only edit your own threads.")`. |
| `threads.py` | `delete_thread` | `is_moderator(user)` becomes `moderates(user)`, twice. Deleting your own thread needs no box (spec note 5). |
| `threads.py` | `accept_answer` | The two-line check becomes `may_change(user, mine, "Only the person who asked can accept an answer.")`. |
| `replies.py` | `create_reply` | `if t.locked and not moderates(user):` |
| `replies.py` | `update_reply` | The two-line check becomes `may_change(user, mine, "You can only edit your own replies.")`. |
| `replies.py` | `delete_reply` | `if not (mine or moderates(user)):` |
| `views.py` | `reply_dict` | `"can_edit": _editable(r, mine, moderates(viewer)),` |
| `views.py` | `thread_detail` | `mod = moderates(viewer)` |

Remove each `forbidden` import that is now unused. ruff tells you which.

`api/app/routers/forum.py`:
- the security import becomes `from app.core.security import DB, ActiveUser, CurrentUser, OptionalUser, client_ip,
  requires`;
- add `from typing import Annotated`, `from app.core.access import Box` and `from app.models import User`;
- below `router = router_for("forum")`, add:

```python
Poster = Annotated[User, requires(Box.forum_post)]  # start threads, reply, vote
ForumModerator = Annotated[User, requires(Box.forum_moderate)]
```

- then change the `user:` parameters:

  | Routes | Type |
  | --- | --- |
  | `create_thread`, `vote_thread`, `unvote_thread`, `create_reply`, `vote_reply`, `unvote_reply` | `Poster` |
  | `moderate_thread`, `moderate_reply` | `ForumModerator` |
  | the rest | unchanged |

- [ ] **Step 12: The library and uploads by boxes**

`api/app/services/library.py`:
- replace `from app.core.security import is_moderator` with `from app.core.access import Box` and
  `from app.services import access`;
- add above `can_see`:

```python
def manages(user: User | None) -> bool:
    """Holds library.manage with an active account: reviews uploads, sees pending and removed items, edits any item,
    and publishes their own files without review."""
    return access.can(user, Box.library_manage)
```

- replace `is_moderator(user)` with `manages(user)` in `can_see`, `_visible_statuses`, `to_out`,
  `check_pending_room`, `create_from_upload` and `remove`;
- replace `can_edit` with:

```python
def can_edit(item: LibraryItem, user: User | None) -> bool:
    """PATCH: people who manage the library always; the uploader while the item waits for review, if they may
    upload."""
    if user is None:
        return False
    if manages(user):
        return True
    mine = item.uploaded_by == user.id and item.status == ItemStatus.pending
    return mine and access.can(user, Box.library_upload)
```

`api/app/routers/library.py`:
- the security import becomes `from app.core.security import DB, ActiveUser, OptionalUser, client_ip, requires`;
- add `from typing import Annotated`, `from app.core.access import Box` and `from app.models import User`;
- add under `router = router_for("library")`:

```python
Uploader = Annotated[User, requires(Box.library_upload)]
LibraryManager = Annotated[User, requires(Box.library_manage)]
```

- `create_item` takes `user: Uploader`, and `create_link` and `review` take `user: LibraryManager`.

`api/app/routers/uploads.py`: add `from app.core.access import Box` and `from app.services import access, library`
(merging the existing `library` import). The start of `create_upload`'s body becomes:

```python
    if body.purpose == "library":
        access.require(user, Box.library_upload)
        library.check_pending_room(db, user)  # before the file travels: create_item checks again
    else:
        access.require(user, Box.forum_post)
```

Add `forbidden (403: no library.upload, or no forum.post for a forum picture)` to its docstring's errors.

`api/app/services/uploads.py`, `can_view_image`:
- `is_moderator(viewer)` becomes `moderates(viewer)`;
- import `moderates` from `app.services.forum.visibility`, next to `can_read_thread`;
- remove the `app.core.security` import of `is_moderator`.

- [ ] **Step 13: The newsletter, calendar, Career Navigator, reports and people by boxes**

`api/app/routers/newsletter.py`:
- the security import becomes `from app.core.security import DB, OptionalUser, client_ip, requires`;
- add `from typing import Annotated`, `from app.core.access import Box`, `from app.models import User` and
  `from app.services import access`;
- add under the router:

```python
NewsletterManager = Annotated[User, requires(Box.newsletter_manage)]
Reader = Annotated[User, requires(Box.newsletter_react)]  # reacts to issues
```

- `create_issue`, `update_issue`, `publish_issue` and `delete_issue` take `user: NewsletterManager`, and `react` and
  `unreact` take `user: Reader`;
- `list_issues` uses `include_drafts and access.can(user, Box.newsletter_manage)`.

`api/app/services/newsletter.py`:
- replace `from app.core.security import is_moderator` with `from app.core.access import Box` and
  `from app.services import access`;
- `can_see` returns `issue.status == IssueStatus.published or access.can(user, Box.newsletter_manage)`;
- `set_reaction` checks `if access.can(user, Box.newsletter_manage):`.

`api/app/routers/calendar.py`:
- the security import becomes `from app.core.security import DB, client_ip, requires`;
- add `from typing import Annotated`, `from app.core.access import Box` and `from app.models import User`;
- `create_event`, `update_event` and `delete_event` take `user: Annotated[User, requires(Box.calendar_manage)]`.

`api/app/routers/content.py`:
- the security import becomes `from app.core.security import DB, OptionalUser, client_ip, requires`;
- add `from typing import Annotated`, `from app.core.access import Box` and `from app.models import User`;
- `update_career` takes `user: Annotated[User, requires(Box.career_edit)]`.

`api/app/routers/reports.py`:
- the security import becomes `from app.core.security import DB, client_ip, requires, requires_any`;
- add `from typing import Annotated`, `from app.core.access import Box` and `from app.models import User`;
- add:

```python
ReportsQueue = Annotated[
    User,
    requires_any(
        Box.forum_moderate,
        Box.library_manage,
        refusal="Only people who moderate the forum or manage the library can do this.",
    ),
]
```

- `create_report` takes `user: Annotated[User, requires(Box.reports_create)]`, and `list_reports` and
  `resolve_report` take `user: ReportsQueue`;
- `list_reports`' docstring: "Open reports oldest first (a queue); closed ones most recently closed first. Each
  person sees the reports they can act on: forum posts with forum.moderate, library files with library.manage.
  `reporter` is set for admins only (student reps are classmates)."

`api/app/services/reports.py`:
- replace `from app.core.security import is_admin` with `from app.core.access import Box` and
  `from app.services import access`;
- add above `_report_outs`:

```python
def _queue(user: User) -> list[str]:
    """The target types this person acts on: forum posts with forum.moderate, library files with library.manage."""
    types: list[str] = []
    if access.can(user, Box.forum_moderate):
        types += ["thread", "reply"]
    if access.can(user, Box.library_manage):
        types.append("library_item")
    return types
```

- in `_report_outs`, `show_reporter = access.is_admin(viewer)`;
- in `list_reports`, add `Report.target_type.in_(_queue(user))` to both `where(...)` calls, the count and the select;
- in `resolve_report`, the first check becomes
  `if report is None or report.target_type not in _queue(user): raise not_found("This report doesn't exist.")`.

`api/app/routers/admin.py`:
- imports:
  - `from app.core.security import DB, client_ip, requires`;
  - drop `from app.models import Role as UserRole` and `Role` from the `app.schemas.common` import;
  - add `RoleGrant` to the `app.models` import, and `forbidden` to the `app.core.errors` import;
  - add `from typing import Annotated`, `from app.core.access import Box` and `from app.services import access`.
- Delete `ROLE_NOTICES`.
- Replace `admin_user`:

```python
def admin_user(u: User, *, contacts: bool) -> AdminUser:
    """A person for the people list. `contacts`: their email address and phone number (admins only)."""
    return AdminUser.model_validate(
        {
            "id": u.id,
            "display_name": u.display_name,
            "email": u.email if contacts else None,
            "phone": u.phone if contacts else None,
            "roles": accounts.role_summaries(u),
            "status": u.status.value,
            "year": u.year,
            "created_at": u.created_at,
            "last_seen_at": u.last_seen_at,
        }
    )
```

- `stats` takes `user: Annotated[User, requires(Box.stats_view)]`, and `audit_log` takes
  `user: Annotated[User, requires(Box.audit_read)]`.
- `list_users`:
  - takes `user: Annotated[User, requires(Box.people_suspend)]` and `role: str | None = None`. Its docstring says
    "`role`: a role's slug. Only admins search and see email addresses and phone numbers."
  - The search matches `User.display_name` for everyone, and adds the email and phone matches only when
    `contacts = access.is_admin(user)`.
  - The role filter becomes:

```python
    if role is not None:
        held = access.role_by_slug(db, role)
        if held is None:
            raise invalid("role", "There's no role with this name.")
        where.append(User.id.in_(select(RoleGrant.user_id).where(RoleGrant.role_id == held.id)))
```

  - It returns `admin_user(u, contacts=contacts)` for each item.
- `update_user` takes `user: Annotated[User, requires(Box.people_suspend)]`. Its docstring's errors:
  "cannot_change_self (409), last_admin (409: the only active admin), forbidden (403: recovery is for admins, and so
  is suspending or restoring an admin), identifier_taken (409), last_identifier (409), invalid_identifier (422)."
  Its body, from `new_role = ...` down to the end of the status block, becomes:

```python
    new_status = UserStatus(body.status) if body.status is not None else None
    recovery: dict[Kind, str | None] = {}
    if "email" in body.model_fields_set:
        recovery["email"] = body.email
    if "phone" in body.model_fields_set:
        recovery["phone"] = body.phone
    contacts = access.is_admin(user)
    if new_status is None and not recovery:
        return admin_user(target, contacts=contacts)
    if target.id == user.id:
        raise conflict("cannot_change_self", "You can't change your own account here. Ask another admin.")
    if recovery and not contacts:
        raise forbidden("Only admins can do this.")
    ip = client_ip(request)
    if new_status is not None and new_status != target.status:
        if access.access_of(target, db).admin:
            if not contacts:
                suspend = new_status == UserStatus.suspended
                raise forbidden("Only admins can suspend an admin." if suspend else "Only admins can restore an admin.")
            if new_status == UserStatus.suspended:
                access.ensure_admins_remain(db, target)
        record(db, user, "user.status", "user", target.id, {"from": target.status.value, "to": new_status.value}, ip)
        target.status = new_status
        title, body_text = STATUS_NOTICES[new_status]
        notify(db, target.id, "system", title, body=body_text, actor=user)
```

  The rest of `update_user`, the recovery and the commit, stays, and returns `admin_user(target, contacts=contacts)`.

`api/app/routers/me.py`:
- replace `is_moderator` in the security import with nothing, and add `from app.services import access`;
- in `update_me`, the name check becomes
  `accounts.clean_display_name(body.display_name, staff=access.access_of(user).badge is not None)`. Names that
  read as staff are for people holding a role with a badge.

- [ ] **Step 14: Accounts, sign-up and the CLI**

`api/app/services/accounts.py`:
- imports:
  - drop `Role` from the `app.models` import;
  - add `from app.core.access import ADMIN, STUDENT`;
  - make the services import `from app.services import access, otp, sessions`;
  - add `from app.schemas.access import RoleSummary`.
- Add above `me_out`:

```python
def role_summaries(user: User) -> list[RoleSummary]:
    """The person's roles as /me and the people list show them, in role order."""
    return [RoleSummary(id=r.id, slug=r.slug, name=r.name, badge=r.badge) for r in access.access_of(user).roles]
```

- In `me_out`, replace `"role": user.role.value,` with:

```python
            "roles": role_summaries(user),
            "boxes": [b.value for b in sorted(access.boxes_of(user))],
```

- In `public_user`, replace `"role": user.role.value,` with `"badge": access.access_of(user).badge,`. In its
  docstring, "name, cohort and role" becomes "name, cohort and badge".
- In `user_for_sign_in`:
  - drop `role=Role.student,` from `User(...)`;
  - the `else:` branch becomes:

```python
        else:
            user, created = candidate, True
            access.give(db, user, STUDENT)
```

  - and the admin block becomes:

```python
    if not access.access_of(user, db).admin and {user.email, user.phone} & admin_identifiers():
        # a new account has no name yet: the activity log shows its masked address instead (UX-15)
        name = user.display_name or destination_hint(kind, identifier)
        before = access.role_names(user)
        access.give(db, user, ADMIN)
        change = {"from": before, "to": access.role_names(user), "via": "bootstrap", "targetName": name}
        record(db, None, "user.roles", "user", user.id, change, ip)
```

`api/app/cli.py`:
- In the module docstring:
  - the `set-role` line becomes
    `set-role ID ROLE...  make the account with this email or phone number hold exactly these roles (slugs; audited)`;
  - the `dev-login` line becomes
    `dev-login ID       development only: print a session token for an account (created if needed, holding Student;
    --role gives one more role)`.
- Replace `Role` with `AccessRole` in `from app.models import ...`.
- `cmd_set_role` becomes:

```python
def cmd_set_role(args: argparse.Namespace) -> int:
    from app.core.access import ADMIN
    from app.core.errors import ApiError
    from app.services import access
    from app.services.audit import record
    from app.services.identifiers import normalize_identifier

    _, ident = normalize_identifier(args.identifier)
    with get_sessionmaker()() as db:
        user = db.scalar(select(User).where((User.email == ident) | (User.phone == ident)))
        if user is None:
            print(f"no account for {ident}: sign in once first", file=sys.stderr)
            return 1
        found = {slug: access.role_by_slug(db, slug) for slug in args.roles}
        wanted = [role for role in found.values() if role is not None]
        if len(wanted) < len(found):
            missing = ", ".join(slug for slug, role in found.items() if role is None)
            known = ", ".join(db.scalars(select(AccessRole.slug).order_by(AccessRole.position)))
            print(f"no role called {missing}: the roles are {known}", file=sys.stderr)
            return 1
        before = access.role_names(user)
        try:
            if access.access_of(user, db).admin and all(role.slug != ADMIN for role in wanted):
                access.ensure_admins_remain(db, user)
        except ApiError as refused:
            print(refused.message, file=sys.stderr)
            return 1
        access.set_roles(db, user, wanted)
        after = access.role_names(user)
        if after != before:
            record(db, None, "user.roles", "user", user.id, {"from": before, "to": after, "via": "cli"})
        db.commit()
    print(f"{ident} now holds: {', '.join(after)}")
    return 0
```

- `cmd_dev_login`:
  - its local imports gain `from app.core.access import STUDENT` and `from app.services import access`;
  - inside `with get_sessionmaker()() as db:`, everything from `user = db.scalar(...)` to `db.flush()` becomes:

```python
        if args.role and access.role_by_slug(db, args.role) is None:
            print(f"no role called {args.role}", file=sys.stderr)
            return 1
        user = db.scalar(select(User).where((User.email == ident) | (User.phone == ident)))
        if user is None:
            user = User(email=ident if kind == "email" else None, phone=ident if kind == "phone" else None)
            db.add(user)
            db.flush()
            access.give(db, user, STUDENT)
        if args.name:
            user.display_name = args.name
        if args.year:
            user.year = args.year
        if args.role:
            access.give(db, user, args.role)
        db.flush()
```

- In `main()`:
  - `set-role` takes
    `sr.add_argument("roles", nargs="+", metavar="ROLE", help="role slugs: student, rep, newsletter-manager, content-manager, admin, or one an admin made")`;
  - `dev-login`'s option becomes
    `dl.add_argument("--role", default=None, metavar="ROLE", help="give this role too (a slug, such as rep or admin)")`.

`web/e2e/support.ts`, `devLogin`: the option type becomes `role: 'rep' | 'admin'`. In `web/e2e/auth.setup.ts`:
- line 207's option becomes `role: who === 'rep' ? 'rep' : 'admin'`;
- line 212 becomes:

```ts
    expect(me.body).toMatchObject({ status: 'active', roles: expect.arrayContaining([expect.objectContaining({ slug: who === 'rep' ? 'rep' : 'admin' })]) });
```

`web/e2e/admin.spec.ts` changes a role on the People screen. The web plan rewrites it with the Access screen.

- [ ] **Step 15: The test fixtures, and every test that used `role`**

In `api/tests/conftest.py`, replace the `make_user` fixture, and add `Sequence` and `Any` to its imports:

```python
@pytest.fixture
def make_user(db: Session) -> Callable[..., User]:
    """make_user(email=, phone=, name=, roles=, year=) -> a User holding these roles (slugs; Student by default),
    committed. An email address is made up if neither identifier is given."""
    from app.services import access

    def _make(
        *,
        email: str | None = None,
        phone: str | None = None,
        name: str | None = "Test Student",
        roles: Sequence[str] = ("student",),
        year: int | None = 2,
    ) -> User:
        if email is None and phone is None:
            email = f"student-{uuid.uuid4().hex[:8]}@example.com"
        u = User(email=email, phone=phone, display_name=name, year=year)
        db.add(u)
        db.commit()
        access.give(db, u, *roles)
        db.commit()
        return u

    return _make


@pytest.fixture
def give_roles(db: Session) -> Callable[..., None]:
    """give_roles(user, "student", "newsletter-manager"): the person now holds exactly these roles (slugs)."""
    from app.services import access

    def _give(user: User, *slugs: str) -> None:
        roles = [access.role_by_slug(db, slug) for slug in slugs]
        access.set_roles(db, user, [r for r in roles if r is not None])
        db.commit()

    return _give


@pytest.fixture
def make_role(db: Session) -> Callable[..., Any]:
    """make_role("forum-helpers", Box.forum_moderate, badge="Helper"): a role with these boxes, committed."""
    from app.models import AccessRole, RoleBox
    from app.services import access

    def _make(slug: str, *boxes: Any, badge: str | None = None) -> AccessRole:
        role = AccessRole(slug=slug, name=slug.replace("-", " ").capitalize(), badge=badge, position=50)
        db.add(role)
        db.flush()
        db.add_all(RoleBox(role_id=role.id, box=str(box)) for box in boxes)
        db.commit()
        access.forget(db)
        return role

    return _make
```

Rewrite the call sites in one pass, then let ruff drop the `Role` imports that are now unused:

```sh
cd api
grep -rl 'role=Role\.' tests | xargs sed -i '' \
  -e 's/role=Role\.moderator/roles=("student", "rep")/g' \
  -e 's/role=Role\.admin/roles=("student", "admin")/g' \
  -e 's/role=Role\.student/roles=("student",)/g'
sed -i '' 's/role=moderator\.role/roles=("student", "rep")/' tests/community/test_threads_write.py
sed -i '' 's/"role": "student"}/"badge": None}/' tests/content/test_library.py tests/community/test_threads_create.py tests/community/test_meta_stats.py
sed -i '' 's/"role": "moderator"}/"badge": "Student rep"}/' tests/accounts/test_notifications.py
sed -i '' 's/"role": "admin"}/"badge": "Admin"}/' tests/accounts/test_admin.py
uv run --no-sync ruff check --fix tests
```

Then the rewrites sed can't do:

`tests/core/test_roles.py`:
- import `from app.services import access` and `from app.core.access import Box` in place of
  `from app.core.security import is_admin, is_moderator` and of `Role`;
- the first test becomes:

```python
def test_boxes_need_an_active_account(make_user: Callable[..., User], db: Session) -> None:
    rep, boss = make_user(roles=("student", "rep")), make_user(roles=("student", "admin"))
    assert [access.can(rep, Box.forum_moderate), access.can(boss, Box.forum_moderate), access.is_admin(boss)] == [
        True,
        True,
        True,
    ]
    assert [access.is_admin(rep), access.can(None, Box.forum_moderate), access.can(make_user(), Box.forum_moderate)] == [
        False,
        False,
        False,
    ]
    _suspend(db, rep)
    _suspend(db, boss)
    assert [access.can(rep, Box.forum_moderate), access.can(boss, Box.forum_moderate), access.is_admin(boss)] == [
        False,
        False,
        False,
    ]
```

- and `test_a_suspended_admin_cannot_change_roles` becomes:

```python
def test_a_suspended_admin_cannot_change_accounts(client_for: Clients, admin: User, student: User, db: Session) -> None:
    _suspend(db, admin)
    c = client_for(admin)
    assert c.patch(f"{API}/admin/users/{student.id}", json={"status": "suspended"}).status_code == 403
    assert c.get(f"{API}/admin/users").status_code == 403
    db.refresh(student)
    assert student.status == UserStatus.active
```

`tests/core/test_cli.py`: `test_set_role_is_audited` becomes these two, with `from app.services import access` among
its imports:

```python
def test_set_role_gives_exactly_these_roles_and_is_audited(
    same_session: Session, make_user: Callable[..., User], capsys: pytest.CaptureFixture[str]
) -> None:
    user = make_user(email="soon.rep@example.com", name="Soon A Rep")
    assert cli.main(["set-role", "Soon.Rep@Example.com", "student", "rep"]) == 0
    assert capsys.readouterr().out == "soon.rep@example.com now holds: Rep, Student\n"
    assert access.access_of(user).slugs == ("rep", "student")
    entry = same_session.scalar(select(AuditEntry).where(AuditEntry.action == "user.roles"))
    assert entry is not None
    assert entry.actor_id is None
    assert entry.target_id == str(user.id)
    assert entry.data == {"from": ["Student"], "to": ["Rep", "Student"], "via": "cli", "targetName": "Soon A Rep"}
    assert cli.main(["set-role", "nobody@example.com", "admin"]) == 1
    assert cli.main(["set-role", "soon.rep@example.com", "owner"]) == 1
    assert "no role called owner" in capsys.readouterr().err


def test_set_role_never_leaves_the_hub_without_an_admin(
    same_session: Session, make_user: Callable[..., User], capsys: pytest.CaptureFixture[str]
) -> None:
    boss = make_user(email="only.admin@example.com", name="Only Admin", roles=("student", "admin"))
    assert cli.main(["set-role", "only.admin@example.com", "student"]) == 1
    assert "at least one active admin" in capsys.readouterr().err
    assert access.is_admin(boss)
    make_user(email="second.admin@example.com", name="Second Admin", roles=("student", "admin"))
    assert cli.main(["set-role", "only.admin@example.com", "student"]) == 0
    assert not access.is_admin(boss)
```

`tests/accounts/test_sign_in.py`:
- line 62 becomes `assert [r["slug"] for r in me["roles"]] == ["student"]`;
- the body of `test_admin_identifiers_become_admins`, after its first `set_option`, `make_user` and second
  `set_option`, becomes:

```python
    def slugs(identifier: str) -> list[str]:
        return [r["slug"] for r in sign_in(identifier)[1]["user"]["roles"]]

    assert slugs("boss@example.com") == ["admin", "student"]
    assert slugs("+97333999999") == ["admin", "student"]
    assert slugs("plain@example.com") == ["student"]
    assert slugs("rep@example.com") == ["admin", "student"]
    entry = db.scalar(select(AuditEntry).where(AuditEntry.action == "user.roles", AuditEntry.target_id == str(rep.id)))
    assert entry is not None
    assert entry.actor_id is None
    assert entry.data == {
        "from": ["Student"],
        "to": ["Admin", "Student"],
        "via": "bootstrap",
        "targetName": "Test Student",
    }
```

`tests/accounts/test_me.py`, `test_me`: replace the line `"role": "student",` with:

```python
        "roles": [{"id": r.json()["roles"][0]["id"], "slug": "student", "name": "Student", "badge": None}],
        "boxes": ["forum.post", "library.upload", "newsletter.react", "reports.create"],
```

`tests/accounts/test_admin.py`:
- `test_students_get_403`: the PATCH body becomes `{"status": "suspended"}`;
- `test_moderators_see_stats_only` and `test_suspended_staff_lose_their_powers`: the PATCH bodies become
  `{"status": "suspended"}`;
- `test_list_and_search_users`:
  - in the key set, `"role"` becomes `"roles"`;
  - `found(role="moderator")` becomes `found(role="rep")`;
  - `found(q="ali", role="student") == []` becomes `found(q="ali", role="newsletter-manager") == []`;
  - the `"owner"` check stays: an unknown role answers 422.
- Delete `test_change_a_role`. Task 4 tests roles changed through `PUT /admin/users/{id}/roles`.
- `test_both_at_once_and_nothing_at_all` becomes:

```python
def test_nothing_sent_changes_nothing_and_the_same_status_is_not_logged_twice(
    client_for: ClientFor, make_user: MakeUser, admin: User, db: Session
) -> None:
    student = make_user()
    c = client_for(admin)
    assert c.patch(f"{API}/admin/users/{student.id}", json={}).json()["status"] == "active"
    for _ in range(2):
        assert c.patch(f"{API}/admin/users/{student.id}", json={"status": "suspended"}).status_code == 200
    count = len(db.scalars(select(AuditEntry).where(AuditEntry.target_id == str(student.id))).all())
    assert count == 1
```

- `test_admins_cannot_change_themselves`: the bodies become `({"status": "suspended"}, {"email": "new@example.com"})`,
  and the last line becomes `assert access.is_admin(admin)` (import `access` from `app.services`);
- `test_update_errors`: `json={"role": "moderator"}` becomes `json={"status": "suspended"}`, and
  `json={"role": "owner"}` becomes `json={"status": "gone"}`;
- `test_audit_log`:
  - `c.patch(f"{API}/admin/users/{a.id}", json={"role": "moderator"})` becomes
    `c.patch(f"{API}/admin/users/{a.id}", json={"status": "suspended"})`;
  - `("user.role", str(a.id))` becomes `("user.status", str(a.id))`.

Run: `cd api && grep -rn "Role\b\|\.role\b\|\"role\": \"" tests app | grep -v "RoleGrant\|RoleBox\|AccessRole\|RoleRef\|RoleSummary"`
Expected: nothing.

- [ ] **Step 16: Run the new tests, then everything**

Run: `cd api && uv run --no-sync pytest tests/core/test_access_service.py tests/core/test_access_matrix.py tests/community/test_forum_access.py tests/content/test_library_access.py tests/core/test_roles.py tests/core/test_cli.py tests/accounts -q`
Expected: all pass.

Regenerate the contract:

```sh
cd api && uv run --no-sync python -m app.cli openapi > openapi.json && cd ../web && npm run api:types
```

Run: `scripts/check.sh api` (background). Expected: `All checks passed.` `scripts/check.sh web` now fails on the
web app's types, because `role` is gone. The web plan fixes that.

- [ ] **Step 17: Commit**

```bash
git add -A api web/e2e/support.ts web/e2e/auth.setup.ts web/src/api/schema.d.ts
git status --short   # only the files this task lists
git commit -m "People hold roles: access tables in one baseline migration, boxes on every guarded route (R-1)"
```

---

### Task 3: Feature switches on every area, `/me.features` and `GET /features`

**Files:**
- Modify:
  - `api/app/services/access.py`: the switches, `feature_on()`, `require_feature()` and `store_switch()`.
  - `api/app/core/security.py`: `needs_feature()`.
  - `api/app/routers/_base.py`: `router_for(tag, *dependencies)`.
  - `api/app/routers/forum.py`, `library.py`, `newsletter.py`, `calendar.py` and `content.py`: their switches.
  - `api/app/routers/uploads.py` and `reports.py`: switches decided by the request.
  - `api/app/schemas/auth.py` (`Me.features`) and `api/app/services/accounts.py` (`me_out`).
  - `api/app/routers/__init__.py`, to register the new router.
  - `api/tests/conftest.py`: the `set_feature` fixture.
- Create: `api/app/routers/features.py` (`GET /features`) and `api/app/schemas/access.py` gains `FeaturesOut`.
- Test: `api/tests/core/test_switches.py` (new).
- Contract: `api/openapi.json` and `web/src/api/schema.d.ts`.

**Interfaces:**
- **Consumes:** `access_of`, `is_active` and `forget` (Task 2), and `SwitchState`, `feature_on` (as
  `switch_allows`), `known_feature`, `SWITCH_MODES` and `FEATURES` (Task 1).
- **Produces, `app.services.access`:**
  - `switches(db) -> dict[Feature, SwitchState]`;
  - `feature_on(db, user, feature) -> bool` and `features_on(db, user) -> list[Feature]`;
  - `require_feature(db, user, feature) -> None`, which raises 404 `feature_off`;
  - `store_switch(db, feature, mode, role_ids, *, by) -> None`.
- **Produces, elsewhere:**
  - `needs_feature(feature) -> Any` in `app.core.security`;
  - `router_for(tag: str, *dependencies: Any) -> APIRouter`;
  - `Me.features: list[FeatureKey]` and `FeaturesOut(features: list[FeatureKey])`;
  - the fixture `set_feature(feature: str, mode: SwitchMode, roles: Sequence[str] = ())`.

- [ ] **Step 1: Write the failing tests**

Add the `set_feature` fixture to `api/tests/conftest.py`, with `from app.core.access import SwitchMode` at the top:

```python
@pytest.fixture
def set_feature(db: Session) -> Callable[..., None]:
    """set_feature("forum", "off"), or set_feature("calendar", "roles", ["content-manager"]): a switch, committed."""
    from app.core.access import Feature
    from app.services import access

    def _set(feature: str, mode: SwitchMode, roles: Sequence[str] = ()) -> None:
        ids = [r.id for r in (access.role_by_slug(db, slug) for slug in roles) if r is not None]
        access.store_switch(db, Feature(feature), mode, ids, by=None)
        db.commit()

    return _set
```

Create `api/tests/core/test_switches.py`:

```python
"""Feature switches. A feature that is off doesn't exist for guests or students:
- its routes answer 404 feature_off, its feeds and pictures too;
- people can't report into it;
- /me and /features leave it out.

Admins see every feature. "Some roles" shows it to those roles only, and to nobody suspended."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.access import Feature
from app.models import FeatureSwitch, User, UserStatus
from app.services import access
from tests.core.helpers import API, PDF, PNG, image, new_reply, new_thread, share_pdf

ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]
NOTHING = uuid.UUID(int=1)
ADMIN = ("student", "admin")
PDF_UPLOAD = {"purpose": "library", "fileName": "notes.pdf", "contentType": "application/pdf", "sizeBytes": len(PDF)}
PNG_UPLOAD = {"purpose": "forum_image", "fileName": "graph.png", "contentType": "image/png", "sizeBytes": len(PNG)}

SWITCHED: list[tuple[str, str, str]] = [
    ("forum", "GET", "/forum/threads"),
    ("forum", "GET", "/forum/meta"),
    ("forum", "GET", f"/forum/threads/{NOTHING}"),
    ("forum", "POST", "/forum/threads"),
    ("library", "GET", "/library/items"),
    ("library", "GET", "/library/facets"),
    ("library", "GET", f"/library/items/{NOTHING}/download"),
    ("newsletter", "GET", "/newsletter/issues"),
    ("newsletter", "POST", "/newsletter/issues"),
    ("calendar", "GET", "/calendar/events"),
    ("calendar", "GET", "/calendar/feed.ics"),
    ("calendar", "POST", "/calendar/events"),
    ("career", "GET", "/career"),
    ("career", "PUT", "/career"),
]


def off(response: Any) -> bool:
    return bool(response.status_code == 404 and response.json()["error"]["code"] == "feature_off")


@pytest.mark.parametrize(("feature", "method", "path"), SWITCHED, ids=[f"{f}: {m} {p}" for f, m, p in SWITCHED])
def test_a_switched_off_feature_is_gone_except_for_admins(
    feature: str,
    method: str,
    path: str,
    client_for: ClientFor,
    make_user: MakeUser,
    set_feature: Callable[..., None],
) -> None:
    body: dict[str, Any] | None = {} if method in ("POST", "PUT") else None
    student, boss = make_user(name="Sara Student"), make_user(name="Head Admin", roles=ADMIN)
    assert not off(client_for(student).request(method, f"{API}{path}", json=body))
    set_feature(feature, "off")
    assert off(client_for().request(method, f"{API}{path}", json=body))
    assert off(client_for(student).request(method, f"{API}{path}", json=body))
    assert not off(client_for(boss).request(method, f"{API}{path}", json=body))  # admins see every feature


def test_some_roles_only_and_never_while_suspended(
    client_for: ClientFor, make_user: MakeUser, set_feature: Callable[..., None], db: Session
) -> None:
    student, rep = make_user(name="Sara Student"), make_user(name="Maryam Rep", roles=("student", "rep"))
    set_feature("forum", "roles", ["rep"])
    assert client_for(rep).get(f"{API}/forum/threads").status_code == 200
    assert off(client_for(student).get(f"{API}/forum/threads"))
    rep.status = UserStatus.suspended
    db.commit()
    assert off(client_for(rep).get(f"{API}/forum/threads"))  # suspended: like a guest


def test_switching_off_uploads_leaves_the_library_readable(
    client_for: ClientFor, make_user: MakeUser, set_feature: Callable[..., None], storage: Any
) -> None:
    student, boss = make_user(name="Sara Student"), make_user(name="Head Admin", roles=ADMIN)
    published = share_pdf(client_for(boss), storage, title="Published notes")
    set_feature("library.uploads", "off")
    assert off(client_for(student).post(f"{API}/uploads", json=PDF_UPLOAD))
    assert off(client_for(student).post(f"{API}/library/items", json={}))
    assert client_for(student).get(f"{API}/library/items/{published['id']}").status_code == 200
    assert client_for(student).post(f"{API}/uploads", json=PNG_UPLOAD).status_code == 201  # forum pictures still go
    assert client_for(boss).post(f"{API}/uploads", json=PDF_UPLOAD).status_code == 201


def test_forum_pictures_and_reports_follow_their_feature(
    client_for: ClientFor, make_user: MakeUser, set_feature: Callable[..., None], storage: Any
) -> None:
    student = make_user(name="Sara Student")
    path = image(client_for(student), storage)  # its uploader can see it before it's posted
    t = new_thread(client_for(make_user(name="Omar Classmate")), "Report me later")
    assert client_for(student).get(path, follow_redirects=False).status_code == 302
    set_feature("forum", "off")
    assert off(client_for(student).get(path, follow_redirects=False))
    assert off(client_for(student).post(f"{API}/uploads", json=PNG_UPLOAD))
    report = {"targetType": "thread", "targetId": t["id"], "reason": "spam"}
    assert off(client_for(student).post(f"{API}/reports", json=report))


def test_a_notification_into_a_switched_off_feature_still_lists(
    client_for: ClientFor, make_user: MakeUser, set_feature: Callable[..., None]
) -> None:
    student = make_user(name="Sara Student")
    t = new_thread(client_for(student), "Before the switch")
    new_reply(client_for(make_user(name="Replier")), t["id"], "An answer before the switch")
    set_feature("forum", "off")
    links = [n["url"] for n in client_for(student).get(f"{API}/notifications").json()["items"]]
    assert any(link and link.startswith(f"/forum/{t['slug']}") for link in links)
    assert off(client_for(student).get(f"{API}/forum/threads/{t['slug']}"))


def test_me_and_features_list_what_is_on(
    client_for: ClientFor, make_user: MakeUser, set_feature: Callable[..., None], db: Session
) -> None:
    everything = [f.value for f in Feature]
    student, boss = make_user(name="Sara Student"), make_user(name="Head Admin", roles=ADMIN)
    assert client_for(student).get(f"{API}/me").json()["features"] == everything
    assert client_for().get(f"{API}/features").json() == {"features": everything}
    set_feature("calendar", "off")
    without_calendar = [f for f in everything if f != "calendar"]
    assert client_for(student).get(f"{API}/me").json()["features"] == without_calendar
    assert client_for(student).get(f"{API}/features").json() == {"features": without_calendar}
    assert client_for().get(f"{API}/features").json() == {"features": without_calendar}
    assert client_for(boss).get(f"{API}/me").json()["features"] == everything
    db.add(FeatureSwitch(feature="teleport", mode="everyone"))  # a key the code doesn't know
    db.commit()
    access.forget(db)
    assert client_for().get(f"{API}/features").json() == {"features": without_calendar}
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd api && uv run --no-sync pytest tests/core/test_switches.py -q`
Expected: FAIL. `set_feature` errors on `access.store_switch`, which doesn't exist yet.

- [ ] **Step 3: The switches in `api/app/services/access.py`**

Imports:
- extend the `app.core.access` import with `FEATURES`, `SWITCH_MODES`, `Feature`, `SwitchMode`, `SwitchState` and
  `known_feature`, plus `from app.core.access import feature_on as switch_allows`;
- add `feature_off` to the `app.core.errors` import, and `FeatureSwitch` and `FeatureSwitchRole` to the `app.models`
  import;
- add `from app.core.time import utcnow`.

Below `ACCESS_KEY`:

```python
SWITCHES_KEY = "dsba.switches"  # Session.info: {Feature: SwitchState}
MODES: dict[str, SwitchMode] = {m: m for m in SWITCH_MODES}
```

`forget` drops both:

```python
def forget(db: Session) -> None:
    """Drops what this session loaded about roles and switches. Call it after any change to them."""
    db.info.pop(ACCESS_KEY, None)
    db.info.pop(SWITCHES_KEY, None)
```

Add after `role_names`:

```python
def switches(db: Session) -> dict[Feature, SwitchState]:
    """Every switch the code knows. A stored key it doesn't know is ignored, and a missing feature counts as off."""
    cached: dict[Feature, SwitchState] | None = db.info.get(SWITCHES_KEY)
    if cached is not None:
        return cached
    on_for: dict[str, set[uuid.UUID]] = {}
    for key, role_id in db.execute(select(FeatureSwitchRole.feature, FeatureSwitchRole.role_id)):
        on_for.setdefault(key, set()).add(role_id)
    states: dict[Feature, SwitchState] = {}
    for key, stored in db.execute(select(FeatureSwitch.feature, FeatureSwitch.mode)):
        feature, mode = known_feature(key), MODES.get(stored)
        if feature is not None and mode is not None:
            states[feature] = SwitchState(mode, frozenset(on_for.get(key, ())))
    db.info[SWITCHES_KEY] = states
    return states


def feature_on(db: Session, user: User | None, feature: Feature) -> bool:
    return switch_allows(switches(db).get(feature), access_of(user, db), active=is_active(user))


def features_on(db: Session, user: User | None) -> list[Feature]:
    """The features that exist for this person, in the order FEATURES lists them."""
    return [f for f in FEATURES if feature_on(db, user, f)]


def require_feature(db: Session, user: User | None, feature: Feature) -> None:
    """404 feature_off unless `feature` is on for the person (admins see every feature)."""
    if not feature_on(db, user, feature):
        raise feature_off()


def store_switch(
    db: Session, feature: Feature, mode: SwitchMode, role_ids: Iterable[uuid.UUID], *, by: User | None
) -> None:
    """Sets a feature's switch. The roles count only for "roles". No audit: callers record it."""
    now, by_id = utcnow(), by.id if by else None
    db.execute(
        pg_insert(FeatureSwitch)
        .values(feature=feature.value, mode=mode, updated_by=by_id, updated_at=now)
        .on_conflict_do_update(index_elements=["feature"], set_={"mode": mode, "updated_by": by_id, "updated_at": now})
    )
    db.execute(delete(FeatureSwitchRole).where(FeatureSwitchRole.feature == feature.value))
    if mode == "roles":
        db.add_all(FeatureSwitchRole(feature=feature.value, role_id=role_id) for role_id in set(role_ids))
        db.flush()
    forget(db)
```

- [ ] **Step 4: `needs_feature()` and `router_for()`**

In `api/app/core/security.py`, add `Feature` to the `app.core.access` import and `feature_off` to the
`app.core.errors` import, then add after `requires_admin`:

```python
def needs_feature(feature: Feature) -> Any:
    """A route or router dependency: 404 feature_off unless `feature` is on for this person. Admins see every
    feature."""

    def dependency(
        db: Annotated[Session, Depends(get_db)], user: Annotated[User | None, Depends(get_optional_user)]
    ) -> None:
        access.require_feature(db, user, feature)

    return Depends(dependency)
```

Write the whole of `api/app/routers/_base.py`:

```python
from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from app.schemas.common import ErrorResponse

# Every route documents the error shape (see app/core/errors.py).
ERRORS = {code: {"model": ErrorResponse} for code in (400, 401, 403, 404, 409, 422, 429)}


def router_for(tag: str, *dependencies: Any) -> APIRouter:
    """A router for one area. `dependencies` run before every one of its routes, e.g. needs_feature(Feature.forum)."""
    return APIRouter(tags=[tag], responses=ERRORS, dependencies=list(dependencies))  # type: ignore[arg-type]
```

- [ ] **Step 5: Switch each area**

Each router imports `Feature` (next to `Box`) and `needs_feature`.

| Router | Change |
| --- | --- |
| `forum.py` | `router = router_for("forum", needs_feature(Feature.forum))` |
| `library.py` | `router = router_for("library", needs_feature(Feature.library))`. `create_item`'s decorator gains `dependencies=[needs_feature(Feature.library_uploads)]`. |
| `newsletter.py` | `router = router_for("newsletter", needs_feature(Feature.newsletter))` |
| `calendar.py` | `router = router_for("calendar", needs_feature(Feature.calendar))`. The feeds are on this router too. |
| `content.py` | `career` and `update_career` gain `dependencies=[needs_feature(Feature.career)]` in their decorators. Search stays on: Task 6 leaves out what's off. |
| `uploads.py` | `media`'s decorator gains `dependencies=[needs_feature(Feature.forum)]`. |

In `uploads.py`, `create_upload`'s checks become:

```python
    if body.purpose == "library":
        access.require_feature(db, user, Feature.library)
        access.require_feature(db, user, Feature.library_uploads)
        access.require(user, Box.library_upload)
        library.check_pending_room(db, user)  # before the file travels: create_item checks again
    else:
        access.require_feature(db, user, Feature.forum)
        access.require(user, Box.forum_post)
```

and its docstring's errors gain `feature_off (404: the library, its uploads or the forum is switched off)`.

In `reports.py`, add `from app.services import access`. `create_report` takes `db: DB`, which it already has, and
starts with:

```python
    feature = Feature.library if body.target_type == "library_item" else Feature.forum
    access.require_feature(db, user, feature)
```

and its docstring's errors gain `feature_off (404: the forum or the library is switched off)`.

- [ ] **Step 6: `/me.features` and `GET /features`**

`api/app/schemas/access.py` gains:

```python
class FeaturesOut(ApiModel):
    features: list[FeatureKey]  # the features on for whoever asks
```

`api/app/schemas/auth.py`: `Me` gains, after `boxes`:

```python
    features: list[FeatureKey]  # the features on for this person (admins: every feature)
```

and its import becomes `from app.schemas.access import BoxKey, FeatureKey, RoleSummary`.

`api/app/services/accounts.py`, `me_out`:
- add `from sqlalchemy.orm import object_session` to the imports;
- add after `"boxes"`:

```python
            "features": [f.value for f in access.features_on(session, user)] if (session := object_session(user)) else [],
```

Create `api/app/routers/features.py`:

```python
"""Which features are on. Owner: lead."""

from __future__ import annotations

from app.core.security import DB, OptionalUser
from app.routers._base import router_for
from app.schemas.access import FeaturesOut
from app.services import access

router = router_for("features")


@router.get("/features", response_model=FeaturesOut)
def features(db: DB, user: OptionalUser) -> FeaturesOut:
    """The features on for whoever asks: for a guest, those switched on for everyone. Signed in, the same list as
    /me's `features`."""
    return FeaturesOut(features=[f.value for f in access.features_on(db, user)])
```

In `api/app/routers/__init__.py`, add `features` to the import and to the tuple, after `content`.

- [ ] **Step 7: Run the switch tests, then the areas**

First update `test_me` in `tests/accounts/test_me.py`: its expected body gains
`"features": ["forum", "library", "library.uploads", "newsletter", "calendar", "career", "grades", "noora"],`.

Run: `cd api && uv run --no-sync pytest tests/core/test_switches.py tests/core/test_access_service.py tests/accounts/test_me.py -q`
Expected: all pass.

Regenerate the contract:

```sh
cd api && uv run --no-sync python -m app.cli openapi > openapi.json && cd ../web && npm run api:types
```

Run: `scripts/check.sh api` (background). Expected: `All checks passed.`

- [ ] **Step 8: Commit**

```bash
git add api/app api/tests api/openapi.json web/src/api/schema.d.ts
git commit -m "Feature switches on every area; /me.features and GET /features (R-10)"
```

---

### Task 4: The admin API: roles, people's roles and switches

**Files:**
- Create:
  - `api/app/services/roles.py`: the changes admins make.
  - `api/app/routers/access.py`: `/admin/roles` and `/admin/features`.
- Modify:
  - `api/app/schemas/access.py`: the admin shapes.
  - `api/app/routers/admin.py`: `PUT /admin/users/{user_id}/roles`.
  - `api/app/routers/__init__.py`: register `access`.
- Test: `api/tests/accounts/test_access_admin.py` (new).
- Contract: `api/openapi.json` and `web/src/api/schema.d.ts`.

**Interfaces:**
- **Consumes:**
  - from `app.services.access`: `access_of`, `role_by_slug`, `role_names`, `set_roles`, `ensure_admins_remain`,
    `switches`, `store_switch` and `forget`;
  - `requires_admin()`, `admin_user()` and `accounts.role_summaries()` (Task 2);
  - `unique_slug()` from `app.core.text`, and `record()`, `notify()` and `ratelimit.enforce()`.
- **Produces, `app.services.roles`:**
  - `catalogue(db) -> RoleCatalogue`;
  - `create_role(db, admin, body: RoleCreate, ip) -> AccessRole`;
  - `update_role(db, admin, role_id, body: RoleUpdate, ip) -> AccessRole`;
  - `delete_role(db, admin, role_id, ip) -> None`;
  - `role_out(db, role) -> RoleOut`;
  - `set_user_roles(db, admin, target, role_ids: Sequence[uuid.UUID], ip) -> None`;
  - `switch_list(db) -> list[FeatureOut]` and `set_switch(db, admin, feature, body: SwitchUpdate, ip) -> FeatureOut`.
- **Produces, `app.schemas.access`:** `BoxOut`, `RoleOut`, `RoleCatalogue`, `RoleCreate`, `RoleUpdate`,
  `UserRolesUpdate`, `FeatureOut` and `SwitchUpdate`.

- [ ] **Step 1: Write the failing tests**

Create `api/tests/accounts/test_access_admin.py`:

```python
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
from app.models import AccessRole, AuditEntry, Notification, RoleBox, User
from app.schemas.access import RoleUpdate
from app.services import access, roles
from tests.accounts.conftest import API

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
    assert [r["slug"] for r in catalogue["roles"]] == ["admin", "rep", "student", "newsletter-manager", "content-manager", "events-team"]
    assert next(r for r in catalogue["roles"] if r["slug"] == "events-team")["holders"] == 1
    assert len(catalogue["boxes"]) == len(Box)
    assert catalogue["boxes"][0] == {"key": "forum.post", "area": "Forum", "label": "Start threads, reply, vote, accept answers and edit your own posts"}


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
        ("DELETE", f"/admin/roles/{everything.id}", None),
        ("PUT", f"/admin/users/{climber.id}/roles", {"roleIds": [admin_role]}),
        ("PUT", f"/admin/users/{sara.id}/roles", {"roleIds": [admin_role]}),
        ("GET", "/admin/features", None),
        ("PUT", "/admin/features/forum", {"mode": "off"}),
    ]:
        r = c.request(method, f"{API}{path}", json=body)
        assert (r.status_code, r.json()["error"]["message"]) == (403, "Only admins can do this."), (method, path)
    access.forget(db)
    assert access.access_of(climber).slugs == ("student", "everything")
    assert not access.access_of(sara).admin
    assert access.feature_on(db, None, Feature.forum)
    assert access.role_by_slug(db, "climbers") is None


def test_nobody_changes_their_own_roles(client_for: ClientFor, boss: User, db: Session) -> None:
    r = client_for(boss).put(f"{API}/admin/users/{boss.id}/roles", json={"roleIds": [role_id(db, "student")]})
    assert (r.status_code, r.json()["error"]["code"]) == (409, "cannot_change_self")
    assert access.is_admin(boss)


def test_admins_flip_switches(client_for: ClientFor, make_user: MakeUser, boss: User, db: Session) -> None:
    c = client_for(boss)
    listed = c.get(f"{API}/admin/features").json()
    assert [f["feature"] for f in listed] == [f.value for f in Feature]
    assert listed[0] == {"feature": "forum", "label": "Forum", "hides": "Every thread, reply and forum picture.", "mode": "everyone", "roleIds": []}
    some = c.put(f"{API}/admin/features/calendar", json={"mode": "roles", "roleIds": [role_id(db, "rep")]})
    assert some.status_code == 200, some.text
    assert (some.json()["mode"], some.json()["roleIds"]) == ("roles", [role_id(db, "rep")])
    assert not access.feature_on(db, make_user(name="Sara Student"), Feature.calendar)
    entry = db.scalar(select(AuditEntry).where(AuditEntry.action == "feature.switch"))
    assert entry is not None
    assert entry.data == {"feature": "calendar", "from": "everyone", "to": "roles", "roles": ["Rep"], "actorName": "Head Admin"}
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
        assert actor is not None and target is not None
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
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd api && uv run --no-sync pytest tests/accounts/test_access_admin.py -q`
Expected: FAIL at collection. `app.services.roles` and `RoleUpdate` don't exist yet.

- [ ] **Step 3: The shapes, appended to `api/app/schemas/access.py`**

Add the imports `from typing import Annotated, Literal`, `from pydantic import Field, StringConstraints` and
`from app.core.access import SwitchMode`, then:

```python
RoleName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=40)]
Badge = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=24)]


class BoxOut(ApiModel):
    key: BoxKey
    area: str
    label: str


class RoleOut(ApiModel):
    id: UUID
    slug: str
    name: str
    badge: str | None
    position: int
    built_in: bool  # can't be deleted
    locked: bool  # can't be changed (Admin)
    version: int  # send it back when editing: a role changed since answers 409 role_changed
    boxes: list[BoxKey]  # Admin: every box
    holders: int


class RoleCatalogue(ApiModel):
    roles: list[RoleOut]  # Admin, Rep, then the others in their order
    boxes: list[BoxOut]  # every box, grouped by area for the checkboxes


class RoleCreate(ApiModel):
    name: RoleName
    badge: Badge | None = None
    boxes: list[BoxKey] = []


class RoleUpdate(ApiModel):
    """Only the fields sent change; `badge: null` removes the badge, and `boxes` replaces them as a whole."""

    version: int
    name: RoleName | None = None
    badge: Badge | None = None
    boxes: list[BoxKey] | None = None
    position: Annotated[int, Field(ge=0, le=1000)] | None = None


class UserRolesUpdate(ApiModel):
    role_ids: list[UUID]  # exactly the roles the person holds afterwards


class FeatureOut(ApiModel):
    feature: FeatureKey
    label: str
    hides: str  # what switching it off hides
    mode: SwitchMode
    role_ids: list[UUID]  # for "roles"


class SwitchUpdate(ApiModel):
    mode: SwitchMode
    role_ids: list[UUID] = []
```

- [ ] **Step 4: The service: `api/app/services/roles.py`**

```python
"""What admins change on the Access screen: roles, people's roles and the feature switches. Each change is audited,
limited to 60 per admin per 10 minutes, and told to the people it touches."""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import timedelta
from typing import Any, cast

from sqlalchemy import CursorResult, delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.access import ADMIN, BOXES, FEATURES, REP, Box, Feature, known_boxes
from app.core.errors import conflict, invalid, not_found
from app.core.text import unique_slug
from app.core.time import utcnow
from app.models import AccessRole, AuditEntry, RoleBox, RoleGrant, User
from app.schemas.access import BoxOut, FeatureOut, RoleCatalogue, RoleCreate, RoleOut, RoleUpdate, SwitchUpdate
from app.services import access, ratelimit
from app.services.audit import record
from app.services.notify import notify

ACTIONS = ("role.create", "role.update", "role.delete", "user.roles", "feature.switch")
CHANGES_LIMIT = 60
CHANGES_WINDOW = timedelta(minutes=10)
UNKNOWN_ROLE = "One of these roles doesn't exist. Reload the page and try again."


def limit_changes(db: Session, admin: User) -> None:
    """429 after 60 changes to roles, people's roles and switches by this admin in 10 minutes."""
    ratelimit.enforce(
        db,
        f"access-admin:{admin.id}",
        AuditEntry.created_at,
        [AuditEntry.actor_id == admin.id, AuditEntry.action.in_(ACTIONS)],
        limit=CHANGES_LIMIT,
        window=CHANGES_WINDOW,
        message="That's a lot of changes at once. Try again in {}.",
    )


# ── roles ───────────────────────────────────────────────────────────────────────────────────


def _stored_boxes(db: Session, role_ids: Sequence[uuid.UUID]) -> dict[uuid.UUID, list[str]]:
    found: dict[uuid.UUID, list[str]] = {}
    for role_id, box in db.execute(select(RoleBox.role_id, RoleBox.box).where(RoleBox.role_id.in_(role_ids))):
        found.setdefault(role_id, []).append(box)
    return found


def _boxes(role: AccessRole, stored: Sequence[str]) -> list[Box]:
    """The boxes a role gives: every box for Admin; otherwise the stored ones the code knows, in BOXES order."""
    held = frozenset(Box) if role.slug == ADMIN else known_boxes(stored)
    return [b for b in BOXES if b in held]


def _out(role: AccessRole, stored: Sequence[str], holders: int) -> RoleOut:
    return RoleOut(
        id=role.id,
        slug=role.slug,
        name=role.name,
        badge=role.badge,
        position=role.position,
        built_in=role.built_in,
        locked=role.locked,
        version=role.version,
        boxes=[b.value for b in _boxes(role, stored)],
        holders=holders,
    )


def _ordered(db: Session) -> list[AccessRole]:
    """Admin, Rep, then the others by position and name."""
    roles = db.scalars(select(AccessRole)).all()
    first = {ADMIN: 0, REP: 1}
    return sorted(roles, key=lambda r: (first.get(r.slug, 2), r.position, r.name.casefold()))


def catalogue(db: Session) -> RoleCatalogue:
    roles = _ordered(db)
    stored = _stored_boxes(db, [r.id for r in roles])
    holders = dict(db.execute(select(RoleGrant.role_id, func.count()).group_by(RoleGrant.role_id)).tuples().all())
    return RoleCatalogue(
        roles=[_out(r, stored.get(r.id, []), holders.get(r.id, 0)) for r in roles],
        boxes=[BoxOut(key=b.value, area=info.area, label=info.label) for b, info in BOXES.items()],
    )


def role_out(db: Session, role: AccessRole) -> RoleOut:
    holders = db.scalar(select(func.count()).select_from(RoleGrant).where(RoleGrant.role_id == role.id)) or 0
    return _out(role, _stored_boxes(db, [role.id]).get(role.id, []), holders)


def _check_name(db: Session, name: str, *, other_than: uuid.UUID | None = None) -> None:
    taken = select(AccessRole.id).where(func.lower(AccessRole.name) == name.lower())
    if other_than is not None:
        taken = taken.where(AccessRole.id != other_than)
    if db.scalar(taken) is not None:
        raise invalid("name", "Another role already has this name.")


def _snapshot(db: Session, role: AccessRole) -> dict[str, Any]:
    stored = _stored_boxes(db, [role.id]).get(role.id, [])
    return {"name": role.name, "badge": role.badge, "position": role.position, "boxes": sorted(stored)}


def create_role(db: Session, admin: User, body: RoleCreate, ip: str | None) -> AccessRole:
    """A new role, last in the order. Its slug comes from its name."""
    limit_changes(db, admin)
    _check_name(db, body.name)
    position = (db.scalar(select(func.max(AccessRole.position))) or 0) + 1
    role = AccessRole(
        slug=unique_slug(db, AccessRole.slug, body.name, fallback="role"),
        name=body.name,
        badge=body.badge,
        position=position,
    )
    try:
        with db.begin_nested():
            db.add(role)
            db.flush()
    except IntegrityError:  # the same name or slug, taken a moment ago
        raise invalid("name", "Another role already has this name.") from None
    boxes = sorted(set(body.boxes))
    db.add_all(RoleBox(role_id=role.id, box=box) for box in boxes)
    db.flush()
    record(db, admin, "role.create", "role", role.id, {"name": role.name, "badge": role.badge, "boxes": boxes}, ip)
    access.forget(db)
    return role


def update_role(db: Session, admin: User, role_id: uuid.UUID, body: RoleUpdate, ip: str | None) -> AccessRole:
    """Changes a role, if nobody changed it since the admin loaded `body.version`: one conditional UPDATE bumps the
    version, so of two saves of the same version, the second gets 409 role_changed."""
    limit_changes(db, admin)
    role = db.get(AccessRole, role_id)
    if role is None:
        raise not_found("This role doesn't exist.")
    if role.locked:
        raise conflict("role_locked", "The Admin role holds every power, and can't be changed.")
    sent = body.model_fields_set
    before = _snapshot(db, role)
    changes: dict[str, Any] = {}
    if "name" in sent and body.name is not None and body.name != role.name:
        _check_name(db, body.name, other_than=role.id)
        changes["name"] = body.name
    if "badge" in sent and body.badge != role.badge:
        changes["badge"] = body.badge
    if "position" in sent and body.position is not None and body.position != role.position:
        changes["position"] = body.position
    boxes = sorted(set(body.boxes)) if "boxes" in sent and body.boxes is not None else None
    if not changes and (boxes is None or boxes == before["boxes"]):
        return role
    bumped = cast(
        CursorResult[Any],
        db.execute(
            update(AccessRole)
            .where(AccessRole.id == role.id, AccessRole.version == body.version)
            .values(version=AccessRole.version + 1, updated_at=utcnow(), **changes)
            .execution_options(synchronize_session=False)
        ),
    )
    if bumped.rowcount == 0:
        raise conflict("role_changed", "Someone else changed this role while you were editing. Load it again.")
    if boxes is not None:
        db.execute(delete(RoleBox).where(RoleBox.role_id == role.id))
        db.add_all(RoleBox(role_id=role.id, box=box) for box in boxes)
    db.flush()
    db.refresh(role)
    record(db, admin, "role.update", "role", role.id, {"before": before, "after": _snapshot(db, role)}, ip)
    access.forget(db)
    return role


def delete_role(db: Session, admin: User, role_id: uuid.UUID, ip: str | None) -> None:
    """Deletes a role that isn't built in. Its holders lose it and are told."""
    limit_changes(db, admin)
    role = db.get(AccessRole, role_id)
    if role is None:
        raise not_found("This role doesn't exist.")
    if role.built_in:
        raise conflict("role_locked", "Built-in roles can't be deleted. Take their boxes away instead.")
    holders = db.scalars(select(RoleGrant.user_id).where(RoleGrant.role_id == role.id)).all()
    record(db, admin, "role.delete", "role", role.id, {"name": role.name, "holders": len(holders)}, ip)
    for user_id in holders:
        body = f"The {role.name} role was removed from the hub."
        notify(db, user_id, "system", "Your roles changed", body=body, actor=admin)
    db.delete(role)
    db.flush()
    access.forget(db)


def set_user_roles(db: Session, admin: User, target: User, role_ids: Sequence[uuid.UUID], ip: str | None) -> None:
    """The person holds exactly these roles afterwards. Nobody changes their own, and the last active admin keeps
    Admin."""
    limit_changes(db, admin)
    if target.id == admin.id:
        raise conflict("cannot_change_self", "You can't change your own roles. Ask another admin.")
    wanted = set(role_ids)
    roles = db.scalars(select(AccessRole).where(AccessRole.id.in_(wanted))).all() if wanted else []
    if len(roles) != len(wanted):
        raise invalid("roleIds", UNKNOWN_ROLE)
    before = access.role_names(target)
    if access.access_of(target, db).admin and all(r.slug != ADMIN for r in roles):
        access.ensure_admins_remain(db, target)
    access.set_roles(db, target, roles, by=admin)
    after = access.role_names(target)
    if after == before:
        return
    record(db, admin, "user.roles", "user", target.id, {"from": before, "to": after}, ip)
    held = ", ".join(after) if after else "no roles"
    notify(db, target.id, "system", "Your roles changed", body=f"You now hold: {held}.", actor=admin)


# ── switches ────────────────────────────────────────────────────────────────────────────────


def _switch_out(db: Session, feature: Feature) -> FeatureOut:
    state = access.switches(db).get(feature)
    return FeatureOut(
        feature=feature.value,
        label=FEATURES[feature].label,
        hides=FEATURES[feature].hides,
        mode=state.mode if state else "off",
        role_ids=sorted(state.role_ids) if state else [],
    )


def switch_list(db: Session) -> list[FeatureOut]:
    return [_switch_out(db, f) for f in FEATURES]


def set_switch(db: Session, admin: User, feature: Feature, body: SwitchUpdate, ip: str | None) -> FeatureOut:
    limit_changes(db, admin)
    wanted = set(body.role_ids) if body.mode == "roles" else set()
    if body.mode == "roles" and not wanted:
        raise invalid("roleIds", "Choose at least one role.")
    roles = db.scalars(select(AccessRole).where(AccessRole.id.in_(wanted))).all() if wanted else []
    if len(roles) != len(wanted):
        raise invalid("roleIds", UNKNOWN_ROLE)
    state = access.switches(db).get(feature)
    access.store_switch(db, feature, body.mode, wanted, by=admin)
    change = {
        "feature": feature.value,
        "from": state.mode if state else "off",
        "to": body.mode,
        "roles": sorted(r.name for r in roles),
    }
    record(db, admin, "feature.switch", "feature", feature.value, change, ip)
    return _switch_out(db, feature)
```

- [ ] **Step 5: The routes**

Create `api/app/routers/access.py`:

```python
"""Roles and feature switches, for admins (the Access screen). Owner: lead."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import Request, Response, status

from app.core.access import Feature
from app.core.security import DB, client_ip, requires_admin
from app.models import User
from app.routers._base import router_for
from app.schemas.access import FeatureKey, FeatureOut, RoleCatalogue, RoleCreate, RoleOut, RoleUpdate, SwitchUpdate
from app.services import roles

router = router_for("access")

AdminOnly = Annotated[User, requires_admin()]


@router.get("/admin/roles", response_model=RoleCatalogue)
def list_roles(user: AdminOnly, db: DB) -> RoleCatalogue:
    """Every role with its boxes and how many people hold it, and every box with its area and label."""
    return roles.catalogue(db)


@router.post("/admin/roles", response_model=RoleOut, status_code=status.HTTP_201_CREATED)
def create_role(body: RoleCreate, request: Request, user: AdminOnly, db: DB) -> RoleOut:
    """Errors: invalid_input (422: another role has this name), rate_limited (429). Audited."""
    role = roles.create_role(db, user, body, client_ip(request))
    db.commit()
    return roles.role_out(db, role)


@router.patch("/admin/roles/{role_id}", response_model=RoleOut)
def update_role(role_id: UUID, body: RoleUpdate, request: Request, user: AdminOnly, db: DB) -> RoleOut:
    """Send the `version` you loaded. Errors: role_locked (409: Admin), role_changed (409: changed since you loaded
    it), invalid_input (422), rate_limited (429). Audited."""
    role = roles.update_role(db, user, role_id, body, client_ip(request))
    db.commit()
    return roles.role_out(db, role)


@router.delete("/admin/roles/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_role(role_id: UUID, request: Request, user: AdminOnly, db: DB) -> Response:
    """Its holders lose it and are told. Errors: role_locked (409: a built-in role), rate_limited (429). Audited."""
    roles.delete_role(db, user, role_id, client_ip(request))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/admin/features", response_model=list[FeatureOut])
def list_features(user: AdminOnly, db: DB) -> list[FeatureOut]:
    return roles.switch_list(db)


@router.put("/admin/features/{feature}", response_model=FeatureOut)
def set_feature(feature: FeatureKey, body: SwitchUpdate, request: Request, user: AdminOnly, db: DB) -> FeatureOut:
    """Off, on for some roles (`roleIds`), or on for everyone. Errors: invalid_input (422: no roles, or a role that
    doesn't exist), rate_limited (429). Audited."""
    out = roles.set_switch(db, user, Feature(feature), body, client_ip(request))
    db.commit()
    return out
```

In `api/app/routers/__init__.py`, add `access` to the import and to the tuple, after `admin`.

In `api/app/routers/admin.py`:
- add `requires_admin` to the security import and `UserRolesUpdate` from `app.schemas.access`;
- add `from app.services import roles` (merge with the existing `app.services` import);
- add the route:

```python
@router.put("/admin/users/{user_id}/roles", response_model=AdminUser)
def set_user_roles(
    user_id: UUID, body: UserRolesUpdate, request: Request, user: Annotated[User, requires_admin()], db: DB
) -> AdminUser:
    """The roles the person holds afterwards, exactly. They're told. Errors: cannot_change_self (409), last_admin
    (409: the only active admin keeps Admin), invalid_input (422: a role that doesn't exist), rate_limited (429).
    Audited."""
    target = db.get(User, user_id)
    if target is None:
        raise not_found("This account doesn't exist.")
    roles.set_user_roles(db, user, target, body.role_ids, client_ip(request))
    db.commit()
    return admin_user(target, contacts=True)
```

- [ ] **Step 6: Run the tests, regenerate the contract, check everything**

Run: `cd api && uv run --no-sync pytest tests/accounts/test_access_admin.py tests/accounts/test_admin.py tests/core/test_access_matrix.py -q`
Expected: all pass.

```sh
cd api && uv run --no-sync python -m app.cli openapi > openapi.json && cd ../web && npm run api:types
```

Run: `scripts/check.sh api` (background). Expected: `All checks passed.`

- [ ] **Step 7: Commit**

```bash
git add api/app api/tests/accounts/test_access_admin.py api/openapi.json web/src/api/schema.d.ts
git commit -m "Admin API: roles, people's roles and switches, audited, rate-limited and race-safe (R-1, R-10)"
```

---

### Task 5: Lists load their people's roles in one go

`public_user()` reads each person's badge through `access.access_of()`, which loads one person at a time. A list of 20
threads by 20 authors would make 40 extra queries. Every list that shows people loads their roles first with
`access.prefetch()`.

**Files:**
- Modify:
  - `api/app/services/forum/queries.py`: thread lists and the week's top contributors.
  - `api/app/services/forum/views.py`: a thread's replies.
  - `api/app/services/library.py`: `to_out`.
  - `api/app/services/reports.py`: `_users`.
  - `api/app/routers/admin.py`: `list_users` and `audit_log`.
  - `api/app/routers/notifications.py`: the list's actors.
- Test: `api/tests/core/test_query_counts.py` (new).

**Interfaces:**
- **Consumes:** `access.prefetch(db, users)` and `access.forget(db)` (Task 2).
- **Produces:** nothing new. The lists' query counts stop growing with their number of people.

- [ ] **Step 1: Write the failing test**

Create `api/tests/core/test_query_counts.py`:

```python
"""Lists that show people (threads, replies, library files) load those people's roles in one go: the number of
queries doesn't grow with the number of authors."""

from __future__ import annotations

from collections.abc import Callable, Iterator
from contextlib import contextmanager
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import Engine, event
from sqlalchemy.orm import Session

from app.models import User
from app.services import access
from tests.core.helpers import API, new_reply, new_thread, share_pdf

ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]


@contextmanager
def counting(engine: Engine) -> Iterator[list[str]]:
    seen: list[str] = []

    def count(conn: Any, cursor: Any, statement: str, *args: Any) -> None:
        seen.append(statement)

    event.listen(engine, "before_cursor_execute", count)
    try:
        yield seen
    finally:
        event.remove(engine, "before_cursor_execute", count)


def queries(engine: Engine, db: Session, c: TestClient, path: str) -> int:
    access.forget(db)  # nothing loaded before the request: every author's roles are read in it
    with counting(engine) as seen:
        assert c.get(f"{API}{path}").status_code == 200
    return len(seen)


def test_thread_lists_and_replies(client_for: ClientFor, make_user: MakeUser, engine: Engine, db: Session) -> None:
    reader = client_for(make_user(name="Reader"))
    t = new_thread(client_for(make_user(name="Asker")), "Many voices")
    for i in range(2):
        new_thread(client_for(make_user(name=f"Author {i}")), f"Thread {i}")
        new_reply(client_for(make_user(name=f"Replier {i}")), t["id"], f"Reply {i}")
    few = (queries(engine, db, reader, "/forum/threads"), queries(engine, db, reader, f"/forum/threads/{t['slug']}"))
    for i in range(2, 6):
        new_thread(client_for(make_user(name=f"Author {i}")), f"Thread {i}")
        new_reply(client_for(make_user(name=f"Replier {i}")), t["id"], f"Reply {i}")
    many = (queries(engine, db, reader, "/forum/threads"), queries(engine, db, reader, f"/forum/threads/{t['slug']}"))
    assert many == few


def test_library_lists(
    client_for: ClientFor, make_user: MakeUser, engine: Engine, db: Session, storage: Any
) -> None:
    reader = client_for(make_user(name="Reader"))
    for i in range(2):
        share_pdf(client_for(make_user(name=f"Sharer {i}", roles=("student", "rep"))), storage, title=f"Notes {i}")
    few = queries(engine, db, reader, "/library/items")
    for i in range(2, 6):
        share_pdf(client_for(make_user(name=f"Sharer {i}", roles=("student", "rep"))), storage, title=f"Notes {i}")
    assert queries(engine, db, reader, "/library/items") == few
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd api && uv run --no-sync pytest tests/core/test_query_counts.py -q`
Expected: FAIL. `many` is larger than `few`, by two queries per extra author.

- [ ] **Step 3: Prefetch in every list that shows people**

In each place below, import `from app.services import access` (merging with an existing `app.services` import) and
call `access.prefetch(db, …)` with the list's people, after their rows are fetched and before `public_user()` or
`admin_user()` runs on them:

| Where | Change |
| --- | --- |
| `library.py`, `to_out` | after `users = {u.id: u for u in ...}`: `access.prefetch(db, users.values())` |
| `reports.py`, `_users` | build the dict as `found`, call `access.prefetch(db, found.values())`, return `found` |
| `admin.py`, `list_users` | `users = db.scalars(...).all()`, then `access.prefetch(db, users)` |
| `admin.py`, `audit_log` | end the query with `.tuples().all()` so the rows can be read twice, then `access.prefetch(db, [a for _, a in rows])` |
| `notifications.py`, the list route | the same as `audit_log`, for its `actor` alias |
| `forum/queries.py`, every `rows = db.execute(summary_select(viewer)...).all()` (the thread lists; each row is `(ForumThread, User \| None, year, voted)`) | on the next line: `access.prefetch(db, [row[1] for row in rows])` |
| `forum/queries.py`, the top contributors (`rows = db.execute(select(User, per_author.c.replies, ...)).all()`) | on the next line: `access.prefetch(db, [row[0] for row in rows])` |
| `forum/views.py`, `thread_detail`, after the `rows = [(r, a) for r, a in db.execute(select(ForumReply, User)...)]` list | `access.prefetch(db, [author, *(a for _, a in rows)])`. `author` is the thread's, loaded at the top of the function. |

A fetched list of rows can only be read once while it's an iterator. Call `.all()` on it first.

- [ ] **Step 4: Run the test, then the areas**

Run: `cd api && uv run --no-sync pytest tests/core/test_query_counts.py tests/community tests/content tests/accounts -q`
Expected: all pass.

Run: `scripts/check.sh api` (background). Expected: `All checks passed.`

- [ ] **Step 5: Commit**

```bash
git add api/app api/tests/core/test_query_counts.py
git commit -m "Lists load their people's roles in one go (no query per author)"
```

---

### Task 6: Search leaves out switched-off features

**Files:**
- Modify:
  - `api/app/services/search.py`: `run_search` takes the viewer.
  - `api/app/routers/content.py`: `search` passes it.
- Test: `api/tests/content/test_search.py` (one new test).

**Interfaces:**
- **Consumes:** `access.feature_on(db, user, feature)` (Task 3).
- **Produces:**
  `run_search(db: Session, q: str, types: list[SearchType] | None, limit: int, viewer: User | None) -> SearchResults`.

- [ ] **Step 1: Write the failing test**

Append to `api/tests/content/test_search.py`, adding the imports it needs (`datetime`, `CalendarEvent`, `User`):

```python
def test_search_leaves_out_what_is_switched_off(
    client_for: Callable[..., TestClient],
    make_user: Callable[..., User],
    set_feature: Callable[..., None],
    db: Session,
) -> None:
    from tests.core.helpers import new_thread

    db.add(CalendarEvent(id="2026-11-01-st2133-exam", date=datetime.date(2026, 11, 1), title="ST2133 exam", type="exam"))
    db.commit()
    student, boss = make_user(name="Sara Student"), make_user(name="Head Admin", roles=("student", "admin"))
    new_thread(client_for(student), "Past papers please", title="ST2133 revision plan")

    def found(person: User | None) -> tuple[int, int]:
        r = client_for(person).get(f"{API}/search", params={"q": "ST2133"}).json()
        return len(r["threads"]), len(r["events"])

    assert found(student) == (1, 1)
    set_feature("calendar", "off")
    set_feature("forum", "roles", ["rep"])
    assert found(student) == (0, 0)
    assert found(None) == (0, 0)
    assert found(boss) == (1, 1)  # admins see every feature
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd api && uv run --no-sync pytest tests/content/test_search.py -q -k switched_off`
Expected: FAIL. `assert (1, 1) == (0, 0)`: search still finds both.

- [ ] **Step 3: Pass the viewer, and drop what's off**

In `api/app/services/search.py`:
- add `from app.core.access import Feature`, `from app.models import User` (merge with the existing `app.models`
  import) and `from app.services import access`;
- add below `ALL_TYPES`:

```python
# The feature each type of result belongs to (modules belong to none: the hub itself).
TYPE_FEATURES: dict[SearchType, Feature] = {
    "thread": Feature.forum,
    "library": Feature.library,
    "issue": Feature.newsletter,
    "event": Feature.calendar,
}
```

- then change `run_search`'s signature and its first line:

```python
def run_search(db: Session, q: str, types: list[SearchType] | None, limit: int, viewer: User | None) -> SearchResults:
    want = {
        t for t in (types or ALL_TYPES) if t not in TYPE_FEATURES or access.feature_on(db, viewer, TYPE_FEATURES[t])
    }
```

In `api/app/routers/content.py`, `search` returns `run_search(db, q, types, limit, user)`. It already takes
`user: OptionalUser`. Its docstring gains "Features switched off for the viewer are left out."

- [ ] **Step 4: Run the search tests, regenerate the contract, check everything**

Run: `cd api && uv run --no-sync pytest tests/content/test_search.py -q`
Expected: all pass.

The docstring changed, so regenerate the contract:

```sh
cd api && uv run --no-sync python -m app.cli openapi > openapi.json && cd ../web && npm run api:types
```

Run: `scripts/check.sh api` (background). Expected: `All checks passed.`

- [ ] **Step 5: Commit**

```bash
git add api/app/services/search.py api/app/routers/content.py api/tests/content/test_search.py api/openapi.json web/src/api/schema.d.ts
git commit -m "Search leaves out features switched off for the viewer (R-10)"
```

---

### Task 7: The decisions and the docs

**Files:**
- Modify:
  - `docs/backend/ARCHITECTURE.md`: decisions D11 to D13, plus the lines about `set-role` and `dev-login`.
  - `docs/backend/DEPLOYMENT.md`: the first admin.
  - `README.md`: the first admin.

**Interfaces:**
- **Consumes:** everything above.
- **Produces:** docs that match the code. No code changes.

- [ ] **Step 1: Add the decisions to the end of `docs/backend/ARCHITECTURE.md`**

```markdown
## Round 4 decisions

- **D11 Access is by boxes, and roles are data.**
  - A box is one power, such as `newsletter.manage`. The code checks boxes, never role names.
  - A role is a named set of boxes that admins edit on the Access screen. A person may hold several roles.
  - Admin holds every box. A few powers stay with Admin and are no box: editing roles, giving roles, flipping
    switches, account recovery, seeing who reported something, and suspending an admin.
  - A suspended account holds no boxes. The last active admin can't lose Admin.
- **D12 Feature switches live in the hub.** Each feature is off, on for some roles, or on for everyone, and admins
  flip it on the Access screen. The API enforces it: a switched-off feature answers 404 `feature_off`, and search
  leaves it out. Admins see every feature, so they can try one before switching it on.
- **D13 PostHog stays anonymous analytics.** Its own feature flags stay off. Switches reach it only as the list of
  features on during a visit, set by the web app.
```

- [ ] **Step 2: Bring the commands up to date**

| File | Line | Change |
| --- | --- | --- |
| `docs/backend/ARCHITECTURE.md` | 38 | "`python -m app.cli set-role` changes a role from the shell" becomes "`python -m app.cli set-role ID ROLE...` sets someone's roles from the shell (slugs, such as `student admin`)". |
| `docs/backend/ARCHITECTURE.md` | 226 | `[--role moderator]` becomes `[--role rep]`. |
| `docs/backend/DEPLOYMENT.md` | 90 | `set-role you@example.com admin` becomes `set-role you@example.com student admin`. |
| `docs/backend/DEPLOYMENT.md` | 96 | It now says: "`DSBA_ADMIN_IDENTIFIERS` gives the Admin role, when they first sign in, to the people listed there. `set-role` sets exactly the roles you name, and writes an audit entry." |
| `README.md` | 31 | `set-role you@example.com admin` becomes `set-role you@example.com student admin`. |

Then run: `grep -rn "moderator" docs/backend README.md CLAUDE.md`
- **Expected:** only mentions of moderating, the activity. The role is called Rep.
- **Fix any line that names "moderator" as a role.** Leave `docs/reviews/` alone: they record what the reviewers
  found at the time.

- [ ] **Step 3: The last check of the API side**

Run: `scripts/check.sh api` (background). Expected: `All checks passed.`

Run: `scripts/check.sh web` (background). Expected: it fails on types, because the web app still reads `role`. That's
the web plan's first task, and the branch doesn't merge until it passes.

- [ ] **Step 4: Commit**

```bash
git add docs/backend/ARCHITECTURE.md docs/backend/DEPLOYMENT.md README.md
git commit -m "Decisions D11-D13: access by boxes, feature switches in the hub, PostHog stays anonymous"
```
