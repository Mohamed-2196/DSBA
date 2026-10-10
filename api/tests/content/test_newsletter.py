from __future__ import annotations

import datetime as dt
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AuditEntry, Notification, User
from app.seed.loader import load_newsletter
from app.services.newsletter import LINK_RULE
from tests.content.conftest import API

Clients = Callable[..., TestClient]

ISSUES = f"{API}/newsletter/issues"


def new_issue(**extra: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "slug": "october-issue",
        "number": 2,
        "title": "The October issue",
        "date": "2026-10-20",
        "cover": {"tone": "paper"},
        "dek": "Exams, a new study room and the forum's best answers.",
        "summary": "Everything for the October session.",
        "editors": ["Hawra T."],
        "sections": [
            {"id": "exams", "label": "Exams", "title": "The October session", "blocks": [{"type": "p", "text": "Hi"}]},
            {"id": "study-room", "label": "Campus", "title": "A new study room", "blocks": []},
        ],
    }
    body.update(extra)
    return body


@pytest.fixture
def seeded(db: Session) -> None:
    load_newsletter(db)
    db.commit()


def test_seeded_issues_are_drafts_for_moderators_only(
    seeded: None, client_for: Clients, student: User, moderator: User
) -> None:
    for c in (client_for(), client_for(student)):
        assert c.get(ISSUES).json() == []
        assert c.get(ISSUES, params={"include_drafts": True}).json() == []
        assert c.get(f"{ISSUES}/launch-edition").status_code == 404
    rep = client_for(moderator)
    assert rep.get(ISSUES).json() == []
    drafts = rep.get(ISSUES, params={"include_drafts": True}).json()
    assert [(i["slug"], i["status"]) for i in drafts] == [("launch-edition", "draft"), ("pilot", "draft")]
    detail = rep.get(f"{ISSUES}/launch-edition").json()
    assert [s["id"] for s in detail["sections"]][:2] == ["cfa", "student-council"]
    assert detail["reactions"]["cfa"] == {"useful": 0, "love": 0, "laugh": 0, "mine": []}


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
    assert rep.post(ISSUES, json=new_issue(slug="Bad Slug")).status_code == 422
    no_id = new_issue(slug="no-ids", sections=[{"label": "x"}])
    assert rep.post(ISSUES, json=no_id).json()["error"]["fields"] == {
        "sections.0.id": "Give each section an id: lower-case letters, digits and dashes."
    }
    twice = new_issue(slug="twice", sections=[{"id": "a"}, {"id": "a"}])
    assert rep.post(ISSUES, json=twice).status_code == 422

    other = rep.post(ISSUES, json=new_issue(slug="november-issue", number=3)).json()
    r = rep.patch(f"{ISSUES}/{issue['id']}", json={"title": "The October issue (updated)", "dek": "New dek"})
    assert (r.json()["title"], r.json()["dek"], r.json()["slug"]) == (
        "The October issue (updated)",
        "New dek",
        issue["slug"],
    )
    assert rep.patch(f"{ISSUES}/{issue['id']}", json={"slug": "november-issue"}).json()["error"]["code"] == "slug_taken"
    assert rep.patch(f"{ISSUES}/{issue['id']}", json={"slug": "october"}).json()["slug"] == "october"
    assert client_for(student).patch(f"{ISSUES}/{issue['id']}", json={"title": "x"}).status_code == 403

    assert client_for(student).delete(f"{ISSUES}/{other['id']}").status_code == 403
    assert rep.delete(f"{ISSUES}/{other['id']}").status_code == 204
    assert rep.get(f"{ISSUES}/november-issue").status_code == 404
    actions = list(db.scalars(select(AuditEntry.action)))
    assert {"newsletter.create", "newsletter.update", "newsletter.delete"} <= set(actions)


def test_publishing_notifies_readers_once(
    client_for: Clients, make_user: Callable[..., User], moderator: User, db: Session
) -> None:
    keen = make_user(name="Keen")
    quiet = make_user(name="Quiet")
    quiet.preferences = {"newsletter_emails": False}
    default = make_user(name="Default")
    default.preferences = {"email_notifications": False}
    db.commit()

    rep = client_for(moderator)
    issue = rep.post(ISSUES, json=new_issue()).json()
    assert client_for().get(f"{ISSUES}/{issue['slug']}").status_code == 404

    r = rep.post(f"{ISSUES}/{issue['id']}/publish")
    assert r.status_code == 200
    assert r.json()["status"] == "published"
    assert r.json()["publishedAt"] is not None

    notes = list(db.scalars(select(Notification)))
    assert {n.user_id for n in notes} == {keen.id, default.id}  # not the publisher, not who opted out
    n = notes[0]
    assert (n.kind, n.url, n.actor_id) == ("new_issue", "/newsletter/october-issue", moderator.id)
    assert n.title == "New issue of The DSBA Newsletter: The October issue"
    assert n.body == issue["dek"]
    entry = db.scalar(select(AuditEntry).where(AuditEntry.action == "newsletter.publish"))
    assert entry is not None
    assert entry.data["notified"] == 2

    # public now, newest first
    older = rep.post(ISSUES, json=new_issue(slug="september", number=1, date="2026-09-20")).json()
    rep.post(f"{ISSUES}/{older['id']}/publish")
    assert [i["slug"] for i in client_for().get(ISSUES).json()] == ["october-issue", "september"]

    # publishing again changes nothing and tells nobody
    again = rep.post(f"{ISSUES}/{issue['id']}/publish").json()["publishedAt"]
    assert dt.datetime.fromisoformat(again) == dt.datetime.fromisoformat(r.json()["publishedAt"])
    assert len(list(db.scalars(select(Notification)))) == 4
    assert client_for(keen).post(f"{ISSUES}/{issue['id']}/publish").status_code == 403


def test_reactions(client_for: Clients, student: User, other: User, moderator: User) -> None:
    rep = client_for(moderator)
    issue = rep.post(ISSUES, json=new_issue()).json()
    me, them = client_for(student), client_for(other)
    url = f"{ISSUES}/{issue['id']}/sections/exams/reactions"

    assert me.put(f"{url}/useful").status_code == 404  # a draft: not for readers
    assert rep.put(f"{url}/useful").json()["error"]["code"] == "not_published"
    rep.post(f"{ISSUES}/{issue['id']}/publish")

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
    ],
)
def test_links_in_issues_must_be_safe(client_for: Clients, moderator: User, bad: str) -> None:
    rep = client_for(moderator)
    in_text = new_issue(sections=[{"id": "a", "blocks": [{"type": "p", "text": f"Read [this]({bad}) now."}]}])
    r = rep.post(ISSUES, json=in_text)
    assert r.status_code == 422
    assert r.json()["error"]["fields"] == {"sections.0.blocks.0.text": LINK_RULE}
    in_figure = new_issue(sections=[{"id": "a", "figure": {"src": bad, "alt": "x"}}])
    assert rep.post(ISSUES, json=in_figure).json()["error"]["fields"] == {"sections.0.figure.src": LINK_RULE}
    in_cover = new_issue(cover={"tone": "navy", "art": bad})
    assert rep.post(ISSUES, json=in_cover).json()["error"]["fields"] == {"cover.art": LINK_RULE}
    assert rep.post(ISSUES, json=new_issue(dek=f"See [here]({bad})")).status_code == 422
    issue = rep.post(ISSUES, json=new_issue()).json()
    assert rep.patch(f"{ISSUES}/{issue['id']}", json={"summary": f"[x]({bad})"}).status_code == 422


def test_safe_links_and_the_seeded_issues_pass(seeded: None, client_for: Clients, moderator: User, db: Session) -> None:
    rep = client_for(moderator)
    good = new_issue(
        cover={"tone": "navy", "art": "brand/newsletter-cover.jpg"},
        sections=[
            {
                "id": "a",
                "figure": {"src": "demo/news/speech-day.jpg", "alt": "Speech Day"},
                "blocks": [
                    {"type": "p", "text": "See [the calendar](/calendar), [the portal](https://my.london.ac.uk/x)."},
                    {"type": "p", "text": "Write to [the editors](mailto:news@example.com) or [jump](#a)."},
                ],
            }
        ],
    )
    assert rep.post(ISSUES, json=good).status_code == 201
    # the seeded issues, sent back as they are, are accepted
    launch = rep.get(f"{ISSUES}/launch-edition").json()
    r = rep.patch(f"{ISSUES}/{launch['id']}", json={"cover": launch["cover"], "sections": launch["sections"]})
    assert r.status_code == 200, r.text


def test_issue_size_limits(client_for: Clients, moderator: User) -> None:
    rep = client_for(moderator)
    huge = new_issue(sections=[{"id": "a", "blocks": [{"type": "p", "text": "x" * (256 * 1024)}]}])
    assert rep.post(ISSUES, json=huge).json()["error"]["fields"] == {"sections": "This issue is too long."}
    many = new_issue(sections=[{"id": f"s{i}"} for i in range(41)])
    assert rep.post(ISSUES, json=many).status_code == 422
