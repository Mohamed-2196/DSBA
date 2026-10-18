"""Rules every forum write shares: what a title, body, category and tags may be, the module a thread is about, slugs,
rate limits, the thread's counters, status changes and the audit helper."""

from __future__ import annotations

import re
import secrets
import unicodedata
from collections.abc import Sequence
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import set_committed_value

from app.core.errors import invalid
from app.core.text import slugify, unique_slug
from app.models import ForumReply, ForumThread, Module, PostStatus, User
from app.services.audit import record
from app.services.forum.taxonomy import MAX_TAGS, Taxonomy
from app.services.forum.text import clean_body, clean_title, has_text, media_ids
from app.services.forum.visibility import as_id
from app.services.modules import require_module
from app.services.ratelimit import enforce

THREADS_PER_HOUR = 10
REPLIES_PER_HOUR = 60
RATE_WINDOW = timedelta(hours=1)
MAX_IMAGES_PER_POST = 20
# Slugs the web app or the API already use under /forum/ and /forum/threads/.
RESERVED_SLUGS = frozenset({"new", "hot"})
SHORT_SLUG_PREFIX = "t-"
SHORT_SLUG_LENGTH = 6
SHORT_SLUG_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"


# ── what people write ───────────────────────────────────────────────────────────────────────────────


def valid_title(value: str) -> str:
    title = clean_title(value)
    if len(title) < 5:
        raise invalid("title", "Make the title a little longer (at least 5 characters).")
    if not any(unicodedata.category(c)[0] in "LN" for c in title):
        raise invalid("title", "Write the title in words.")
    return title


def valid_body(value: str, field: str = "body", *, required: bool = False) -> str:
    body = clean_body(value)
    if required and not has_text(body):
        raise invalid(field, "Write something first.")
    if len(media_ids(body)) > MAX_IMAGES_PER_POST:
        raise invalid(field, f"A post can show up to {MAX_IMAGES_PER_POST} pictures.")
    return body


def valid_category(t: Taxonomy, category: str | None, current: str | None = None) -> str | None:
    """A category from the list. A retired one only when the thread already has it."""
    if category is None:
        return None
    found = t.category(category)
    if found is None or (found.retired and category != current):
        raise invalid("category", "Choose a category from the list.")
    return category


def valid_tags(t: Taxonomy, tags: Sequence[str], current: Sequence[str] = ()) -> list[str]:
    """Tags from the list, each once. A retired tag only when the thread already has it."""
    unique = list(dict.fromkeys(tags))
    if len(unique) > MAX_TAGS:
        raise invalid("tags", f"Pick up to {MAX_TAGS} tags.")
    for tag_id in unique:
        found = t.tag(tag_id)
        if found is None or (found.retired and tag_id not in current):
            raise invalid("tags", "Pick tags from the list.")
    return unique


def hide_reason(value: str | None) -> str | None:
    """A rep's reason for hiding a post, as one line for the author's notification; None when there is none."""
    return clean_title(value or "") or None


def module_or_422(db: Session, module_id: str | None, *, visible: bool = False) -> Module | None:
    """The module a thread is about, or 422 on moduleId: the rule and the message of the library and the calendar
    (modules.require_module; code quality review CQ-6). An empty id is no module."""
    return require_module(db, module_id or None, visible=visible)


# ── slugs ───────────────────────────────────────────────────────────────────────────────────────────


def thread_slug(db: Session, title: str, attempt: int = 0) -> str:
    """The thread's address (/forum/<slug>): its title as a slug, free in the table. A title without Latin letters
    (Arabic, digits only) gets a short id slug, t-<6 letters or digits> (decision D8), and so does one whose slug
    would read as a thread id (a pasted id; hex digits that a '-2' makes one): no slug reads as an id, so neither
    can stand in for the other (SEC-12). Nor is a slug a page the app already has (/forum/new)."""
    base = slugify(title)
    if not re.search("[a-z]", base) or as_id(base) is not None:
        return short_slug(db)
    if base in RESERVED_SLUGS:
        base = f"{base}-thread"
    if attempt:  # someone took it between our check and our insert
        base = f"{base}-{secrets.token_hex(3)}"
    slug = unique_slug(db, ForumThread.slug, base, fallback="thread")
    return short_slug(db) if as_id(slug) is not None else slug


def short_slug(db: Session) -> str:
    """t- and 6 random letters or digits (36^6 of them), free in the table."""
    slug = ""
    for _ in range(10):
        slug = SHORT_SLUG_PREFIX + "".join(secrets.choice(SHORT_SLUG_ALPHABET) for _ in range(SHORT_SLUG_LENGTH))
        if db.scalar(select(ForumThread.id).where(ForumThread.slug == slug)) is None:
            break
    return slug  # a clash with a thread posted in between is caught by the insert, which picks again


# ── rate limits ─────────────────────────────────────────────────────────────────────────────────────


def limit_threads(db: Session, user: User) -> None:
    """At most THREADS_PER_HOUR new threads per person; counted under an advisory lock (ratelimit.enforce), so a
    burst of parallel requests can't all pass the same count."""
    enforce(
        db,
        f"forum:threads:{user.id}",
        ForumThread.created_at,
        [ForumThread.author_id == user.id],
        limit=THREADS_PER_HOUR,
        window=RATE_WINDOW,
        message=f"You've started {THREADS_PER_HOUR} threads in the last hour. Try again in {{}}.",
    )


def limit_replies(db: Session, user: User) -> None:
    enforce(
        db,
        f"forum:replies:{user.id}",
        ForumReply.created_at,
        [ForumReply.author_id == user.id],
        limit=REPLIES_PER_HOUR,
        window=RATE_WINDOW,
        message=f"You've posted {REPLIES_PER_HOUR} replies in the last hour. Try again in {{}}.",
    )


# ── counters and status ─────────────────────────────────────────────────────────────────────────────


def bump_thread(db: Session, t: ForumThread, *, replies: int = 0, activity: datetime | None = None) -> None:
    """reply_count (+/-) and last_activity_at, in SQL, then mirrored on the loaded object."""
    values: dict[str, Any] = {}
    if replies:
        values["reply_count"] = func.greatest(ForumThread.reply_count + replies, 0)
    if activity is not None:
        values["last_activity_at"] = activity
    if not values:
        return
    row = db.execute(
        update(ForumThread)
        .where(ForumThread.id == t.id)
        .values(**values)
        .returning(ForumThread.reply_count, ForumThread.last_activity_at)
        .execution_options(synchronize_session=False)
    ).one()
    set_committed_value(t, "reply_count", row.reply_count)
    set_committed_value(t, "last_activity_at", row.last_activity_at)


def change(
    db: Session,
    post: ForumThread | ForumReply,
    expected: PostStatus,
    *,
    unless_deleted: bool = False,
    **values: Any,
) -> bool:
    """Sets `values` on the post in one UPDATE ... WHERE status = `expected` (and, with `unless_deleted`, its text
    wasn't deleted yet), and
    mirrors them on the loaded object. When two requests race (two deletes, a delete and a hide), one makes the change
    and the other changes nothing, so a counter never moves twice (code quality review CQ-14). -> whether this
    request made the change."""
    model: Any = type(post)
    conds = [model.id == post.id, model.status == expected]
    if unless_deleted:
        conds.append(model.deleted_at.is_(None))
    row = db.execute(
        update(model).where(*conds).values(**values).returning(model.id).execution_options(synchronize_session=False)
    ).first()
    if row is None:  # someone got there first: show what is there now
        db.refresh(post, ["status", "body", "deleted_at"])
        return False
    for key, value in values.items():
        set_committed_value(post, key, value)
    return True


def audit(db: Session, actor: User, action: str, kind: str, target_id: object, ip: str | None, **data: Any) -> None:
    """An audit row with what was acted on (audit.record adds who acted, and keeps only a valid IP address)."""
    record(db, actor, action, kind, target_id, data, ip)
