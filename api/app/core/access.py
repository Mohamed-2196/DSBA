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
    guides_edit = "guides.edit"
    requests_manage = "requests.manage"
    summary_share = "summary.share"
    stats_view = "stats.view"
    people_suspend = "people.suspend"
    audit_read = "audit.read"


# The boxes Student may hold. Every new account gets Student, so a manager box there would go to anyone who signs
# up.
STUDENT_BOXES = frozenset({Box.forum_post, Box.library_upload, Box.newsletter_react, Box.reports_create})


class Feature(enum.StrEnum):
    forum = "forum"
    forum_help_below = "forum.help-below"  # Home's unanswered questions from the years below: nothing in the API
    forum_anonymous = "forum.anonymous"  # posting a thread without your name
    forum_follow = "forum.follow"  # following a thread
    library = "library"
    library_uploads = "library.uploads"  # uploads only: the library stays readable
    library_questions = "library.questions"  # past papers' questions tagged with chapters
    library_daily_question = "library.daily-question"  # Home's past question a day (GET /home)
    library_practice = "library.practice"  # practising a chapter's past questions, with marks kept per student
    newsletter = "newsletter"
    newsletter_polls = "newsletter.polls"  # polls in issues: the issue reads without them
    calendar = "calendar"
    career = "career"
    career_seniors = "career.seniors"  # seniors who answer, listed in Career Navigator
    grades = "grades"  # the grades calculator and its rules (students' marks stay in their browser)
    noora = "noora"  # Mini Noora: her script, and her words in Manage
    noora_ai = "noora.ai"  # her answers from Claude (Mini Noora stays scripted without it)
    notes = "notes"  # each student's private notes
    notes_share = "notes.share"  # a note shared with its module's students
    board = "board"  # each student's private boards
    requests = "requests"
    requests_autoclose = "requests.autoclose"  # paper and date requests that close themselves
    requests_done = "requests.done"  # the requests done lately, on the requests page and in the newsletter
    summary = "summary"  # the Sunday summary email, and its text for a year's group
    modules_video_suggestions = "modules.video-suggestions"  # videos students suggest for chapters
    modules_time_stamps = "modules.time-stamps"  # what a lesson's video covers, by time, suggested by students
    daily = "daily"  # the daily puzzles, their scores and leaderboard


class BoxInfo(NamedTuple):
    area: str
    label: str  # what the box allows, for the admin screen
    refusal: str  # the 403 message when it's missing


BOXES: dict[Box, BoxInfo] = {
    Box.forum_post: BoxInfo(
        "Forum",
        "Start threads, reply, vote, accept answers and edit your own posts; ask for files and dates; suggest videos",
        "Your account can't post in the forum. Contact a student rep.",
    ),
    Box.library_upload: BoxInfo(
        "Library",
        "Upload files for review; tag and flag past papers' questions",
        "Your account can't upload to the library. Contact a student rep.",
    ),
    Box.newsletter_react: BoxInfo(
        "Newsletter",
        "React to issues and vote in their polls",
        "Your account can't react to the newsletter. Contact a student rep.",
    ),
    Box.reports_create: BoxInfo(
        "Reports", "Report a post or a file", "Your account can't report posts or files. Contact a student rep."
    ),
    Box.forum_moderate: BoxInfo(
        "Forum",
        "Hide, lock and remove threads and replies, handle forum reports, and edit the forum's categories, tags, "
        "guidelines and tips",
        "Only people who moderate the forum can do this.",
    ),
    Box.library_manage: BoxInfo(
        "Library",
        "Review uploads, add links, edit and remove items, and handle library reports",
        "Only people who manage the library can do this.",
    ),
    Box.newsletter_manage: BoxInfo(
        "Newsletter",
        "Write, edit, publish and delete issues, and set the line under the newsletter's name and the pictures it "
        "offers",
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
    Box.guides_edit: BoxInfo(
        "Guides",
        "Edit the guides: Start here, Results day and Choosing your electives",
        "Only people who edit the guides can do this.",
    ),
    Box.requests_manage: BoxInfo(
        "Requests",
        "Answer and remove students' requests, and handle reports about them",
        "Only people who handle requests can do this.",
    ),
    Box.summary_share: BoxInfo(
        "Sunday summary",
        "See a year's Sunday summary, to paste into its group, and edit its words and the time it goes out",
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
    Feature.forum_help_below: FeatureInfo(
        "Help the year below", "The unanswered questions from the years below on Home, for Years 2 and 3."
    ),
    Feature.forum_anonymous: FeatureInfo(
        "Posting without a name", "The option to start a thread without your name. Threads posted so far stay unnamed."
    ),
    Feature.forum_follow: FeatureInfo("Following threads", "Following threads, and the notifications it sends."),
    Feature.library: FeatureInfo("Library", "Every file and link in the library, and uploads to it."),
    Feature.library_uploads: FeatureInfo("Library uploads", "Uploading to the library. It stays readable."),
    Feature.library_questions: FeatureInfo(
        "Past questions by topic",
        "Tagging past papers' questions with chapters, and each chapter's past questions. The tags are kept.",
    ),
    Feature.library_daily_question: FeatureInfo(
        "A past question a day",
        "Home's card with one tagged past question a day before your next exam. Needs past questions by topic.",
    ),
    Feature.library_practice: FeatureInfo(
        "Practise a chapter",
        "Working through a chapter's past questions one by one, marking each done, stuck or skipped, and the progress "
        "on chapters and modules. The marks are kept. Needs past questions by topic.",
    ),
    Feature.newsletter: FeatureInfo("Newsletter", "Every issue and its reactions."),
    Feature.newsletter_polls: FeatureInfo("Newsletter polls", "The polls in issues and voting in them."),
    Feature.calendar: FeatureInfo("Calendar", "The calendar, its feeds and its events in search."),
    Feature.career: FeatureInfo("Career Navigator", "Career Navigator."),
    Feature.career_seniors: FeatureInfo(
        "Seniors who answer", "The seniors listed in Career Navigator, and signing up as one on Your account."
    ),
    Feature.grades: FeatureInfo("Grades calculator", "The grades calculator."),
    Feature.noora: FeatureInfo("Mini Noora", "Mini Noora, the hub's helper."),
    Feature.noora_ai: FeatureInfo(
        "Mini Noora's AI answers", "Her answers from Claude. She answers from her script instead."
    ),
    Feature.notes: FeatureInfo("Notes", "Students' private notes. They're kept, and come back when it's on again."),
    Feature.notes_share: FeatureInfo(
        "Sharing notes with a module",
        "Notes students shared with their module, and sharing more. The shared copies are kept.",
    ),
    Feature.board: FeatureInfo(
        "Boards", "Each student's boards, cards, files on cards and reminders, and the add-to-board buttons."
    ),
    Feature.requests: FeatureInfo("Requests", "Students' requests, their me-toos and the answers."),
    Feature.requests_autoclose: FeatureInfo(
        "Requests that close themselves",
        "Matching paper requests with new files, and closing date requests when a rep confirms the date.",
    ),
    Feature.requests_done: FeatureInfo(
        "You asked, we did",
        "The requests done in the last 30 days, on the requests page and in the newsletter's section of them.",
    ),
    Feature.summary: FeatureInfo("Sunday summary", "The Sunday summary email, and its text for reps to share."),
    Feature.modules_video_suggestions: FeatureInfo(
        "Suggested videos", "Suggesting videos for lessons, and the queue of suggestions in Manage."
    ),
    Feature.modules_time_stamps: FeatureInfo(
        "Time stamps in recordings",
        "What a lesson's video covers, by time, beside the player; suggesting them, and their queue in Manage.",
    ),
    Feature.daily: FeatureInfo("Daily", "The daily puzzles, their points, streaks and leaderboard, and Home's card."),
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
