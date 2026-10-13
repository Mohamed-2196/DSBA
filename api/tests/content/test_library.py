from __future__ import annotations

import re
import uuid
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import timedelta
from typing import Any
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app import cli
from app.core.time import utcnow
from app.models import AuditEntry, ItemStatus, LibraryItem, Module, Notification, Upload, User, UserStatus
from app.services import library
from tests.content.conftest import API, DOCX, PDF, PNG

JPG = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01" + b"\x00" * 48
WEBP = b"RIFF\x24\x00\x00\x00WEBPVP8 " + b"\x00" * 48

Clients = Callable[..., TestClient]
Share = Callable[..., dict[str, Any]]
Upload_ = Callable[..., dict[str, Any]]


def item_url(item: dict[str, Any], suffix: str = "") -> str:
    return f"{API}/library/items/{item['id']}{suffix}"


def link(client: TestClient, **body: Any) -> Any:
    payload = {"url": "https://drive.google.com/drive/folders/abc", "title": "Past exams", "kind": "past-paper"}
    payload.update(body)
    return client.post(f"{API}/library/links", json=payload)


def audit_actions(db: Session) -> list[str]:
    return list(db.scalars(select(AuditEntry.action).order_by(AuditEntry.id)))


# ── the lifecycle of a student's upload ──────────────────────────────────────────────────────


def test_upload_review_publish_download_star_delete(
    client_for: Clients,
    student: User,
    other: User,
    moderator: User,
    modules: dict[str, Module],
    share_file: Share,
    storage: Any,
    db: Session,
) -> None:
    me, them, rep, guest = client_for(student), client_for(other), client_for(moderator), client_for()

    item = share_file(
        me,
        title="Past paper 2024 Zone A",
        kind="past-paper",
        module_id="advanced-stats-distribution",
        exam_year=2024,
        zone="A",
        name="ST2133 2024 A.pdf",
    )
    assert item["status"] == "pending"
    assert item["slug"] == "st2133-past-paper-2024-zone-a"
    assert item["year"] == 2  # from the module
    assert item["format"] == "PDF"
    assert item["fileName"] == "ST2133 2024 A.pdf"
    assert item["uploadedBy"] == {"id": str(student.id), "displayName": "Sara Student", "year": 2, "badge": None}
    assert (item["isMine"], item["canEdit"], item["starred"], item["publishedAt"]) == (True, True, False, None)
    assert "email" not in str(item["uploadedBy"]).lower()

    # pending: only the uploader and moderators see it
    for c in (guest, them):
        assert c.get(item_url(item)).status_code == 404
        assert c.get(f"{API}/library/items/{item['slug']}").status_code == 404
        assert c.get(item_url(item, "/download"), follow_redirects=False).status_code == 404
    assert rep.get(item_url(item)).json()["canEdit"] is True
    assert guest.get(f"{API}/library/items").json()["total"] == 0
    assert [i["id"] for i in me.get(f"{API}/library/items", params={"mine": True}).json()["items"]] == [item["id"]]
    queue = rep.get(f"{API}/library/items", params={"status": "pending"}).json()
    assert [i["id"] for i in queue["items"]] == [item["id"]]
    # `status` from anyone but a moderator is ignored: published items only
    assert them.get(f"{API}/library/items", params={"status": "pending"}).json()["total"] == 0
    assert guest.get(f"{API}/library/items", params={"status": "rejected"}).json()["total"] == 0

    # the moderator publishes it: the uploader hears about it, the decision is audited
    r = rep.post(item_url(item, "/review"), json={"decision": "publish", "note": "Thanks, great scan."})
    assert r.status_code == 200, r.text
    published = r.json()
    assert published["status"] == "published"
    assert published["publishedAt"] is not None
    note = db.scalar(select(Notification).where(Notification.user_id == student.id))
    assert note is not None
    assert (note.kind, note.url, note.actor_id) == ("upload_published", f"/library/{item['slug']}", moderator.id)
    assert "library.publish" in audit_actions(db)

    # public now; the review note stays between the uploader and moderators
    seen = guest.get(f"{API}/library/items/{item['slug']}").json()
    assert seen["reviewNote"] is None
    assert seen["isMine"] is False
    assert seen["canEdit"] is False
    assert me.get(item_url(item)).json()["reviewNote"] == "Thanks, great scan."
    assert me.get(item_url(item)).json()["canEdit"] is False  # published: only moderators edit

    # download: an attachment link, counted in SQL
    r = guest.get(item_url(item, "/download"), follow_redirects=False)
    assert r.status_code == 302
    location = urlparse(r.headers["location"])
    assert location.path.startswith(f"/{storage.bucket}/library/")
    params = parse_qs(location.query)
    assert params["response-content-disposition"][0].startswith("attachment;")
    assert "ST2133" in params["response-content-disposition"][0]
    assert params["response-content-type"] == ["application/pdf"]
    them.get(item_url(item, "/download"), follow_redirects=False)
    assert guest.get(item_url(item)).json()["downloadCount"] == 2

    # the viewer's inline link (not counted)
    r = guest.get(item_url(item, "/file"))
    assert r.status_code == 200
    assert parse_qs(urlparse(r.json()["url"]).query)["response-content-disposition"][0].startswith("inline;")
    assert guest.get(item_url(item)).json()["downloadCount"] == 2

    # stars: idempotent, per person
    assert guest.put(item_url(item, "/star")).status_code == 401
    assert them.put(item_url(item, "/star")).json() == {"starred": True}
    assert them.put(item_url(item, "/star")).json() == {"starred": True}
    assert them.get(item_url(item)).json()["starred"] is True
    assert me.get(item_url(item)).json()["starred"] is False
    assert [i["id"] for i in them.get(f"{API}/library/items", params={"starred": True}).json()["items"]] == [item["id"]]
    assert me.get(f"{API}/library/items", params={"starred": True}).json()["total"] == 0
    assert guest.get(f"{API}/library/items", params={"starred": True}).status_code == 401
    assert them.delete(item_url(item, "/star")).json() == {"starred": False}
    assert them.delete(item_url(item, "/star")).json() == {"starred": False}

    # delete: not someone else's; the uploader's own goes at once (the file a week later, with the daily sweep)
    key = db.scalar(select(LibraryItem.storage_key).where(LibraryItem.id == uuid.UUID(item["id"])))
    assert key is not None
    assert storage.head(key) is not None
    assert them.delete(item_url(item)).status_code == 403
    assert guest.delete(item_url(item)).status_code == 401
    assert me.delete(item_url(item)).status_code == 204
    assert storage.head(key) is not None  # nothing serves it any more: see test_the_sweep_deletes_...
    assert guest.get(item_url(item, "/download"), follow_redirects=False).status_code == 404
    assert guest.get(item_url(item)).status_code == 404
    assert me.get(item_url(item)).status_code == 404  # gone for its uploader too
    assert me.delete(item_url(item)).status_code == 404
    assert guest.get(f"{API}/library/items").json()["total"] == 0
    assert me.get(f"{API}/library/items", params={"mine": True}).json()["total"] == 0
    assert "library.remove" not in audit_actions(db)  # the uploader's own: nothing to audit


def test_a_rejected_upload_tells_the_uploader_why(
    client_for: Clients, student: User, moderator: User, share_file: Share, db: Session
) -> None:
    me, rep = client_for(student), client_for(moderator)
    item = share_file(me)
    r = rep.post(item_url(item, "/review"), json={"decision": "reject", "note": "This is a copyrighted textbook."})
    assert r.json()["status"] == "rejected"
    note = db.scalar(select(Notification).where(Notification.user_id == student.id))
    assert note is not None
    assert (note.kind, note.body) == ("upload_rejected", "This is a copyrighted textbook.")
    assert me.get(item_url(item)).json()["reviewNote"] == "This is a copyrighted textbook."
    assert client_for().get(item_url(item)).status_code == 404
    assert [i["status"] for i in me.get(f"{API}/library/items", params={"mine": True}).json()["items"]] == ["rejected"]
    assert "library.reject" in audit_actions(db)
    # only moderators review
    assert me.post(item_url(item, "/review"), json={"decision": "publish"}).status_code == 403


def test_moderators_publish_their_own_uploads_at_once(
    client_for: Clients, moderator: User, share_file: Share, db: Session
) -> None:
    item = share_file(client_for(moderator), title="Distribution theory cheat sheet", kind="cheat-sheet")
    assert item["status"] == "published"
    assert item["publishedAt"] is not None
    assert client_for().get(item_url(item)).status_code == 200
    assert db.scalar(select(Notification)) is None  # nobody is told about their own action
    entry = db.scalar(select(AuditEntry).where(AuditEntry.action == "library.publish"))
    assert entry is not None  # it skipped review: on the record
    assert entry.data == {"title": "Distribution theory cheat sheet", "own": True, "actorName": "Maryam Rep"}


def test_creating_an_item_needs_a_finished_upload_of_your_own(
    client_for: Clients,
    student: User,
    other: User,
    upload_file: Upload_,
    modules: dict[str, Module],
) -> None:
    me = client_for(student)

    def create(upload_id: str, **extra: Any) -> Any:
        return me.post(
            f"{API}/library/items", json={"uploadId": upload_id, "title": "My notes", "kind": "notes", **extra}
        )

    pending = upload_file(me, complete=False)
    assert create(pending["uploadId"]).json()["error"]["code"] == "not_uploaded"
    theirs = upload_file(client_for(other))
    assert create(theirs["uploadId"]).status_code == 404
    image = upload_file(me, purpose="forum_image", name="a.png", content_type="image/png", body=b"\x89PNG\r\n\x1a\n")
    assert create(image["uploadId"]).status_code == 422
    done = upload_file(me)
    assert create(done["uploadId"], moduleId="no-such-module").json()["error"]["fields"] == {
        "moduleId": "Pick a module from the list."
    }
    assert create(done["uploadId"], title="ab").status_code == 422  # titles are 3-200 characters
    assert create(done["uploadId"], kind="memes").status_code == 422
    assert create(done["uploadId"]).status_code == 201
    assert create(done["uploadId"]).json()["error"]["code"] == "already_used"
    assert (
        client_for()
        .post(f"{API}/library/items", json={"uploadId": done["uploadId"], "title": "x" * 5, "kind": "notes"})
        .status_code
        == 401
    )


def test_edit_rules(
    client_for: Clients,
    student: User,
    other: User,
    moderator: User,
    share_file: Share,
    modules: dict[str, Module],
    db: Session,
) -> None:
    me, them, rep = client_for(student), client_for(other), client_for(moderator)
    item = share_file(me, title="Notes", module_id="economics")
    assert item["year"] == 1

    r = me.patch(item_url(item), json={"title": "Chapter 2 notes", "moduleId": "econometrics", "description": " "})
    assert r.status_code == 200, r.text
    edited = r.json()
    assert (edited["title"], edited["moduleId"], edited["year"], edited["description"]) == (
        "Chapter 2 notes",
        "econometrics",
        2,
        None,
    )
    assert edited["slug"] == item["slug"]  # the address never changes
    assert them.patch(item_url(item), json={"title": "Mine now"}).status_code == 404  # pending: invisible to them
    assert me.patch(item_url(item), json={"moduleId": "nope"}).status_code == 422
    assert "library.edit" not in audit_actions(db)

    rep.post(item_url(item, "/review"), json={"decision": "publish"})
    assert me.patch(item_url(item), json={"title": "Too late"}).status_code == 403
    assert them.patch(item_url(item), json={"title": "Not yours"}).status_code == 403
    r = rep.patch(item_url(item), json={"kind": "study-guide", "authorName": "Sara S."})
    assert r.status_code == 200
    assert (r.json()["kind"], r.json()["authorName"]) == ("study-guide", "Sara S.")
    assert "library.edit" in audit_actions(db)


def test_moderators_remove_files_and_it_is_audited(
    client_for: Clients, student: User, moderator: User, share_file: Share, storage: Any, db: Session
) -> None:
    item = share_file(client_for(student))
    rep = client_for(moderator)
    rep.post(item_url(item, "/review"), json={"decision": "publish"})
    key = db.scalar(select(LibraryItem.storage_key).where(LibraryItem.id == uuid.UUID(item["id"])))
    assert key is not None
    assert rep.delete(item_url(item)).status_code == 204
    assert storage.head(key) is not None  # deleted by the daily sweep a week later (SEC-14)
    entry = db.scalar(select(AuditEntry).where(AuditEntry.action == "library.remove"))
    assert entry is not None
    assert (entry.target_type, entry.target_id) == ("library_item", item["id"])
    assert (entry.data["title"], entry.data["was"]) == ("Chapter 3 notes", "published")
    assert rep.get(item_url(item)).json()["status"] == "removed"
    assert (
        rep.post(item_url(item, "/review"), json={"decision": "publish"}).json()["error"]["code"] == "post_unavailable"
    )
    assert client_for().get(item_url(item, "/download"), follow_redirects=False).status_code == 404


def test_previews_are_for_pdfs_and_images_only(client_for: Clients, moderator: User, share_file: Share) -> None:
    rep = client_for(moderator)
    docx = share_file(
        rep,
        name="Essay.docx",
        content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        body=DOCX,
    )
    assert docx["format"] == "DOCX"
    r = rep.get(item_url(docx, "/file"))
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "no_preview"
    params = parse_qs(urlparse(rep.get(item_url(docx, "/download"), follow_redirects=False).headers["location"]).query)
    assert params["response-content-type"] == [
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ]
    assert params["response-content-disposition"][0].startswith("attachment;")


# ── links ────────────────────────────────────────────────────────────────────────────────────


def test_moderators_add_https_links(
    client_for: Clients, student: User, moderator: User, modules: dict[str, Module], db: Session
) -> None:
    rep = client_for(moderator)
    r = link(rep, moduleId="econometrics", description="VLE and older papers")
    assert r.status_code == 201, r.text
    item = r.json()
    assert (item["source"], item["status"], item["format"], item["year"]) == ("link", "published", None, 2)
    assert item["url"] == "https://drive.google.com/drive/folders/abc"
    assert item["slug"] == "ec2020-past-exams"
    assert "library.link" in audit_actions(db)

    assert link(rep, url="http://example.com/x").json()["error"]["fields"] == {"url": "Use an https:// link."}
    assert link(rep, url="javascript:alert(1)").status_code == 422
    assert link(rep, url="https://user:secret@example.com/x").json()["error"]["fields"] == {
        "url": "Remove the user name and password from the link."
    }
    assert link(rep, url="https://example.com/" + "x" * 2000).status_code == 422
    assert link(client_for(student)).status_code == 403
    assert link(client_for()).status_code == 401

    guest = client_for()
    r = guest.get(item_url(item, "/download"), follow_redirects=False)
    assert (r.status_code, r.headers["location"]) == (302, "https://drive.google.com/drive/folders/abc")
    assert guest.get(item_url(item)).json()["downloadCount"] == 1
    assert guest.get(item_url(item, "/file")).json()["error"]["code"] == "no_preview"
    assert link(rep, moduleId="econometrics").json()["slug"] == "ec2020-past-exams-2"


# ── listing, search and facets ───────────────────────────────────────────────────────────────


def test_filters_sorts_search_and_facets(
    client_for: Clients, moderator: User, modules: dict[str, Module], share_file: Share
) -> None:
    rep, guest = client_for(moderator), client_for()
    paper = share_file(rep, title="Past paper 2023 Zone B", kind="past-paper", module_id="advanced-stats-distribution")
    guide = share_file(
        rep, title="Gamma and beta functions", kind="study-guide", module_id="advanced-stats-distribution"
    )
    econ = link(rep, title="Mahdi's notes", kind="notes", moduleId="economics", authorName="Mahdi").json()
    rep.get(item_url(guide, "/download"), follow_redirects=False)
    rep.get(item_url(guide, "/download"), follow_redirects=False)
    rep.get(item_url(econ, "/download"), follow_redirects=False)

    def ids(**params: Any) -> list[str]:
        r = guest.get(f"{API}/library/items", params=params)
        assert r.status_code == 200, r.text
        return [i["id"] for i in r.json()["items"]]

    assert ids() == [econ["id"], guide["id"], paper["id"]]  # newest first
    assert ids(sort="popular") == [guide["id"], econ["id"], paper["id"]]
    assert ids(sort="title") == [guide["id"], econ["id"], paper["id"]]
    assert ids(module_id="advanced-stats-distribution") == [guide["id"], paper["id"]]
    assert ids(year=1) == [econ["id"]]
    assert ids(kind="past-paper") == [paper["id"]]
    assert ids(source="link") == [econ["id"]]
    assert ids(source="file", sort="title") == [guide["id"], paper["id"]]

    # full text, with the last word as a prefix; the module's code and name and the kind count too
    assert ids(q="gamma") == [guide["id"]]
    assert ids(q="gam") == [guide["id"]]
    assert ids(q="beta func") == [guide["id"]]
    assert ids(q="ST2133", sort="title") == [guide["id"], paper["id"]]
    assert ids(q="st2133 past papers") == [paper["id"]]
    assert ids(q="distribution theory zone") == [paper["id"]]
    assert ids(q="mahdi econ") == [econ["id"]]  # only the last word is a prefix
    assert ids(q="econ mahdi") == []
    assert ids(q='"zone b"') == [paper["id"]]
    assert ids(q="st2133 -gamma") == [paper["id"]]
    assert ids(q="nothing-matches-this") == []
    assert ids(q="++") == []
    assert ids(q="paper", sort="relevance")[0] == paper["id"]

    page = guest.get(f"{API}/library/items", params={"limit": 2, "offset": 2}).json()
    assert (page["total"], page["limit"], page["offset"], len(page["items"])) == (3, 2, 2, 1)

    facets = guest.get(f"{API}/library/facets").json()
    assert facets == {
        "total": 3,
        "byKind": {"past-paper": 1, "study-guide": 1, "notes": 1},
        "byModule": {"advanced-stats-distribution": 2, "economics": 1},
        "byYear": {"1": 1, "2": 2},
    }
    mods = {m["id"]: m["libraryCount"] for m in guest.get(f"{API}/modules").json()}
    assert (mods["advanced-stats-distribution"], mods["economics"], mods["statistics"]) == (2, 1, 0)


def test_items_are_found_by_id_or_slug(client_for: Clients, moderator: User, share_file: Share) -> None:
    item = share_file(client_for(moderator), title="Week 1 slides")
    guest = client_for()
    assert guest.get(f"{API}/library/items/{item['slug']}").json()["id"] == item["id"]
    assert guest.get(item_url(item)).json()["slug"] == "week-1-slides"
    assert guest.get(f"{API}/library/items/{uuid.uuid4()}").status_code == 404
    assert guest.get(f"{API}/library/items/no-such-slug").status_code == 404


def test_a_title_used_twice_gets_its_own_address(client_for: Clients, moderator: User, share_file: Share) -> None:
    rep = client_for(moderator)
    first = share_file(rep, title="Revision notes")
    second = share_file(rep, title="Revision notes")
    assert (first["slug"], second["slug"]) == ("revision-notes", "revision-notes-2")


def test_pdf_constant_is_a_pdf() -> None:
    assert PDF.startswith(b"%PDF-")


def key_of(db: Session, item: dict[str, Any]) -> str | None:
    return db.scalar(select(LibraryItem.storage_key).where(LibraryItem.id == uuid.UUID(item["id"])))


# ── pictures (decision D9) ───────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("name", "content_type", "body", "fmt", "stored"),
    [
        ("whiteboard.png", "image/png", PNG, "PNG", "image/png"),
        ("Scan 1.JPG", "image/jpeg", JPG, "JPG", "image/jpeg"),
        ("slide.jpeg", "image/jpg", JPG, "JPG", "image/jpeg"),
        ("photo.webp", "image/webp", WEBP, "WEBP", "image/webp"),
    ],
)
def test_pictures_are_shared_reviewed_and_previewed_inline(
    client_for: Clients,
    student: User,
    moderator: User,
    share_file: Share,
    name: str,
    content_type: str,
    body: bytes,
    fmt: str,
    stored: str,
) -> None:
    item = share_file(
        client_for(student), title="Whiteboard after the lecture", name=name, content_type=content_type, body=body
    )
    assert (item["format"], item["contentType"], item["status"]) == (fmt, stored, "pending")
    rep = client_for(moderator)
    r = rep.get(item_url(item, "/file"))  # the rep looks at it before publishing
    assert r.status_code == 200, r.text
    params = parse_qs(urlparse(r.json()["url"]).query)
    assert params["response-content-type"] == [stored]
    assert params["response-content-disposition"][0].startswith("inline;")
    rep.post(item_url(item, "/review"), json={"decision": "publish"})
    location = rep.get(item_url(item, "/download"), follow_redirects=False).headers["location"]
    assert parse_qs(urlparse(location).query)["response-content-disposition"][0].startswith("attachment;")


# ── who may write (student test ST-8) ────────────────────────────────────────────────────────


def test_a_suspended_account_or_one_without_a_profile_cannot_star_or_remove(
    client_for: Clients, make_user: Callable[..., User], moderator: User, share_file: Share, db: Session
) -> None:
    shared = share_file(client_for(moderator), title="Shared by a rep")
    sam = make_user(name="Sam")
    c = client_for(sam)
    own = share_file(c, title="Sam's notes")
    assert c.put(item_url(shared, "/star")).json() == {"starred": True}
    sam.status = UserStatus.suspended
    db.commit()
    for r in (c.put(item_url(shared, "/star")), c.delete(item_url(shared, "/star")), c.delete(item_url(own))):
        assert r.status_code == 403
        assert r.json()["error"]["message"] == "Your account is suspended. Contact a student rep."
    assert c.get(item_url(shared)).json()["starred"] is True  # reading still works
    assert c.get(item_url(own)).json()["status"] == "pending"
    nameless = client_for(make_user(name=None))
    r = nameless.put(item_url(shared, "/star"))
    assert (r.status_code, r.json()["error"]["message"]) == (403, "Finish your profile first.")


# ── what waits for review, and for how long (security review SEC-14) ─────────────────────────


def presign_library(client: TestClient) -> Any:
    payload = {"purpose": "library", "fileName": "more.pdf", "contentType": "application/pdf", "sizeBytes": 100}
    return client.post(f"{API}/uploads", json=payload)


def test_a_student_has_at_most_ten_files_waiting_for_review(
    client_for: Clients,
    student: User,
    moderator: User,
    share_file: Share,
    upload_file: Upload_,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    assert library.MAX_PENDING == 10
    monkeypatch.setattr(library, "MAX_PENDING", 2)  # the same rule, with fewer uploads
    me, rep = client_for(student), client_for(moderator)
    early = upload_file(me)  # uploaded while there was room
    first = share_file(me, title="First notes")
    share_file(me, title="Second notes")

    # refused before the file travels...
    r = presign_library(me)
    assert (r.status_code, r.json()["error"]["code"]) == (409, "too_many_pending")
    assert r.json()["error"]["message"] == (
        "You have 2 files waiting for review. Share more once a student rep has looked at them."
    )
    # ...and when an item is made from an upload that got in earlier
    third = {"uploadId": early["uploadId"], "title": "Third notes", "kind": "notes"}
    r = me.post(f"{API}/library/items", json=third)
    assert (r.status_code, r.json()["error"]["code"]) == (409, "too_many_pending")
    # forum pictures are not held up
    image = {"purpose": "forum_image", "fileName": "a.png", "contentType": "image/png", "sizeBytes": 100}
    assert me.post(f"{API}/uploads", json=image).status_code == 201

    # once a rep has looked at one, there is room again
    rep.post(item_url(first, "/review"), json={"decision": "reject"})
    assert me.post(f"{API}/library/items", json=third).status_code == 201
    assert presign_library(me).json()["error"]["code"] == "too_many_pending"
    # reps' files are published at once: nothing of theirs waits
    for i in range(3):
        assert share_file(rep, title=f"Rep file {i}")["status"] == "published"


def test_the_sweep_deletes_rejected_and_removed_files_after_a_week(
    client_for: Clients,
    student: User,
    moderator: User,
    share_file: Share,
    storage: Any,
    db: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    me, rep = client_for(student), client_for(moderator)
    rejected = share_file(me, title="Rejected notes")
    removed = share_file(me, title="Removed notes")
    published = share_file(me, title="Published notes")
    recent = share_file(me, title="Rejected this week")
    rep.post(item_url(rejected, "/review"), json={"decision": "reject", "note": "This is a copyrighted textbook."})
    rep.post(item_url(recent, "/review"), json={"decision": "reject"})
    rep.post(item_url(published, "/review"), json={"decision": "publish"})
    assert me.delete(item_url(removed)).status_code == 204
    keys = {name: key_of(db, item) for name, item in (("rejected", rejected), ("removed", removed))}
    kept = [key_of(db, published), key_of(db, recent)]
    assert all(keys.values())
    assert all(kept)
    week_ago = utcnow() - library.FILE_GRACE - timedelta(hours=1)
    old = [uuid.UUID(rejected["id"]), uuid.UUID(removed["id"])]
    db.execute(update(LibraryItem).where(LibraryItem.id.in_(old)).values(updated_at=week_ago))
    db.commit()

    @contextmanager
    def same_session() -> Iterator[Session]:
        yield db

    monkeypatch.setattr(cli, "get_sessionmaker", lambda: same_session)
    cli.sweep()  # the daily command (app/cli.py) does it
    db.expire_all()
    for key in keys.values():
        assert key is not None
        assert storage.head(key) is None
        assert db.scalar(select(Upload).where(Upload.storage_key == key)) is None
    assert all(storage.head(k) is not None for k in kept if k)  # published, or rejected less than a week ago

    # the item stays, without a file: its uploader still reads why it was rejected
    row = db.get(LibraryItem, uuid.UUID(rejected["id"]))
    assert row is not None
    assert (row.status, row.storage_key) == (ItemStatus.rejected, None)
    assert me.get(item_url(rejected)).json()["reviewNote"] == "This is a copyrighted textbook."
    r = rep.post(item_url(rejected, "/review"), json={"decision": "publish"})
    assert (r.status_code, r.json()["error"]["code"]) == (409, "file_gone")
    assert rep.get(item_url(rejected, "/download"), follow_redirects=False).status_code == 404
    assert rep.get(item_url(rejected, "/file")).json()["error"]["code"] == "no_preview"
    assert library.sweep_files(db, storage) == 0  # nothing left to do


# ── the activity log (student test ST-9) ─────────────────────────────────────────────────────


def test_the_activity_log_names_every_file(
    client_for: Clients, student: User, moderator: User, share_file: Share, modules: dict[str, Module], db: Session
) -> None:
    me, rep = client_for(student), client_for(moderator)
    a = share_file(me, title="Notes A")
    b = share_file(me, title="Notes B")
    rep.post(item_url(a, "/review"), json={"decision": "publish", "note": "Thanks"})
    rep.post(item_url(b, "/review"), json={"decision": "reject", "note": "Blurry"})
    rep.patch(item_url(a), json={"title": "Notes A (revised)", "moduleId": "economics"})
    rep.delete(item_url(a))
    share_file(rep, title="Rep's sheet")
    link(rep, title="Past exams folder")
    rows = list(db.scalars(select(AuditEntry).where(AuditEntry.target_type == "library_item").order_by(AuditEntry.id)))
    assert [(e.action, e.data["title"]) for e in rows] == [
        ("library.publish", "Notes A"),
        ("library.reject", "Notes B"),
        ("library.edit", "Notes A (revised)"),
        ("library.remove", "Notes A (revised)"),
        ("library.publish", "Rep's sheet"),
        ("library.link", "Past exams folder"),
    ]
    assert (rows[0].data["note"], rows[1].data["note"]) == ("Thanks", "Blurry")
    assert rows[2].data["fields"] == ["module_id", "title", "year"]
    assert rows[3].data["was"] == "published"
    assert rows[4].data["own"] is True
    assert rows[5].data["url"] == "https://drive.google.com/drive/folders/abc"
    assert all(e.data["actorName"] == "Maryam Rep" for e in rows)


def test_titles_without_latin_letters_get_a_short_id(
    client_for: Clients, moderator: User, modules: dict[str, Module]
) -> None:
    """Decision D8: an Arabic title gives 'ec2020-x3k9q2' (or 'f-x3k9q2' without a module), never 'file-2'."""
    rep = client_for(moderator)
    with_module = link(rep, title="أسئلة الامتحانات السابقة", moduleId="econometrics").json()["slug"]
    without = link(rep, title="ملخص الفصل الثالث").json()["slug"]
    assert re.fullmatch(r"ec2020-[a-z0-9]{6}", with_module), with_module
    assert re.fullmatch(r"f-[a-z0-9]{6}", without), without
    assert link(rep, title="Past exams سابقة", moduleId="econometrics").json()["slug"] == "ec2020-past-exams"
