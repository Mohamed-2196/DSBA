"""Links in text that other people wrote never reach an email or the Sunday summary, bare domains included."""

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


def test_unlink_takes_out_bare_domains_that_mail_apps_turn_into_links() -> None:
    """A domain with no scheme or path is a link to Gmail, Outlook and WhatsApp, so it goes too."""
    for bait in (
        "dsba-hub-login.example/code",
        "dsba-hub-login.com",
        "dsba-hub-login.com?code=1",
        "dsba-hub-login.com:8443/x",
        "bit.ly",
        "sub.dsba-hub-login.co.uk",
        "dsba-hub-login\u3002com",
        "dsba-hub-login\uff0ecom",
        "https://x.example",
        "www.example",
    ):
        assert unlink(f"Your code expired, sign in again at {bait}") == "Your code expired, sign in again at [link]"
    mail = email_text(
        "Ali replied to your thread", "Codes changed: sign in at dsba-hub-login.com", None, "email_replies"
    )
    assert "dsba-hub-login" not in mail


def test_unlink_keeps_ordinary_words() -> None:
    assert unlink("e.g. chapter 3.2, i.e. the mock at 9.30") == "e.g. chapter 3.2, i.e. the mock at 9.30"


def test_a_thread_title_with_a_domain_reaches_the_summary_without_it(
    db: Session, make_user: MakeUser, set_feature: Callable[..., None]
) -> None:
    """Any student's thread title goes to every student of the year who takes the Sunday summary, its link taken out."""
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
    assert "- Hub codes changed, sign in at [link]" in text
    assert "dsba-hub-login" not in text
