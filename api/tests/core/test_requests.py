"""The builders' requests to the core, and notify/audit hygiene (security review, findings 18 and 21)."""

from __future__ import annotations

import datetime as dt
import uuid
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core.errors import field_name
from app.models import AuditEntry, ItemSource, LibraryItem, User
from app.seed.loader import V1_PUBLISHED_AT, load_library, load_modules
from app.services.audit import record
from app.services.newsletter import LINK_RULE
from app.services.notify import hub_path, notify
from tests.core.helpers import API, new_thread, share_pdf

Clients = Callable[..., TestClient]


# ── validation errors name the field the client sent ─────────────────────────────────────────


@pytest.mark.parametrize(
    ("loc", "name"),
    [
        (("body", "body"), "body"),  # a reply's text is a field called "body"
        (("body", "sections", 0, "href"), "sections.0.href"),
        (("query", "limit"), "limit"),
        (("path", "thread_id"), "thread_id"),
        (("body",), "request"),
        ((), "request"),
    ],
)
def test_only_the_first_segment_says_where_the_value_came_from(loc: tuple[object, ...], name: str) -> None:
    assert field_name(loc) == name


def test_a_reply_that_is_too_long_names_its_body(client_for: Clients, student: User) -> None:
    t = new_thread(client_for(student), "Long replies")
    r = client_for(student).post(f"{API}/forum/threads/{t['id']}/replies", json={"body": "x" * 30_000})
    assert r.status_code == 422
    assert "body" in r.json()["error"]["fields"]


# ── the database works in UTC ────────────────────────────────────────────────────────────────


def test_connections_use_utc(db: Session) -> None:
    assert db.scalar(text("SELECT current_setting('TimeZone')")) == "UTC"
    now = db.scalar(text("SELECT now()"))
    assert now is not None
    assert now.utcoffset() == dt.timedelta(0)


# ── progress import caps (finding 19) ────────────────────────────────────────────────────────


def test_progress_import_is_capped(client_for: Clients, student: User) -> None:
    c = client_for(student)
    watched = {f"m:{i // 100}:{i % 100}": "2026-10-01T10:00:00Z" for i in range(5001)}
    r = c.post(f"{API}/me/progress/import", json={"watched": watched, "last": {}})
    assert r.status_code == 422
    assert "watched" in r.json()["error"]["fields"]
    last = {f"module-{i}": {"chapter": 0, "video": 0, "at": "2026-10-01T10:00:00Z"} for i in range(101)}
    r = c.post(f"{API}/me/progress/import", json={"watched": {}, "last": last})
    assert r.status_code == 422
    assert "last" in r.json()["error"]["fields"]


# ── newsletter links under "to" ──────────────────────────────────────────────────────────────


def test_newsletter_buttons_link_only_to_safe_places(client_for: Clients, moderator: User) -> None:
    def issue(to: str) -> dict[str, Any]:
        block = {"type": "cta", "to": to, "label": "Open"}
        return {
            "slug": f"cta-{uuid.uuid4().hex[:6]}",
            "number": 9,
            "title": "Buttons",
            "date": "2026-10-20",
            "sections": [{"id": "a", "title": "A", "blocks": [block]}],
        }

    rep = client_for(moderator)
    r = rep.post(f"{API}/newsletter/issues", json=issue("javascript:alert(1)"))
    assert r.status_code == 422
    assert r.json()["error"]["fields"] == {"sections.0.blocks.0.to": LINK_RULE}
    assert rep.post(f"{API}/newsletter/issues", json=issue("/calendar")).status_code == 201


# ── library files ────────────────────────────────────────────────────────────────────────────


def test_removed_items_answer_404_on_download_and_file(
    client_for: Clients, storage: Any, moderator: User, db: Session
) -> None:
    rep = client_for(moderator)
    item = share_pdf(rep, storage, title="Removed notes")
    base = f"{API}/library/items/{item['id']}"
    assert rep.get(f"{base}/download", follow_redirects=False).status_code == 302
    assert rep.get(f"{base}/file").status_code == 200
    link = rep.post(
        f"{API}/library/links", json={"url": "https://example.com/folder", "title": "A folder", "kind": "notes"}
    )
    assert link.status_code == 201
    link_base = f"{API}/library/items/{link.json()['id']}"
    for url in (base, link_base):
        assert rep.delete(url).status_code == 204
        assert rep.get(url).json()["status"] == "removed"  # moderators still see the record...
    for url in (f"{base}/download", f"{base}/file", f"{link_base}/download"):
        r = rep.get(url, follow_redirects=False)  # ...but nothing to open
        assert r.status_code == 404, url
        assert r.json()["error"]["code"] == "not_found"


def test_seeded_links_were_published_before_anything_shared_since(db: Session) -> None:
    load_modules(db)
    assert load_library(db) > 0
    db.commit()
    dates = set(db.scalars(select(LibraryItem.published_at).where(LibraryItem.source == ItemSource.link)))
    assert dates == {V1_PUBLISHED_AT}


# ── notifications link only inside the Hub (finding 18) ─────────────────────────────────────


@pytest.mark.parametrize(
    ("url", "kept"),
    [
        ("/forum/how-do-i-find-the-mgf", True),
        ("/library/st2133-notes?tab=files#top", True),
        ("//evil.example/signin", False),
        ("/\\evil.example/signin", False),
        ("/\t/evil.example", False),
        ("https://evil.example/", False),
        ("javascript:alert(1)", False),
        ("forum/relative", False),
        ("/" + "a" * 300, False),
    ],
)
def test_notifications_keep_only_hub_paths(db: Session, make_user: Callable[..., User], url: str, kept: bool) -> None:
    assert (hub_path(url) == url) is kept
    n = notify(db, make_user().id, "system", "Hello", url=url)
    assert n is not None
    db.flush()
    assert n.url == (url if kept else None)


# ── audit rows keep names (finding 21) ───────────────────────────────────────────────────────


def test_audit_rows_keep_the_names_of_who_and_whom(db: Session, make_user: Callable[..., User]) -> None:
    actor, target = make_user(name="Head Admin"), make_user(name="Soon A Rep")
    record(db, actor, "user.role", "user", target.id, {"from": "student", "to": "moderator"}, "not-an-ip")
    record(db, None, "user.status", "user", str(target.id), {"to": "suspended"}, "::ffff:203.0.113.9")
    record(db, actor, "forum.thread.hide", "thread", uuid.uuid4(), {"actorName": "As passed", "title": "T"})
    db.flush()
    rows = list(db.scalars(select(AuditEntry).order_by(AuditEntry.id)))[-3:]
    assert rows[0].data == {"from": "student", "to": "moderator", "actorName": "Head Admin", "targetName": "Soon A Rep"}
    assert rows[0].ip is None  # not an address: stored as none, never a 500
    assert rows[1].data == {"to": "suspended", "targetName": "Soon A Rep"}  # no actor (the CLI, a bootstrap)
    assert str(rows[1].ip) == "203.0.113.9"
    assert rows[2].data == {"actorName": "As passed", "title": "T"}


@pytest.mark.parametrize(
    "to", ["/\t/evil.example/signin", "/\n/evil.example", "/\\evil.example", "//evil.example", "/x\\y"]
)
def test_newsletter_links_with_whitespace_or_backslashes_are_refused(
    client_for: Clients, moderator: User, to: str
) -> None:
    issue = {
        "slug": f"tab-{uuid.uuid4().hex[:6]}",
        "number": 9,
        "title": "Tabs",
        "date": "2026-10-20",
        "sections": [{"id": "a", "title": "A", "blocks": [{"type": "cta", "to": to, "label": "Open"}]}],
    }
    r = client_for(moderator).post(f"{API}/newsletter/issues", json=issue)
    assert r.status_code == 422
    assert r.json()["error"]["fields"] == {"sections.0.blocks.0.to": LINK_RULE}
