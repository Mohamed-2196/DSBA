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
    content_edit = "content.edit"
    requests_manage = "requests.manage"
    summary_share = "summary.share"
    stats_view = "stats.view"
    people_suspend = "people.suspend"
    audit_read = "audit.read"


# The boxes Student may hold. Every new account gets Student, so a manager box there would go to anyone who signs up
# (security review AD-3).
STUDENT_BOXES = frozenset({Box.forum_post, Box.library_upload, Box.newsletter_react, Box.reports_create})


class Feature(enum.StrEnum):
    forum = "forum"
    library = "library"
    library_uploads = "library.uploads"  # uploads only: the library stays readable
    newsletter = "newsletter"
    calendar = "calendar"
    career = "career"
    grades = "grades"  # the web app's grades calculator: nothing in the API
    noora = "noora"  # Mini Noora, in the web app: nothing in the API
    noora_ai = "noora.ai"  # her answers from Claude (Mini Noora stays scripted without it)
    notes = "notes"  # each student's private notes
    board = "board"  # each student's private study board
    requests = "requests"
    summary = "summary"  # the Sunday summary email, and its text for a year's group


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
    Box.content_edit: BoxInfo(
        "Modules",
        "Add, edit, reorder, hide and remove modules, chapters and lessons",
        "Only people who edit modules and lessons can do this.",
    ),
    Box.requests_manage: BoxInfo(
        "Requests",
        "Answer and remove students' requests, and handle reports about them",
        "Only people who handle requests can do this.",
    ),
    Box.summary_share: BoxInfo(
        "Sunday summary",
        "See a year's Sunday summary, to paste into its group",
        "Only people who share the Sunday summary can do this.",
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
    Feature.noora_ai: FeatureInfo(
        "Mini Noora's AI answers", "Her answers from Claude. She answers from her script instead."
    ),
    Feature.notes: FeatureInfo("Notes", "Students' private notes. They're kept, and come back when it's on again."),
    Feature.board: FeatureInfo("Study board", "Each student's study board, and the add-to-board buttons."),
    Feature.requests: FeatureInfo("Requests", "Students' requests, their me-toos and the answers."),
    Feature.summary: FeatureInfo("Sunday summary", "The Sunday summary email, and its text for reps to share."),
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
