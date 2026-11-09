"""Notifications on phones and computers (web push): which browsers get them, queuing them when a notification is
made, and sending them from the mail worker. How a message is encrypted and signed: app/services/webpush.py.

- A browser gets pushes once its person turns on "Notifications on this device" (subscribe()). Its subscription is
  tied to the signed-in session that made it: once that session ends (signed out, signed out from another device,
  expired), the browser gets nothing more.
- notify() and notify_all() (app/services/notify.py) call queue() and queue_all() in their transaction: one row in
  push_outbox per browser of each person whose push choice for that kind is on (PUSH_SWITCHES; only replies to your
  own posts start on), at most PUSH_MAX_PER_HOUR an hour per browser. Nothing is queued while the hub has no VAPID
  key (DSBA_VAPID_PRIVATE_KEY), or for a person push is off for.
- A sign-in or step-up on the same browser moves its subscription to the new session (sessions.renew()).
- The worker sends each row as the emails are sent (app/services/outbox.py: FOR UPDATE SKIP LOCKED, retries with
  backoff, given up after MAX_ATTEMPTS). When its turn comes a push is cancelled if it is no longer wanted: the
  session ended, push or the feature it is about is off for the person, its choice was turned off, or the
  notification was read already. A browser its push service no longer knows (404 or 410) is forgotten.
- Rows that are done are deleted after KEEP_DONE. Logs name the kind and the push service's answer, never an
  endpoint."""

from __future__ import annotations

import json
import logging
import uuid
from collections.abc import Callable
from contextlib import AbstractContextManager
from datetime import datetime, timedelta
from functools import lru_cache
from typing import Any
from urllib.parse import urlsplit

import httpx
from sqlalchemy import ColumnElement, and_, delete, func, insert, not_, select, update
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.access import Feature
from app.core.errors import invalid
from app.core.text import clip
from app.core.time import utcnow
from app.models import Notification, OutboxStatus, PushOutbox, PushSubscription, User, UserSession
from app.schemas.auth import ExportPushDevice
from app.services import access, webpush
from app.services.outbox import EMAIL_FEATURES, backoff

log = logging.getLogger("dsba.push")

# The push choice (a Preferences field) each kind of notification follows; kinds not listed are never pushed. The
# groups are the email choices', with replies to your own posts apart from threads you follow, and reminders.
PUSH_SWITCHES: dict[str, str] = {
    "thread_reply": "push_replies",
    "reply_reply": "push_replies",
    "senior_question": "push_replies",
    "followed_reply": "push_followed",
    "followed_answer": "push_followed",
    "answer_accepted": "push_answer_accepted",
    "upload_published": "push_upload_reviews",
    "upload_rejected": "push_upload_reviews",
    "new_issue": "push_new_issues",
    "date_changed": "push_date_changes",
    "event_reminder": "push_reminders",
    "board_reminder": "push_reminders",
}
# What each choice is before the person sets it: only replies to your own posts (the hub stays calm).
PUSH_DEFAULTS: dict[str, bool] = dict.fromkeys(PUSH_SWITCHES.values(), False) | {"push_replies": True}
# The feature each pushed kind is about: nothing is pushed about a feature that is off for its reader.
PUSH_FEATURES: dict[str, Feature] = {
    **{kind: feature for kind, feature in EMAIL_FEATURES.items() if kind in PUSH_SWITCHES},
    "event_reminder": Feature.calendar,
    "board_reminder": Feature.board,
}
PUSH_MAX_PER_HOUR = 10  # pushes queued for one browser in an hour; past it, the notification is in the Hub only
MAX_DEVICES = 10  # browsers per person: a new one past it replaces the one subscribed longest ago
MAX_ATTEMPTS = 8
KEEP_DONE = timedelta(days=30)
TTL = 24 * 3600  # seconds a push service keeps a message for a browser that is offline
TITLE_MAX = 120
BODY_MAX = 180


# ── configuration ────────────────────────────────────────────────────────────────────────────


@lru_cache(maxsize=4)
def _key(value: str) -> webpush.VapidKey | None:
    try:
        return webpush.VapidKey.parse(value)
    except ValueError as e:  # production refuses to start with it (settings_problems); elsewhere push is just off
        log.warning("push is off: %s", e)
        return None


def vapid_key() -> webpush.VapidKey | None:
    """The hub's VAPID key, or None when push isn't set up (no DSBA_VAPID_PRIVATE_KEY, no subject, or a key that
    doesn't parse: a notification must never fail over push)."""
    s = get_settings()
    if s.vapid_private_key is None or not s.vapid_private_key.get_secret_value().strip() or not s.vapid_subject:
        return None
    return _key(s.vapid_private_key.get_secret_value())


def configured() -> bool:
    return vapid_key() is not None


# ── choices ──────────────────────────────────────────────────────────────────────────────────


def wants_push(user: User, switch: str) -> bool:
    """Whether the push choice `switch` (a Preferences field) is on for this person: as they set it, else
    PUSH_DEFAULTS."""
    value = (user.preferences if isinstance(user.preferences, dict) else {}).get(switch)
    return value if isinstance(value, bool) else PUSH_DEFAULTS[switch]


def _wanted_by(switch: str) -> ColumnElement[bool]:
    """A condition on User: the push choice `switch` is on (as wants_push(), in SQL)."""
    if PUSH_DEFAULTS[switch]:
        return not_(User.preferences.contains({switch: False}))
    return User.preferences.contains({switch: True})


def _live_session(now: datetime) -> ColumnElement[bool]:
    return and_(UserSession.revoked_at.is_(None), UserSession.expires_at > now)


# ── this device ──────────────────────────────────────────────────────────────────────────────


def _key_field(field: str, value: str, length: int) -> bytes:
    try:
        raw = webpush.b64decode(value)
    except ValueError:
        raw = b""
    if len(raw) != length:
        raise invalid(field, "This browser's notification keys don't look right. Try turning it on again.")
    return raw


def subscribe(db: Session, user: User, sess: UserSession, endpoint: str, p256dh: str, auth: str) -> PushSubscription:
    """Records this browser's subscription for `user`, tied to `sess` (the caller commits). The same browser again
    (its endpoint) is updated: signed in as someone else, it is theirs now. Raises invalid (422) for an endpoint
    that isn't a browser's push service or keys that aren't a browser's."""
    if not webpush.push_service(endpoint):
        raise invalid("endpoint", "This browser's notification service isn't one the Hub can send to.")
    point = _key_field("keys.p256dh", p256dh, 65)
    try:
        webpush.browser_key(point)
    except ValueError as e:
        raise invalid(
            "keys.p256dh", "This browser's notification keys don't look right. Try turning it on again."
        ) from e
    _key_field("keys.auth", auth, 16)
    sub = db.scalar(select(PushSubscription).where(PushSubscription.endpoint == endpoint).with_for_update())
    if sub is None:
        sub = PushSubscription(id=uuid.uuid4(), endpoint=endpoint, created_at=utcnow())
        db.add(sub)
    elif sub.user_id != user.id:
        sub.created_at = utcnow()
        sub.last_success_at = None
    sub.user_id, sub.session_id, sub.p256dh, sub.auth = user.id, sess.id, p256dh, auth
    db.flush()
    others = db.scalars(
        select(PushSubscription)
        .where(PushSubscription.user_id == user.id, PushSubscription.id != sub.id)
        .order_by(PushSubscription.created_at.desc(), PushSubscription.id)
        .offset(MAX_DEVICES - 1)
    ).all()
    for old in others:
        db.delete(old)
    return sub


def unsubscribe(db: Session, user: User, endpoint: str) -> bool:
    """Forgets this browser's subscription, if it is `user`'s (the caller commits). -> whether there was one."""
    gone = db.execute(
        delete(PushSubscription)
        .where(PushSubscription.endpoint == endpoint, PushSubscription.user_id == user.id)
        .returning(PushSubscription.id)
    ).all()
    return bool(gone)


def export(db: Session, user_id: uuid.UUID) -> list[ExportPushDevice]:
    """The person's browsers that get pushes, newest first, for the account export: when each was turned on, its last
    push and its push service, never its endpoint or keys."""
    subs = db.scalars(
        select(PushSubscription)
        .where(PushSubscription.user_id == user_id)
        .order_by(PushSubscription.created_at.desc(), PushSubscription.id)
    )
    return [
        ExportPushDevice(
            service=(urlsplit(sub.endpoint).hostname or "").lower(),
            created_at=sub.created_at,
            last_success_at=sub.last_success_at,
        )
        for sub in subs
    ]


# ── queuing ──────────────────────────────────────────────────────────────────────────────────


def payload(title: str, body: str | None, url: str | None, tag: str) -> dict[str, Any]:
    """What the service worker shows: one line of title, a short body, the Hub page it opens, and a tag (a later
    push with the same tag replaces it on the device)."""
    return {
        "title": clip(" ".join(title.split()), TITLE_MAX),
        "body": clip(" ".join(body.split()), BODY_MAX) if body else None,
        "url": url or "/",
        "tag": tag,
    }


def _tag(kind: str, notification_id: uuid.UUID, data: dict[str, Any] | None) -> str:
    """Pushes about one forum thread share a tag, so a busy thread is one notification on the device."""
    thread = (data or {}).get("threadId")
    return f"thread-{thread}" if isinstance(thread, str) and thread else f"{kind}-{notification_id}"


def _due_browsers(now: datetime) -> Any:
    """Subscriptions whose session is live and that had fewer than PUSH_MAX_PER_HOUR pushes queued in the last hour."""
    since = now - timedelta(hours=1)
    full = (
        select(PushOutbox.subscription_id)
        .where(PushOutbox.subscription_id.is_not(None), PushOutbox.created_at >= since)
        .group_by(PushOutbox.subscription_id)
        .having(func.count() >= PUSH_MAX_PER_HOUR)
    )
    return (
        select(PushSubscription.id, PushSubscription.user_id)
        .join(UserSession, UserSession.id == PushSubscription.session_id)
        .where(_live_session(now), PushSubscription.id.not_in(full))
    )


def queue(db: Session, n: Notification, person: User) -> int:
    """Queues `n`'s push for each of `person`'s browsers, when push is set up and on for them and their choice for
    its kind is on (in the caller's transaction). -> how many."""
    switch = PUSH_SWITCHES.get(n.kind)
    if switch is None or not configured() or not wants_push(person, switch):
        return 0
    if not access.feature_on(db, person, Feature.push):
        return 0
    now = utcnow()
    browsers = db.execute(_due_browsers(now).where(PushSubscription.user_id == person.id)).all()
    if not browsers:
        return 0
    body = payload(n.title, n.body, n.url, _tag(n.kind, n.id, n.data))
    db.flush()  # the notification's row first: the pushes refer to it
    db.execute(
        insert(PushOutbox),
        [
            {
                "id": uuid.uuid4(),
                "user_id": person.id,
                "subscription_id": sub_id,
                "notification_id": n.id,
                "kind": n.kind,
                "payload": body,
                "status": OutboxStatus.pending,
                "next_attempt_at": now,
                "created_at": now,
            }
            for sub_id, _ in browsers
        ],
    )
    return len(browsers)


def queue_all(
    db: Session,
    kind: str,
    notified: dict[uuid.UUID, uuid.UUID],
    *,
    title: str,
    body: str | None,
    url: str | None,
) -> int:
    """Queues one notification made for many people (`notified`: person -> their notification) to the browsers of
    those push is on for and whose choice for `kind` is on (in the caller's transaction). -> how many."""
    switch = PUSH_SWITCHES.get(kind)
    if switch is None or not notified or not configured():
        return 0
    readers = access.audience(db, Feature.push)
    if readers is None:
        return 0
    now = utcnow()
    browsers = db.execute(
        _due_browsers(now)
        .join(User, User.id == PushSubscription.user_id)
        .where(PushSubscription.user_id.in_(list(notified)), _wanted_by(switch), readers)
    ).all()
    rows = [
        {
            "id": uuid.uuid4(),
            "user_id": user_id,
            "subscription_id": sub_id,
            "notification_id": notified[user_id],
            "kind": kind,
            "payload": payload(title, body, url, f"{kind}-{notified[user_id]}"),
            "status": OutboxStatus.pending,
            "next_attempt_at": now,
            "created_at": now,
        }
        for sub_id, user_id in browsers
    ]
    if rows:
        db.execute(insert(PushOutbox), rows)
    return len(rows)


# ── sending ──────────────────────────────────────────────────────────────────────────────────


def _cancel_reason(db: Session, row: PushOutbox, sub: PushSubscription | None, now: datetime) -> str | None:
    """Why the push is no longer wanted when its turn comes, or None to send it."""
    if sub is None or sub.user_id != row.user_id:
        return "this browser no longer gets this person's pushes"
    sess = db.get(UserSession, sub.session_id)
    if sess is None or sess.revoked_at is not None or sess.expires_at <= now:
        return "signed out"
    user = db.get(User, row.user_id)
    if user is None:
        return "no account"
    if not access.feature_on(db, user, Feature.push):
        return "push is off"
    feature = PUSH_FEATURES.get(row.kind)
    if feature is not None and not access.feature_on(db, user, feature):
        return "its feature is off"
    switch = PUSH_SWITCHES.get(row.kind)
    if switch is None or not wants_push(user, switch):
        return "turned off"
    if row.notification_id is not None:
        n = db.get(Notification, row.notification_id)
        if n is None or n.read_at is not None:
            return "read already"
    return None


def _unread(db: Session, user_id: uuid.UUID) -> int:
    return (
        db.scalar(
            select(func.count())
            .select_from(Notification)
            .where(Notification.user_id == user_id, Notification.read_at.is_(None))
        )
        or 0
    )


def _retry_after(response: httpx.Response) -> timedelta | None:
    value = response.headers.get("retry-after", "")
    return timedelta(seconds=min(int(value), 6 * 3600)) if value.isdigit() else None


def send_one(db: Session, http: httpx.Client, now: datetime | None = None) -> bool:
    """Claims the oldest due push, sends it and records the result, in one transaction. -> False when nothing is
    due (or push isn't set up). Whatever goes wrong with one push fails that push alone: the next one still goes."""
    key = vapid_key()
    subject = get_settings().vapid_subject
    if key is None or not subject:
        return False
    now = now or utcnow()
    row = db.scalars(
        select(PushOutbox)
        .where(PushOutbox.status == OutboxStatus.pending, PushOutbox.next_attempt_at <= now)
        .order_by(PushOutbox.next_attempt_at, PushOutbox.id)
        .limit(1)
        .with_for_update(skip_locked=True)
    ).first()
    if row is None:
        db.rollback()
        return False
    row_id, kind = row.id, row.kind
    try:
        _send(db, http, row, key, subject, now)
        db.commit()
    except Exception as e:  # never left pending: it would be the oldest due row again, ahead of every other push
        log.exception("a %s push failed", kind)
        db.rollback()
        db.execute(
            update(PushOutbox)
            .where(PushOutbox.id == row_id, PushOutbox.status == OutboxStatus.pending)
            .values(status=OutboxStatus.failed, last_error=f"failed ({type(e).__name__})")
        )
        db.commit()
    return True


def _send(db: Session, http: httpx.Client, row: PushOutbox, key: webpush.VapidKey, subject: str, now: datetime) -> None:
    """Sends one claimed push, or cancels it when it's no longer wanted, and records how it went (the caller
    commits)."""
    sub = db.get(PushSubscription, row.subscription_id) if row.subscription_id is not None else None
    reason = _cancel_reason(db, row, sub, now)
    if reason is not None:
        row.status = OutboxStatus.cancelled
        row.last_error = reason
        if reason == "signed out" and sub is not None:
            db.delete(sub)
        return
    assert sub is not None
    row.attempts += 1
    message = json.dumps({**row.payload, "badge": _unread(db, row.user_id)}, separators=(",", ":")).encode()
    try:
        body = webpush.encrypt(message, webpush.b64decode(sub.p256dh), webpush.b64decode(sub.auth))
        response = webpush.post(http, sub.endpoint, body, key=key, subject=subject, ttl=TTL)
    except ValueError as e:  # a message too long, or keys that stopped being valid: no retry helps
        row.status = OutboxStatus.failed
        row.last_error = f"couldn't encrypt: {e}"[:200]
        return
    except httpx.HTTPError as e:
        _retry(row, now, f"couldn't reach the push service ({type(e).__name__})")
        return
    code = response.status_code
    if 200 <= code < 300:
        row.status, row.sent_at, row.last_error = OutboxStatus.sent, utcnow(), None
        sub.last_success_at = row.sent_at
    elif code in (404, 410):  # the browser unsubscribed, or its subscription expired
        row.status, row.last_error = OutboxStatus.cancelled, f"gone ({code})"
        db.delete(sub)
    elif code == 429 or code >= 500:
        _retry(row, now, f"push service busy ({code})", _retry_after(response))
    else:  # 400, 401, 403 (the VAPID key), 413: sending it again won't help
        row.status, row.last_error = OutboxStatus.failed, f"refused ({code})"
        log.warning("a %s push was refused by its push service (%d)", row.kind, code)


def _retry(row: PushOutbox, now: datetime, error: str, after: timedelta | None = None) -> None:
    row.last_error = error[:200]
    if row.attempts >= MAX_ATTEMPTS:
        row.status = OutboxStatus.failed
        log.warning("gave up on a %s push after %d tries (%s)", row.kind, row.attempts, error)
    else:
        row.next_attempt_at = now + max(backoff(row.attempts), after or timedelta(0))


def purge(db: Session, now: datetime | None = None) -> int:
    """Deletes pushes that were sent, given up or cancelled more than KEEP_DONE ago. -> how many."""
    cutoff = (now or utcnow()) - KEEP_DONE
    gone = db.execute(
        delete(PushOutbox)
        .where(PushOutbox.status != OutboxStatus.pending, PushOutbox.created_at < cutoff)
        .returning(PushOutbox.id)
    ).all()
    db.commit()
    return len(gone)


def drain(
    sessions: Callable[[], AbstractContextManager[Session]],
    limit: int = 100,
    http: httpx.Client | None = None,
) -> int:
    """Sends due pushes until none is due or `limit` were handled. -> how many were handled."""
    if not configured():
        return 0
    handled = 0
    client = http or httpx.Client(timeout=webpush.TIMEOUT)
    try:
        with sessions() as db:
            while handled < limit and send_one(db, client):
                handled += 1
    finally:
        if http is None:
            client.close()
    return handled
