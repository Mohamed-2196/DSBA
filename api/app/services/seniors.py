"""Seniors who answer (needs the career.seniors feature).

- A Year 3 student whose account is at least 30 days old lists themselves on Your account: the topics they answer
  on and a line about what they did. They can pause the listing (it is kept, not shown) or remove it. Opt-in only:
  name, cohort and badge are shown, never contact details.
- Career Navigator's "Ask a senior" panel lists the active, unpaused Year 3 seniors. "Ask" starts a forum thread
  that names the senior (ThreadCreate.senior_id): they get a senior_question notification.
- The year is the student's own say, so the account's age stands in for a check: someone who signs up and picks
  Year 3 waits 30 days before they can answer as a senior. Their line can't claim a staff role or hold a link.
- The listing is one row per person, in their export and deleted with their account."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.access import Feature
from app.core.errors import forbidden, invalid
from app.core.time import utcnow
from app.models import ForumThread, SeniorProfile, User, UserStatus
from app.schemas.seniors import MySenior, Senior, SeniorUpdate
from app.services import access
from app.services.accounts import looks, public_user
from app.services.forum.notices import quoted_title
from app.services.notify import has_link, notify

SENIOR_YEAR = 3
ACCOUNT_AGE = timedelta(days=30)  # how old an account must be before it can answer as a senior
# A senior's line may say "DSBA" or "BIBF" (unlike a display name), but not claim a staff role.
ROLE_WORDS = ("admin", "moderator", "student rep")


def eligible_from(user: User) -> datetime | None:
    """When a Year 3 student's account is old enough to list them; None for anyone not in Year 3."""
    return user.created_at + ACCOUNT_AGE if user.year == SENIOR_YEAR else None


def eligible(user: User) -> bool:
    """Year 3 students with an active account at least ACCOUNT_AGE old."""
    since = eligible_from(user)
    return since is not None and since <= utcnow() and user.status == UserStatus.active


def listed(db: Session) -> list[Senior]:
    """The seniors taking questions, longest listed first."""
    rows = (
        db.execute(
            select(SeniorProfile, User)
            .join(User, User.id == SeniorProfile.user_id)
            .where(
                SeniorProfile.paused.is_(False),
                User.year == SENIOR_YEAR,
                User.status == UserStatus.active,
                User.created_at <= utcnow() - ACCOUNT_AGE,
            )
            .order_by(SeniorProfile.created_at, User.id)
        )
        .tuples()
        .all()
    )
    access.prefetch(db, [u for _, u in rows])
    return [Senior.model_validate({"user": public_user(u), "topics": list(p.topics), "note": p.note}) for p, u in rows]


def mine(db: Session, user: User) -> MySenior:
    p = db.get(SeniorProfile, user.id)
    return MySenior.model_validate(
        {
            "eligible": eligible(user),
            "eligible_from": None if eligible(user) else eligible_from(user),
            "listed": p is not None,
            "topics": list(p.topics) if p else [],
            "note": p.note if p else "",
            "paused": p.paused if p else False,
        }
    )


def save(db: Session, user: User, data: SeniorUpdate) -> MySenior:
    """Lists the person, or changes their listing. Year 3 accounts at least 30 days old only."""
    if not eligible(user):
        if eligible_from(user) is not None:
            raise forbidden("New accounts can answer as seniors after 30 days. Try again then.")
        raise forbidden("Only Year 3 students can answer as seniors. Check your year on Your account.")
    if any(word in looks(data.note) for word in ROLE_WORDS):
        raise invalid("note", "Your line can't read as a rep or the hub's staff. Say what you did instead.")
    if has_link(data.note):
        raise invalid("note", "Your line can't hold a link. Say what you did in words.")
    topics = list(dict.fromkeys(data.topics))
    stmt = pg_insert(SeniorProfile).values(user_id=user.id, topics=topics, note=data.note, paused=data.paused)
    db.execute(
        stmt.on_conflict_do_update(
            index_elements=["user_id"], set_={"topics": topics, "note": data.note, "paused": data.paused}
        )
    )
    db.expire_all()
    return mine(db, user)


def remove(db: Session, user: User) -> None:
    db.execute(delete(SeniorProfile).where(SeniorProfile.user_id == user.id))


def asked(db: Session, asker: User, senior_id: uuid.UUID, t: ForumThread) -> None:
    """A thread started from "Ask" in Career Navigator: the senior hears about it. The senior must be listed and
    taking questions, and not the asker."""
    access.require_feature(db, asker, Feature.career_seniors)
    senior = db.get(User, senior_id)
    p = db.get(SeniorProfile, senior_id)
    if senior is None or p is None or p.paused or not eligible(senior) or senior.id == asker.id:
        raise invalid("seniorId", "This senior isn't taking questions right now. Ask the whole forum instead.")
    year = f"A Year {t.author_year} student" if t.author_year else "A student"
    who = year if t.anonymous else (asker.display_name or year)
    notify(
        db,
        senior.id,
        "senior_question",
        f"{who} asked you a question",
        body=quoted_title(t),
        url=f"/forum/{t.slug}",
        actor=asker,
        named=not t.anonymous,
        data={"threadId": str(t.id)},
    )
