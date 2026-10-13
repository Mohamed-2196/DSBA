"""Queued emails (app/models/outbox.py) and the worker that sends them: `python -m app.cli mail-worker`.

- `queue()` adds a row in the caller's transaction, so an email goes out only if the change it is about commits.
- The worker claims the oldest due row with FOR UPDATE SKIP LOCKED, sends it and records the result in one
  transaction: several workers can run at once and never send the same row twice. If the worker dies mid-send, the
  row unlocks and is sent again later (at least once).
- A failed send is retried with exponential backoff (30 s, 1 min, 2 min, ... up to 6 h, with some jitter), and
  given up after MAX_ATTEMPTS. Logs name the kind and the masked address, never the address or the body.
- When its turn comes, a notification email is cancelled if the person no longer wants it: the account is gone,
  its email address changed, or the switch for that kind was turned off. It is cancelled too when the feature it is
  about is switched off for the person.
- Rows that are done are deleted after KEEP_DONE."""

from __future__ import annotations

import logging
import secrets
import signal
import threading
import uuid
from collections.abc import Callable
from contextlib import AbstractContextManager
from datetime import datetime, timedelta
from types import FrameType
from typing import cast

from sqlalchemy import delete, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.access import Feature
from app.core.time import utcnow
from app.models import EmailOutbox, OutboxStatus, User
from app.schemas.auth import Preferences
from app.schemas.notifications import NotificationKind
from app.services import access, mailer
from app.services.identifiers import destination_hint
from app.services.mailer import DeliveryError

log = logging.getLogger("dsba.outbox")

ACCOUNT_NOTICE = "account_notice"  # security notices: always sent, to the address they were meant for
# Notification kinds that also come by email, and the switch (a Preferences field) that turns that email off.
EMAIL_SWITCHES: dict[NotificationKind, str] = {
    "thread_reply": "email_replies",
    "reply_reply": "email_replies",
    "answer_accepted": "email_answer_accepted",
    "upload_published": "email_upload_reviews",
    "upload_rejected": "email_upload_reviews",
    "new_issue": "email_new_issues",
}
# The feature each emailed kind is about: no email goes out about a feature that is off for its reader.
EMAIL_FEATURES: dict[NotificationKind, Feature] = {
    "thread_reply": Feature.forum,
    "reply_reply": Feature.forum,
    "answer_accepted": Feature.forum,
    "upload_published": Feature.library,
    "upload_rejected": Feature.library,
    "new_issue": Feature.newsletter,
}
MAX_ATTEMPTS = 8
FIRST_RETRY = timedelta(seconds=30)
MAX_RETRY = timedelta(hours=6)
KEEP_DONE = timedelta(days=30)  # sent, failed and cancelled rows (what an export shows) are deleted after this
PURGE_EVERY = timedelta(hours=1)
SUBJECT_MAX = 200


def wants(user: User, switch: str) -> bool:
    """Whether the email switch `switch` (a Preferences field) is on for this person. Unset means on."""
    stored = user.preferences if isinstance(user.preferences, dict) else {}
    value = stored.get(switch, Preferences.model_fields[switch].default)
    return value is not False


def queue(
    db: Session,
    *,
    to: str,
    subject: str,
    body: str,
    kind: str,
    user_id: uuid.UUID | None = None,
    notification_id: uuid.UUID | None = None,
) -> EmailOutbox:
    """Adds an email to the outbox in the caller's transaction (the caller commits)."""
    now = utcnow()
    row = EmailOutbox(
        id=uuid.uuid4(),
        user_id=user_id,
        notification_id=notification_id,
        kind=kind,
        to_address=to,
        subject=" ".join(subject.split())[:SUBJECT_MAX],  # one line: a header can't hold a line break
        body=body,
        status=OutboxStatus.pending,
        attempts=0,
        next_attempt_at=now,
        created_at=now,
    )
    db.add(row)
    return row


def backoff(attempts: int) -> timedelta:
    """How long to wait after the `attempts`-th failed send: 30 s, 1 min, 2 min, ... at most 6 h, give or take 20%."""
    base = min(FIRST_RETRY * (1 << min(max(0, attempts - 1), 20)), MAX_RETRY)
    jitter = 0.8 + secrets.randbelow(401) / 1000  # 0.8 to 1.2
    return base * jitter


def _still_wanted(db: Session, row: EmailOutbox) -> bool:
    if row.kind == ACCOUNT_NOTICE or row.user_id is None:
        return True
    user = db.get(User, row.user_id)
    if user is None or user.email != row.to_address:
        return False
    kind = cast(NotificationKind, row.kind)  # a stored kind: a notification kind
    switch, feature = EMAIL_SWITCHES.get(kind), EMAIL_FEATURES.get(kind)
    if feature is not None and not access.feature_on(db, user, feature):
        return False
    return switch is None or wants(user, switch)


def send_one(db: Session, now: datetime | None = None) -> bool:
    """Claims the oldest due email, sends it and records the result, in one transaction. -> False when nothing is due.

    The row stays locked while it is being sent (FOR UPDATE SKIP LOCKED), so other workers pass over it."""
    now = now or utcnow()
    row = db.scalars(
        select(EmailOutbox)
        .where(EmailOutbox.status == OutboxStatus.pending, EmailOutbox.next_attempt_at <= now)
        .order_by(EmailOutbox.next_attempt_at, EmailOutbox.id)
        .limit(1)
        .with_for_update(skip_locked=True)
    ).first()
    if row is None:
        db.rollback()
        return False
    if not _still_wanted(db, row):
        row.status = OutboxStatus.cancelled
        db.commit()
        return True
    row.attempts += 1
    try:
        mailer.send_email(row.to_address, row.subject, row.body)
    except DeliveryError as e:
        row.last_error = str(e)[:200]
        if row.attempts >= MAX_ATTEMPTS:
            row.status = OutboxStatus.failed
            log.warning(
                "gave up on a %s email to %s after %d tries",
                row.kind,
                destination_hint("email", row.to_address),
                row.attempts,
            )
        else:
            row.next_attempt_at = now + backoff(row.attempts)
        db.commit()
        return True
    row.status = OutboxStatus.sent
    row.sent_at = utcnow()
    row.last_error = None
    db.commit()
    return True


def purge(db: Session, now: datetime | None = None) -> int:
    """Deletes emails that were sent, given up or cancelled more than KEEP_DONE ago. -> how many."""
    cutoff = (now or utcnow()) - KEEP_DONE
    gone = db.execute(
        delete(EmailOutbox)
        .where(EmailOutbox.status != OutboxStatus.pending, EmailOutbox.created_at < cutoff)
        .returning(EmailOutbox.id)
    ).all()
    db.commit()
    return len(gone)


def drain(sessions: Callable[[], AbstractContextManager[Session]], limit: int = 100) -> int:
    """Sends due emails until none is due or `limit` were handled. -> how many were handled."""
    handled = 0
    with sessions() as db:
        while handled < limit and send_one(db):
            handled += 1
    return handled


def run_worker(
    sessions: Callable[[], AbstractContextManager[Session]],
    *,
    once: bool = False,
    poll_seconds: float = 5.0,
    stop: threading.Event | None = None,
) -> int:
    """The mail worker: sends due emails, waits `poll_seconds` when there are none, purges old rows hourly.
    SIGTERM and SIGINT stop it after the email in hand. With `once`, it stops when nothing is due."""
    stop = stop or threading.Event()

    def _stop(signum: int, _frame: FrameType | None) -> None:
        log.info("mail worker stopping (signal %d)", signum)
        stop.set()

    if threading.current_thread() is threading.main_thread():
        signal.signal(signal.SIGTERM, _stop)
        signal.signal(signal.SIGINT, _stop)
    log.info("mail worker started")
    last_purge: datetime | None = None
    while not stop.is_set():
        try:
            if last_purge is None or utcnow() - last_purge > PURGE_EVERY:
                with sessions() as db:
                    purged = purge(db)
                if purged:
                    log.info("purged %d old email(s) from the outbox", purged)
                last_purge = utcnow()
            handled = drain(sessions)
        except SQLAlchemyError:
            log.exception("mail worker: database error; trying again in %.0f s", poll_seconds)
            handled = 0
        if handled:
            log.info("mail worker handled %d email(s)", handled)
            continue
        if once:
            break
        stop.wait(poll_seconds)
    log.info("mail worker stopped")
    return 0
