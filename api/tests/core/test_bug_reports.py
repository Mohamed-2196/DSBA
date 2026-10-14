"""Bug reports: anyone reports (guests and suspended accounts too), with a screenshot when signed in; every active
admin hears of it in the hub, never by email; admins triage them, audited; rate limits per person and per network."""

from __future__ import annotations

import uuid
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app import cli
from app.models import AuditEntry, BugReport, EmailOutbox, Notification, Upload, UploadStatus, User, UserStatus
from tests.core.conftest import BrowserAt
from tests.core.helpers import API, PNG, image, upload

ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]
ADMIN = ("student", "admin")
REPORTS = f"{API}/bug-reports"
QUEUE = f"{API}/admin/bug-reports"


def report(**extra: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "whatHappened": "  The upload button does nothing.  ",
        "expected": "The file picker opens.",
        "pageUrl": "/library?module=economics",
        "appVersion": "2.0.0-test",
        "browser": "Safari 19 on iPhone",
    }
    body.update(extra)
    return body


def screenshot(c: TestClient, storage: Any) -> str:
    return upload(c, storage, purpose="bug_screenshot", name="screen.png", content_type="image/png", body=PNG)


def _status(c: TestClient, path: str) -> int:
    return int(c.get(path, follow_redirects=False).status_code)


def _fields(r: Any) -> dict[str, str]:
    assert r.status_code == 422, r.text
    out: dict[str, str] = r.json()["error"]["fields"]
    return out


def test_a_guest_reports_and_every_active_admin_hears_of_it_in_the_hub(
    client_for: ClientFor, make_user: MakeUser, db: Session
) -> None:
    boss, deputy = make_user(name="Head Admin", roles=ADMIN), make_user(name="Second Admin", roles=ADMIN)
    away = make_user(name="Away Admin", roles=ADMIN)
    away.status = UserStatus.suspended
    db.commit()
    student, rep = make_user(name="Sara Student"), make_user(name="Maryam Rep", roles=("student", "rep"))

    r = client_for().post(REPORTS, json=report())
    assert r.status_code == 201, r.text
    saved = db.get(BugReport, uuid.UUID(r.json()["id"]))
    assert saved is not None
    assert (saved.user_id, saved.what_happened, saved.page_url, saved.status.value) == (
        None,
        "The upload button does nothing.",
        "/library?module=economics",
        "open",
    )
    told = db.scalars(select(Notification).where(Notification.kind == "bug_report")).all()
    assert {n.user_id for n in told} == {boss.id, deputy.id}
    assert {(n.title, n.body, n.url) for n in told} == {
        ("New bug report", "The upload button does nothing.", "/manage/bugs")
    }
    assert not {n.user_id for n in told} & {away.id, student.id, rep.id}
    assert db.scalar(select(func.count()).select_from(EmailOutbox)) == 0  # never by email


def test_a_long_report_is_cut_short(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    make_user(name="Head Admin", roles=ADMIN)
    assert client_for().post(REPORTS, json=report(whatHappened="x" * 300)).status_code == 201
    body = db.scalar(select(Notification.body).where(Notification.kind == "bug_report"))
    assert body is not None
    assert len(body) == 120
    assert body.endswith("…")


def test_an_admin_is_not_told_of_their_own_report(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    boss, deputy = make_user(name="Head Admin", roles=ADMIN), make_user(name="Second Admin", roles=ADMIN)
    assert client_for(boss).post(REPORTS, json=report()).status_code == 201
    told = db.scalars(select(Notification.user_id).where(Notification.kind == "bug_report")).all()
    assert told == [deputy.id]


def test_a_suspended_account_may_still_report(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    user = make_user()
    user.status = UserStatus.suspended
    db.commit()
    r = client_for(user).post(REPORTS, json=report())
    assert r.status_code == 201, r.text
    saved = db.get(BugReport, uuid.UUID(r.json()["id"]))
    assert saved is not None
    assert saved.user_id == user.id


def test_the_page_must_be_a_page_of_the_hub(client_for: ClientFor, settings: Any) -> None:
    guest = client_for()
    origin = settings.web_origins[0].rstrip("/")
    r = guest.post(REPORTS, json=report(pageUrl=f"{origin}/forum/a-thread?sort=new#reply-2"))
    assert r.status_code == 201, r.text
    for bad in ("https://evil.example/forum", "//evil.example/x", "javascript:alert(1)", "library", "/\\evil"):
        assert set(_fields(guest.post(REPORTS, json=report(pageUrl=bad)))) == {"pageUrl"}, bad


def test_the_fields_are_checked(client_for: ClientFor) -> None:
    guest = client_for()
    assert set(_fields(guest.post(REPORTS, json=report(whatHappened="   ")))) == {"whatHappened"}
    assert set(_fields(guest.post(REPORTS, json=report(whatHappened="x" * 2001)))) == {"whatHappened"}
    assert set(_fields(guest.post(REPORTS, json=report(appVersion="")))) == {"appVersion"}
    assert set(_fields(guest.post(REPORTS, json=report(browser="b" * 301)))) == {"browser"}
    minimal = {"whatHappened": "It broke.", "pageUrl": "/", "appVersion": "2.0.0"}
    assert guest.post(REPORTS, json=minimal).status_code == 201


def test_a_report_needs_the_csrf_token(app: Any) -> None:
    with TestClient(app) as bare:
        r = bare.post(REPORTS, json=report())
    assert (r.status_code, r.json()["error"]["code"]) == (403, "csrf_failed")


def test_a_screenshot_is_attached_and_shown_only_to_its_uploader_and_admins(
    client_for: ClientFor, make_user: MakeUser, storage: Any, db: Session
) -> None:
    author, boss = make_user(name="Sara Student"), make_user(name="Head Admin", roles=ADMIN)
    me = client_for(author)
    shot = screenshot(me, storage)
    up = db.get(Upload, uuid.UUID(shot))
    assert up is not None
    assert up.storage_key.startswith("bugs/")
    r = me.post(REPORTS, json=report(screenshotUploadId=shot))
    assert r.status_code == 201, r.text
    db.refresh(up)
    assert (up.status, up.bug_report_id) == (UploadStatus.attached, uuid.UUID(r.json()["id"]))

    media = f"{API}/media/{shot}"
    assert _status(me, media) == 302
    assert _status(client_for(boss), media) == 302
    for viewer in (client_for(), client_for(make_user(name="Omar Classmate")), client_for(make_user(roles=("rep",)))):
        assert _status(viewer, media) == 404

    listed = client_for(boss).get(QUEUE).json()["items"][0]
    assert listed["screenshotUrl"] == f"/api/v1/media/{shot}"
    assert listed["reporter"]["displayName"] == "Sara Student"
    assert set(listed) >= {"whatHappened", "expected", "pageUrl", "appVersion", "browser", "resolvedAt", "resolvedBy"}


def test_only_your_own_unused_screenshot_may_be_attached(
    client_for: ClientFor, make_user: MakeUser, storage: Any
) -> None:
    author, other = client_for(make_user(name="Sara Student")), client_for(make_user(name="Omar Classmate"))
    used = screenshot(author, storage)
    assert author.post(REPORTS, json=report(screenshotUploadId=used)).status_code == 201
    theirs = screenshot(other, storage)
    forum_picture = image(author, storage).rsplit("/", 1)[-1]
    for bad in (used, theirs, forum_picture, str(uuid.uuid4())):
        assert set(_fields(author.post(REPORTS, json=report(screenshotUploadId=bad)))) == {"screenshotUploadId"}
    assert set(_fields(client_for().post(REPORTS, json=report(screenshotUploadId=theirs)))) == {"screenshotUploadId"}


def test_screenshots_take_still_images_only(client_for: ClientFor, make_user: MakeUser) -> None:
    c = client_for(make_user())
    gif = {"purpose": "bug_screenshot", "fileName": "a.gif", "contentType": "image/gif", "sizeBytes": 10}
    r = c.post(f"{API}/uploads", json=gif)
    assert (r.status_code, r.json()["error"]["code"]) == (422, "unsupported_type")
    assert client_for().post(f"{API}/uploads", json={**gif, "fileName": "a.png"}).status_code == 401


def test_ten_reports_an_hour_for_a_signed_in_person(client_for: ClientFor, make_user: MakeUser) -> None:
    c = client_for(make_user())
    for _ in range(10):
        assert c.post(REPORTS, json=report()).status_code == 201
    r = c.post(REPORTS, json=report())
    assert r.status_code == 429
    assert r.json()["error"]["message"].startswith("You've sent a lot of reports. Try again in ")
    assert client_for(make_user(name="Omar Classmate")).post(REPORTS, json=report()).status_code == 201


def test_five_reports_an_hour_for_guests_on_one_network(browser_at: BrowserAt) -> None:
    for _ in range(5):
        assert browser_at("203.0.113.5").post(REPORTS, json=report()).status_code == 201
    assert browser_at("203.0.113.5").post(REPORTS, json=report()).status_code == 429
    assert browser_at("203.0.113.6").post(REPORTS, json=report()).status_code == 201


def test_admins_list_reports_by_status_newest_first(client_for: ClientFor, make_user: MakeUser) -> None:
    boss = client_for(make_user(name="Head Admin", roles=ADMIN))
    ids = [client_for().post(REPORTS, json=report(whatHappened=f"Bug {i}")).json()["id"] for i in range(3)]
    page = boss.get(QUEUE).json()
    assert [r["id"] for r in page["items"]] == ids[::-1]
    assert (page["total"], page["openCount"]) == (3, 3)
    assert boss.patch(f"{QUEUE}/{ids[0]}", json={"status": "fixed"}).status_code == 200
    assert [r["id"] for r in boss.get(QUEUE, params={"status": "fixed"}).json()["items"]] == [ids[0]]
    page = boss.get(QUEUE, params={"limit": 1}).json()
    assert ([r["id"] for r in page["items"]], page["total"], page["openCount"]) == ([ids[2]], 2, 2)
    assert boss.get(QUEUE, params={"status": "closed"}).status_code == 422


def test_only_admins_triage(client_for: ClientFor, make_user: MakeUser) -> None:
    rid = client_for().post(REPORTS, json=report()).json()["id"]
    assert client_for().get(QUEUE).status_code == 401
    for roles in (("student",), ("student", "rep")):
        c = client_for(make_user(roles=roles))
        assert c.get(QUEUE).status_code == 403
        assert c.patch(f"{QUEUE}/{rid}", json={"status": "fixed"}).status_code == 403


def test_marking_a_report_records_who_and_when_and_is_audited(
    client_for: ClientFor, make_user: MakeUser, db: Session
) -> None:
    admin = make_user(name="Head Admin", roles=ADMIN)
    boss = client_for(admin)
    rid = client_for().post(REPORTS, json=report()).json()["id"]
    r = boss.patch(f"{QUEUE}/{rid}", json={"status": "wont_fix"})
    assert r.status_code == 200, r.text
    out = r.json()
    assert (out["status"], out["resolvedBy"]["displayName"]) == ("wont_fix", "Head Admin")
    assert out["resolvedAt"] is not None
    entry = db.scalar(select(AuditEntry).where(AuditEntry.action == "bug_report.status"))
    assert entry is not None
    assert (entry.actor_id, entry.target_id, entry.data["status"]) == (admin.id, rid, "wont_fix")

    out = boss.patch(f"{QUEUE}/{rid}", json={"status": "open"}).json()
    assert (out["status"], out["resolvedAt"], out["resolvedBy"]) == ("open", None, None)
    assert boss.patch(f"{QUEUE}/{rid}", json={"status": "open"}).status_code == 200  # unchanged: not audited again
    assert db.scalar(select(func.count()).where(AuditEntry.action == "bug_report.status")) == 2

    assert boss.patch(f"{QUEUE}/{uuid.uuid4()}", json={"status": "fixed"}).status_code == 404
    assert set(_fields(boss.patch(f"{QUEUE}/{rid}", json={"status": "done"}))) == {"status"}


def test_admin_stats_count_open_reports_for_admins_only(client_for: ClientFor, make_user: MakeUser) -> None:
    rid = client_for().post(REPORTS, json=report()).json()["id"]
    client_for().post(REPORTS, json=report())
    boss = client_for(make_user(name="Head Admin", roles=ADMIN))
    assert boss.get(f"{API}/admin/stats").json()["openBugReports"] == 2
    boss.patch(f"{QUEUE}/{rid}", json={"status": "fixed"})
    assert boss.get(f"{API}/admin/stats").json()["openBugReports"] == 1
    rep = client_for(make_user(name="Maryam Rep", roles=("student", "rep")))
    assert rep.get(f"{API}/admin/stats").json()["openBugReports"] is None


def test_a_deleted_account_leaves_its_reports_and_their_screenshots(
    client_for: ClientFor, make_user: MakeUser, storage: Any, db: Session
) -> None:
    user = make_user()
    c = client_for(user)
    shot = screenshot(c, storage)
    rid = uuid.UUID(c.post(REPORTS, json=report(screenshotUploadId=shot)).json()["id"])
    assert c.delete(f"{API}/me").status_code in (200, 204)
    db.expire_all()
    saved, up = db.get(BugReport, rid), db.get(Upload, uuid.UUID(shot))
    assert saved is not None
    assert up is not None
    assert (saved.user_id, up.user_id, up.status) == (None, None, UploadStatus.attached)
    assert storage.head(up.storage_key) is not None
    boss = client_for(make_user(name="Head Admin", roles=ADMIN))
    listed = boss.get(QUEUE).json()["items"][0]
    assert (listed["reporter"], listed["screenshotUrl"]) == (None, f"/api/v1/media/{shot}")
    assert _status(boss, f"{API}/media/{shot}") == 302


def test_the_sweep_keeps_screenshots_and_forgets_old_addresses(
    browser_at: BrowserAt,
    client_for: ClientFor,
    make_user: MakeUser,
    storage: Any,
    db: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    @contextmanager
    def same_session() -> Iterator[Session]:
        yield db

    monkeypatch.setattr(cli, "get_sessionmaker", lambda: same_session)
    c = client_for(make_user())
    shot = screenshot(c, storage)
    c.post(REPORTS, json=report(screenshotUploadId=shot))
    old = uuid.UUID(browser_at("203.0.113.9").post(REPORTS, json=report()).json()["id"])
    new = uuid.UUID(browser_at("203.0.113.10").post(REPORTS, json=report()).json()["id"])
    long_ago = BugReport.created_at - timedelta(days=2)
    db.execute(update(Upload).values(created_at=Upload.created_at - timedelta(days=2)))
    db.execute(update(BugReport).where(BugReport.id == old).values(created_at=long_ago))
    db.commit()
    assert cli.sweep().bug_report_ips == 1
    db.expire_all()
    assert db.get(Upload, uuid.UUID(shot)) is not None
    assert [str(db.get(BugReport, i).ip) for i in (old, new)] == ["None", "203.0.113.10"]  # type: ignore[union-attr]


def test_a_checked_screenshot_comes_back_with_its_media_url(
    client_for: ClientFor, make_user: MakeUser, storage: Any
) -> None:
    c = client_for(make_user())
    body = {"purpose": "bug_screenshot", "fileName": "s.png", "contentType": "image/png", "sizeBytes": len(PNG)}
    r = c.post(f"{API}/uploads", json=body)
    assert r.status_code == 201, r.text
    storage.client.put_object(Bucket=storage.bucket, Key=r.json()["fields"]["key"], Body=PNG, ContentType="image/png")
    done = c.post(f"{API}/uploads/{r.json()['uploadId']}/complete").json()
    assert done["mediaUrl"] == f"/api/v1/media/{r.json()['uploadId']}"
