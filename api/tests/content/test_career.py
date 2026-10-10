from __future__ import annotations

from collections.abc import Callable

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AuditEntry, User
from app.seed.loader import load_career, read
from app.services.newsletter import LINK_RULE
from tests.content.conftest import API

Clients = Callable[..., TestClient]
CAREER = f"{API}/career"


def test_career_is_public_and_empty_until_loaded(client_for: Clients, db: Session) -> None:
    assert client_for().get(CAREER).json() == {"data": {}, "updatedAt": None}
    load_career(db)
    db.commit()
    body = client_for().get(CAREER).json()
    assert body["data"] == read("career")
    assert body["updatedAt"] is not None


def test_only_admins_replace_the_document(
    client_for: Clients, student: User, moderator: User, admin: User, db: Session
) -> None:
    doc = {"checkedOn": "10 October 2026", "employers": [{"id": "nbb", "name": "National Bank of Bahrain"}]}
    assert client_for().put(CAREER, json=doc).status_code == 401
    assert client_for(student).put(CAREER, json=doc).status_code == 403
    assert client_for(moderator).put(CAREER, json=doc).status_code == 403

    r = client_for(admin).put(CAREER, json=doc)
    assert r.status_code == 200, r.text
    assert r.json()["data"] == doc
    assert client_for().get(CAREER).json()["data"] == doc  # replaced as a whole
    entry = db.scalar(select(AuditEntry).where(AuditEntry.action == "career.update"))
    assert entry is not None
    assert entry.actor_id == admin.id

    assert client_for(admin).put(CAREER, json=["not", "an", "object"]).status_code == 422
    assert client_for(admin).put(CAREER, json={"big": "x" * 1_000_001}).status_code == 422


def test_career_links_must_be_safe(client_for: Clients, admin: User, db: Session) -> None:
    c = client_for(admin)
    bad = {"employers": [{"id": "x", "name": "X", "url": "javascript:alert(1)"}]}
    r = c.put(CAREER, json=bad)
    assert r.status_code == 422
    assert r.json()["error"]["fields"] == {"employers.0.url": LINK_RULE}
    assert c.put(CAREER, json={"note": "See [this](//evil.example)"}).status_code == 422
    assert c.put(CAREER, json=read("career")).status_code == 200  # the real document passes
