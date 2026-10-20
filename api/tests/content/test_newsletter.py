"""The newsletter: typed issues (code quality review CQ-4, decision D5), size limits (security review SEC-6),
publishing to every account (decision D1), reactions, the activity log (student test ST-9) and two reps saving the
same address at once (CQ-14), one published issue per number (ST-68), no empty issue published (ST-75) and a
deleted issue's notifications (ST-74)."""

from __future__ import annotations

import datetime as dt
import uuid
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import set_committed_value

from app.core.links import LINK_RULE, PICTURE_RULE
from app.models import AuditEntry, EmailOutbox, IssueStatus, NewsletterIssue, Notification, User
from app.schemas.newsletter import IssueCreate
from app.seed.loader import load_newsletter, read
from app.services import newsletter as svc
from tests.content.conftest import API, PNG
from tests.core.helpers import upload

Clients = Callable[..., TestClient]

ISSUES = f"{API}/newsletter/issues"
BLOCK_TYPES = {"p", "list", "signoff", "cta"}


def newsletter_picture(c: TestClient, storage: Any) -> str:
    """A newsletter picture uploaded by the signed-in person: -> its /api/v1/media path."""
    upload_id = upload(c, storage, purpose="newsletter_image", name="a.png", content_type="image/png", body=PNG)
    return f"/api/v1/media/{upload_id}"


def new_issue(**extra: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "slug": "october-issue",
        "number": 2,
        "title": "The October issue",
        "date": "2026-10-20",
        "cover": {"tone": "paper", "lines": [{"section": "exams", "text": "The October session"}]},
        "dek": "Exams, a new study room and the forum's best answers.",
        "summary": "Everything for the October session.",
        "editors": ["Hawra T."],
        "sections": [
            {
                "id": "exams",
                "label": "Exams",
                "icon": "CalendarCheck",
                "title": "The October session",
                "blocks": [{"type": "p", "text": "Hi", "lead": True}],
            },
            {"id": "study-room", "label": "Campus", "title": "A new study room"},
        ],
    }
    body.update(extra)
    return body


def one_section(**section: Any) -> dict[str, Any]:
    """An issue with one section ('a'), made of `section`."""
    return new_issue(cover={}, sections=[{"id": "a", "title": "A", **section}])


def fields(r: Any) -> dict[str, str]:
    assert r.status_code == 422, r.text
    out: dict[str, str] = r.json()["error"]["fields"]
    return out


@pytest.fixture
def seeded(db: Session) -> None:
    load_newsletter(db)
    db.commit()


# ── reading ──────────────────────────────────────────────────────────────────────────────────


def test_seeded_issues_are_typed_drafts_for_moderators_only(
    seeded: None, client_for: Clients, student: User, moderator: User
) -> None:
    newest_first = sorted(read("newsletter"), key=lambda i: (i["date"], i["number"]), reverse=True)
    for c in (client_for(), client_for(student)):
        assert c.get(ISSUES).json() == []
        assert c.get(ISSUES, params={"include_drafts": True}).json() == []
        assert c.get(f"{ISSUES}/{newest_first[0]['slug']}").status_code == 404
    rep = client_for(moderator)
    assert rep.get(ISSUES).json() == []
    drafts = rep.get(ISSUES, params={"include_drafts": True}).json()
    assert [(i["slug"], i["status"]) for i in drafts] == [(i["slug"], "draft") for i in newest_first]
    for raw in newest_first:
        detail = rep.get(f"{ISSUES}/{raw['slug']}").json()
        ids = [s["id"] for s in raw["sections"]]
        assert [s["id"] for s in detail["sections"]] == ids  # every section, in order
        assert set(detail["reactions"]) == set(ids)
        assert all(r == {"useful": 0, "love": 0, "laugh": 0, "mine": []} for r in detail["reactions"].values())
        assert {b["type"] for s in detail["sections"] for b in s["blocks"] + s["after"]} <= BLOCK_TYPES
        assert detail["cover"]["tone"] in ("navy", "paper")


def test_an_issue_reads_back_in_its_typed_shape(client_for: Clients, moderator: User, db: Session) -> None:
    rep = client_for(moderator)
    issue = rep.post(ISSUES, json=new_issue()).json()
    assert issue["cover"] == {
        "tone": "paper",
        "art": None,
        "artAlt": None,
        "lines": [{"section": "exams", "text": "The October session"}],
    }
    exams, room = issue["sections"]
    assert exams["blocks"] == [{"type": "p", "text": "Hi", "lead": True}]
    assert (exams["icon"], exams["kind"], exams["figure"], exams["aside"], exams["after"]) == (
        "CalendarCheck",
        None,
        None,
        None,
        [],
    )
    assert (room["blocks"], room["icon"]) == ([], None)
    # stored as camelCase JSON in the same shape, without empty optional fields
    row = db.get(NewsletterIssue, uuid.UUID(issue["id"]))
    assert row is not None
    assert row.sections[1] == {
        "id": "study-room",
        "title": "A new study room",
        "label": "Campus",
        "blocks": [],
        "after": [],
    }
    assert row.cover == {"tone": "paper", "lines": [{"section": "exams", "text": "The October session"}]}


def test_every_part_an_issue_can_hold(client_for: Clients, moderator: User, storage: Any) -> None:
    """The closed set a form-based editor offers (decision D5): paragraphs, lists, sign-offs and buttons; a figure,
    a card or a few numbers beside the copy; live sections listing deadlines, forum threads or library files."""
    rep = client_for(moderator)
    media = newsletter_picture(rep, storage)
    story = {
        "id": "speech-day",
        "label": "Campus",
        "icon": "Megaphone",
        "title": "Speech Day",
        "figure": {"src": media, "width": 1200, "height": 800, "alt": "The hall", "caption": "Photo: the BIBF"},
        "aside": {
            "type": "stats",
            "title": "In numbers",
            "items": [{"value": "120+", "label": "graduates"}],
            "foot": "Source: the programme office",
        },
        "blocks": [
            {"type": "p", "text": "**Well done** to *everyone* who ==graduated==.", "lead": True},
            {"type": "list", "items": ["Gowns at 9", "Photos at 12 ([map](/calendar))"]},
            {"type": "cta", "label": "See the calendar", "to": "/calendar?date=2026-10-05"},
            {"type": "signoff", "text": "The editors"},
        ],
    }
    card = {
        "id": "council",
        "title": "Student council",
        "aside": {"type": "card", "kicker": "Vote", "title": "Elections", "text": "Polls open Sunday.", "wide": True},
    }
    deadlines = {
        "id": "deadlines",
        "title": "Coming up",
        "kind": "deadlines",
        "window": {"from": "2026-10-20", "to": "2026-11-30"},
        "after": [{"type": "p", "text": "Dates can move: check the calendar."}],
        "estWords": 120,
    }
    forum = {
        "id": "forum",
        "title": "From the forum",
        "kind": "forum",
        "fallback": {"title": "Quiet week", "text": "Nothing new yet."},
    }
    body = new_issue(
        cover={
            "tone": "navy",
            "art": "brand/newsletter-cover.jpg",
            "artAlt": "A study desk",
            "lines": [{"section": "speech-day", "text": "Hats off"}],
        },
        sections=[story, card, deadlines, forum, {"id": "library", "title": "New in the library", "kind": "library"}],
    )
    r = rep.post(ISSUES, json=body)
    assert r.status_code == 201, r.text
    out = r.json()
    assert [s["id"] for s in out["sections"]] == ["speech-day", "council", "deadlines", "forum", "library"]
    assert out["sections"][0]["figure"]["caption"] == "Photo: the BIBF"
    assert out["sections"][0]["aside"]["items"] == [{"value": "120+", "label": "graduates"}]
    assert out["sections"][2]["window"] == {"from": "2026-10-20", "to": "2026-11-30"}
    assert out["sections"][3]["fallback"] == {"title": "Quiet week", "text": "Nothing new yet."}


def test_what_doesnt_fit_the_schema_is_refused(client_for: Clients, moderator: User, db: Session) -> None:
    rep = client_for(moderator)
    assert set(fields(rep.post(ISSUES, json=new_issue(sections=[{"label": "x"}])))) == {
        "sections.0.id",
        "sections.0.title",
    }
    twice = new_issue(sections=[{"id": "a", "title": "A"}, {"id": "a", "title": "B"}])
    assert fields(rep.post(ISSUES, json=twice)) == {"sections": "Two sections have the same id: “a”."}
    assert "sections.0.id" in fields(rep.post(ISSUES, json=one_section(id="Not An Id")))
    assert "slug" in fields(rep.post(ISSUES, json=new_issue(slug="Bad Slug")))
    # the block and aside types are a closed set; an error inside one names its type
    assert "sections.0.blocks.0" in fields(rep.post(ISSUES, json=one_section(blocks=[{"type": "html", "text": "x"}])))
    assert "sections.0.aside" in fields(rep.post(ISSUES, json=one_section(aside={"type": "quote", "text": "x"})))
    assert set(fields(rep.post(ISSUES, json=one_section(blocks=[{"type": "list", "items": []}])))) == {
        "sections.0.blocks.0.list.items"
    }
    assert "sections.0.icon" in fields(rep.post(ISSUES, json=one_section(icon="Skull")))
    assert "sections.0.kind" in fields(rep.post(ISSUES, json=one_section(kind="cohorts")))
    figure = {"src": "brand/x.jpg", "alt": "x"}  # no size: the reader would jump while it loads
    assert set(fields(rep.post(ISSUES, json=one_section(figure=figure)))) == {
        "sections.0.figure.width",
        "sections.0.figure.height",
    }
    backwards = {"from": "2026-11-01", "to": "2026-10-01"}
    assert fields(rep.post(ISSUES, json=one_section(kind="deadlines", window=backwards))) == {
        "sections.0.window": "The last day can't be before the first."
    }
    assert "cover.tone" in fields(rep.post(ISSUES, json=new_issue(cover={"tone": "pink"})))
    # what isn't in the schema is dropped, never stored
    extra = one_section(blocks=[{"type": "p", "text": "Hi", "html": "<script>alert(1)</script>"}], onclick="x")
    issue = rep.post(ISSUES, json=extra).json()
    row = db.get(NewsletterIssue, uuid.UUID(issue["id"]))
    assert row is not None
    assert row.sections == [
        {"id": "a", "title": "A", "blocks": [{"type": "p", "text": "Hi", "lead": False}], "after": []}
    ]


# ── writing ──────────────────────────────────────────────────────────────────────────────────


def test_moderators_write_issues(client_for: Clients, student: User, moderator: User, db: Session) -> None:
    rep = client_for(moderator)
    r = rep.post(ISSUES, json=new_issue())
    assert r.status_code == 201, r.text
    issue = r.json()
    assert (issue["status"], issue["publishedAt"], issue["number"]) == ("draft", None, 2)
    assert set(issue["reactions"]) == {"exams", "study-room"}

    assert client_for(student).post(ISSUES, json=new_issue(slug="other")).status_code == 403
    assert client_for().post(ISSUES, json=new_issue(slug="other")).status_code == 401
    assert rep.post(ISSUES, json=new_issue()).json()["error"]["code"] == "slug_taken"

    other = rep.post(ISSUES, json=new_issue(slug="november-issue", number=3)).json()
    url = f"{ISSUES}/{issue['id']}"
    r = rep.patch(url, json={"title": "The October issue (updated)", "dek": "New dek"})
    assert (r.json()["title"], r.json()["dek"], r.json()["slug"]) == (
        "The October issue (updated)",
        "New dek",
        "october-issue",
    )
    assert rep.patch(url, json={"slug": "november-issue"}).json()["error"]["code"] == "slug_taken"
    assert rep.patch(url, json={"slug": "october"}).json()["slug"] == "october"
    # the dek and the summary can be emptied (null or ""); the other fields can't
    emptied = rep.patch(url, json={"dek": None, "summary": "", "title": None}).json()
    assert (emptied["dek"], emptied["summary"], emptied["title"]) == ("", "", "The October issue (updated)")
    # sections and the cover are replaced as a whole
    r = rep.patch(url, json={"sections": [{"id": "only", "title": "Only this"}], "cover": {"tone": "navy"}})
    assert [s["id"] for s in r.json()["sections"]] == ["only"]
    assert r.json()["cover"] == {"tone": "navy", "art": None, "artAlt": None, "lines": []}
    # a refused edit leaves the issue as it was
    assert rep.patch(url, json={"title": "Changed", "sections": [{"id": "x"}]}).status_code == 422
    assert rep.get(f"{ISSUES}/october").json()["title"] == "The October issue (updated)"
    assert client_for(student).patch(url, json={"title": "x"}).status_code == 403

    assert client_for(student).delete(f"{ISSUES}/{other['id']}").status_code == 403
    assert rep.delete(f"{ISSUES}/{other['id']}").status_code == 204
    assert rep.get(f"{ISSUES}/november-issue").status_code == 404
    assert rep.delete(f"{ISSUES}/{other['id']}").status_code == 404


def test_the_activity_log_names_the_issue(client_for: Clients, moderator: User, db: Session) -> None:
    """Every audit row about an issue carries its title (student test ST-9) and its address."""
    rep = client_for(moderator)
    issue = rep.post(ISSUES, json=new_issue()).json()
    rep.patch(f"{ISSUES}/{issue['id']}", json={"title": "The October issue, revised", "dek": "Shorter"})
    rep.patch(f"{ISSUES}/{issue['id']}", json={"dek": "Shorter"})  # no change: nothing to log
    rep.delete(f"{ISSUES}/{issue['id']}")
    rows = list(db.scalars(select(AuditEntry).where(AuditEntry.target_id == issue["id"]).order_by(AuditEntry.id)))
    assert [(e.action, e.target_type, e.data["title"], e.data["slug"]) for e in rows] == [
        ("newsletter.create", "newsletter_issue", "The October issue", "october-issue"),
        ("newsletter.update", "newsletter_issue", "The October issue, revised", "october-issue"),
        ("newsletter.delete", "newsletter_issue", "The October issue, revised", "october-issue"),
    ]
    assert rows[1].data["fields"] == ["title", "dek"]
    assert rows[2].data["status"] == "draft"
    assert all(e.data["actorName"] == "Maryam Rep" for e in rows)


def test_two_reps_saving_the_same_address_get_409_not_500(
    client_for: Clients, moderator: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Both requests see the address as free (code quality review CQ-14): the insert decides."""
    rep = client_for(moderator)
    first = rep.post(ISSUES, json=new_issue()).json()
    other = rep.post(ISSUES, json=new_issue(slug="other-issue")).json()
    monkeypatch.setattr(svc, "check_slug_free", lambda *_args, **_kwargs: None)
    r = rep.post(ISSUES, json=new_issue())
    assert (r.status_code, r.json()["error"]["code"]) == (409, "slug_taken")
    r = rep.patch(f"{ISSUES}/{other['id']}", json={"slug": first["slug"], "title": "Renamed"})
    assert (r.status_code, r.json()["error"]["code"]) == (409, "slug_taken")
    assert rep.get(f"{ISSUES}/other-issue").json()["title"] == "The October issue"  # left as it was


# ── size limits ──────────────────────────────────────────────────────────────────────────────


def test_issue_size_limits(client_for: Clients, moderator: User) -> None:
    """Every text has a limit (security review SEC-6), and the whole issue at most 256 KB."""
    rep = client_for(moderator)
    assert set(fields(rep.post(ISSUES, json=new_issue(dek="x" * 2001)))) == {"dek"}
    assert set(fields(rep.post(ISSUES, json=new_issue(summary="x" * 2001)))) == {"summary"}
    assert set(fields(rep.post(ISSUES, json=new_issue(editors=["Ed"] * 13)))) == {"editors"}
    assert set(fields(rep.post(ISSUES, json=new_issue(editors=["x" * 81])))) == {"editors.0"}
    assert set(fields(rep.post(ISSUES, json=new_issue(title="x" * 161)))) == {"title"}
    too_long = one_section(blocks=[{"type": "p", "text": "x" * 4001}])
    assert set(fields(rep.post(ISSUES, json=too_long))) == {"sections.0.blocks.0.p.text"}
    assert set(
        fields(rep.post(ISSUES, json=new_issue(sections=[{"id": f"s{i}", "title": "S"} for i in range(41)])))
    ) == {"sections"}
    lines = [{"section": "a", "text": "x"}] * 6
    assert set(fields(rep.post(ISSUES, json=new_issue(cover={"lines": lines})))) == {"cover.lines"}
    # parts that each fit, but too many of them
    chunk = [{"type": "p", "text": "x" * 4000}] * 35
    huge = new_issue(sections=[{"id": "a", "title": "A", "blocks": chunk}, {"id": "b", "title": "B", "blocks": chunk}])
    assert fields(rep.post(ISSUES, json=huge)) == {"sections": svc.TOO_LONG}
    issue = rep.post(ISSUES, json=new_issue()).json()
    assert fields(rep.patch(f"{ISSUES}/{issue['id']}", json={"sections": huge["sections"]})) == {
        "sections": svc.TOO_LONG
    }
    assert (
        rep.post(ISSUES, json=new_issue(slug="at-the-limits", dek="x" * 2000, editors=["x" * 80] * 12)).status_code
        == 201
    )


# ── links and pictures ───────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "bad",
    [
        "javascript:alert(1)",
        "JavaScript:alert(1)",
        "data:text/html,<script>alert(1)</script>",
        "//evil.example/signin",
        "/\\evil.example/signin",
        "http://example.com/plain-http",
        "https://user:pass@example.com/",
        "../../api/v1/admin",
        "#top",
    ],
)
def test_links_in_issues_must_be_safe(client_for: Clients, moderator: User, bad: str) -> None:
    rep = client_for(moderator)
    in_text = one_section(blocks=[{"type": "p", "text": f"Read [this]({bad}) now."}])
    assert fields(rep.post(ISSUES, json=in_text)) == {"sections.0.blocks.0.p.text": LINK_RULE}
    in_list = one_section(blocks=[{"type": "list", "items": ["fine", f"[x]({bad})"]}])
    assert fields(rep.post(ISSUES, json=in_list)) == {"sections.0.blocks.0.list.items.1": LINK_RULE}
    button = one_section(blocks=[{"type": "cta", "label": "Open", "to": bad}])
    assert fields(rep.post(ISSUES, json=button)) == {"sections.0.blocks.0.cta.to": LINK_RULE}
    in_card = one_section(aside={"type": "card", "kicker": "K", "title": "T", "text": f"[x]({bad})"})
    assert fields(rep.post(ISSUES, json=in_card)) == {"sections.0.aside.card.text": LINK_RULE}
    assert fields(rep.post(ISSUES, json=new_issue(dek=f"See [here]({bad})"))) == {"dek": LINK_RULE}
    issue = rep.post(ISSUES, json=new_issue()).json()
    assert fields(rep.patch(f"{ISSUES}/{issue['id']}", json={"summary": f"[x]({bad})"})) == {"summary": LINK_RULE}


@pytest.mark.parametrize(
    "bad",
    [
        "https://tracker.example.com/pixel.gif",  # another host would log every reader's address
        "http://example.com/a.jpg",
        "javascript:alert(1)",
        "//evil.example/a.png",
        "../secret.png",
        "/api/v1/media/not-an-id",
    ],
)
def test_pictures_come_from_the_hub(client_for: Clients, moderator: User, bad: str) -> None:
    rep = client_for(moderator)
    figure = {"src": bad, "width": 4, "height": 3, "alt": "x"}
    assert fields(rep.post(ISSUES, json=one_section(figure=figure))) == {"sections.0.figure.src": PICTURE_RULE}
    assert fields(rep.post(ISSUES, json=new_issue(cover={"art": bad}))) == {"cover.art": PICTURE_RULE}


def test_safe_links_and_the_seeded_issues_pass(
    seeded: None, client_for: Clients, moderator: User, storage: Any
) -> None:
    rep = client_for(moderator)
    good = new_issue(
        cover={"tone": "navy", "art": "brand/newsletter-cover.jpg", "artAlt": "A study desk"},
        sections=[
            {
                "id": "a",
                "title": "A",
                "figure": {"src": "demo/news/speech-day.jpg", "width": 1600, "height": 900, "alt": "Speech Day"},
                "blocks": [
                    {"type": "p", "text": "See [the calendar](/calendar), [the portal](https://my.london.ac.uk/x)."},
                    {"type": "p", "text": "Write to [the editors](mailto:news@example.com)."},
                    {"type": "cta", "label": "Upload", "to": "https://my.london.ac.uk/upload"},
                ],
            },
            {
                "id": "b",
                "title": "B",
                "figure": {"src": newsletter_picture(rep, storage), "width": 4, "height": 3, "alt": "A graph"},
            },
        ],
    )
    assert rep.post(ISSUES, json=good).status_code == 201
    # every seeded issue, sent back as the API gave it, is accepted unchanged
    for raw in read("newsletter"):
        issue = rep.get(f"{ISSUES}/{raw['slug']}").json()
        r = rep.patch(f"{ISSUES}/{issue['id']}", json={"cover": issue["cover"], "sections": issue["sections"]})
        assert r.status_code == 200, r.text
        assert (r.json()["cover"], r.json()["sections"]) == (issue["cover"], issue["sections"])


# ── publishing and reactions ─────────────────────────────────────────────────────────────────


def test_publishing_tells_every_account_once(
    client_for: Clients, make_user: Callable[..., User], moderator: User, db: Session
) -> None:
    """Decision D1: the notification in the Hub reaches everyone but the publisher, whatever their email switches;
    the email goes to those with an address who keep "New newsletter issues" on."""
    keen = make_user(name="Keen")
    quiet = make_user(name="Quiet")
    quiet.preferences = {**quiet.preferences, "email_new_issues": False}
    undecided = make_user(name="Undecided", emails=None)
    db.commit()

    rep = client_for(moderator)
    issue = rep.post(ISSUES, json=new_issue()).json()
    assert client_for().get(f"{ISSUES}/{issue['slug']}").status_code == 404

    r = rep.post(f"{ISSUES}/{issue['id']}/publish")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "published"
    assert r.json()["publishedAt"] is not None

    notes = list(db.scalars(select(Notification)))
    assert {n.user_id for n in notes} == {keen.id, quiet.id, undecided.id}  # not the publisher
    for n in notes:
        assert (n.kind, n.url, n.actor_id) == ("new_issue", "/newsletter/october-issue", moderator.id)
        assert n.title == "New issue of The DSBA Newsletter: The October issue"
        assert n.body == issue["dek"]
        assert n.data == {"issueId": issue["id"], "slug": "october-issue"}
    emails = list(db.scalars(select(EmailOutbox)))
    assert [(e.user_id, e.kind, e.to_address) for e in emails] == [(keen.id, "new_issue", keen.email)]
    assert emails[0].notification_id == next(n.id for n in notes if n.user_id == keen.id)
    entry = db.scalar(select(AuditEntry).where(AuditEntry.action == "newsletter.publish"))
    assert entry is not None
    assert (entry.data["notified"], entry.data["title"], entry.data["slug"]) == (
        3,
        "The October issue",
        "october-issue",
    )

    # public now, newest first
    older = rep.post(ISSUES, json=new_issue(slug="september", number=1, date="2026-09-20")).json()
    rep.post(f"{ISSUES}/{older['id']}/publish")
    assert [i["slug"] for i in client_for().get(ISSUES).json()] == ["october-issue", "september"]

    # publishing again changes nothing and tells nobody
    again = rep.post(f"{ISSUES}/{issue['id']}/publish").json()["publishedAt"]
    assert dt.datetime.fromisoformat(again) == dt.datetime.fromisoformat(r.json()["publishedAt"])
    assert len(list(db.scalars(select(Notification)))) == 6
    assert client_for(keen).post(f"{ISSUES}/{issue['id']}/publish").status_code == 403


def test_a_publish_reads_the_issue_again_so_two_at_once_notify_once(
    client_for: Clients, make_user: Callable[..., User], moderator: User, db: Session
) -> None:
    """Student test ST-16: a double click on "Publish and notify everyone". The second request loaded the issue as
    a draft; the lock makes it read the row again, find it published, and tell nobody."""
    make_user()
    rep = client_for(moderator)
    issue = rep.post(ISSUES, json=new_issue()).json()
    assert rep.post(f"{ISSUES}/{issue['id']}/publish").status_code == 200
    stale = db.get(NewsletterIssue, uuid.UUID(issue["id"]))
    assert stale is not None
    set_committed_value(stale, "status", IssueStatus.draft)  # what the second request saw
    assert svc.publish(db, moderator, stale, None) is False
    assert len(list(db.scalars(select(Notification)))) == 1
    assert len(list(db.scalars(select(AuditEntry).where(AuditEntry.action == "newsletter.publish")))) == 1


def test_issue_emails_quote_no_links(
    client_for: Clients, make_user: Callable[..., User], moderator: User, db: Session
) -> None:
    """Security review SEC-18: the email quotes the issue's lead without its links."""
    reader = make_user()
    rep = client_for(moderator)
    issue = rep.post(ISSUES, json=new_issue(dek="Read it at https://evil.example/login or www.evil.example")).json()
    rep.post(f"{ISSUES}/{issue['id']}/publish")
    [email] = db.scalars(select(EmailOutbox).where(EmailOutbox.user_id == reader.id)).all()
    assert "evil.example" not in email.body
    assert "Read it at [link] or [link]" in email.body


def test_one_issue_email_a_day(
    client_for: Clients, make_user: Callable[..., User], moderator: User, db: Session
) -> None:
    """Security review AD-8 (SEC-18): each published issue reaches everyone in the Hub, but the cohort gets at most
    one issue email a day; the response says whether this one went by email."""
    keen = make_user(name="Keen")
    rep = client_for(moderator)
    issues = [
        rep.post(ISSUES, json=new_issue(slug=f"issue-{n}", number=n, title=f"Issue {n}")).json() for n in (1, 2, 3)
    ]

    def publish(issue: dict[str, Any]) -> dict[str, Any]:
        r = rep.post(f"{ISSUES}/{issue['id']}/publish")
        assert r.status_code == 200, r.text
        body: dict[str, Any] = r.json()
        return body

    def emails() -> list[str]:
        return [e.subject for e in db.scalars(select(EmailOutbox).order_by(EmailOutbox.created_at))]

    first = publish(issues[0])
    assert (first["status"], first["emailed"]) == ("published", True)
    second = publish(issues[1])
    assert (second["status"], second["emailed"]) == ("published", False)
    assert emails() == ["New issue of The DSBA Newsletter: Issue 1"]
    notes = db.scalars(select(Notification.title).where(Notification.user_id == keen.id)).all()
    assert sorted(notes) == [f"New issue of The DSBA Newsletter: Issue {n}" for n in (1, 2)]  # in the Hub, both
    logged = db.scalars(select(AuditEntry).where(AuditEntry.action == "newsletter.publish")).all()
    assert sorted(e.data["emailed"] for e in logged) == [False, True]
    assert publish(issues[0])["emailed"] is False  # publishing again sends nothing

    for entry in logged:  # a day later
        entry.created_at -= dt.timedelta(hours=24, minutes=1)
    db.commit()
    assert publish(issues[2])["emailed"] is True
    assert emails()[-1] == "New issue of The DSBA Newsletter: Issue 3"


def test_reactions(client_for: Clients, student: User, other: User, moderator: User) -> None:
    rep = client_for(moderator)
    issue = rep.post(ISSUES, json=new_issue()).json()
    me, them = client_for(student), client_for(other)
    url = f"{ISSUES}/{issue['id']}/sections/exams/reactions"

    assert me.put(f"{url}/useful").status_code == 404  # a draft: not for readers
    assert rep.put(f"{url}/useful").json()["error"]["code"] == "not_published"
    assert rep.post(f"{ISSUES}/{issue['id']}/publish").status_code == 200

    assert client_for().put(f"{url}/useful").status_code == 401
    assert me.put(f"{url}/useful").json() == {"useful": 1, "love": 0, "laugh": 0, "mine": ["useful"]}
    assert me.put(f"{url}/useful").json()["useful"] == 1  # idempotent
    assert me.put(f"{url}/love").json() == {"useful": 1, "love": 1, "laugh": 0, "mine": ["useful", "love"]}
    assert them.put(f"{url}/useful").json() == {"useful": 2, "love": 1, "laugh": 0, "mine": ["useful"]}
    assert me.put(f"{url}/angry").status_code == 422
    assert me.put(f"{ISSUES}/{issue['id']}/sections/nope/reactions/useful").status_code == 404

    detail = me.get(f"{ISSUES}/{issue['slug']}").json()
    assert detail["reactions"]["exams"] == {"useful": 2, "love": 1, "laugh": 0, "mine": ["useful", "love"]}
    assert detail["reactions"]["study-room"] == {"useful": 0, "love": 0, "laugh": 0, "mine": []}
    assert client_for().get(f"{ISSUES}/{issue['slug']}").json()["reactions"]["exams"]["mine"] == []

    assert me.delete(f"{url}/useful").json() == {"useful": 1, "love": 1, "laugh": 0, "mine": ["love"]}
    assert me.delete(f"{url}/useful").json()["useful"] == 1


def test_publishing_tells_only_those_the_newsletter_is_on_for(
    client_for: Clients,
    make_user: Callable[..., User],
    moderator: User,
    admin: User,
    set_feature: Callable[..., None],
    db: Session,
) -> None:
    """Switched off, publishing tells nobody; on for some roles, it tells those roles (and admins) only."""
    student = make_user(name="Sara Student")
    other_rep = make_user(name="Other Rep", roles=("student", "rep"))
    boss = client_for(admin)
    set_feature("newsletter", "off")
    issue = boss.post(ISSUES, json=new_issue()).json()
    r = boss.post(f"{ISSUES}/{issue['id']}/publish")
    assert (r.status_code, r.json()["emailed"]) == (200, False)
    assert list(db.scalars(select(Notification))) == []
    assert list(db.scalars(select(EmailOutbox))) == []

    set_feature("newsletter", "roles", ["rep"])
    later = client_for(moderator).post(ISSUES, json=new_issue(slug="later", number=3)).json()
    assert client_for(moderator).post(f"{ISSUES}/{later['id']}/publish").status_code == 200
    told = {n.user_id for n in db.scalars(select(Notification))}
    assert told == {other_rep.id, admin.id}
    assert student.id not in told


# ── numbers, empty issues and deleted issues (student test ST-68, ST-74, ST-75) ─────────────────────


def test_a_published_number_is_never_taken_again(client_for: Clients, moderator: User, db: Session) -> None:
    rep = client_for(moderator)
    out = rep.post(ISSUES, json=new_issue(slug="ninety-nine", number=99)).json()
    assert rep.post(f"{ISSUES}/{out['id']}/publish").status_code == 200

    # a new draft can't take it, and is told the next free number
    r = rep.post(ISSUES, json=new_issue(slug="another-99", number=99))
    assert r.status_code == 409, r.text
    assert r.json()["error"]["code"] == "number_taken"
    assert r.json()["error"]["message"] == "Issue 99 is already out. The next free number is 100."
    assert r.json()["error"]["fields"]["number"] == r.json()["error"]["message"]

    # nor can a draft be renumbered to it, nor a published issue keep or move to another published number
    draft = rep.post(ISSUES, json=new_issue(slug="hundred", number=100)).json()
    assert rep.patch(f"{ISSUES}/{draft['id']}", json={"number": 99}).json()["error"]["code"] == "number_taken"
    assert rep.patch(f"{ISSUES}/{out['id']}", json={"number": 99, "title": "Same number"}).status_code == 200
    assert db.scalar(select(NewsletterIssue.number).where(NewsletterIssue.slug == "hundred")) == 100


def test_two_drafts_may_share_a_number_until_one_is_published(client_for: Clients, moderator: User) -> None:
    rep = client_for(moderator)
    first = rep.post(ISSUES, json=new_issue(slug="first", number=7)).json()
    second = rep.post(ISSUES, json=new_issue(slug="second", number=7)).json()
    assert rep.post(f"{ISSUES}/{first['id']}/publish").status_code == 200
    r = rep.post(f"{ISSUES}/{second['id']}/publish")
    assert r.status_code == 409, r.text
    assert r.json()["error"]["code"] == "number_taken"
    assert rep.get(f"{ISSUES}/second").json()["status"] == "draft"
    assert [i["slug"] for i in client_for().get(ISSUES).json()] == ["first"]


def test_the_database_keeps_published_numbers_unique(moderator: User, db: Session) -> None:
    """Two publishes at once pass the check together; the partial unique index stops the second."""
    a = svc.new_draft(IssueCreate.model_validate(new_issue(slug="a", number=5)), moderator)
    b = svc.new_draft(IssueCreate.model_validate(new_issue(slug="b", number=5)), moderator)
    db.add_all([a, b])
    db.flush()
    a.status = IssueStatus.published
    db.flush()
    b.status = IssueStatus.published
    with pytest.raises(IntegrityError):
        db.flush()
    db.rollback()


def test_an_issue_with_no_stories_cant_be_published(client_for: Clients, moderator: User) -> None:
    rep = client_for(moderator)
    issue = rep.post(ISSUES, json=new_issue(sections=[], cover={})).json()
    r = rep.post(f"{ISSUES}/{issue['id']}/publish")
    assert r.status_code == 409, r.text
    assert r.json()["error"]["code"] == "empty_issue"
    assert rep.get(f"{ISSUES}/{issue['slug']}").json()["status"] == "draft"


def test_deleting_an_issue_takes_its_notifications_back(
    client_for: Clients, make_user: Callable[..., User], moderator: User, db: Session
) -> None:
    reader = make_user(name="Reader")
    db.commit()
    rep = client_for(moderator)
    gone = rep.post(ISSUES, json=new_issue(slug="gone", number=3)).json()
    kept = rep.post(ISSUES, json=new_issue(slug="kept", number=4)).json()
    for issue in (gone, kept):
        assert rep.post(f"{ISSUES}/{issue['id']}/publish").status_code == 200
    assert len(list(db.scalars(select(Notification).where(Notification.user_id == reader.id)))) == 2

    assert rep.delete(f"{ISSUES}/{gone['id']}").status_code == 204
    db.expire_all()
    left = list(db.scalars(select(Notification).where(Notification.user_id == reader.id)))
    assert [n.url for n in left] == ["/newsletter/kept"]
    pending = list(db.scalars(select(EmailOutbox).where(EmailOutbox.status == "pending")))
    assert all(e.notification_id in {n.id for n in left} for e in pending)
