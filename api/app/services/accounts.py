"""Accounts: what /me shows, profile rules, sign-in bookkeeping, lesson progress, the export and deletion."""

from __future__ import annotations

import logging
import re
import unicodedata
import uuid
from datetime import UTC, datetime

from botocore.exceptions import BotoCoreError, ClientError
from sqlalchemy import delete, false, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import ApiError, invalid, not_found
from app.core.time import utcnow
from app.models import (
    ForumReply,
    ForumThread,
    ItemStatus,
    LessonResume,
    LessonView,
    LibraryItem,
    LibraryStar,
    Module,
    NewsletterIssue,
    NewsletterReaction,
    Notification,
    ReplyVote,
    Report,
    Role,
    ThreadVote,
    Upload,
    UploadPurpose,
    UploadStatus,
    User,
    UserSession,
)
from app.schemas.auth import AccountExport, Me, Preferences, PreferencesUpdate
from app.schemas.common import UserPublic
from app.schemas.modules import Progress, ProgressImport
from app.services import otp, sessions
from app.services.audit import record
from app.services.identifiers import Kind, admin_identifiers
from app.services.storage import Storage

log = logging.getLogger("dsba.accounts")

# ── the signed-in user ───────────────────────────────────────────────────────────────────────


def preferences_of(user: User) -> Preferences:
    stored = user.preferences if isinstance(user.preferences, dict) else {}
    known = {k: v for k, v in stored.items() if k in Preferences.model_fields and isinstance(v, bool)}
    return Preferences.model_validate(known)


def update_preferences(user: User, changes: PreferencesUpdate) -> None:
    merged = preferences_of(user).model_dump()
    for name in changes.model_fields_set:
        value = getattr(changes, name)
        if value is not None:
            merged[name] = value
    user.preferences = merged  # a new dict: JSONB columns don't see changes made in place


def me_out(user: User) -> Me:
    return Me.model_validate(
        {
            "id": user.id,
            "display_name": user.display_name,
            "year": user.year,
            "role": user.role.value,
            "status": user.status.value,
            "email": user.email,
            "phone": user.phone,
            "needs_profile": user.display_name is None,
            "created_at": user.created_at,
            "preferences": preferences_of(user),
        }
    )


def public_user(user: User | None) -> UserPublic | None:
    """How a person appears next to what they did (never their email or phone number)."""
    if user is None:
        return None
    return UserPublic.model_validate(
        {
            "id": user.id,
            "display_name": user.display_name or "Unnamed account",
            "year": user.year,
            "role": user.role.value,
        }
    )


# ── display names ────────────────────────────────────────────────────────────────────────────

NAME_MIN, NAME_MAX = 2, 40
NAME_PUNCTUATION = frozenset(" .'-")
# What phones and word processors type in place of the plain characters (NFKC leaves these alone)
NAME_LOOKALIKES = str.maketrans({"\u2019": "'", "\u2018": "'", "\u2010": "-", "\u2011": "-"})
# Names that pass for the Hub's staff: only moderators and admins may use them (security review finding 20)
STAFF_WORDS = ("admin", "moderator", "student rep", "dsba", "bibf")


def _bad_name(message: str) -> ApiError:
    return invalid("displayName", message, code="invalid_display_name")


def clean_display_name(raw: str, *, staff: bool = False) -> str:
    """NFKC, trimmed and single-spaced. 2-40 characters: letters in any script (with their combining marks),
    digits, spaces and . ' - , with at least one letter. Control and format characters (bidi controls, zero-width
    characters) and everything else are refused, and so are STAFF_WORDS in a non-staff name.
    Raises invalid_display_name (422)."""
    name = " ".join(unicodedata.normalize("NFKC", raw).translate(NAME_LOOKALIKES).split())
    if not NAME_MIN <= len(name) <= NAME_MAX:
        raise _bad_name(f"Use {NAME_MIN} to {NAME_MAX} characters.")
    for ch in name:
        category = unicodedata.category(ch)
        if not (category[0] in "LM" or category == "Nd" or ch in NAME_PUNCTUATION):
            raise _bad_name("Use only letters, digits, spaces, dots (.), apostrophes (') and hyphens (-).")
    if not any(unicodedata.category(ch)[0] == "L" for ch in name):
        raise _bad_name("Include at least one letter.")
    if unicodedata.category(name[0])[0] == "M":
        raise _bad_name("Start with a letter or a digit.")
    if not staff and any(word in name.casefold() for word in STAFF_WORDS):
        raise _bad_name("This name is kept for the Hub's staff. Choose another one.")
    return name


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
            role=Role.student,
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
    if user.role != Role.admin and {user.email, user.phone} & admin_identifiers():
        change = {"from": user.role.value, "to": "admin", "via": "bootstrap", "targetName": user.display_name}
        record(db, None, "user.role", "user", user.id, change, ip)
        user.role = Role.admin
    user.last_seen_at = now
    return user, created


# ── lesson progress ──────────────────────────────────────────────────────────────────────────

LESSON_KEY = re.compile(r"([a-z0-9-]{1,64}):(\d{1,3}):(\d{1,3})", re.ASCII)
MAX_IMPORT_WATCHED = 5000
MAX_IMPORT_LAST = 100


def parse_lesson_key(key: str) -> tuple[str, int, int] | None:
    m = LESSON_KEY.fullmatch(key)
    return (m.group(1), int(m.group(2)), int(m.group(3))) if m else None


def lesson_key(module_id: str, chapter: int, video: int) -> str:
    return f"{module_id}:{chapter}:{video}"


def lesson_exists(module: Module | None, chapter: int, video: int) -> bool:
    if module is None or not isinstance(module.chapters, list) or not 0 <= chapter < len(module.chapters):
        return False
    entry = module.chapters[chapter]
    videos = entry.get("videos") if isinstance(entry, dict) else None
    return isinstance(videos, list) and 0 <= video < len(videos)


def require_lesson(db: Session, module_id: str, chapter: int, video: int) -> None:
    if not lesson_exists(db.get(Module, module_id), chapter, video):
        raise not_found("This lesson doesn't exist.")


def progress_of(db: Session, user_id: uuid.UUID) -> Progress:
    watched = dict(
        db.execute(select(LessonView.lesson_key, LessonView.watched_at).where(LessonView.user_id == user_id))
        .tuples()
        .all()
    )
    last = {
        module_id: {"chapter": chapter, "video": video, "at": at}
        for module_id, chapter, video, at in db.execute(
            select(LessonResume.module_id, LessonResume.chapter, LessonResume.video, LessonResume.opened_at).where(
                LessonResume.user_id == user_id
            )
        ).tuples()
    }
    return Progress.model_validate({"watched": watched, "last": last})


def set_watched(db: Session, user_id: uuid.UUID, key: str, watched: bool) -> None:
    parsed = parse_lesson_key(key)
    if parsed is None:
        raise not_found("This lesson doesn't exist.")
    module_id, chapter, video = parsed
    require_lesson(db, module_id, chapter, video)
    canonical = lesson_key(module_id, chapter, video)
    if watched:
        db.execute(
            pg_insert(LessonView)
            .values(user_id=user_id, lesson_key=canonical, module_id=module_id, watched_at=utcnow())
            .on_conflict_do_nothing(index_elements=[LessonView.user_id, LessonView.lesson_key])
        )
    else:
        db.execute(delete(LessonView).where(LessonView.user_id == user_id, LessonView.lesson_key == canonical))


def set_resume(db: Session, user_id: uuid.UUID, module_id: str, chapter: int, video: int, at: datetime) -> None:
    """Remembers the lesson opened last in a module; with `at` older than what is stored, nothing changes."""
    stmt = pg_insert(LessonResume).values(
        user_id=user_id, module_id=module_id, chapter=chapter, video=video, opened_at=at
    )
    db.execute(
        stmt.on_conflict_do_update(
            index_elements=[LessonResume.user_id, LessonResume.module_id],
            set_={"chapter": stmt.excluded.chapter, "video": stmt.excluded.video, "opened_at": stmt.excluded.opened_at},
            where=LessonResume.opened_at <= stmt.excluded.opened_at,
        )
    )


def reset_module(db: Session, user_id: uuid.UUID, module_id: str) -> None:
    db.execute(delete(LessonView).where(LessonView.user_id == user_id, LessonView.module_id == module_id))
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
    watched: dict[tuple[str, int, int], datetime] = {}
    for key, at in body.watched.items():
        parsed = parse_lesson_key(key)
        if parsed is not None:
            when = _past(at, now)
            watched[parsed] = max(when, watched.get(parsed, when))
    module_ids = {m for m, _, _ in watched} | set(body.last)
    modules = {m.id: m for m in db.scalars(select(Module).where(Module.id.in_(module_ids)))} if module_ids else {}
    rows = [
        {"user_id": user_id, "lesson_key": lesson_key(m, c, v), "module_id": m, "watched_at": at}
        for (m, c, v), at in watched.items()
        if lesson_exists(modules.get(m), c, v)
    ]
    if rows:
        stmt = pg_insert(LessonView).values(rows)
        db.execute(
            stmt.on_conflict_do_update(
                index_elements=[LessonView.user_id, LessonView.lesson_key],
                set_={"watched_at": func.greatest(LessonView.watched_at, stmt.excluded.watched_at)},
            )
        )
    for module_id, last in body.last.items():
        if lesson_exists(modules.get(module_id), last.chapter, last.video):
            set_resume(db, user_id, module_id, last.chapter, last.video, _past(last.at, now))


# ── export ──────────────────────────────────────────────────────────────────────────────────


def export_account(db: Session, user: User, current: UserSession | None) -> AccountExport:
    """Everything stored about `user`, as JSON (camelCase keys, like the rest of the API)."""
    uid = user.id
    threads = [
        {
            "id": t.id,
            "slug": t.slug,
            "title": t.title,
            "body": t.body,
            "category": t.category,
            "moduleId": t.module_id,
            "tags": list(t.tags or []),
            "status": t.status.value,
            "createdAt": t.created_at,
            "editedAt": t.edited_at,
            "voteCount": t.vote_count,
            "replyCount": t.reply_count,
        }
        for t in db.scalars(select(ForumThread).where(ForumThread.author_id == uid).order_by(ForumThread.created_at))
    ]
    replies = [
        {
            "id": r.id,
            "threadId": r.thread_id,
            "threadSlug": slug,
            "parentId": r.parent_id,
            "body": r.body,
            "status": r.status.value,
            "createdAt": r.created_at,
            "editedAt": r.edited_at,
            "voteCount": r.vote_count,
        }
        for r, slug in db.execute(
            select(ForumReply, ForumThread.slug)
            .join(ForumThread, ForumThread.id == ForumReply.thread_id)
            .where(ForumReply.author_id == uid)
            .order_by(ForumReply.created_at)
        ).tuples()
    ]
    library_items = [
        {
            "id": i.id,
            "slug": i.slug,
            "source": i.source.value,
            "kind": i.kind,
            "title": i.title,
            "description": i.description,
            "moduleId": i.module_id,
            "year": i.year,
            "url": i.url,
            "fileName": i.file_name,
            "contentType": i.content_type,
            "sizeBytes": i.size_bytes,
            "examYear": i.exam_year,
            "zone": i.zone,
            "authorName": i.author_name,
            "status": i.status.value,
            "reviewNote": i.review_note,
            "downloadCount": i.download_count,
            "createdAt": i.created_at,
            "publishedAt": i.published_at,
        }
        for i in db.scalars(select(LibraryItem).where(LibraryItem.uploaded_by == uid).order_by(LibraryItem.created_at))
    ]
    stars = [str(i) for i in db.scalars(select(LibraryStar.item_id).where(LibraryStar.user_id == uid))]
    reactions = [
        {
            "issueId": r.issue_id,
            "issueSlug": slug,
            "sectionId": r.section_id,
            "reaction": r.reaction,
            "createdAt": r.created_at,
        }
        for r, slug in db.execute(
            select(NewsletterReaction, NewsletterIssue.slug)
            .join(NewsletterIssue, NewsletterIssue.id == NewsletterReaction.issue_id)
            .where(NewsletterReaction.user_id == uid)
        ).tuples()
    ]
    votes: list[dict[str, object]] = [
        {"type": "thread", "id": tid, "createdAt": at}
        for tid, at in db.execute(
            select(ThreadVote.thread_id, ThreadVote.created_at).where(ThreadVote.user_id == uid)
        ).tuples()
    ]
    votes += [
        {"type": "reply", "id": rid, "createdAt": at}
        for rid, at in db.execute(select(ReplyVote.reply_id, ReplyVote.created_at).where(ReplyVote.user_id == uid))
        .tuples()
        .all()
    ]
    reports = [
        {
            "id": r.id,
            "targetType": r.target_type,
            "targetId": r.target_id,
            "reason": r.reason,
            "note": r.note,
            "status": r.status.value,
            "createdAt": r.created_at,
        }
        for r in db.scalars(select(Report).where(Report.reporter_id == uid).order_by(Report.created_at))
    ]
    notifications = [
        {
            "id": n.id,
            "kind": n.kind,
            "title": n.title,
            "body": n.body,
            "url": n.url,
            "createdAt": n.created_at,
            "readAt": n.read_at,
        }
        for n in db.scalars(
            select(Notification).where(Notification.user_id == uid).order_by(Notification.created_at.desc())
        )
    ]
    progress = progress_of(db, uid).model_dump(by_alias=True)
    return AccountExport(
        user=me_out(user),
        sessions=[sessions.info(s, current) for s in sessions.live(db, uid)],
        threads=threads,
        replies=replies,
        library_items=library_items,
        stars=stars,
        reactions=reactions,
        progress=progress,
        notifications=notifications,
        votes=votes,
        reports=reports,
    )


# ── deletion ────────────────────────────────────────────────────────────────────────────────


def delete_account(db: Session, user: User, storage: Storage) -> None:
    """Deletes the account. Files that never reached the library and forum pictures go (objects first: if the
    bucket fails, nothing is deleted and the person can try again); pending and rejected library items go;
    published items stay without an uploader; posts stay as 'deleted user' (the foreign keys set NULL), and
    everything personal (sessions, codes, notifications, progress, stars, votes, reactions) cascades."""
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
                    & or_(Upload.status != UploadStatus.attached, Upload.purpose == UploadPurpose.forum_image),
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
    # Their votes go with the account (cascade), so the counters they added go too.
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
    otp.forget_identifiers(db, [i for i in (user.email, user.phone) if i])
    db.execute(delete(User).where(User.id == uid))
    db.commit()
