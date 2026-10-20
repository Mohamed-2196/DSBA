"""The daily upload budgets (SEC-14): the bytes each account, and the whole hub, may upload in 24 hours, set by
admins in Manage → Numbers (1 GB and 20 GB to start), counted from what uploads declare when they start."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import timedelta
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.time import utcnow
from app.models import AuditEntry, Upload, UploadLimits, UploadPurpose, UploadStatus, User
from tests.core.helpers import API

ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]
KB = 1024


def start(c: TestClient, size: int) -> Any:
    body = {"purpose": "bug_screenshot", "fileName": "screen.png", "contentType": "image/png", "sizeBytes": size}
    return c.post(f"{API}/uploads", json=body)


def budgets(db: Session, *, hub_mb: int | None = None, account_mb: int | None = None) -> None:
    lim = db.get_one(UploadLimits, 1)
    if hub_mb is not None:
        lim.hub_mb_per_day = hub_mb
    if account_mb is not None:
        lim.account_mb_per_day = account_mb
    db.commit()


def old_upload(db: Session, user: User, size: int, hours_ago: float) -> None:
    db.add(
        Upload(
            user_id=user.id,
            purpose=UploadPurpose.bug_screenshot,
            storage_key=f"incoming/{uuid.uuid4()}",
            file_name="old.png",
            content_type="image/png",
            size_bytes=size,
            status=UploadStatus.uploaded,
            created_at=utcnow() - timedelta(hours=hours_ago),
        )
    )
    db.commit()


def test_the_budgets_start_at_20_gb_and_1_gb(client_for: ClientFor, make_user: MakeUser) -> None:
    boss = client_for(make_user(name="Head Admin", roles=("student", "admin")))
    r = boss.get(f"{API}/admin/uploads").json()
    assert (r["hubMbPerDay"], r["accountMbPerDay"], r["bytesLastDay"]) == (20 * 1024, 1024, 0)


def test_an_account_over_its_budget_waits(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    sara, omar = make_user(), make_user(name="Omar Other")
    budgets(db, account_mb=1)
    old_upload(db, sara, 600 * KB, hours_ago=25)  # outside the 24 hours: it doesn't count
    old_upload(db, sara, 300 * KB, hours_ago=2)
    c = client_for(sara)
    assert start(c, 600 * KB).status_code == 201
    r = start(c, 200 * KB)  # 300 + 600 + 200 KB > 1 MB
    assert r.status_code == 429
    error = r.json()["error"]
    assert error["code"] == "rate_limited"
    assert 21 * 3600 < error["retryAfter"] <= 22 * 3600  # when the 2-hour-old upload leaves the window
    assert "uploaded a lot of files today" in error["message"]
    assert start(client_for(omar), 600 * KB).status_code == 201  # another account has its own budget


def test_the_hub_over_its_budget_waits(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    sara, omar = make_user(), make_user(name="Omar Other")
    budgets(db, hub_mb=1, account_mb=1024)
    old_upload(db, sara, 900 * KB, hours_ago=1)
    r = start(client_for(omar), 200 * KB)
    assert r.status_code == 429
    assert "The Hub has taken in a lot of files today" in r.json()["error"]["message"]
    assert start(client_for(omar), 100 * KB).status_code == 201  # what still fits


def test_only_admins_see_and_set_the_budgets(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    sara, rep = make_user(), make_user(name="Maryam Rep", roles=("student", "rep"))
    boss = make_user(name="Head Admin", roles=("student", "admin"))
    body = {"hubMbPerDay": 10 * 1024, "accountMbPerDay": 512}
    assert client_for().get(f"{API}/admin/uploads").status_code == 401
    for person in (sara, rep):
        assert client_for(person).get(f"{API}/admin/uploads").status_code == 403
        assert client_for(person).put(f"{API}/admin/uploads", json=body).status_code == 403

    r = client_for(boss).put(f"{API}/admin/uploads", json=body)
    assert r.status_code == 200, r.text
    assert (r.json()["hubMbPerDay"], r.json()["accountMbPerDay"]) == (10 * 1024, 512)
    assert r.json()["updatedAt"] is not None
    entry = db.scalars(select(AuditEntry).where(AuditEntry.action == "uploads.limits")).one()
    assert entry.data["before"] == {"hubMbPerDay": 20 * 1024, "accountMbPerDay": 1024}
    assert entry.data["after"] == {"hubMbPerDay": 10 * 1024, "accountMbPerDay": 512}
    for bad in ({"hubMbPerDay": 100, "accountMbPerDay": 512}, {"hubMbPerDay": 2048, "accountMbPerDay": 1}, {}):
        r = client_for(boss).put(f"{API}/admin/uploads", json=bad)
        assert (r.status_code, r.json()["error"]["code"]) == (422, "invalid_input")


def test_the_numbers_count_the_last_24_hours(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    sara = make_user()
    old_upload(db, sara, 5 * KB, hours_ago=30)
    old_upload(db, sara, 7 * KB, hours_ago=3)
    boss = client_for(make_user(name="Head Admin", roles=("student", "admin")))
    assert boss.get(f"{API}/admin/uploads").json()["bytesLastDay"] == 7 * KB
