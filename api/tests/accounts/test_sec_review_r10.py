"""Security review, rounds 5 to 9 (docs/reviews/security.md). Each test passes while its finding is real: fixing
the finding makes it fail, and then it should be turned around into a regression test."""

from __future__ import annotations

import datetime as dt
import uuid
from collections.abc import Callable

from sqlalchemy.orm import Session

from app.core.access import Feature
from app.core.time import bahrain_today
from app.models import ForumThread, User
from app.services import summary
from app.services.notify import email_text, unlink

MakeUser = Callable[..., User]


def test_sec30_unlink_keeps_bare_domains_that_mail_apps_turn_into_links() -> None:
    """A domain with no path or scheme is left as it is, and Gmail and Outlook make it a link."""
    assert unlink("see dsba-hub-login.example/code") == "see [link]"  # with a path: taken out
    for bait in ("dsba-hub-login.com", "dsba-hub-login.com?code=1", "bit.ly"):
        assert unlink(f"Your code expired, sign in again at {bait}") == f"Your code expired, sign in again at {bait}"
    mail = email_text(
        "Ali replied to your thread", "Codes changed: sign in at dsba-hub-login.com", None, "email_replies"
    )
    assert "dsba-hub-login.com" in mail


def test_sec30_a_thread_title_puts_a_clickable_domain_in_every_opted_in_summary(
    db: Session, make_user: MakeUser, set_feature: Callable[..., None]
) -> None:
    """Any student's thread title goes to every student of the year who takes the Sunday summary."""
    set_feature("summary", "everyone")
    author = make_user(name="Asker", year=2)
    db.add(
        ForumThread(
            slug=f"bait-{uuid.uuid4().hex[:6]}",
            title="Hub codes changed, sign in at dsba-hub-login.com",
            body="...",
            category="year-2",
            author_id=author.id,
        )
    )
    db.commit()
    sunday = summary.week_of(bahrain_today()) + dt.timedelta(days=7)
    text = summary.build(db, 2, sunday, frozenset({Feature.forum})).email()
    assert "- Hub codes changed, sign in at dsba-hub-login.com" in text
