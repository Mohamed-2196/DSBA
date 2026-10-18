"""The signed-in user's account: profile, sessions, identifiers, export and deletion."""

from __future__ import annotations

import datetime as dt
import json
import uuid
from collections.abc import Callable
from datetime import timedelta
from typing import Any, TypeVar

import pytest
from botocore.exceptions import ClientError
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_token
from app.core.time import utcnow
from app.models import (
    AuditEntry,
    ForumReply,
    ForumThread,
    ItemSource,
    ItemStatus,
    LessonView,
    LibraryItem,
    LibraryStar,
    Module,
    NewsletterIssue,
    NewsletterReaction,
    NooraUsage,
    Note,
    Notebook,
    NoteInk,
    Notification,
    OtpChallenge,
    OtpPurpose,
    ReplyVote,
    Report,
    ThreadVote,
    Upload,
    UploadPurpose,
    UploadStatus,
    User,
    UserSession,
    UserStatus,
)
from app.schemas.auth import MAX_HOME_BLOCKS
from app.services.identifiers import anon_identifier
from app.services.storage import Storage
from tests.accounts.conftest import API, Deliver, Outbox, SignIn, start, wrong
from tests.lessons import lesson_id

ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]


def _fresh(db: Session, model: Any, ident: Any) -> Any:
    return db.get(model, ident, populate_existing=True)


T = TypeVar("T")


def _row(db: Session, model: type[T], ident: object) -> T:
    """The row, which must exist."""
    found = db.get(model, ident)
    assert found is not None, f"no {model.__name__} {ident}"
    return found


# ── who am I ────────────────────────────────────────────────────────────────────────────────


def test_guests_get_401_everywhere(client: TestClient) -> None:
    calls = [
        ("GET", "/me"),
        ("PATCH", "/me"),
        ("DELETE", "/me"),
        ("GET", "/me/export"),
        ("GET", "/me/sessions"),
        ("DELETE", f"/me/sessions/{uuid.uuid4()}"),
        ("POST", "/me/identifiers/otp"),
        ("POST", "/me/identifiers/verify"),
        ("DELETE", "/me/identifiers/phone"),
    ]
    for method, path in calls:
        body: dict[str, object] | None = {"identifier": "a@b.com"} if path.endswith("/otp") else None
        if path.endswith("/verify"):
            body = {"challengeId": str(uuid.uuid4()), "code": "123456"}
        if method == "PATCH":
            body = {"year": 1}
        r = client.request(method, f"{API}{path}", json=body)
        assert r.status_code == 401, (method, path, r.text)
        assert r.json()["error"]["code"] == "unauthenticated"


def test_session_state_never_answers_401(client_for: ClientFor, make_user: MakeUser) -> None:
    """Student test ST-10: GET /auth/session is 200 for guests too, so a guest's page load logs no error."""
    r = client_for().get(f"{API}/auth/session")
    assert r.status_code == 200
    assert r.json() == {"me": None}
    user = make_user(email="session@example.com", name="Noor Session")
    c = client_for(user)
    r = c.get(f"{API}/auth/session")
    assert r.status_code == 200
    assert r.json()["me"] == c.get(f"{API}/me").json()
    assert r.headers["cache-control"] == "no-store"


def test_me(client_for: ClientFor, make_user: MakeUser) -> None:
    user = make_user(email="me@example.com", name="Maryam Ali", year=3)
    r = client_for(user).get(f"{API}/me")
    assert r.status_code == 200
    assert r.json() == {
        "id": str(user.id),
        "displayName": "Maryam Ali",
        "year": 3,
        "roles": [{"id": r.json()["roles"][0]["id"], "slug": "student", "name": "Student", "badge": None}],
        "boxes": ["forum.post", "library.upload", "newsletter.react", "reports.create"],
        "features": ["forum", "library", "library.uploads", "newsletter", "calendar", "career", "grades", "noora"],
        "status": "active",
        "email": "me@example.com",
        "phone": None,
        "needsProfile": False,
        "createdAt": r.json()["createdAt"],
        "preferences": {
            "notificationEmails": True,
            "emailReplies": True,
            "emailAnswerAccepted": True,
            "emailUploadReviews": True,
            "emailNewIssues": True,
            "emailDateChanges": True,
            "emailWeeklySummary": False,
            "trackProgress": False,
            "homeBlocks": None,
        },
        "papers": [],
        "zone": None,
    }


def test_your_papers(client_for: ClientFor, make_user: MakeUser) -> None:
    """The papers someone sits, kept on the account; a new year clears them."""
    c = client_for(make_user(year=2))
    papers = ["econometrics", "statistics", "econometrics"]
    r = c.patch(f"{API}/me", json={"papers": papers})
    assert r.status_code == 200, r.text
    assert r.json()["papers"] == ["econometrics", "statistics"]  # in order, once each
    assert c.patch(f"{API}/me", json={"year": 2}).json()["papers"] == ["econometrics", "statistics"]  # same year
    assert c.patch(f"{API}/me", json={"year": 3}).json()["papers"] == []  # Year 2's choices don't carry over
    both = c.patch(f"{API}/me", json={"year": 2, "papers": ["abstract-maths"]}).json()
    assert (both["year"], both["papers"]) == (2, ["abstract-maths"])
    assert c.patch(f"{API}/me", json={"papers": []}).json()["papers"] == []
    assert c.patch(f"{API}/me", json={"zone": "B"}).json()["zone"] == "B"
    assert c.patch(f"{API}/me", json={"papers": ["statistics"]}).json()["zone"] == "B"  # left as it was
    assert c.patch(f"{API}/me", json={"zone": None}).json()["zone"] is None
    assert c.patch(f"{API}/me", json={"zone": "C"}).status_code == 422
    assert c.patch(f"{API}/me", json={"papers": ["Bad Id"]}).status_code == 422
    assert c.patch(f"{API}/me", json={"papers": [f"m{i}" for i in range(21)]}).status_code == 422


def test_the_profile_step(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    user = make_user(name=None, year=None, emails=None)
    c = client_for(user)
    me = c.get(f"{API}/me").json()
    assert (me["needsProfile"], me["preferences"]["notificationEmails"]) == (True, None)
    # the question about emails is answered with the name: yes or no, never left out
    r = c.patch(f"{API}/me", json={"displayName": "Sara Ahmed", "year": 1})
    assert (r.status_code, r.json()["error"]["code"]) == (422, "invalid_input")
    assert list(r.json()["error"]["fields"]) == ["preferences.notificationEmails"]
    r = c.patch(f"{API}/me", json={"displayName": "Sara Ahmed", "preferences": {"notificationEmails": None}})
    assert r.status_code == 422
    assert _fresh(db, User, user.id).display_name is None  # nothing was saved
    r = c.patch(
        f"{API}/me", json={"displayName": "  Sara   Ahmed ", "year": 1, "preferences": {"notificationEmails": False}}
    )
    assert r.status_code == 200, r.text
    assert r.json()["displayName"] == "Sara Ahmed"
    assert r.json()["year"] == 1
    assert r.json()["needsProfile"] is False
    assert r.json()["preferences"]["notificationEmails"] is False
    # once there is a profile, a new name needs nothing more
    assert c.patch(f"{API}/me", json={"displayName": "Sara A."}).status_code == 200


def test_the_answer_about_emails_starts_every_notification_email(client_for: ClientFor, make_user: MakeUser) -> None:
    notifications = ["emailReplies", "emailAnswerAccepted", "emailUploadReviews", "emailNewIssues", "emailDateChanges"]
    c = client_for(make_user(name=None, emails=None))
    before = c.get(f"{API}/me").json()["preferences"]
    assert [before[s] for s in [*notifications, "emailWeeklySummary"]] == [False] * 6  # nothing before an answer
    yes = c.patch(f"{API}/me", json={"displayName": "Omar", "preferences": {"notificationEmails": True}}).json()
    assert [yes["preferences"][s] for s in notifications] == [True] * 5
    assert yes["preferences"]["emailWeeklySummary"] is False  # the Sunday summary is asked for on its own
    no = client_for(make_user(name=None, emails=None))
    r = no.patch(f"{API}/me", json={"displayName": "Huda", "preferences": {"notificationEmails": False}})
    assert [r.json()["preferences"][s] for s in notifications] == [False] * 5
    # each one changes on its own; the answer changed later moves the ones never switched
    r = no.patch(f"{API}/me", json={"preferences": {"emailDateChanges": True}})
    assert [r.json()["preferences"][s] for s in notifications] == [False, False, False, False, True]
    r = no.patch(f"{API}/me", json={"preferences": {"notificationEmails": True, "emailNewIssues": False}})
    assert [r.json()["preferences"][s] for s in notifications] == [True, True, True, False, True]
    r = no.patch(f"{API}/me", json={"preferences": {"notificationEmails": None}})  # null: unchanged
    assert r.json()["preferences"]["notificationEmails"] is True


def test_an_email_turned_on_before_an_answer_answers_no_for_the_others(
    client_for: ClientFor, make_user: MakeUser, db: Session
) -> None:
    """An account with a profile and no answer (made with dev-login): its switches show off, and work."""
    user = make_user(emails=None)
    c = client_for(user)
    r = c.patch(f"{API}/me", json={"preferences": {"emailReplies": False}})  # turned off: still no answer
    assert r.json()["preferences"]["notificationEmails"] is None
    r = c.patch(f"{API}/me", json={"preferences": {"emailNewIssues": True}})
    prefs = r.json()["preferences"]
    assert [prefs[s] for s in ("notificationEmails", "emailNewIssues", "emailReplies", "emailDateChanges")] == [
        False,
        True,
        False,
        False,
    ]
    assert _fresh(db, User, user.id).preferences == {
        "notification_emails": False,
        "email_replies": False,
        "email_new_issues": True,
    }


@pytest.mark.parametrize(
    ("typed", "stored"),
    [
        ("محمد علي", "محمد علي"),
        ("Anne-Marie O\u2019Neil", "Anne-Marie O'Neil"),
        ("J. R. Smith", "J. R. Smith"),
        ("Zo\u00eb 2", "Zo\u00eb 2"),
        ("Jose\u0301", "Jos\u00e9"),  # combining accent, composed
        ("\uff2d\uff41\uff52\uff59\uff41\uff4d", "Maryam"),  # full-width letters fold (NFKC)
        ("Fatima\u00a0Hasan", "Fatima Hasan"),  # a no-break space is a space
        ("نورا", "نورا"),
        ("\u0939\u093f\u0928\u094d\u0926\u0940", "\u0939\u093f\u0928\u094d\u0926\u0940"),  # marks inside a script
    ],
)
def test_display_names_that_work(client_for: ClientFor, make_user: MakeUser, typed: str, stored: str) -> None:
    r = client_for(make_user()).patch(f"{API}/me", json={"displayName": typed})
    assert r.status_code == 200, r.text
    assert r.json()["displayName"] == stored


@pytest.mark.parametrize(
    "typed",
    [
        "a",
        "  b  ",
        "x" * 41,
        "<b>Mo</b>",
        "Mo \U0001f600",
        "123",
        "...",
        "Ad\u200bmin Sara",  # zero-width space
        "Sara\u200cAli",  # zero-width non-joiner
        "Mo\u202eM",  # right-to-left override
        "\u0301Ali",  # starts with a combining mark
        "Line\nBreak\u0007",
        "Admin Ali",
        "Head MODERATOR",
        "Student Rep Sara",
        "DSBA official",
        "bibf team",
        None,
    ],
)
def test_display_names_that_dont(client_for: ClientFor, make_user: MakeUser, typed: str | None) -> None:
    user = make_user(name="Before")
    r = client_for(user).patch(f"{API}/me", json={"displayName": typed})
    assert r.status_code == 422, r.text
    err = r.json()["error"]
    assert err["code"] == "invalid_display_name"
    assert set(err["fields"]) == {"displayName"}


@pytest.mark.parametrize(
    "typed",
    [
        "\u0410dmin",  # Cyrillic A
        "Student R\u0435p",  # Cyrillic e
        "DSB\u0410 Team",  # Cyrillic A
        "\u0391dmin",  # Greek Alpha
        "Adm\u0131n",  # dotless i
        "Adm1n Sara",  # a digit for a letter
        "M0derator",
        "Adrnin",  # r + n reads as m
        "B\u0456BF Team",  # Cyrillic i
        "\u0410\u0434m\u0456n",  # Cyrillic and Latin mixed in one word
    ],
)
def test_look_alike_staff_names_are_refused(client_for: ClientFor, make_user: MakeUser, typed: str) -> None:
    """Security review SEC-11: letters from other alphabets that look like the staff words don't get past the rule."""
    r = client_for(make_user(name="Before")).patch(f"{API}/me", json={"displayName": typed})
    assert r.status_code == 422, r.text
    assert r.json()["error"]["code"] == "invalid_display_name"


@pytest.mark.parametrize(
    "typed",
    [
        "A d m i n",
        "Ad-min",
        "Ad.min Sara",
        "Ad'min",
        "Ad min",
        "Sara A-d-m-i-n",
        "Ad-ministrator",
        "A d r n i n",  # r + n reads as m across the gap too
        "D S B A Team",
        "D.S.B.A.",
        "B I B F",
        "Student R e p",
        "StudentRep",
        "Student-Rep Ali",
        "Mod erator",
        "\u0410 d m i n",  # a Cyrillic A, spaced out
    ],
)
def test_staff_words_spelt_out_across_spaces_dots_and_hyphens_are_refused(
    client_for: ClientFor, make_user: MakeUser, typed: str
) -> None:
    r = client_for(make_user(name="Before")).patch(f"{API}/me", json={"displayName": typed})
    assert r.status_code == 422, r.text
    assert r.json()["error"]["code"] == "invalid_display_name"


@pytest.mark.parametrize(
    "typed",
    [
        "Ahmad Mina",
        "Habib Fakhro",
        "Saad Minhas",
        "Adam Inayat",
        "Mohamed Al-Dosari",
        "Reem D'Souza",
        "Hamad B. Ibrahim",
    ],
)
def test_names_that_only_end_and_begin_a_staff_word_are_fine(
    client_for: ClientFor, make_user: MakeUser, typed: str
) -> None:
    """'Ahmad Mina' holds a-d-m-i-n across its space, and 'Habib Fakhro' b-i-b-f: neither starts a staff word."""
    r = client_for(make_user(name="Before")).patch(f"{API}/me", json={"displayName": typed})
    assert r.status_code == 200, r.text
    assert r.json()["displayName"] == typed


@pytest.mark.parametrize(
    "typed",
    [
        "\u041c\u0430\u0440\u0438\u044f \u0418\u0432\u0430\u043d\u043e\u0432\u0430",
        "\u03a3\u03bf\u03c6\u03af\u03b1 P.",
        "Ali 2",
    ],
)
def test_names_in_one_alphabet_per_word_are_fine(client_for: ClientFor, make_user: MakeUser, typed: str) -> None:
    r = client_for(make_user()).patch(f"{API}/me", json={"displayName": typed})
    assert r.status_code == 200, r.text


def test_staff_may_use_staff_words(client_for: ClientFor, make_user: MakeUser) -> None:
    rep = make_user(roles=("student", "rep"))
    r = client_for(rep).patch(f"{API}/me", json={"displayName": "Sara (student rep)".replace("(", "").replace(")", "")})
    assert r.status_code == 200, r.text
    assert r.json()["displayName"] == "Sara student rep"


def test_a_badge_alone_does_not_allow_staff_names(
    client_for: ClientFor, make_user: MakeUser, make_role: Callable[..., Any]
) -> None:
    """Only Admin and Rep holders may use staff words in their names; a custom role's badge doesn't allow it."""
    make_role("helpers", badge="Helper")
    helper = make_user(name="Before", roles=("student", "helpers"))
    r = client_for(helper).patch(f"{API}/me", json={"displayName": "Admin"})
    assert (r.status_code, r.json()["error"]["code"]) == (422, "invalid_display_name")
    admin = make_user(name="Before", roles=("student", "admin"))
    assert client_for(admin).patch(f"{API}/me", json={"displayName": "Admin Sara"}).status_code == 200


def test_year(client_for: ClientFor, make_user: MakeUser) -> None:
    c = client_for(make_user(year=2))
    assert c.patch(f"{API}/me", json={"year": 3}).json()["year"] == 3
    assert c.patch(f"{API}/me", json={"displayName": "Still Three"}).json()["year"] == 3  # not sent: unchanged
    assert c.patch(f"{API}/me", json={"year": None}).json()["year"] is None  # null clears it
    r = c.patch(f"{API}/me", json={"year": 4})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "invalid_input"


def _switches(**changed: bool) -> dict[str, object]:
    """The preferences as the API shows them to someone who answered yes about emails at sign-up: the Sunday summary
    and lesson progress off, the other emails on, Home's default layout; except those given."""
    defaults: dict[str, object] = {
        "notificationEmails": True,
        "emailReplies": True,
        "emailAnswerAccepted": True,
        "emailUploadReviews": True,
        "emailNewIssues": True,
        "emailDateChanges": True,
        "emailWeeklySummary": False,
        "trackProgress": False,
        "homeBlocks": None,
    }
    return defaults | changed


def test_preferences_one_switch_per_kind_of_email(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    """Decision D1: one switch per kind of email. A switch set is stored; one never set follows the answer about
    emails at sign-up."""
    user = make_user()
    c = client_for(user)
    r = c.patch(f"{API}/me", json={"preferences": {"emailNewIssues": False}})
    assert r.status_code == 200, r.text
    assert r.json()["preferences"] == _switches(emailNewIssues=False)
    r = c.patch(f"{API}/me", json={"preferences": {"emailReplies": False, "emailNewIssues": None}})
    assert r.json()["preferences"] == _switches(emailReplies=False, emailNewIssues=False)  # null: unchanged
    assert c.get(f"{API}/me").json()["preferences"] == _switches(emailReplies=False, emailNewIssues=False)
    assert _fresh(db, User, user.id).preferences == {
        "notification_emails": True,
        "email_replies": False,
        "email_new_issues": False,
    }
    r = c.patch(f"{API}/me", json={"preferences": {"emailReplies": True, "emailNewIssues": True}})
    assert r.json()["preferences"] == _switches()
    r = c.patch(f"{API}/me", json={"preferences": {"emailWeeklySummary": True}})  # opt-in: stored when on
    assert r.json()["preferences"] == _switches(emailWeeklySummary=True)
    assert _fresh(db, User, user.id).preferences["email_weekly_summary"] is True


def test_lesson_progress_is_opt_in(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    user = make_user()
    c = client_for(user)
    r = c.patch(f"{API}/me", json={"preferences": {"trackProgress": True}})
    assert r.status_code == 200, r.text
    assert r.json()["preferences"] == _switches(trackProgress=True)
    r = c.patch(f"{API}/me", json={"preferences": {"emailReplies": False}})
    assert r.json()["preferences"] == _switches(trackProgress=True, emailReplies=False)  # the others stay
    assert _fresh(db, User, user.id).preferences == {
        "notification_emails": True,
        "track_progress": True,
        "email_replies": False,
    }


def test_home_blocks(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    """Home's layout: the blocks shown, in order (repeats dropped); null goes back to the default."""
    user = make_user()
    c = client_for(user)
    r = c.patch(f"{API}/me", json={"preferences": {"homeBlocks": ["todo", "coming_up", "todo"]}})
    assert r.status_code == 200, r.text
    assert r.json()["preferences"]["homeBlocks"] == ["todo", "coming_up"]
    r = c.patch(f"{API}/me", json={"preferences": {"emailNewIssues": False}})
    assert r.json()["preferences"]["homeBlocks"] == ["todo", "coming_up"]  # not sent: unchanged
    r = c.patch(f"{API}/me", json={"preferences": {"homeBlocks": []}})
    assert r.json()["preferences"]["homeBlocks"] == []  # every block hidden
    r = c.patch(f"{API}/me", json={"preferences": {"homeBlocks": None}})
    assert r.json()["preferences"] == _switches(emailNewIssues=False)
    assert "home_blocks" not in _fresh(db, User, user.id).preferences
    r = c.patch(f"{API}/me", json={"preferences": {"homeBlocks": ["weather"]}})
    assert r.status_code == 422
    r = c.patch(f"{API}/me", json={"preferences": {"homeBlocks": ["todo"] * (MAX_HOME_BLOCKS + 1)}})
    assert r.status_code == 422
    for gone in (["new"], ["files", "new", "forum", "noora"]):  # a block the hub no longer has: dropped on read
        user.preferences = {"home_blocks": gone}
        db.commit()
        assert c.get(f"{API}/me").json()["preferences"]["homeBlocks"] == [b for b in gone if b != "new"]


def test_a_suspended_account_keeps_its_name(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    user = make_user(name="Old Name")
    user.status = UserStatus.suspended
    db.commit()
    c = client_for(user)
    r = c.patch(f"{API}/me", json={"displayName": "New Name"})
    assert r.status_code == 403
    assert c.patch(f"{API}/me", json={"displayName": "Old Name", "year": 1}).status_code == 200
    assert c.get(f"{API}/me").json()["displayName"] == "Old Name"


# ── sessions ────────────────────────────────────────────────────────────────────────────────


def test_sessions_list(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    user = make_user()
    a, b = client_for(user), client_for(user)
    now = utcnow()
    db.add_all(
        [
            UserSession(user_id=user.id, token_hash=hash_token("dead"), expires_at=now - timedelta(minutes=1)),
            UserSession(
                user_id=user.id, token_hash=hash_token("gone"), expires_at=now + timedelta(days=1), revoked_at=now
            ),
        ]
    )
    db.commit()
    items = a.get(f"{API}/me/sessions").json()
    assert len(items) == 2
    assert [s["current"] for s in items].count(True) == 1
    assert set(items[0]) == {"id", "createdAt", "lastSeenAt", "userAgent", "ip", "current"}
    b_items = b.get(f"{API}/me/sessions").json()
    assert {s["id"] for s in b_items} == {s["id"] for s in items}
    assert next(s["id"] for s in items if s["current"]) != next(s["id"] for s in b_items if s["current"])


def test_revoke_another_browser(client_for: ClientFor, make_user: MakeUser) -> None:
    user = make_user()
    a, b = client_for(user), client_for(user)
    b_id = next(s["id"] for s in b.get(f"{API}/me/sessions").json() if s["current"])
    r = a.delete(f"{API}/me/sessions/{b_id}")
    assert r.status_code == 204
    assert not any(h.startswith("dsba_session=") for h in r.headers.get_list("set-cookie"))
    assert b.get(f"{API}/me").status_code == 401
    assert a.get(f"{API}/me").status_code == 200


def test_revoke_this_browser_clears_its_cookie(client_for: ClientFor, make_user: MakeUser) -> None:
    c = client_for(make_user())
    mine = next(s["id"] for s in c.get(f"{API}/me/sessions").json() if s["current"])
    r = c.delete(f"{API}/me/sessions/{mine}")
    assert r.status_code == 204
    assert any(h.startswith("dsba_session=") for h in r.headers.get_list("set-cookie"))
    assert c.get(f"{API}/me").status_code == 401


def test_cannot_revoke_someone_elses_session(client_for: ClientFor, make_user: MakeUser) -> None:
    owner, other = client_for(make_user()), client_for(make_user())
    theirs = owner.get(f"{API}/me/sessions").json()[0]["id"]
    assert other.delete(f"{API}/me/sessions/{theirs}").status_code == 404
    assert other.delete(f"{API}/me/sessions/{uuid.uuid4()}").status_code == 404
    assert owner.get(f"{API}/me").status_code == 200


# ── adding, changing and removing identifiers ───────────────────────────────────────────────


def test_add_a_phone_number(client_for: ClientFor, make_user: MakeUser, outbox: Outbox, deliver: Deliver) -> None:
    user = make_user(email="adds@example.com")
    c = client_for(user)
    r = c.post(f"{API}/me/identifiers/otp", json={"identifier": "3312 3459"})
    assert r.status_code == 202, r.text
    assert r.json()["channel"] == "sms"
    assert r.json()["destinationHint"] == "+973 •••• ••59"
    text = outbox.to("+97333123459")[0]
    r = c.post(f"{API}/me/identifiers/verify", json={"challengeId": r.json()["challengeId"], "code": text.code})
    assert r.status_code == 200, r.text
    assert r.json()["phone"] == "+97333123459"
    assert r.json()["email"] == "adds@example.com"
    assert outbox.to("adds@example.com") == []  # an email notice goes through the outbox
    assert deliver() == 1
    [notice] = outbox.to("adds@example.com")
    assert "A phone number (+973 •••• ••59) was added" in notice.text
    assert "If this wasn't you" in notice.text


def test_change_the_email_address(
    client_for: ClientFor,
    make_user: MakeUser,
    outbox: Outbox,
    sign_in: SignIn,
    age: Callable[..., None],
    deliver: Deliver,
) -> None:
    user = make_user(email="old@example.com", phone="+97333123460")
    c = client_for(user)
    r = c.post(f"{API}/me/identifiers/otp", json={"identifier": "New@Example.com"})
    assert r.status_code == 202
    mail = outbox.to("new@example.com")[0]
    assert "add this email address to your account" in mail.text
    r = c.post(f"{API}/me/identifiers/verify", json={"challengeId": r.json()["challengeId"], "code": mail.code})
    assert r.status_code == 200
    assert r.json()["email"] == "new@example.com"
    deliver()
    [notice] = outbox.to("old@example.com")  # sent although the account no longer has that address
    assert "changed to n•••@example.com" in notice.text
    age(31)
    assert sign_in("new@example.com")[1]["user"]["id"] == str(user.id)
    assert sign_in("old@example.com")[1]["isNewUser"] is True  # the old address is free again


def test_an_identifier_in_use_gets_a_notice_and_the_same_answer(
    client_for: ClientFor, make_user: MakeUser, outbox: Outbox, db: Session
) -> None:
    make_user(email="taken@example.com")
    c = client_for(make_user(phone="+97333123461"))
    taken = c.post(f"{API}/me/identifiers/otp", json={"identifier": "taken@example.com"})
    free = c.post(f"{API}/me/identifiers/otp", json={"identifier": "free@example.com"})
    assert taken.status_code == free.status_code == 202
    a, b = taken.json(), free.json()
    assert a.keys() == b.keys()
    assert (a["channel"], a["expiresIn"], a["resendAfter"]) == (b["channel"], b["expiresIn"], b["resendAfter"])
    [notice] = outbox.to("taken@example.com")
    assert notice.subject == "This email address already has a DSBA Hub account"
    assert "sign in with this email address instead" in notice.text
    assert not any(ch.isdigit() for ch in notice.text.split("DSBA Hub\n")[0])  # no code in it
    # the request still counts: the cooldown applies to both alike
    assert c.post(f"{API}/me/identifiers/otp", json={"identifier": "taken@example.com"}).status_code == 429
    assert c.post(f"{API}/me/identifiers/otp", json={"identifier": "free@example.com"}).status_code == 429
    r = c.post(f"{API}/me/identifiers/verify", json={"challengeId": a["challengeId"], "code": "000000"})
    assert r.status_code in (409, 422)


def test_identifier_taken_while_the_code_was_on_its_way(
    client_for: ClientFor, make_user: MakeUser, outbox: Outbox, db: Session
) -> None:
    user = make_user(email="slow@example.com")
    c = client_for(user)
    r = c.post(f"{API}/me/identifiers/otp", json={"identifier": "33123462"})
    make_user(phone="+97333123462")
    r = c.post(f"{API}/me/identifiers/verify", json={"challengeId": r.json()["challengeId"], "code": outbox[-1].code})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "identifier_taken"
    assert _fresh(db, User, user.id).phone is None


def test_identifier_unchanged(client_for: ClientFor, make_user: MakeUser, outbox: Outbox) -> None:
    c = client_for(make_user(email="same@example.com"))
    r = c.post(f"{API}/me/identifiers/otp", json={"identifier": "SAME@example.com"})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "identifier_unchanged"
    assert outbox == []


def test_codes_are_bound_to_their_user_and_purpose(client_for: ClientFor, make_user: MakeUser, outbox: Outbox) -> None:
    mine = client_for(make_user())
    r = mine.post(f"{API}/me/identifiers/otp", json={"identifier": "33123463"})
    cid, code = r.json()["challengeId"], outbox[-1].code
    thief = client_for(make_user())
    r = thief.post(f"{API}/me/identifiers/verify", json={"challengeId": cid, "code": code})
    assert r.status_code == 410
    sign_in_challenge = start(client_for(), "33123464").json()["challengeId"]
    r = mine.post(f"{API}/me/identifiers/verify", json={"challengeId": sign_in_challenge, "code": outbox[-1].code})
    assert r.status_code == 410
    r = mine.post(f"{API}/me/identifiers/verify", json={"challengeId": cid, "code": wrong(code)})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "invalid_code"
    assert mine.post(f"{API}/me/identifiers/verify", json={"challengeId": cid, "code": code}).status_code == 200


def test_codes_per_user_for_new_identifiers(
    client_for: ClientFor, make_user: MakeUser, outbox: Outbox, set_option: Callable[[str, Any], None]
) -> None:
    set_option("otp_max_per_identifier_per_hour", 2)
    c = client_for(make_user())
    assert c.post(f"{API}/me/identifiers/otp", json={"identifier": "33123465"}).status_code == 202
    assert c.post(f"{API}/me/identifiers/otp", json={"identifier": "33123466"}).status_code == 202
    r = c.post(f"{API}/me/identifiers/otp", json={"identifier": "33123467"})
    assert r.status_code == 429
    assert r.json()["error"]["code"] == "rate_limited"
    assert "too many codes" in r.json()["error"]["message"]


def test_changing_identifiers_signs_out_other_browsers(
    client_for: ClientFor, make_user: MakeUser, outbox: Outbox
) -> None:
    user = make_user(email="careful@example.com")
    here, there = client_for(user), client_for(user)
    r = here.post(f"{API}/me/identifiers/otp", json={"identifier": "33123468"})
    here.post(f"{API}/me/identifiers/verify", json={"challengeId": r.json()["challengeId"], "code": outbox[-1].code})
    assert here.get(f"{API}/me").status_code == 200
    assert there.get(f"{API}/me").status_code == 401


def test_remove_an_identifier(client_for: ClientFor, make_user: MakeUser, outbox: Outbox) -> None:
    user = make_user(email="both@example.com", phone="+97333123469")
    here, there = client_for(user), client_for(user)
    r = here.delete(f"{API}/me/identifiers/phone")
    assert r.status_code == 200
    assert r.json()["phone"] is None
    assert r.json()["email"] == "both@example.com"
    [notice] = outbox.to("+97333123469")
    assert "This phone number was removed from your DSBA Hub account." in notice.text
    assert there.get(f"{API}/me").status_code == 401
    r = here.delete(f"{API}/me/identifiers/email")
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "last_identifier"
    assert here.delete(f"{API}/me/identifiers/phone").status_code == 200  # nothing to remove
    assert here.delete(f"{API}/me/identifiers/name").status_code == 422


# ── export ──────────────────────────────────────────────────────────────────────────────────


def _thread(db: Session, author: User | None, **kw: Any) -> ForumThread:
    t = ForumThread(
        slug=f"t-{uuid.uuid4().hex[:8]}", title="A question about MGFs", body="Body", category="general", **kw
    )
    t.author_id = author.id if author else None
    db.add(t)
    db.flush()
    return t


STROKE = {"id": "s1", "tool": "pen", "color": "#1f2933", "width": 2.0, "points": [10.0, 20.0, 0.5]}


def test_export(client_for: ClientFor, make_user: MakeUser, db: Session, module: Module) -> None:
    user = make_user(email="export@example.com", phone="+97333123470")
    other = make_user(email="someone-else@example.com", phone="+97333123471", name="Other Person")
    mine = _thread(db, user)
    theirs = _thread(db, other)
    reply = ForumReply(thread_id=theirs.id, author_id=user.id, body="My answer")
    db.add(reply)
    db.add(ForumReply(thread_id=mine.id, author_id=other.id, body="Their answer"))
    item = LibraryItem(
        slug=f"i-{uuid.uuid4().hex[:6]}",
        source=ItemSource.link,
        kind="notes",
        title="My notes",
        url="https://example.com",
        uploaded_by=user.id,
        status=ItemStatus.published,
    )
    db.add(item)
    issue = NewsletterIssue(slug=f"n-{uuid.uuid4().hex[:6]}", number=1, title="Issue 1", date=dt.date(2026, 10, 1))
    db.add(issue)
    book, their_book = uuid.uuid4(), uuid.uuid4()
    db.flush()
    db.add_all(
        [
            LibraryStar(user_id=user.id, item_id=item.id),
            NewsletterReaction(user_id=user.id, issue_id=issue.id, section_id="intro", reaction="love"),
            ThreadVote(user_id=user.id, thread_id=theirs.id),
            Report(reporter_id=user.id, target_type="thread", target_id=theirs.id, reason="spam", note="Ads"),
            LessonView(user_id=user.id, lesson_id=lesson_id(module, 0, 0)),
            Notification(user_id=user.id, kind="thread_reply", title="Someone replied", actor_id=other.id),
            Notification(user_id=other.id, kind="thread_reply", title="Not mine", actor_id=user.id),
            Notebook(id=book, user_id=user.id, title="Test notebook", module_id=module.id),
            Notebook(id=their_book, user_id=other.id, title="Their notebook"),
            NooraUsage(user_id=user.id, day=dt.date(2026, 10, 2), questions=3, input_tokens=900, output_tokens=200),
        ]
    )
    db.flush()
    note = Note(user_id=user.id, notebook_id=book, title="Private", text="my-private-note-text")
    db.add_all([note, Note(user_id=other.id, notebook_id=their_book, title="Theirs", text="their-private-note-text")])
    db.flush()
    db.add(NoteInk(note_id=note.id, sheet=0, strokes=[STROKE], size_bytes=100))
    db.commit()
    r = client_for(user).get(f"{API}/me/export")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["user"]["email"] == "export@example.com"
    assert [s["current"] for s in data["sessions"]] == [True]
    assert [t["id"] for t in data["threads"]] == [str(mine.id)]
    assert data["threads"][0]["title"] == "A question about MGFs"
    assert [x["body"] for x in data["replies"]] == ["My answer"]
    assert data["replies"][0]["threadSlug"] == theirs.slug
    assert [i["title"] for i in data["libraryItems"]] == ["My notes"]
    assert data["stars"] == [str(item.id)]
    assert data["reactions"][0]["reaction"] == "love"
    assert data["reactions"][0]["issueSlug"] == issue.slug
    assert data["votes"] == [{"type": "thread", "id": str(theirs.id), "createdAt": data["votes"][0]["createdAt"]}]
    assert data["reports"][0]["note"] == "Ads"
    assert list(data["progress"]["watched"]) == [lesson_id(module, 0, 0)]
    assert [n["title"] for n in data["notifications"]] == ["Someone replied"]
    assert data["emails"] == []
    assert [(b["title"], b["moduleId"]) for b in data["notebooks"]] == [("Test notebook", module.id)]
    assert [(n["title"], n["text"], n["ink"]) for n in data["notebooks"][0]["notes"]] == [
        ("Private", "my-private-note-text", [{"sheet": 0, "strokes": [STROKE]}])
    ]  # SEC-24
    assert data["nooraUsage"] == [{"day": "2026-10-02", "questions": 3, "inputTokens": 900, "outputTokens": 200}]
    assert set(data) == {  # code quality review CQ-4: a typed export, every section on purpose
        "user",
        "sessions",
        "threads",
        "replies",
        "libraryItems",
        "stars",
        "reactions",
        "progress",
        "notifications",
        "votes",
        "reports",
        "bugReports",
        "requests",
        "meToos",
        "questionTags",
        "questionFlags",
        "emails",
        "boards",
        "boardLabels",
        "boardPlans",
        "paperScores",
        "follows",
        "pollVotes",
        "senior",
        "notebooks",
        "nooraUsage",
        "videoSuggestions",
        "calendarEvents",
        "calendarSettings",
        "dailyPlays",
        "dailyShowOnBoard",
    }
    text = json.dumps(data)
    for private in ("someone-else@example.com", "+97333123471", "Their answer", "Not mine", "their-private-note-text"):
        assert private not in text


# ── deletion ────────────────────────────────────────────────────────────────────────────────


def _object(storage: Storage, key: str) -> str:
    storage.client.put_object(Bucket=storage.bucket, Key=key, Body=b"%PDF-1.4", ContentType="application/pdf")
    return key


def test_delete_the_account(
    client_for: ClientFor, make_user: MakeUser, db: Session, storage: Storage, module: Module
) -> None:
    user = make_user(email="bye@example.com", phone="+97333123472")
    other = make_user(name="Stays Here")
    c = client_for(user)
    mine = _thread(db, user)
    theirs = _thread(db, other, vote_count=1)
    their_reply = ForumReply(thread_id=theirs.id, author_id=other.id, body="Answer", vote_count=1)
    my_reply = ForumReply(thread_id=theirs.id, author_id=user.id, body="Mine")
    db.add_all([their_reply, my_reply])
    db.flush()
    db.add_all([ThreadVote(user_id=user.id, thread_id=theirs.id), ReplyVote(user_id=user.id, reply_id=their_reply.id)])

    def item(status: ItemStatus, key: str) -> LibraryItem:
        i = LibraryItem(
            slug=f"i-{uuid.uuid4().hex[:8]}",
            source=ItemSource.file,
            kind="notes",
            title=f"{status.value} notes",
            storage_key=_object(storage, key),
            file_name="notes.pdf",
            content_type="application/pdf",
            size_bytes=8,
            uploaded_by=user.id,
            status=status,
        )
        db.add(i)
        return i

    published = item(ItemStatus.published, f"library/{uuid.uuid4()}/published.pdf")
    pending = item(ItemStatus.pending, f"library/{uuid.uuid4()}/pending.pdf")
    rejected = item(ItemStatus.rejected, f"library/{uuid.uuid4()}/rejected.pdf")
    removed = item(ItemStatus.removed, f"library/{uuid.uuid4()}/removed.pdf")

    def upload(purpose: UploadPurpose, status: UploadStatus, key: str) -> Upload:
        u = Upload(
            user_id=user.id,
            purpose=purpose,
            storage_key=key,
            file_name="f",
            content_type="application/pdf",
            size_bytes=8,
            status=status,
        )
        db.add(u)
        return u

    kept_upload = upload(UploadPurpose.library, UploadStatus.attached, published.storage_key or "")
    pending_upload = upload(UploadPurpose.library, UploadStatus.attached, pending.storage_key or "")
    loose = upload(UploadPurpose.library, UploadStatus.uploaded, _object(storage, f"library/{uuid.uuid4()}/x.pdf"))
    picture = upload(UploadPurpose.forum_image, UploadStatus.attached, _object(storage, f"forum/{uuid.uuid4()}/p.png"))
    issue = NewsletterIssue(slug=f"n-{uuid.uuid4().hex[:6]}", number=2, title="Issue 2", date=dt.date(2026, 10, 2))
    db.add(issue)
    db.flush()
    report = Report(reporter_id=user.id, target_type="thread", target_id=theirs.id, reason="spam")
    sent = Notification(user_id=other.id, kind="thread_reply", title="A reply", actor_id=user.id)
    entry = AuditEntry(actor_id=user.id, action="library.publish")
    challenge = OtpChallenge(
        purpose=OtpPurpose.sign_in,
        channel="email",
        identifier="bye@example.com",
        code_hash="x" * 64,
        expires_at=utcnow() + timedelta(minutes=5),
    )
    db.add_all(
        [
            report,
            sent,
            entry,
            challenge,
            LibraryStar(user_id=user.id, item_id=published.id),
            NewsletterReaction(user_id=user.id, issue_id=issue.id, section_id="s", reaction="useful"),
            LessonView(user_id=user.id, lesson_id=lesson_id(module, 0, 0)),
            Notification(user_id=user.id, kind="system", title="For me"),
        ]
    )
    db.commit()
    ids = {
        "user": user.id,
        "pending": pending.id,
        "rejected": rejected.id,
        "loose": loose.id,
        "picture": picture.id,
        "pending_upload": pending_upload.id,
    }

    r = c.delete(f"{API}/me")
    assert r.status_code == 204
    assert any(h.startswith("dsba_session=") for h in r.headers.get_list("set-cookie"))
    assert c.get(f"{API}/me").status_code == 401

    db.expire_all()
    assert db.get(User, ids["user"]) is None
    # posts stay, without an author; their votes are taken back
    assert _row(db, ForumThread, mine.id).author_id is None
    assert _row(db, ForumReply, my_reply.id).author_id is None
    assert _row(db, ForumThread, theirs.id).vote_count == 0
    assert _row(db, ForumReply, their_reply.id).vote_count == 0
    # the library: published and removed items stay unattributed; pending and rejected ones go with their files
    assert _row(db, LibraryItem, published.id).uploaded_by is None
    assert db.get(LibraryItem, removed.id) is not None
    assert db.get(LibraryItem, ids["pending"]) is None
    assert db.get(LibraryItem, ids["rejected"]) is None
    assert storage.head(published.storage_key or "") is not None
    assert storage.head(pending.storage_key or "") is None
    assert storage.head(rejected.storage_key or "") is None
    # uploads: the loose one and the forum picture go (rows and files), the published item's stays
    for gone in ("loose", "picture", "pending_upload"):
        assert db.get(Upload, ids[gone]) is None
    assert storage.head(loose.storage_key) is None
    assert storage.head(picture.storage_key) is None
    assert _row(db, Upload, kept_upload.id).user_id is None
    # everything personal is gone, other people's records lose the link
    for model in (UserSession, LibraryStar, NewsletterReaction, LessonView, ThreadVote, ReplyVote):
        assert db.scalars(select(model).where(model.user_id == ids["user"])).all() == []
    assert db.scalars(select(Notification).where(Notification.user_id == ids["user"])).all() == []
    assert _row(db, Notification, sent.id).actor_id is None
    assert _row(db, Report, report.id).reporter_id is None
    assert _row(db, AuditEntry, entry.id).actor_id is None
    # the sign-in code stays for the rate limits, without the address and unusable (student test, security note)
    kept = db.get(OtpChallenge, challenge.id)
    assert kept is not None
    assert kept.identifier == anon_identifier("email", "bye@example.com")
    assert "bye" not in kept.identifier
    assert kept.user_id is None
    assert kept.expires_at <= utcnow()
    assert db.get(User, other.id) is not None


def test_account_stays_when_its_files_cannot_be_deleted(
    client_for: ClientFor, make_user: MakeUser, db: Session, storage: Storage, monkeypatch: pytest.MonkeyPatch
) -> None:
    user = make_user()
    db.add(
        Upload(
            user_id=user.id,
            purpose=UploadPurpose.forum_image,
            storage_key=_object(storage, f"forum/{uuid.uuid4()}/p.png"),
            file_name="p.png",
            content_type="image/png",
            size_bytes=8,
            status=UploadStatus.attached,
        )
    )
    db.commit()

    def broken(key: str) -> None:
        raise ClientError({"Error": {"Code": "InternalError", "Message": "down"}}, "DeleteObject")

    monkeypatch.setattr(storage, "delete", broken)
    c = client_for(user)
    r = c.delete(f"{API}/me")
    assert r.status_code == 503
    assert r.json()["error"]["code"] == "storage_unavailable"
    assert c.get(f"{API}/me").status_code == 200
