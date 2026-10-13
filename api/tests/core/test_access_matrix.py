"""Every route a box guards, four ways:
- a guest gets 401;
- someone holding every other box gets 403 with that box's message;
- someone holding only that box gets past the guard;
- a suspended holder gets 403.

Then the two areas where boxes decide what a person sees: the reports queue and the people list."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.access import BOXES, Box
from app.models import User, UserStatus
from tests.core.helpers import API, new_thread, share_pdf

ClientFor = Callable[..., TestClient]
Holder = Callable[[frozenset[Box]], User]
NOTHING = uuid.UUID(int=1)  # an id nothing has: a route that lets you in answers 404 or 422, never 403

GUARDED: list[tuple[str, str, Box]] = [
    ("POST", "/forum/threads", Box.forum_post),
    ("PUT", f"/forum/threads/{NOTHING}/vote", Box.forum_post),
    ("POST", f"/forum/threads/{NOTHING}/replies", Box.forum_post),
    ("PUT", f"/forum/replies/{NOTHING}/vote", Box.forum_post),
    ("POST", f"/forum/threads/{NOTHING}/moderate", Box.forum_moderate),
    ("POST", f"/forum/replies/{NOTHING}/moderate", Box.forum_moderate),
    ("POST", "/library/items", Box.library_upload),
    ("POST", "/library/links", Box.library_manage),
    ("POST", f"/library/items/{NOTHING}/review", Box.library_manage),
    ("PUT", f"/newsletter/issues/{NOTHING}/sections/intro/reactions/like", Box.newsletter_react),
    ("POST", "/newsletter/issues", Box.newsletter_manage),
    ("PATCH", f"/newsletter/issues/{NOTHING}", Box.newsletter_manage),
    ("POST", f"/newsletter/issues/{NOTHING}/publish", Box.newsletter_manage),
    ("DELETE", f"/newsletter/issues/{NOTHING}", Box.newsletter_manage),
    ("POST", "/calendar/events", Box.calendar_manage),
    ("PATCH", "/calendar/events/2026-01-01-nothing", Box.calendar_manage),
    ("DELETE", "/calendar/events/2026-01-01-nothing", Box.calendar_manage),
    ("PUT", "/career", Box.career_edit),
    ("GET", "/admin/stats", Box.stats_view),
    ("GET", "/admin/users", Box.people_suspend),
    ("PATCH", f"/admin/users/{NOTHING}", Box.people_suspend),
    ("GET", "/admin/audit", Box.audit_read),
    ("POST", "/reports", Box.reports_create),
]


@pytest.fixture
def holder(make_user: Callable[..., User], make_role: Callable[..., Any], give_roles: Callable[..., None]) -> Holder:
    """holder(boxes) -> a person whose only role holds exactly these boxes."""
    made = iter(range(1, 1000))

    def _holder(boxes: frozenset[Box]) -> User:
        n = next(made)
        role = make_role(f"holder-{n}", *boxes)
        person = make_user(name=f"Holder {n}", roles=())
        give_roles(person, role.slug)
        return person

    return _holder


@pytest.mark.parametrize(("method", "path", "box"), GUARDED, ids=[f"{m} {p}" for m, p, _ in GUARDED])
def test_each_guarded_route_needs_its_box(
    method: str, path: str, box: Box, client_for: ClientFor, holder: Holder, db: Session
) -> None:
    body: dict[str, Any] | None = {} if method in ("POST", "PUT", "PATCH") else None
    assert client_for().request(method, f"{API}{path}", json=body).status_code == 401
    others = client_for(holder(frozenset(Box) - {box})).request(method, f"{API}{path}", json=body)
    assert others.status_code == 403, others.text
    assert others.json()["error"]["message"] == BOXES[box].refusal
    owner = holder(frozenset({box}))
    allowed = client_for(owner).request(method, f"{API}{path}", json=body)
    assert allowed.status_code != 403, allowed.text
    owner.status = UserStatus.suspended
    db.commit()
    assert client_for(owner).request(method, f"{API}{path}", json=body).status_code == 403


def test_the_reports_queue_follows_the_boxes(
    client_for: ClientFor, holder: Holder, make_user: Callable[..., User], storage: Any
) -> None:
    boss = make_user(name="Head Admin", roles=("student", "admin"))
    thread = new_thread(client_for(make_user(name="Sara Student")), "Report me")
    item = share_pdf(client_for(boss), storage, title="Report me too")
    reporter = client_for(make_user(name="Omar Reporter"))
    for target_type, target in (("thread", thread), ("library_item", item)):
        made = reporter.post(
            f"{API}/reports", json={"targetType": target_type, "targetId": target["id"], "reason": "spam"}
        )
        assert made.status_code == 201, made.text
    forum, library = holder(frozenset({Box.forum_moderate})), holder(frozenset({Box.library_manage}))

    def queue(person: User) -> list[tuple[str, Any]]:
        items = client_for(person).get(f"{API}/admin/reports").json()["items"]
        return [(r["targetType"], r["reporter"]) for r in items]

    assert queue(forum) == [("thread", None)]  # who reported is for admins only
    assert queue(library) == [("library_item", None)]
    everything = client_for(boss).get(f"{API}/admin/reports").json()["items"]
    assert sorted(r["targetType"] for r in everything) == ["library_item", "thread"]
    assert {r["reporter"]["displayName"] for r in everything} == {"Omar Reporter"}
    thread_report = next(r["id"] for r in everything if r["targetType"] == "thread")
    closing = client_for(library).post(f"{API}/admin/reports/{thread_report}/resolve", json={"status": "dismissed"})
    assert closing.status_code == 404  # not their queue
    neither = client_for(holder(frozenset({Box.career_edit}))).get(f"{API}/admin/reports")
    assert neither.status_code == 403
    assert (
        neither.json()["error"]["message"]
        == "Only people who moderate the forum, manage the library or handle requests can do this."
    )


def test_suspending_without_admin_powers(
    client_for: ClientFor, holder: Holder, make_user: Callable[..., User], db: Session
) -> None:
    keeper = holder(frozenset({Box.people_suspend}))
    student = make_user(name="Sara Student", email="sara@example.com")
    boss = make_user(name="Head Admin", roles=("student", "admin"))
    c = client_for(keeper)
    listed = c.get(f"{API}/admin/users").json()["items"]
    assert listed
    assert all(p["email"] is None and p["phone"] is None for p in listed)  # no contact details (spec note 10)
    assert c.patch(f"{API}/admin/users/{student.id}", json={"status": "suspended"}).status_code == 200
    refused = c.patch(f"{API}/admin/users/{boss.id}", json={"status": "suspended"})
    assert (refused.status_code, refused.json()["error"]["message"]) == (403, "Only admins can suspend an admin.")
    itself = c.patch(f"{API}/admin/users/{keeper.id}", json={"status": "suspended"})
    assert itself.json()["error"]["code"] == "cannot_change_self"
    recovery = c.patch(f"{API}/admin/users/{student.id}", json={"email": "taken.over@example.com"})
    assert (recovery.status_code, recovery.json()["error"]["message"]) == (403, "Only admins can do this.")
    db.refresh(student)
    assert student.email == "sara@example.com"
    assert any(p["email"] == "sara@example.com" for p in client_for(boss).get(f"{API}/admin/users").json()["items"])


def test_people_search_without_admin_matches_names_only(
    client_for: ClientFor, holder: Holder, make_user: Callable[..., User]
) -> None:
    """Security review AD-2: without Admin, a search can't find anyone by part of an address or a number."""
    make_user(name="Sara Student", email="sara.hidden@example.com")
    make_user(name="Omar Phone", email=None, phone="+97333123456")
    boss = make_user(name="Head Admin", roles=("student", "admin"))
    keeper = client_for(holder(frozenset({Box.people_suspend})))

    def names(c: TestClient, q: str) -> list[str]:
        r = c.get(f"{API}/admin/users", params={"q": q})
        assert r.status_code == 200, r.text
        if c is keeper:  # no address and no number in any answer to a holder
            assert "@" not in r.text
            assert "97333123456" not in r.text
        return [p["displayName"] for p in r.json()["items"]]

    for q in ("sara.hidden@example.com", "sara.hidden", "hidden@", "97333123456", "3312"):
        assert names(keeper, q) == []
    assert names(keeper, "Sara") == ["Sara Student"]
    admin = client_for(boss)
    assert names(admin, "sara.hidden@example.com") == ["Sara Student"]
    assert names(admin, "3312") == ["Omar Phone"]


def test_report_excerpts_stay_with_their_area(
    client_for: ClientFor, holder: Holder, make_user: Callable[..., User]
) -> None:
    """Security review AD-5: a forum report, and its excerpt, reach only people who moderate the forum."""
    thread = new_thread(client_for(make_user(name="Sara Student")), "A secret line about the exam")
    reporter = client_for(make_user(name="Omar Reporter"))
    made = reporter.post(f"{API}/reports", json={"targetType": "thread", "targetId": thread["id"], "reason": "spam"})
    assert made.status_code == 201, made.text
    forum, library = holder(frozenset({Box.forum_moderate})), holder(frozenset({Box.library_manage}))
    seen = client_for(forum).get(f"{API}/admin/reports")
    assert [r["targetExcerpt"] for r in seen.json()["items"]] == ["A secret line about the exam"]
    for status in ("open", "resolved", "dismissed"):
        hidden = client_for(library).get(f"{API}/admin/reports", params={"status": status})
        assert (hidden.json()["items"], hidden.json()["total"]) == ([], 0)
        assert "secret line" not in hidden.text
    report_id = seen.json()["items"][0]["id"]
    closing = client_for(library).post(f"{API}/admin/reports/{report_id}/resolve", json={"status": "dismissed"})
    assert closing.status_code == 404
    assert "secret line" not in closing.text
    closed = client_for(forum).post(f"{API}/admin/reports/{report_id}/resolve", json={"status": "dismissed"})
    assert (closed.status_code, closed.json()["targetExcerpt"]) == (200, "A secret line about the exam")


def test_no_roles_and_suspended_holders_see_nothing_hidden(
    client_for: ClientFor, holder: Holder, make_user: Callable[..., User], storage: Any, db: Session
) -> None:
    """Security review AD-9: hidden posts, pending files and drafts answer 404 to a person with no roles and to a
    suspended holder of every box, as they do to a guest."""
    rep = client_for(make_user(name="Maryam Rep", roles=("student", "rep")))
    hidden = new_thread(client_for(make_user(name="Sara Student")), "Hide me")
    assert rep.post(f"{API}/forum/threads/{hidden['id']}/moderate", json={"status": "hidden"}).status_code == 200
    pending = share_pdf(client_for(make_user(name="Omar Student")), storage, title="Waiting")
    assert pending["status"] == "pending"
    draft = rep.post(
        f"{API}/newsletter/issues",
        json={"slug": "a-draft", "number": 9, "title": "A draft", "date": "2026-10-20", "sections": []},
    )
    assert draft.status_code == 201, draft.text
    nobody = make_user(name="No Roles", roles=())
    suspended = holder(frozenset(Box))
    suspended.status = UserStatus.suspended
    db.commit()
    for person in (nobody, suspended):
        c = client_for(person)
        assert c.get(f"{API}/forum/threads/{hidden['slug']}").status_code == 404
        assert c.get(f"{API}/library/items/{pending['id']}").status_code == 404
        assert c.get(f"{API}/newsletter/issues/a-draft").status_code == 404
        drafts = c.get(f"{API}/newsletter/issues", params={"include_drafts": True}).json()
        assert all(i["slug"] != "a-draft" for i in drafts)
    writes = client_for(nobody)
    assert writes.post(f"{API}/forum/threads", json={"title": "Can I?", "body": "Hi"}).status_code == 403
    assert (
        writes.post(
            f"{API}/reports", json={"targetType": "thread", "targetId": hidden["id"], "reason": "spam"}
        ).status_code
        == 403
    )


def test_others_see_a_badge_never_the_roles(client_for: ClientFor, make_user: Callable[..., User]) -> None:
    """Security review AD-9: a person's roles show to others only as the badge."""
    t = new_thread(client_for(make_user(name="Maryam Rep", roles=("student", "rep", "newsletter-manager"))), "Hi")
    author = client_for().get(f"{API}/forum/threads/{t['slug']}").json()["author"]
    assert author["badge"] == "Student rep"
    assert {"roles", "boxes"}.isdisjoint(author)


def test_the_open_reports_count_follows_the_queue(
    client_for: ClientFor, holder: Holder, make_user: Callable[..., User]
) -> None:
    """Security review AD-5: the dashboard counts the open reports the viewer can act on."""
    thread = new_thread(client_for(make_user(name="Sara Student")), "Count me")
    reporter = client_for(make_user(name="Omar Reporter"))
    made = reporter.post(f"{API}/reports", json={"targetType": "thread", "targetId": thread["id"], "reason": "spam"})
    assert made.status_code == 201, made.text

    def open_reports(*boxes: Box) -> int:
        count: int = (
            client_for(holder(frozenset({Box.stats_view, *boxes}))).get(f"{API}/admin/stats").json()["openReports"]
        )
        return count

    assert [open_reports(), open_reports(Box.library_manage), open_reports(Box.forum_moderate)] == [0, 0, 1]
