"""The Career Navigator's document: typed (code quality review CQ-4), checked for references and links, replaced as a
whole by admins, and audited with its name (student test ST-9)."""

from __future__ import annotations

import copy
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.links import HTTPS_RULE, LINK_RULE
from app.models import AuditEntry, ContentDoc, Module, User
from app.schemas.career import CareerDoc
from app.seed.loader import load_career, read
from tests.content.conftest import API

Clients = Callable[..., TestClient]
CAREER = f"{API}/career"


def doc(**changes: Any) -> dict[str, Any]:
    """The seeded document, with top-level changes."""
    d: dict[str, Any] = copy.deepcopy(read("career"))
    d.update(changes)
    return d


def normalised(d: dict[str, Any]) -> dict[str, Any]:
    """What the API stores and answers for a document: every field, defaults and nulls included."""
    return CareerDoc.model_validate(d).model_dump(mode="json", by_alias=True)


def contains(big: Any, small: Any) -> bool:
    """`small` is `big` without the fields the schema fills in (defaults, nulls): nothing written was lost."""
    if isinstance(small, dict):
        return isinstance(big, dict) and all(k in big and contains(big[k], v) for k, v in small.items())
    if isinstance(small, list):
        return isinstance(big, list) and len(big) == len(small) and all(map(contains, big, small))
    return bool(big == small)


def fields(r: Any) -> dict[str, str]:
    assert r.status_code == 422, r.text
    out: dict[str, str] = r.json()["error"]["fields"]
    return out


def test_career_is_public_and_null_until_loaded(client_for: Clients, db: Session) -> None:
    assert client_for().get(CAREER).json() == {"data": None, "updatedAt": None}
    load_career(db)
    db.commit()
    body = client_for().get(CAREER).json()
    assert body["data"] == normalised(read("career"))
    assert contains(body["data"], read("career"))  # the seed file fits the schema as it is
    assert body["updatedAt"] is not None
    assert load_career(db) == 0  # once: after that the document is the admins'


def test_only_admins_replace_the_document(
    client_for: Clients, student: User, moderator: User, admin: User, modules: dict[str, Module], db: Session
) -> None:
    new = doc(checkedOn="10 October 2026", initialCount=4)
    assert client_for().put(CAREER, json=new).status_code == 401
    assert client_for(student).put(CAREER, json=new).status_code == 403
    assert client_for(moderator).put(CAREER, json=new).status_code == 403

    r = client_for(admin).put(CAREER, json=new)
    assert r.status_code == 200, r.text
    assert r.json()["data"] == normalised(new)
    assert client_for().get(CAREER).json()["data"] == normalised(new)  # replaced as a whole
    entry = db.scalar(select(AuditEntry).where(AuditEntry.action == "career.update"))
    assert entry is not None
    assert (entry.actor_id, entry.target_type, entry.target_id) == (admin.id, "content_doc", "career")
    assert entry.data["title"] == "Career Navigator"
    assert entry.data["bytes"] > 0

    # featured and furtherStudy may be empty, but must be there: they read back as null
    empty = doc(featured=None, furtherStudy=None)
    assert client_for(admin).put(CAREER, json=empty).status_code == 200
    stored = db.get(ContentDoc, "career")
    assert stored is not None
    assert (stored.data["featured"], stored.data["furtherStudy"]) == (None, None)
    assert client_for().get(CAREER).json()["data"] == normalised(empty)
    missing = doc()
    del missing["featured"]
    assert set(fields(client_for(admin).put(CAREER, json=missing))) == {"featured"}


def test_what_doesnt_fit_the_schema_is_refused(client_for: Clients, admin: User, modules: dict[str, Module]) -> None:
    c = client_for(admin)
    assert c.put(CAREER, json=["not", "an", "object"]).status_code == 422
    assert "tracks" in fields(c.put(CAREER, json={"checkedOn": "today"}))
    bad_type = doc()
    bad_type["employers"][0]["offers"] = [{"type": "apprenticeship"}]
    assert set(fields(c.put(CAREER, json=bad_type))) == {"employers.0.offers.0.type"}
    long_text = doc()
    long_text["employers"][0]["why"] = "x" * 601
    assert set(fields(c.put(CAREER, json=long_text))) == {"employers.0.why"}
    bad_id = doc()
    bad_id["tracks"][0]["id"] = "Data Science!"
    assert "tracks.0.id" in fields(c.put(CAREER, json=bad_id))
    # a step whose kind isn't one of the five: the error names where it is
    bad_step = doc()
    skill = next(iter(bad_step["skills"]))
    bad_step["skills"][skill]["close"] = {"kind": "video", "text": "Watch this"}
    assert f"skills.{skill}.close" in fields(c.put(CAREER, json=bad_step))


def test_the_document_holds_together(client_for: Clients, admin: User, modules: dict[str, Module]) -> None:
    """Every id the document refers to is defined in it once, and every module it names exists."""
    c = client_for(admin)
    d = doc(defaultRoleId="astronaut")
    assert fields(c.put(CAREER, json=d)) == {"request": "There is no role “astronaut” in the document."}
    d = doc()
    d["employers"][0]["tracks"] = ["underwater-basket-weaving"]
    assert fields(c.put(CAREER, json=d)) == {
        "request": "There is no track “underwater-basket-weaving” in the document."
    }
    d = doc()
    d["roles"][0]["skills"] = [*d["roles"][0]["skills"], "telepathy"]
    assert fields(c.put(CAREER, json=d)) == {"request": "There is no skill “telepathy” in the document."}
    d = doc()
    d["employers"].append(copy.deepcopy(d["employers"][0]))
    assert fields(c.put(CAREER, json=d)) == {"request": f"Two employers have the same id: “{d['employers'][0]['id']}”."}
    d = doc(chosen={"no-such-module": "option"})
    assert fields(c.put(CAREER, json=d)) == {"request": "There is no module “no-such-module”."}
    d = doc()
    d["tracks"][0]["modules"] = ["no-such-module"]
    assert fields(c.put(CAREER, json=d)) == {"request": "There is no module “no-such-module”."}


def test_career_links_must_be_safe(client_for: Clients, admin: User, modules: dict[str, Module]) -> None:
    c = client_for(admin)
    for bad in ("javascript:alert(1)", "http://example.com/careers", "/careers", "https://user:pw@example.com/"):
        d = doc()
        d["employers"][0]["url"] = bad
        assert fields(c.put(CAREER, json=d)) == {"employers.0.url": HTTPS_RULE}  # other sites: https:// only
    d = doc()
    d["furtherStudy"]["action"]["to"] = "//evil.example/signin"
    assert fields(c.put(CAREER, json=d)) == {"furtherStudy.action.to": LINK_RULE}
    d = doc()
    d["checklist"][0]["link"] = {"kind": "forum", "to": "javascript:alert(1)", "label": "Ask"}
    assert fields(c.put(CAREER, json=d)) == {"checklist.0.link.forum.to": LINK_RULE}
    assert c.put(CAREER, json=doc()).status_code == 200  # the real document passes


def test_the_document_has_a_size_limit(client_for: Clients, admin: User, modules: dict[str, Module]) -> None:
    d = doc()
    d["skills"].update({f"skill-{i}": {"name": f"Skill {i}", "gapNote": "x" * 600} for i in range(900)})
    assert fields(client_for(admin).put(CAREER, json=d)) == {"request": "This document is too large."}


@pytest.mark.parametrize("key", ["tracks", "employers", "certs", "roles", "checklist"])
def test_the_seeded_document_uses_every_part(key: str) -> None:
    """The schema is made from what the page shows: the seed file fills every list the page reads."""
    assert read("career")[key]
