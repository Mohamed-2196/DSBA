from __future__ import annotations

import uuid
from collections.abc import Callable
from typing import Any
from urllib.parse import parse_qs, urlparse

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AuditEntry, LibraryItem, Module, Notification, Upload, User
from tests.content.conftest import API, DOCX, PDF

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
    assert item["uploadedBy"] == {"id": str(student.id), "displayName": "Sara Student", "year": 2, "role": "student"}
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

    # delete: not someone else's; the uploader's own goes, file and all
    key = db.scalar(select(LibraryItem.storage_key).where(LibraryItem.id == uuid.UUID(item["id"])))
    assert key is not None
    assert storage.head(key) is not None
    assert them.delete(item_url(item)).status_code == 403
    assert guest.delete(item_url(item)).status_code == 401
    assert me.delete(item_url(item)).status_code == 204
    assert storage.head(key) is None
    assert db.scalar(select(Upload).where(Upload.storage_key == key)) is None
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
    assert create(done["uploadId"], moduleId="no-such-module").status_code == 422
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
    assert rep.delete(item_url(item)).status_code == 204
    assert storage.head(key) is None
    assert "library.remove" in audit_actions(db)
    assert rep.get(item_url(item)).json()["status"] == "removed"
    assert rep.post(item_url(item, "/review"), json={"decision": "publish"}).json()["error"]["code"] == "removed"
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
