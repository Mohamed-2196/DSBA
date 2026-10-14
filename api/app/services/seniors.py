"""Seniors who answer (needs the career.seniors feature).

- A Year 3 student lists themselves on Your account: the topics they answer on and a line about what they did. They
  can pause the listing (it is kept, not shown) or remove it. Opt-in only: name, cohort and badge are shown, never
  contact details.
- Career Navigator's "Ask a senior" panel lists the active, unpaused Year 3 seniors. "Ask" starts a forum thread
  that names the senior (ThreadCreate.senior_id): they get a senior_question notification.
- The listing is one row per person, in their export and deleted with their account."""

from __future__ import annotations

import uuid

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.access import Feature
from app.core.errors import forbidden, invalid
from app.models import ForumThread, SeniorProfile, User, UserStatus
from app.schemas.seniors import MySenior, Senior, SeniorUpdate
from app.services import access
from app.services.accounts import public_user
from app.services.forum.notices import quoted_title
from app.services.notify import notify

SENIOR_YEAR = 3


def eligible(user: User) -> bool:
    """Year 3 students with an active account."""
    return user.year == SENIOR_YEAR and user.status == UserStatus.active


def listed(db: Session) -> list[Senior]:
    """The seniors taking questions, longest listed first."""
    rows = (
        db.execute(
            select(SeniorProfile, User)
            .join(User, User.id == SeniorProfile.user_id)
            .where(SeniorProfile.paused.is_(False), User.year == SENIOR_YEAR, User.status == UserStatus.active)
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
            "listed": p is not None,
            "topics": list(p.topics) if p else [],
            "note": p.note if p else "",
            "paused": p.paused if p else False,
        }
    )


def save(db: Session, user: User, data: SeniorUpdate) -> MySenior:
    """Lists the person, or changes their listing. Year 3 only."""
    if not eligible(user):
        raise forbidden("Only Year 3 students can answer as seniors. Check your year on Your account.")
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
