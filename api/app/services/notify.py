"""Creating notifications. Every feature that tells someone about something calls notify(), or notify_all() to tell
every account at once (a new newsletter issue).

The notification in the Hub always comes: no email switch can silence it (decision D1). For the kinds that also
come by email (outbox.EMAIL_SWITCHES: replies, accepted answers, upload reviews, new issues, date changes), an email
is queued in the same transaction when the person has an email address, has that switch on (outbox.wants(): never
before they answer the question about emails at sign-up) and hasn't had EMAIL_MAX_PER_HOUR of them in the last
hour; the mail worker sends it (app/services/outbox.py). The emails are plain text: what happened, a link to it,
and a link to the switches. Text that other people wrote is quoted with its links taken out, so nobody can send a
link from the Hub's own address."""

from __future__ import annotations

import re
import uuid
from datetime import timedelta
from typing import Any

from sqlalchemy import ColumnElement, Select, func, insert, literal, select, true
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.text import clip
from app.core.time import utcnow
from app.models import EmailOutbox, Notification, OutboxStatus, User
from app.schemas.notifications import NotificationKind
from app.services.outbox import ACCOUNT_NOTICE, EMAIL_SWITCHES, queue, wanted_by, wants

URL_MAX = 300  # Notification.url
# A page of the Hub: '/forum/<slug>', never '//host' or '/\host' (both lead off-site), a scheme, spaces or control
# characters (browsers drop tabs and newlines from URLs, so '/\t/host' would become '//host').
_HUB_PATH = re.compile(r"/(?![/\\])[^\x00-\x20\x7f\\]*")
BODY_MAX = 300  # characters of the notification's body quoted in its email
# Notification emails one person gets in an hour; past it, the notifications still come, in the Hub only. Keeps a
# busy thread, or someone replying over and over, from flooding an inbox.
EMAIL_MAX_PER_HOUR = 10
# Anything a mail app would turn into a link: a scheme, "www.", or a host name ending in a letters-only top-level
# domain, bare or followed by a path, query or port ("bit.ly", "site.com?code=1"). Some mail apps read the full-width
# and ideographic dots as dots too. The price: "Node.js" and "notes.pdf" read "[link]"; "e.g." stays.
_DOT = "[.\u3002\uff0e\uff61]"
_LINK = re.compile(
    rf"(?i)\b(?:[a-z][a-z0-9+.-]*://\S+|www{_DOT}\S+|[a-z0-9-]+(?:{_DOT}[a-z0-9-]+)*{_DOT}[a-z]{{2,}}\b\S*)"
)
LINK_STANDIN = "[link]"
SETTINGS_PATH = "/account#acct-emails"  # the email switches on Your account
SWITCH_LABELS: dict[str, str] = {
    "email_replies": "Replies",
    "email_answer_accepted": "Accepted answers",
    "email_upload_reviews": "Upload reviews",
    "email_new_issues": "New newsletter issues",
    "email_date_changes": "Date changes",
    "email_weekly_summary": "Sunday summary",
}


def hub_path(url: str | None) -> str | None:
    """`url` when it is a path inside the Hub, else None."""
    if url is None or len(url) > URL_MAX or not _HUB_PATH.fullmatch(url):
        return None
    return url


def unlink(text: str) -> str:
    """`text` on one line, each link in it replaced with "[link]"."""
    return " ".join(_LINK.sub(LINK_STANDIN, text).split())


def has_link(text: str) -> bool:
    """Whether `text` holds anything a mail or chat app would turn into a link."""
    return _LINK.search(text) is not None


def switch_footer(switch: str) -> list[str]:
    """The lines that end every email a switch governs: why it came, and where to turn it off (no token in the link:
    the switches are behind sign-in)."""
    base = get_settings().web_base_url.rstrip("/")
    return [
        f"You get these emails because “{SWITCH_LABELS[switch]}” is on in Your account. "
        f"To turn it off: {base}{SETTINGS_PATH}",
        "",
        "DSBA Hub",
    ]


def email_text(title: str, body: str | None, path: str | None, switch: str) -> str:
    """The plain-text email for a notification: what happened, the link to it, the link to the switch. The title and
    the quote carry no links of their own: the only links are the Hub's."""
    base = get_settings().web_base_url.rstrip("/")
    lines = [unlink(title)]
    if body:
        quoted = unlink(body)
        lines.append(clip(quoted, BODY_MAX))
    lines += [
        "",
        f"Open it in DSBA Hub: {base}{path or '/'}",
        "",
        *switch_footer(switch),
    ]
    return "\n".join(lines) + "\n"


def notify(
    db: Session,
    user_id: uuid.UUID,
    kind: NotificationKind,
    title: str,
    *,
    body: str | None = None,
    url: str | None = None,
    actor: User | None = None,
    named: bool = True,
    data: dict[str, Any] | None = None,
) -> Notification | None:
    """Adds a notification for `user_id` to the session, and queues its email when the person wants one (the caller
    commits both). Nobody is notified about their own action: returns None when the actor is the recipient. With
    `named` False the notification doesn't say who acted (an anonymous thread's author). `url`
    is kept only when it is a page of the Hub ('/forum/<slug>'); anything else is dropped. Kinds:
    app/schemas/notifications.py NotificationKind."""
    if actor is not None and actor.id == user_id:
        return None
    path = hub_path(url)
    n = Notification(
        id=uuid.uuid4(),
        user_id=user_id,
        kind=kind,
        title=title[:200],
        body=body,
        url=path,
        actor_id=actor.id if actor and named else None,
        data=data or {},
    )
    db.add(n)
    switch = EMAIL_SWITCHES.get(kind)
    if switch is not None:
        person = db.get(User, user_id)
        if person is not None and person.email and wants(person, switch) and not inbox_full(db, user_id):
            db.flush()  # the notification's row first: the email refers to it
            text = email_text(title, body, path, switch)
            queue(
                db, to=person.email, subject=unlink(title), body=text, kind=kind, user_id=user_id, notification_id=n.id
            )
    return n


def inbox_full(db: Session, user_id: uuid.UUID) -> bool:
    """Whether `user_id` has had EMAIL_MAX_PER_HOUR emails (other than account notices) queued in the last hour."""
    since = utcnow() - timedelta(hours=1)
    sent = db.scalar(
        select(func.count())
        .select_from(EmailOutbox)
        .where(EmailOutbox.user_id == user_id, EmailOutbox.kind != ACCOUNT_NOTICE, EmailOutbox.created_at >= since)
    )
    return (sent or 0) >= EMAIL_MAX_PER_HOUR


def _full_inboxes() -> Select[tuple[uuid.UUID | None]]:
    """The accounts inbox_full() is true for, as a subquery."""
    since = utcnow() - timedelta(hours=1)
    return (
        select(EmailOutbox.user_id)
        .where(EmailOutbox.user_id.is_not(None), EmailOutbox.kind != ACCOUNT_NOTICE, EmailOutbox.created_at >= since)
        .group_by(EmailOutbox.user_id)
        .having(func.count() >= EMAIL_MAX_PER_HOUR)
    )


def notify_all(
    db: Session,
    kind: NotificationKind,
    title: str,
    *,
    body: str | None = None,
    url: str | None = None,
    actor: User | None = None,
    data: dict[str, Any] | None = None,
    email: bool = True,
    only: ColumnElement[bool] | None = None,
) -> int:
    """One notification for every account except the actor's, among those matching `only` when given (one INSERT ...
    SELECT), and, with `email`, an email for each of them whose switch for `kind` is on and whose inbox isn't full
    (in the same transaction; the caller commits). -> the number of notifications."""
    path = hub_path(url)
    # The id comes from the database: a Python-side default would be computed once and repeated on every row.
    readers = select(
        func.gen_random_uuid(),
        User.id,
        literal(kind),
        literal(title[:200]),
        literal(body),
        literal(path),
        literal(actor.id if actor else None),
        literal(data or {}, JSONB),
    ).where(User.id != actor.id if actor is not None else true(), only if only is not None else true())
    columns = ["id", "user_id", "kind", "title", "body", "url", "actor_id", "data"]
    conn = db.connection()  # the session's transaction
    notified = conn.execute(
        insert(Notification).from_select(columns, readers).returning(Notification.id, Notification.user_id)
    ).all()
    switch = EMAIL_SWITCHES.get(kind)
    if not email or switch is None or not notified:
        return len(notified)
    by_user = {user_id: notification_id for notification_id, user_id in notified}
    recipients = conn.execute(
        select(User.id, User.email).where(
            User.id.in_(list(by_user)),
            User.email.is_not(None),
            wanted_by(switch),
            User.id.not_in(_full_inboxes()),
        )
    ).all()
    text = email_text(title, body, path, switch)
    subject = unlink(title)[:200]
    rows = [
        {
            "id": uuid.uuid4(),
            "user_id": user_id,
            "notification_id": by_user[user_id],
            "kind": kind,
            "to_address": email,
            "subject": subject,
            "body": text,
            "status": OutboxStatus.pending,
        }
        for user_id, email in recipients
    ]
    if rows:
        conn.execute(insert(EmailOutbox), rows)
    return len(notified)
