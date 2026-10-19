"""Accounts: what /me shows, profile rules, sign-in bookkeeping, lesson progress, the export and deletion."""

from __future__ import annotations

import logging
import re
import unicodedata
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Literal, get_args

from botocore.exceptions import BotoCoreError, ClientError
from sqlalchemy import delete, false, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, object_session

from app.core.access import ADMIN, REP, STUDENT
from app.core.errors import ApiError, conflict, forbidden, invalid, not_found
from app.core.time import utcnow
from app.models import (
    CalendarPrefs,
    DailyPlay,
    DailyProfile,
    EmailOutbox,
    ForumReply,
    ForumThread,
    ItemStatus,
    Lesson,
    LessonResume,
    LessonView,
    LibraryItem,
    LibraryStar,
    NewsletterIssue,
    NewsletterReaction,
    NooraUsage,
    Note,
    Notebook,
    NotebookUploadDay,
    NoteInk,
    Notification,
    PaperQuestion,
    PaperQuestionFlag,
    PersonalEvent,
    PollVote,
    ReplyVote,
    Report,
    RequestMeToo,
    SeniorProfile,
    StudentRequest,
    ThreadFollow,
    ThreadVote,
    Upload,
    UploadPurpose,
    UploadStatus,
    User,
    UserSession,
    UserStatus,
    VideoSuggestion,
)
from app.schemas.access import RoleSummary
from app.schemas.auth import (
    AccountExport,
    ExportCalendarSettings,
    ExportDailyPlay,
    ExportEmail,
    ExportFollow,
    ExportInk,
    ExportLibraryItem,
    ExportNooraDay,
    ExportNote,
    ExportNotebook,
    ExportNotebookUploadDay,
    ExportNotification,
    ExportPollVote,
    ExportQuestionTag,
    ExportReaction,
    ExportReply,
    ExportReport,
    ExportRequest,
    ExportSenior,
    ExportSuggestion,
    ExportThread,
    ExportVote,
    HomeBlock,
    Me,
    MeUpdate,
    Preferences,
    PreferencesUpdate,
)
from app.schemas.calendar import PersonalEventOut
from app.schemas.common import UserPublic
from app.schemas.modules import Progress, ProgressImport
from app.schemas.notifications import NotificationKind
from app.services import access, otp, sessions
from app.services.audit import record
from app.services.identifiers import Kind, admin_identifiers, destination_hint
from app.services.modules import link_of, student_lesson, student_lessons
from app.services.outbox import ACCOUNT_NOTICE, ANSWER, answer_of, wants
from app.services.storage import Storage

log = logging.getLogger("dsba.accounts")
NOTIFICATION_KINDS = frozenset(get_args(NotificationKind))

# ── the signed-in user ───────────────────────────────────────────────────────────────────────


# The email switches, one per kind of email (decision D1), and the other switches kept on the account: the answer
# about emails at sign-up, and lesson progress.
EMAIL_SWITCHES = tuple(name for name in Preferences.model_fields if name.startswith("email_"))
SWITCHES = (*EMAIL_SWITCHES, ANSWER, "track_progress")
HOME_BLOCKS = frozenset(get_args(HomeBlock))
NO_ANSWER = "Choose whether we email you about replies and date changes."


def _stored(user: User) -> dict[str, Any]:
    return user.preferences if isinstance(user.preferences, dict) else {}


def home_blocks_of(user: User) -> list[HomeBlock] | None:
    """Home's blocks as the person laid them out, in order; None: the default layout."""
    blocks = _stored(user).get("home_blocks")
    if not isinstance(blocks, list):
        return None
    return [b for b in dict.fromkeys(blocks) if b in HOME_BLOCKS]


def tracks_progress(user: User) -> bool:
    """Whether the person keeps their lesson progress (opt in)."""
    return _stored(user).get("track_progress") is True


def preferences_of(user: User) -> Preferences:
    """The preferences as they work for the account: users.preferences, with each email switch as outbox.wants()
    reads it."""
    return Preferences.model_validate(
        {
            "notification_emails": answer_of(user),
            **{name: wants(user, name) for name in EMAIL_SWITCHES},
            "track_progress": tracks_progress(user),
            "home_blocks": home_blocks_of(user),
        }
    )


def update_preferences(user: User, changes: PreferencesUpdate) -> None:
    """Applies what was sent: a switch sent as null stays as it is; `home_blocks` sent as null goes back to the
    default layout, and repeated blocks are dropped. An email turned on before the question about emails was
    answered answers it "no": that email comes, and the others stay off."""
    sent = changes.model_dump(exclude_unset=True)
    stored = _stored(user)
    merged: dict[str, Any] = {name: stored[name] for name in SWITCHES if isinstance(stored.get(name), bool)}
    merged.update({name: value for name, value in sent.items() if name in SWITCHES and value is not None})
    if ANSWER not in merged and any(sent.get(name) is True for name in EMAIL_SWITCHES):
        merged[ANSWER] = False
    blocks = sent["home_blocks"] if "home_blocks" in sent else home_blocks_of(user)
    if blocks is not None:
        merged["home_blocks"] = list(dict.fromkeys(blocks))
    user.preferences = merged  # a new dict: JSONB columns don't see changes made in place


def update_profile(user: User, body: MeUpdate) -> None:
    """Applies PATCH /me: only the fields sent change. A new year clears the papers (another year's choices), and
    repeated papers are dropped. The first display name needs the answer about emails, unless the account has one.
    Raises invalid_display_name (422), invalid_input (422) on `preferences.notificationEmails`, or forbidden (403)
    for a suspended account's new name."""
    sent = body.model_fields_set
    if "display_name" in sent:
        if body.display_name is None:
            raise invalid("displayName", "Enter a display name.", code="invalid_display_name")
        staff = any(slug in (ADMIN, REP) for slug in access.access_of(user).slugs)  # Admin and Rep holders only
        name = clean_display_name(body.display_name, staff=staff)
        answer = body.preferences.notification_emails if body.preferences is not None else None
        if user.display_name is None and answer is None and answer_of(user) is None:
            raise invalid("preferences.notificationEmails", NO_ANSWER)
        if name != user.display_name:
            if user.status == UserStatus.suspended:
                raise forbidden("Your account is suspended, so your name can't change. Contact a student rep.")
            user.display_name = name
    if "year" in sent and body.year != user.year:
        user.year = body.year
        user.papers = []
    if "papers" in sent and body.papers is not None:
        user.papers = list(dict.fromkeys(body.papers))
    if "zone" in sent:
        user.zone = body.zone
    if "preferences" in sent and body.preferences is not None:
        update_preferences(user, body.preferences)


def require_tracking(user: User) -> None:
    """Lesson progress is kept only for someone who turned it on."""
    if not tracks_progress(user):
        raise conflict(
            "progress_off", "Your lesson progress isn't kept. Turn on Track my lesson progress in Account first."
        )


def role_summaries(user: User) -> list[RoleSummary]:
    """The person's roles as /me and the people list show them, in role order."""
    return [RoleSummary(id=r.id, slug=r.slug, name=r.name, badge=r.badge) for r in access.access_of(user).roles]


def me_out(user: User) -> Me:
    return Me.model_validate(
        {
            "id": user.id,
            "display_name": user.display_name,
            "year": user.year,
            "roles": role_summaries(user),
            "boxes": [b.value for b in sorted(access.boxes_of(user))],
            "features": [f.value for f in access.features_on(session, user)]
            if (session := object_session(user))
            else [],
            "status": user.status.value,
            "email": user.email,
            "phone": user.phone,
            "needs_profile": user.display_name is None,
            "created_at": user.created_at,
            "preferences": preferences_of(user),
            "papers": list(user.papers or []),
            "zone": user.zone,
        }
    )


UNNAMED = "Student"  # an account without a display name yet (it can't post until it has one)


def public_user(user: User | None) -> UserPublic | None:
    """How a person appears next to what they did, everywhere in the Hub: name, cohort and badge, never their email
    or phone number. A suspended account shows no badge. None for a deleted account ("deleted user"). The one
    serialiser for UserPublic (code quality review CQ-6): areas import this rather than writing their own."""
    if user is None:
        return None
    return UserPublic.model_validate(
        {
            "id": user.id,
            "display_name": user.display_name or UNNAMED,
            "year": user.year,  # 1-3 or none: the database checks it
            "badge": access.access_of(user).badge if access.is_active(user) else None,  # suspended: no boxes, no badge
        }
    )


# ── display names ────────────────────────────────────────────────────────────────────────────

NAME_MIN, NAME_MAX = 2, 40
NAME_PUNCTUATION = frozenset(" .'-")
# What phones and word processors type in place of the plain characters (NFKC leaves these alone)
NAME_LOOKALIKES = str.maketrans({"\u2019": "'", "\u2018": "'", "\u2010": "-", "\u2011": "-"})
# Names that pass for the Hub's staff: only holders of Admin or Rep may use them (security review finding 20)
STAFF_WORDS = ("admin", "moderator", "student rep", "dsba", "bibf")
# Characters that look like Latin letters or like the letters of STAFF_WORDS, after casefold (from Unicode TR39's
# confusables; security review SEC-11): Cyrillic, Greek, Armenian, Latin variants and two digits.
CONFUSABLES = str.maketrans(
    {
        # Cyrillic
        "\u0430": "a",
        "\u0432": "b",
        "\u0435": "e",
        "\u0451": "e",
        "\u043a": "k",
        "\u043c": "m",
        "\u043d": "h",
        "\u043e": "o",
        "\u0440": "p",
        "\u0441": "c",
        "\u0442": "t",
        "\u0443": "y",
        "\u0445": "x",
        "\u0456": "i",
        "\u0457": "i",
        "\u0458": "j",
        "\u0455": "s",
        "\u0501": "d",
        "\u04bb": "h",
        "\u04cf": "l",
        "\u051b": "q",
        "\u051d": "w",
        # Greek
        "\u03b1": "a",
        "\u03b2": "b",
        "\u03b5": "e",
        "\u03b6": "z",
        "\u03b7": "n",
        "\u03b9": "i",
        "\u03ba": "k",
        "\u03bc": "m",
        "\u03bd": "n",
        "\u03bf": "o",
        "\u03c1": "p",
        "\u03c4": "t",
        "\u03c5": "u",
        "\u03c7": "x",
        "\u03f2": "c",
        "\u03f3": "j",
        # Armenian
        "\u0585": "o",
        "\u057d": "u",
        "\u0578": "n",
        # Latin look-alikes and digits
        "\u0131": "i",
        "\u0251": "a",
        "\u0261": "g",
        "0": "o",
        "1": "i",
    }
)
CONFUSABLE_PAIRS = (("rn", "m"), ("cl", "d"))  # two letters that read as one
LOOKALIKE_SCRIPTS = ("LATIN", "CYRILLIC", "GREEK")
# What may sit between the letters of a staff word without hiding it: "A d m i n", "Ad-min", "D.S.B.A", "Mod'erator"
WORD_BREAKS = re.compile(r"[\s.'\-]+")
STAFF_WORDS_SPELT_OUT = tuple(word.replace(" ", "") for word in STAFF_WORDS)


def _pairs_read_as_one(text: str) -> str:
    for pair, single in CONFUSABLE_PAIRS:
        text = text.replace(pair, single)
    return text


def skeleton(text: str) -> str:
    """`text` reduced to what it looks like: casefolded, look-alike letters mapped to Latin ones."""
    return _pairs_read_as_one(text.casefold().translate(CONFUSABLES))


def _mixes_scripts(name: str) -> bool:
    """True when one word mixes Latin, Cyrillic or Greek letters ('\u0410dmin': a Cyrillic A, then Latin)."""
    for word in name.replace(".", " ").replace("-", " ").replace("'", " ").split():
        scripts = {
            script
            for ch in word
            if unicodedata.category(ch)[0] == "L"
            for script in LOOKALIKE_SCRIPTS
            if unicodedata.name(ch, "").startswith(script)
        }
        if len(scripts) > 1:
            return True
    return False


def _bad_name(message: str) -> ApiError:
    return invalid("displayName", message, code="invalid_display_name")


def clean_display_name(raw: str, *, staff: bool = False) -> str:
    """NFKC, trimmed and single-spaced. 2-40 characters that pass characters_problem(), and, in a non-staff name,
    nothing that reads as one of STAFF_WORDS (reads_as_staff()). Raises invalid_display_name (422)."""
    name = plain_text(raw)
    if not NAME_MIN <= len(name) <= NAME_MAX:
        raise _bad_name(f"Use {NAME_MIN} to {NAME_MAX} characters.")
    if (problem := characters_problem(name)) is not None:
        raise _bad_name(problem)
    if not staff and reads_as_staff(name):
        raise _bad_name("This name is kept for the Hub's staff. Choose another one.")
    return name


def plain_text(raw: str) -> str:
    """`raw` as names and badges are kept: NFKC, typographic apostrophes and hyphens made plain, trimmed and
    single-spaced."""
    return " ".join(unicodedata.normalize("NFKC", raw).translate(NAME_LOOKALIKES).split())


def characters_problem(text: str) -> str | None:
    """What's wrong with the characters of a name or a badge (plain_text()), or None. Allowed: letters in any script
    with their combining marks, digits, spaces and . ' -, with at least one letter. Control and format characters
    (bidi controls, zero-width characters, soft hyphens) and everything else are refused; so is a word that mixes
    Latin, Cyrillic or Greek letters."""
    for ch in text:
        category = unicodedata.category(ch)
        if not (category[0] in "LM" or category == "Nd" or ch in NAME_PUNCTUATION):
            return "Use only letters, digits, spaces, dots (.), apostrophes (') and hyphens (-)."
    if not any(unicodedata.category(ch)[0] == "L" for ch in text):
        return "Include at least one letter."
    if unicodedata.category(text[0])[0] == "M":
        return "Start with a letter or a digit."
    if _mixes_scripts(text):
        return "Write each word in one alphabet."
    return None


def looks(text: str) -> str:
    """What `text` looks like on screen: NFKC, without control or format characters, then skeleton(). Two badges
    that look the same compare equal."""
    visible = "".join(ch for ch in unicodedata.normalize("NFKC", text) if unicodedata.category(ch) not in ("Cc", "Cf"))
    return skeleton(visible)


def reads_as_staff(text: str) -> bool:
    """Whether `text` reads as one of STAFF_WORDS once look-alike letters are mapped (names, and roles' badges):
    anywhere in it ("Head admin", "Badminton"), or spelt out from the start of a word across spaces, dots,
    apostrophes and hyphens ("A d m i n", "Ad-min", "D.S.B.A Team", "Student R e p"). Words that only end and begin
    one ("Ahmad Mina", "Habib Fakhro") don't count."""
    seen = looks(text)
    if any(word in seen for word in STAFF_WORDS):
        return True
    words = [word for word in WORD_BREAKS.split(seen) if word]
    return any(_pairs_read_as_one("".join(words[i:])).startswith(STAFF_WORDS_SPELT_OUT) for i in range(len(words)))


# ── signing in ──────────────────────────────────────────────────────────────────────────────


def find_user(db: Session, kind: Kind, identifier: str) -> User | None:
    column = User.email if kind == "email" else User.phone
    return db.scalar(select(User).where(column == identifier))


def user_for_sign_in(db: Session, kind: Kind, identifier: str, ip: str | None) -> tuple[User, bool]:
    """The account for a verified identifier, created when there is none. -> (user, created)."""
    now = utcnow()
    user = find_user(db, kind, identifier)
    created = False
    if user is None:
        candidate = User(
            id=uuid.uuid4(),
            email=identifier if kind == "email" else None,
            phone=identifier if kind == "phone" else None,
            preferences={},
            created_at=now,
        )
        try:
            with db.begin_nested():
                db.add(candidate)
        except IntegrityError:  # a parallel sign-in created it a moment ago
            user = find_user(db, kind, identifier)
            if user is None:
                raise
        else:
            user, created = candidate, True
            access.give(db, user, STUDENT)
    if not access.access_of(user, db).admin and {user.email, user.phone} & admin_identifiers():
        # a new account has no name yet: the activity log shows its masked address instead (UX-15)
        name = user.display_name or destination_hint(kind, identifier)
        before = access.role_names(user)
        access.give(db, user, ADMIN)
        change = {"from": before, "to": access.role_names(user), "via": "bootstrap", "targetName": name}
        record(db, None, "user.roles", "user", user.id, change, ip)
    user.last_seen_at = now
    return user, created


# ── identifiers: step-up, changes and their notices ───────────────────────────────────────────

LABELS: dict[Kind, str] = {"email": "email address", "phone": "phone number"}


def step_up_target(user: User, via: Literal["email", "phone"] | None) -> tuple[Kind, str]:
    """Where a step-up code goes: the identifier `via` names, by default the email address, else the phone number.
    Raises invalid_input (422) when the account has no such identifier."""
    if via == "phone" or (via is None and user.email is None):
        if user.phone is None:
            raise invalid("via", "Your account has no phone number. Use your email address.")
        return "phone", user.phone
    if user.email is None:
        raise invalid("via", "Your account has no email address. Use your phone number.")
    return "email", user.email


@dataclass(frozen=True)
class IdentifierChange:
    kind: Kind
    before: str | None  # what the account had (None: an addition)
    after: str | None  # what it has now (None: a removal)
    other: str | None  # the account's identifier of the other kind


def set_identifier(user: User, kind: Kind, value: str | None) -> IdentifierChange:
    """Puts `value` on the account as its email address or phone number (None removes it). The caller flushes."""
    before, other = (user.email, user.phone) if kind == "email" else (user.phone, user.email)
    if kind == "email":
        user.email = value
    else:
        user.phone = value
    return IdentifierChange(kind=kind, before=before, after=value, other=other)


def identifier_taken(kind: Kind) -> ApiError:
    return ApiError(409, "identifier_taken", f"Another account already uses this {LABELS[kind]}.")


def change_identifier(
    db: Session, user: User, sess: UserSession | None, kind: Kind, value: str | None
) -> tuple[str, str] | None:
    """Puts `value` on the account as its email address or phone number (None removes it), signs out the account's
    other sessions and queues the security notice (the caller commits). 409 identifier_taken when another account
    took `value` a moment ago. -> (phone number, text) when the notice is a text, to send once committed."""
    change = set_identifier(user, kind, value)
    try:
        with db.begin_nested():
            db.flush()
    except IntegrityError:  # taken a moment ago by a parallel request
        raise identifier_taken(kind) from None
    sessions.revoke_others(db, user.id, keep=sess)
    return queue_identifier_notice(db, user, change)


def queue_identifier_notice(db: Session, user: User, change: IdentifierChange) -> tuple[str, str] | None:
    """The security notice for a change of identifier (security design finding 15): to the address that was
    replaced or removed, or, for an addition, to the account's other identifier. An email goes through the outbox
    in the caller's transaction. -> (phone number, text) when it is a text, to send once the change is committed."""
    label = LABELS[change.kind]
    hint = destination_hint(change.kind, change.after) if change.after else ""
    to_kind: Kind
    if change.before is not None and change.before != change.after:
        to_kind, to = change.kind, change.before
        text = (
            f"The {label} on your DSBA Hub account was changed to {hint}."
            if change.after
            else f"This {label} was removed from your DSBA Hub account."
        )
    elif change.before is None and change.other is not None:
        to_kind, to = ("phone" if change.kind == "email" else "email"), change.other
        article = "An" if change.kind == "email" else "A"
        text = f"{article} {label} ({hint}) was added to your DSBA Hub account."
    else:
        return None
    return (to, text) if otp.queue_notice(db, to_kind, to, text, user.id) else None


# ── lesson progress ──────────────────────────────────────────────────────────────────────────

MAX_IMPORT_WATCHED = 5000
MAX_IMPORT_LAST = 100


def require_lesson(db: Session, lesson_id: str) -> Lesson:
    """A lesson students see, or 404."""
    lesson = student_lesson(db, lesson_id)
    if lesson is None:
        raise not_found("This lesson doesn't exist.")
    return lesson


def progress_of(db: Session, user: User) -> Progress:
    """The lessons watched and the lesson to resume in each module. While the person keeps no progress, what was
    recorded before stays stored but hidden, and comes back when they turn tracking on again."""
    if not tracks_progress(user):
        return Progress.model_validate({"watched": {}, "last": {}})
    return recorded_progress(db, user.id)


def recorded_progress(db: Session, user_id: uuid.UUID) -> Progress:
    """Everything stored, tracking on or off: the account export holds it all."""
    watched = {
        lesson_id: {"module_id": module_id, "at": at}
        for lesson_id, module_id, at in db.execute(
            select(LessonView.lesson_id, Lesson.module_id, LessonView.watched_at)
            .join(Lesson, Lesson.id == LessonView.lesson_id)
            .where(LessonView.user_id == user_id)
        ).tuples()
    }
    last = {
        module_id: {"lesson_id": lesson_id, "at": at}
        for module_id, lesson_id, at in db.execute(
            select(LessonResume.module_id, LessonResume.lesson_id, LessonResume.opened_at).where(
                LessonResume.user_id == user_id
            )
        ).tuples()
    }
    return Progress.model_validate({"watched": watched, "last": last})


def set_watched(db: Session, user_id: uuid.UUID, lesson_id: str, watched: bool) -> None:
    """404 when students don't see the lesson."""
    lesson = require_lesson(db, lesson_id)
    if watched:
        db.execute(
            pg_insert(LessonView)
            .values(user_id=user_id, lesson_id=lesson.id, watched_at=utcnow())
            .on_conflict_do_nothing(index_elements=[LessonView.user_id, LessonView.lesson_id])
        )
    else:
        db.execute(delete(LessonView).where(LessonView.user_id == user_id, LessonView.lesson_id == lesson.id))


def set_resume(db: Session, user_id: uuid.UUID, lesson: Lesson, at: datetime) -> None:
    """Remembers the lesson opened last in its module; with `at` older than what is stored, nothing changes."""
    stmt = pg_insert(LessonResume).values(
        user_id=user_id, module_id=lesson.module_id, lesson_id=lesson.id, opened_at=at
    )
    db.execute(
        stmt.on_conflict_do_update(
            index_elements=[LessonResume.user_id, LessonResume.module_id],
            set_={"lesson_id": stmt.excluded.lesson_id, "opened_at": stmt.excluded.opened_at},
            where=LessonResume.opened_at <= stmt.excluded.opened_at,
        )
    )


def reset_module(db: Session, user_id: uuid.UUID, module_id: str) -> None:
    lessons = select(Lesson.id).where(Lesson.module_id == module_id)
    db.execute(delete(LessonView).where(LessonView.user_id == user_id, LessonView.lesson_id.in_(lessons)))
    db.execute(delete(LessonResume).where(LessonResume.user_id == user_id, LessonResume.module_id == module_id))


def _past(at: datetime, now: datetime) -> datetime:
    """A browser's timestamp: UTC when it has no zone, and never in the future (a wrong clock must not win)."""
    if at.tzinfo is None:
        at = at.replace(tzinfo=UTC)
    return min(at, now)


def import_progress(db: Session, user_id: uuid.UUID, body: ProgressImport) -> None:
    """Merges a guest's progress: unknown lessons are skipped, the newest timestamp wins."""
    if len(body.watched) > MAX_IMPORT_WATCHED or len(body.last) > MAX_IMPORT_LAST:
        raise invalid("watched", "There is too much progress to import at once.")
    now = utcnow()
    lessons = student_lessons(db, [*body.watched, *(last.lesson_id for last in body.last.values())])
    rows = [
        {"user_id": user_id, "lesson_id": lesson_id, "watched_at": _past(at, now)}
        for lesson_id, at in body.watched.items()
        if lesson_id in lessons
    ]
    if rows:
        stmt = pg_insert(LessonView).values(rows)
        db.execute(
            stmt.on_conflict_do_update(
                index_elements=[LessonView.user_id, LessonView.lesson_id],
                set_={"watched_at": func.greatest(LessonView.watched_at, stmt.excluded.watched_at)},
            )
        )
    for module_id, last in body.last.items():
        lesson = lessons.get(last.lesson_id)
        if lesson is not None and lesson.module_id == module_id:
            set_resume(db, user_id, lesson, _past(last.at, now))


# ── export ──────────────────────────────────────────────────────────────────────────────────


def export_account(db: Session, user: User, current: UserSession | None) -> AccountExport:
    """Everything stored about `user` (GET /me/export). Typed, so a field added to a table has to be added here on
    purpose."""
    uid = user.id
    threads = [
        ExportThread(
            id=t.id,
            slug=t.slug,
            title=t.title,
            body=t.body,
            category=t.category,
            module_id=t.module_id,
            tags=list(t.tags or []),
            status=t.status.value,
            created_at=t.created_at,
            edited_at=t.edited_at,
            vote_count=t.vote_count,
            reply_count=t.reply_count,
            anonymous=t.anonymous,
        )
        for t in db.scalars(select(ForumThread).where(ForumThread.author_id == uid).order_by(ForumThread.created_at))
    ]
    replies = [
        ExportReply(
            id=r.id,
            thread_id=r.thread_id,
            thread_slug=slug,
            parent_id=r.parent_id,
            body=r.body,
            status=r.status.value,
            created_at=r.created_at,
            edited_at=r.edited_at,
            vote_count=r.vote_count,
        )
        for r, slug in db.execute(
            select(ForumReply, ForumThread.slug)
            .join(ForumThread, ForumThread.id == ForumReply.thread_id)
            .where(ForumReply.author_id == uid)
            .order_by(ForumReply.created_at)
        ).tuples()
    ]
    library_items = [
        ExportLibraryItem(
            id=i.id,
            slug=i.slug,
            source=i.source.value,
            kind=i.kind,
            title=i.title,
            description=i.description,
            module_id=i.module_id,
            year=i.year,
            url=i.url,
            file_name=i.file_name,
            content_type=i.content_type,
            size_bytes=i.size_bytes,
            exam_year=i.exam_year,
            zone=i.zone,
            author_name=i.author_name,
            status=i.status.value,
            review_note=i.review_note,
            download_count=i.download_count,
            created_at=i.created_at,
            published_at=i.published_at,
        )
        for i in db.scalars(select(LibraryItem).where(LibraryItem.uploaded_by == uid).order_by(LibraryItem.created_at))
    ]
    stars = list(
        db.scalars(select(LibraryStar.item_id).where(LibraryStar.user_id == uid).order_by(LibraryStar.item_id))
    )
    reactions = [
        ExportReaction(
            issue_id=r.issue_id, issue_slug=slug, section_id=r.section_id, reaction=r.reaction, created_at=r.created_at
        )
        for r, slug in db.execute(
            select(NewsletterReaction, NewsletterIssue.slug)
            .join(NewsletterIssue, NewsletterIssue.id == NewsletterReaction.issue_id)
            .where(NewsletterReaction.user_id == uid)
            .order_by(NewsletterReaction.created_at)
        ).tuples()
    ]
    votes = [
        ExportVote(type="thread", id=tid, created_at=at)
        for tid, at in db.execute(
            select(ThreadVote.thread_id, ThreadVote.created_at)
            .where(ThreadVote.user_id == uid)
            .order_by(ThreadVote.created_at)
        ).tuples()
    ]
    votes += [
        ExportVote(type="reply", id=rid, created_at=at)
        for rid, at in db.execute(
            select(ReplyVote.reply_id, ReplyVote.created_at)
            .where(ReplyVote.user_id == uid)
            .order_by(ReplyVote.created_at)
        ).tuples()
    ]
    reports = [
        ExportReport(
            id=r.id,
            target_type=r.target_type,
            target_id=r.target_id,
            reason=r.reason,
            note=r.note,
            status=r.status.value,
            created_at=r.created_at,
        )
        for r in db.scalars(select(Report).where(Report.reporter_id == uid).order_by(Report.created_at))
    ]
    requests = [
        ExportRequest(
            id=r.id,
            kind=r.kind,
            title=r.title,
            details=r.details,
            module_id=r.module_id,
            wanted_kind=r.wanted_kind,
            exam_year=r.exam_year,
            zone=r.zone,
            event_id=r.event_id,
            status=r.status.value,
            reply=r.reply,
            found_item_id=r.found_item_id,
            found_at=r.found_at,
            removed=r.removed_at is not None,
            created_at=r.created_at,
        )
        for r in db.scalars(
            select(StudentRequest).where(StudentRequest.author_id == uid).order_by(StudentRequest.created_at)
        )
    ]
    me_toos = list(
        db.scalars(select(RequestMeToo.request_id).where(RequestMeToo.user_id == uid).order_by(RequestMeToo.created_at))
    )
    question_tags = [
        ExportQuestionTag(
            id=t.id,
            item_id=t.item_id,
            chapter_id=t.chapter_id,
            question=t.question,
            page=t.page,
            created_at=t.created_at,
        )
        for t in db.scalars(
            select(PaperQuestion).where(PaperQuestion.tagged_by == uid).order_by(PaperQuestion.created_at)
        )
    ]
    question_flags = list(
        db.scalars(
            select(PaperQuestionFlag.question_id)
            .where(PaperQuestionFlag.user_id == uid)
            .order_by(PaperQuestionFlag.created_at)
        )
    )
    notifications = [
        ExportNotification(
            id=n.id,
            kind=n.kind if n.kind in NOTIFICATION_KINDS else "system",
            title=n.title,
            body=n.body,
            url=n.url,
            created_at=n.created_at,
            read_at=n.read_at,
        )
        for n in db.scalars(
            select(Notification).where(Notification.user_id == uid).order_by(Notification.created_at.desc())
        )
    ]
    emails = [
        ExportEmail(
            kind=e.kind if e.kind in NOTIFICATION_KINDS or e.kind == ACCOUNT_NOTICE else "system",
            to_address=e.to_address,
            subject=e.subject,
            status=e.status.value,
            created_at=e.created_at,
            sent_at=e.sent_at,
        )
        for e in db.scalars(select(EmailOutbox).where(EmailOutbox.user_id == uid).order_by(EmailOutbox.created_at))
    ]
    from app.services import bugs
    from app.services.board.export import board_export
    from app.services.board.scores import scores_of

    boards, board_labels, board_plans = board_export(db, uid)
    follows = [
        ExportFollow(thread_id=f.thread_id, thread_slug=slug, level=f.level, created_at=f.created_at)
        for f, slug in db.execute(
            select(ThreadFollow, ForumThread.slug)
            .join(ForumThread, ForumThread.id == ThreadFollow.thread_id)
            .where(ThreadFollow.user_id == uid)
            .order_by(ThreadFollow.created_at)
        ).tuples()
    ]
    poll_votes = [
        ExportPollVote(
            issue_id=v.issue_id, issue_slug=slug, poll_id=v.poll_id, choice=v.choice, created_at=v.created_at
        )
        for v, slug in db.execute(
            select(PollVote, NewsletterIssue.slug)
            .join(NewsletterIssue, NewsletterIssue.id == PollVote.issue_id)
            .where(PollVote.user_id == uid)
            .order_by(PollVote.created_at)
        ).tuples()
    ]
    listing = db.get(SeniorProfile, uid)
    senior = (
        ExportSenior(
            topics=list(listing.topics),
            note=listing.note,
            paused=listing.paused,
            created_at=listing.created_at,
        )
        if listing is not None
        else None
    )
    note_rows = list(db.scalars(select(Note).where(Note.user_id == uid).order_by(Note.created_at)))
    ink_rows = db.scalars(
        select(NoteInk).where(NoteInk.note_id.in_([n.id for n in note_rows])).order_by(NoteInk.sheet)
    ).all()
    listed = {u for n in note_rows for u in n.uploads}
    rows = (
        db.execute(
            select(Upload.id, Upload.file_name).where(
                Upload.id.in_(listed), Upload.user_id == uid, Upload.purpose == UploadPurpose.note_file
            )
        )
        .tuples()
        .all()
    )
    file_names: dict[uuid.UUID, str] = dict(rows)
    notes_by_book: dict[uuid.UUID, list[ExportNote]] = {}
    for n in note_rows:
        notes_by_book.setdefault(n.notebook_id, []).append(
            ExportNote(
                id=n.id,
                title=n.title,
                text=n.text,
                doc=n.doc,
                paper=n.paper,
                sheets=n.sheets,
                lesson_id=n.lesson_id,
                library_item_id=n.library_item_id,
                files=[file_names[u] for u in n.uploads if u in file_names],
                ink=[ExportInk(sheet=i.sheet, strokes=i.strokes) for i in ink_rows if i.note_id == n.id],
                version=n.version,
                created_at=n.created_at,
                updated_at=n.updated_at,
            )
        )
    notebooks = [
        ExportNotebook(
            id=nb.id,
            title=nb.title,
            module_id=nb.module_id,
            created_at=nb.created_at,
            notes=notes_by_book.get(nb.id, []),
        )
        for nb in db.scalars(select(Notebook).where(Notebook.user_id == uid).order_by(Notebook.created_at))
    ]
    noora = [
        ExportNooraDay(
            day=u.day,
            questions=u.questions,
            input_tokens=u.input_tokens + u.cache_read_tokens + u.cache_write_tokens,
            output_tokens=u.output_tokens,
        )
        for u in db.scalars(select(NooraUsage).where(NooraUsage.user_id == uid).order_by(NooraUsage.day))
    ]
    calendar_prefs = db.get(CalendarPrefs, uid)
    calendar_settings = (
        ExportCalendarSettings.model_validate(
            {
                "hidden_events": list(calendar_prefs.hidden_events),
                "hidden_modules": list(calendar_prefs.hidden_modules),
                "hidden_types": list(calendar_prefs.hidden_types),
                "private_feed": calendar_prefs.feed_salt is not None,
            }
        )
        if calendar_prefs is not None
        else None
    )
    return AccountExport(
        user=me_out(user),
        sessions=[sessions.info(s, current) for s in sessions.live(db, uid)],
        threads=threads,
        replies=replies,
        library_items=library_items,
        stars=stars,
        reactions=reactions,
        progress=recorded_progress(db, uid),
        notifications=notifications,
        votes=votes,
        reports=reports,
        bug_reports=bugs.export(db, uid),
        requests=requests,
        me_toos=me_toos,
        question_tags=question_tags,
        question_flags=question_flags,
        emails=emails,
        boards=boards,
        board_labels=board_labels,
        board_plans=board_plans,
        paper_scores=scores_of(db, uid),
        follows=follows,
        poll_votes=poll_votes,
        senior=senior,
        notebooks=notebooks,
        noora_usage=noora,
        notebook_uploads=[
            ExportNotebookUploadDay(day=d.day, uploads=d.uploads, size_bytes=d.size_bytes, capped=d.capped)
            for d in db.scalars(
                select(NotebookUploadDay).where(NotebookUploadDay.user_id == uid).order_by(NotebookUploadDay.day)
            )
        ],
        video_suggestions=[
            ExportSuggestion(
                id=s.id,
                module_id=s.module_id,
                chapter_id=s.chapter_id,
                url=link_of(s.kind, s.video_id, s.url),
                title=s.title,
                reason=s.reason,
                status=s.status.value,
                reply=s.reply,
                lesson_id=s.lesson_id,
                created_at=s.created_at,
            )
            for s in db.scalars(
                select(VideoSuggestion).where(VideoSuggestion.author_id == uid).order_by(VideoSuggestion.created_at)
            )
        ],
        calendar_events=[
            PersonalEventOut.model_validate(e)
            for e in db.scalars(
                select(PersonalEvent)
                .where(PersonalEvent.user_id == uid)
                .order_by(PersonalEvent.date, PersonalEvent.created_at)
            )
        ],
        calendar_settings=calendar_settings,
        daily_plays=[
            ExportDailyPlay.model_validate(p)
            for p in db.scalars(
                select(DailyPlay).where(DailyPlay.user_id == uid).order_by(DailyPlay.day, DailyPlay.started_at)
            )
        ],
        daily_show_on_board=bool(db.scalar(select(DailyProfile.show_on_board).where(DailyProfile.user_id == uid))),
    )


# ── deletion ────────────────────────────────────────────────────────────────────────────────

# Uploads that go with the account even when attached: forum pictures (their posts stay), the files on board cards
# and in notebooks, and bug report screenshots
GONE_WITH_THE_ACCOUNT = (
    UploadPurpose.forum_image,
    UploadPurpose.board,
    UploadPurpose.note_file,
    UploadPurpose.bug_screenshot,
)


def delete_account(db: Session, user: User, storage: Storage) -> None:
    """Deletes the account. Files that never reached the library, forum pictures, notebook files, files on board
    cards and bug report screenshots go (objects first: if the bucket fails, nothing is deleted and the person can
    try again); pending and rejected library items go; published items stay without an uploader; posts stay as
    'deleted user' (the foreign keys set NULL); everything personal (boards and practice scores, sessions,
    notifications, queued emails, progress, notebooks and notes, stars, votes, me-toos, reactions, follows, poll votes,
    the senior listing, their own calendar, the bug reports they sent) cascades; the sign-in codes stay, anonymised,
    until the sweep (the rate limits count them). The last active admin can't leave (409 last_admin). The caller
    commits."""
    if access.is_admin(user):
        access.ensure_admins_remain(db, user)
    uid = user.id
    dropped_items = list(
        db.scalars(
            select(LibraryItem).where(
                LibraryItem.uploaded_by == uid, LibraryItem.status.in_([ItemStatus.pending, ItemStatus.rejected])
            )
        )
    )
    item_keys = {i.storage_key for i in dropped_items if i.storage_key}
    dropped_uploads = list(
        db.scalars(
            select(Upload).where(
                or_(
                    (Upload.user_id == uid)
                    & or_(
                        Upload.status != UploadStatus.attached,
                        Upload.purpose.in_(GONE_WITH_THE_ACCOUNT),
                    ),
                    Upload.storage_key.in_(item_keys) if item_keys else false(),
                )
            )
        )
    )
    keys = sorted(item_keys | {u.storage_key for u in dropped_uploads})
    try:
        for key in keys:
            storage.delete(key)
    except (BotoCoreError, ClientError) as e:
        log.warning("account deletion stopped: %d file(s) could not be deleted (%s)", len(keys), type(e).__name__)
        raise ApiError(
            503, "storage_unavailable", "We couldn't delete your files just now. Try again in a few minutes."
        ) from e

    if dropped_uploads:
        db.execute(delete(Upload).where(Upload.id.in_([u.id for u in dropped_uploads])))
    if dropped_items:
        db.execute(delete(LibraryItem).where(LibraryItem.id.in_([i.id for i in dropped_items])))
    # Their votes, me-toos and flags go with the account (cascade), so the counters they added go too.
    db.execute(
        update(ForumThread)
        .where(ForumThread.id.in_(select(ThreadVote.thread_id).where(ThreadVote.user_id == uid)))
        .values(vote_count=func.greatest(ForumThread.vote_count - 1, 0))
    )
    db.execute(
        update(ForumReply)
        .where(ForumReply.id.in_(select(ReplyVote.reply_id).where(ReplyVote.user_id == uid)))
        .values(vote_count=func.greatest(ForumReply.vote_count - 1, 0))
    )
    db.execute(
        update(StudentRequest)
        .where(StudentRequest.id.in_(select(RequestMeToo.request_id).where(RequestMeToo.user_id == uid)))
        .values(me_too_count=func.greatest(StudentRequest.me_too_count - 1, 0))
    )
    db.execute(
        update(PaperQuestion)
        .where(PaperQuestion.id.in_(select(PaperQuestionFlag.question_id).where(PaperQuestionFlag.user_id == uid)))
        .values(flag_count=func.greatest(PaperQuestion.flag_count - 1, 0))
    )
    from app.services import bugs

    bugs.unquote(db, uid)
    # The sign-in rows stay, without the addresses, for the rate limits (student test: deleting the account and
    # signing up again must refill nothing).
    otp.anonymise(db, user)
    db.execute(delete(User).where(User.id == uid))
