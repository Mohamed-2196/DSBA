"""Career Navigator's document: typed, checked for references and links, saved as a whole by holders of career.edit
from the version they loaded, audited with what changed, with hidden parts kept off the page and logos uploaded."""

from __future__ import annotations

import copy
import json
import uuid
from collections.abc import Callable, Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, delete, select, text
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.core.links import HTTPS_RULE, LINK_RULE
from app.models import AuditEntry, ContentDoc, Module, UploadStatus, User
from app.models import Upload as UploadRow
from app.schemas.career import CareerDoc
from app.seed.loader import load_career, read
from app.services import career
from tests.content.conftest import API, PNG, Upload

Clients = Callable[..., TestClient]
CAREER = f"{API}/career"
EDIT = f"{API}/career/edit"


def doc(**changes: Any) -> dict[str, Any]:
    """The seeded document, with top-level changes."""
    d: dict[str, Any] = copy.deepcopy(read("career"))
    d.update(changes)
    return d


def save(d: dict[str, Any], version: int) -> dict[str, Any]:
    """A PUT /career body."""
    return {"version": version, "data": d}


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
    assert load_career(db) == 0  # once: after that the document is its editors'


def test_editors_save_the_document_and_the_seed_never_loads_over_it(
    client_for: Clients,
    student: User,
    moderator: User,
    admin: User,
    make_user: Callable[..., User],
    modules: dict[str, Module],
    db: Session,
) -> None:
    load_career(db)
    db.commit()
    new = doc(checkedOn="10 October 2026", initialCount=4)
    for who in (None, student, moderator):
        assert client_for(who).get(EDIT).status_code == (401 if who is None else 403)
        assert client_for(who).put(CAREER, json=save(new, 1)).status_code == (401 if who is None else 403)

    manager = make_user(name="Noor Content", roles=("student", "content-manager"))
    c = client_for(manager)
    loaded = c.get(EDIT).json()
    assert (loaded["version"], loaded["data"]) == (1, normalised(read("career")))
    r = c.put(CAREER, json=save(new, 1))
    assert r.status_code == 200, r.text
    assert (r.json()["version"], r.json()["updatedBy"]["displayName"]) == (2, "Noor Content")
    assert client_for().get(CAREER).json()["data"] == normalised(new)
    assert load_career(db) == 0  # the starting content never overwrites the editors' document
    assert client_for(admin).put(CAREER, json=save(new, 2)).json()["version"] == 2  # nothing changed: no new version

    entry = db.scalar(select(AuditEntry).where(AuditEntry.action == "career.update"))
    assert entry is not None
    assert (entry.actor_id, entry.target_type, entry.target_id) == (manager.id, "content_doc", "career")
    assert entry.data["title"] == "Career Navigator"
    assert entry.data["parts"] == ["checkedOn", "initialCount"]
    assert entry.data["before"] == {
        "checkedOn": read("career")["checkedOn"],
        "initialCount": read("career")["initialCount"],
    }
    assert entry.data["after"] == {"checkedOn": "10 October 2026", "initialCount": 4}

    # featured and furtherStudy may be empty, but must be there: they read back as null
    empty = doc(featured=None, furtherStudy=None)
    assert c.put(CAREER, json=save(empty, 2)).status_code == 200
    stored = db.get(ContentDoc, "career")
    assert stored is not None
    assert (stored.data["featured"], stored.data["furtherStudy"]) == (None, None)
    missing = doc()
    del missing["featured"]
    assert set(fields(c.put(CAREER, json=save(missing, 3)))) == {"data.featured"}


def test_a_save_from_an_older_version_is_refused(
    client_for: Clients, admin: User, make_user: Callable[..., User], modules: dict[str, Module], db: Session
) -> None:
    load_career(db)
    db.commit()
    other = client_for(make_user(name="Noor Content", roles=("student", "content-manager")))
    assert other.put(CAREER, json=save(doc(checkedOn="9 October 2026"), 1)).status_code == 200
    r = client_for(admin).put(CAREER, json=save(doc(checkedOn="10 October 2026"), 1))
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "career_changed"
    assert client_for().get(CAREER).json()["data"]["checkedOn"] == "9 October 2026"  # nothing was overwritten


@pytest.fixture
def elsewhere(engine: Engine) -> Iterator[sessionmaker[Session]]:
    """Sessions on connections of their own, for another editor's save; the document they commit goes afterwards."""
    separate = create_engine(engine.url.render_as_string(hide_password=False), poolclass=NullPool)
    yield sessionmaker(bind=separate, expire_on_commit=False)
    with separate.begin() as c:
        c.execute(delete(ContentDoc).where(ContentDoc.key == "career"))
    separate.dispose()


def test_of_two_first_saves_at_once_the_second_is_told_someone_saved_first(
    client_for: Clients,
    admin: User,
    modules: dict[str, Module],
    db: Session,
    elsewhere: sessionmaker[Session],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Both editors open Career Navigator before anyone saved it. The other's first save commits while this one is
    under way: this one gets the editor's 409, not a clash on the row the other made, and overwrites nothing."""
    theirs = doc(checkedOn="9 October 2026")
    real = career._row

    def read_before_theirs(session: Session, *, lock: bool = False) -> ContentDoc | None:
        monkeypatch.setattr(career, "_row", real)  # only this first read comes before their save
        found = real(session, lock=lock)
        with elsewhere() as s:
            s.execute(
                text("INSERT INTO content_docs (key, data, version) VALUES ('career', CAST(:data AS jsonb), 1)"),
                {"data": json.dumps(normalised(theirs))},
            )
            s.commit()
        return found

    monkeypatch.setattr(career, "_row", read_before_theirs)
    r = client_for(admin).put(CAREER, json=save(doc(checkedOn="10 October 2026"), 0))

    assert r.status_code == 409, r.text
    assert r.json()["error"]["code"] == "career_changed"
    db.rollback()  # the request's work ends here, and with it its hold on the row
    assert client_for().get(CAREER).json()["data"]["checkedOn"] == "9 October 2026"  # theirs, not overwritten


def test_lists_are_audited_by_item(client_for: Clients, admin: User, modules: dict[str, Module], db: Session) -> None:
    load_career(db)
    db.commit()
    d = doc()
    first, second = d["employers"][0], d["employers"][1]
    d["employers"][0], d["employers"][1] = second, {**first, "why": "A new reason."}
    del d["employers"][2]
    assert client_for(admin).put(CAREER, json=save(d, 1)).status_code == 200
    entry = db.scalar(select(AuditEntry).where(AuditEntry.action == "career.update"))
    assert entry is not None
    assert entry.data["parts"] == ["employers"]
    before, after = entry.data["before"]["employers"], entry.data["after"]["employers"]
    assert [i["id"] for i in before["items"]] == [first["id"], read("career")["employers"][2]["id"]]
    assert [i["id"] for i in after["items"]] == [first["id"]]
    assert after["items"][0]["why"] == "A new reason."
    assert after["order"][:2] == [second["id"], first["id"]]


def test_hidden_parts_stay_in_the_editor_and_off_the_page(
    client_for: Clients, admin: User, modules: dict[str, Module], db: Session
) -> None:
    load_career(db)
    db.commit()
    d = doc()
    track, employer, cert = d["tracks"][0], d["employers"][0], d["certs"][0]
    role = next(r for r in d["roles"] if r["id"] != d["defaultRoleId"])
    for item in (track, employer, cert, role, d["checklist"][0]):
        item["hidden"] = True
    d["checklist"][1]["link"] = {"kind": "cert", "cert": cert["id"], "label": "See it"}
    assert client_for(admin).put(CAREER, json=save(d, 1)).status_code == 200

    page = client_for().get(CAREER).json()["data"]
    assert track["id"] not in {t["id"] for t in page["tracks"]}
    assert employer["id"] not in {e["id"] for e in page["employers"]}
    assert cert["id"] not in {c["id"] for c in page["certs"]}
    assert role["id"] not in {r["id"] for r in page["roles"]}
    assert d["checklist"][0]["id"] not in {i["id"] for i in page["checklist"]}
    # and nothing on the page points at them
    assert all(track["id"] not in e["tracks"] for e in page["employers"])
    assert all(role["id"] not in c["roles"] for c in page["certs"])
    assert page["checklist"][0]["link"] is None
    edit = client_for(admin).get(EDIT).json()["data"]
    assert edit["employers"][0]["hidden"] is True  # the editor keeps them

    d["roles"] = [{**r, "hidden": r["id"] == d["defaultRoleId"]} for r in d["roles"]]
    assert fields(client_for(admin).put(CAREER, json=save(d, 2))) == {
        "data": "The role the page opens on can't be hidden."
    }


def test_logos_are_uploaded_attached_and_let_go(
    client_for: Clients,
    student: User,
    admin: User,
    modules: dict[str, Module],
    upload_file: Upload,
    db: Session,
) -> None:
    load_career(db)
    db.commit()
    c = client_for(admin)
    # only editors upload logos, and only still pictures
    r = client_for(student).post(
        f"{API}/uploads",
        json={"purpose": "career_logo", "fileName": "a.png", "contentType": "image/png", "sizeBytes": 9},
    )
    assert r.status_code == 403
    r = c.post(
        f"{API}/uploads",
        json={"purpose": "career_logo", "fileName": "a.gif", "contentType": "image/gif", "sizeBytes": 9},
    )
    assert r.json()["error"]["code"] == "unsupported_type"
    logo = upload_file(c, purpose="career_logo", name="nbb.png", content_type="image/png", body=PNG)
    assert logo["mediaUrl"] == f"{API}/career/logos/{logo['uploadId']}"

    # before the document uses it: the editors' preview only
    assert c.get(logo["mediaUrl"], follow_redirects=False).status_code == 302
    assert client_for().get(logo["mediaUrl"], follow_redirects=False).status_code == 404
    assert client_for(student).get(logo["mediaUrl"], follow_redirects=False).status_code == 404

    d = doc()
    d["employers"][0]["logo"] = {"uploadId": logo["uploadId"], "permission": "NBB's marketing team, 3 October 2026"}
    assert c.put(CAREER, json=save(d, 1)).status_code == 200
    up = db.get(UploadRow, uuid.UUID(logo["uploadId"]))
    assert up is not None
    db.refresh(up)
    assert up.status == UploadStatus.attached
    assert up.storage_key.startswith("career/")
    assert client_for().get(logo["mediaUrl"], follow_redirects=False).status_code == 302
    assert client_for().get(CAREER).json()["data"]["employers"][0]["logo"]["uploadId"] == logo["uploadId"]

    # the same file can't be two organisations' logo, and a logo must be a finished upload
    d["employers"][1]["logo"] = d["employers"][0]["logo"]
    assert fields(c.put(CAREER, json=save(d, 2))) == {"data": "Two employers or certificates use the same logo file."}
    d["employers"][1]["logo"] = {"uploadId": str(uuid.uuid4()), "permission": "Yes"}
    assert fields(c.put(CAREER, json=save(d, 2))) == {
        "logo": "A logo isn't uploaded yet, or was removed. Upload it again."
    }

    # taken off: it goes back to uploaded (the sweep deletes it) and leaves the public page
    assert c.put(CAREER, json=save(doc(), 2)).status_code == 200
    db.expire_all()
    fresh_up = db.get(UploadRow, uuid.UUID(logo["uploadId"]))
    assert fresh_up is not None
    assert fresh_up.status == UploadStatus.uploaded
    assert client_for().get(logo["mediaUrl"], follow_redirects=False).status_code == 404


def test_what_doesnt_fit_the_schema_is_refused(client_for: Clients, admin: User, modules: dict[str, Module]) -> None:
    c = client_for(admin)
    assert c.put(CAREER, json=["not", "an", "object"]).status_code == 422
    assert "data.tracks" in fields(c.put(CAREER, json=save({"checkedOn": "today"}, 0)))
    bad_type = doc()
    bad_type["employers"][0]["offers"] = [{"type": "apprenticeship"}]
    assert set(fields(c.put(CAREER, json=save(bad_type, 0)))) == {"data.employers.0.offers.0.type"}
    long_text = doc()
    long_text["employers"][0]["why"] = "x" * 601
    assert set(fields(c.put(CAREER, json=save(long_text, 0)))) == {"data.employers.0.why"}
    bad_id = doc()
    bad_id["tracks"][0]["id"] = "Data Science!"
    assert "data.tracks.0.id" in fields(c.put(CAREER, json=save(bad_id, 0)))
    # a step whose kind isn't one of the five: the error names where it is
    bad_step = doc()
    skill = next(iter(bad_step["skills"]))
    bad_step["skills"][skill]["close"] = {"kind": "video", "text": "Watch this"}
    assert f"data.skills.{skill}.close" in fields(c.put(CAREER, json=save(bad_step, 0)))


def test_the_document_holds_together(client_for: Clients, admin: User, modules: dict[str, Module]) -> None:
    """Every id the document refers to is defined in it once, and every module it names exists."""
    c = client_for(admin)
    d = doc(defaultRoleId="astronaut")
    assert fields(c.put(CAREER, json=save(d, 0))) == {"data": "There is no role “astronaut” in the document."}
    d = doc()
    d["employers"][0]["tracks"] = ["underwater-basket-weaving"]
    assert fields(c.put(CAREER, json=save(d, 0))) == {
        "data": "There is no track “underwater-basket-weaving” in the document."
    }
    d = doc()
    d["roles"][0]["skills"] = [*d["roles"][0]["skills"], "telepathy"]
    assert fields(c.put(CAREER, json=save(d, 0))) == {"data": "There is no skill “telepathy” in the document."}
    d = doc()
    d["employers"].append(copy.deepcopy(d["employers"][0]))
    assert fields(c.put(CAREER, json=save(d, 0))) == {
        "data": f"Two employers have the same id: “{d['employers'][0]['id']}”."
    }
    d = doc(chosen={"no-such-module": "option"})
    assert fields(c.put(CAREER, json=save(d, 0))) == {
        "data": "There is no module “no-such-module”. Choose one from the list."
    }
    d = doc()
    d["tracks"][0]["modules"] = ["no-such-module"]
    assert fields(c.put(CAREER, json=save(d, 0))) == {
        "data": "There is no module “no-such-module”. Choose one from the list."
    }


def test_career_links_must_be_safe(client_for: Clients, admin: User, modules: dict[str, Module]) -> None:
    c = client_for(admin)
    for bad in ("javascript:alert(1)", "http://example.com/careers", "/careers", "https://user:pw@example.com/"):
        d = doc()
        d["employers"][0]["url"] = bad
        assert fields(c.put(CAREER, json=save(d, 0))) == {
            "data.employers.0.url": HTTPS_RULE
        }  # other sites: https:// only
    d = doc()
    d["furtherStudy"]["action"]["to"] = "//evil.example/signin"
    assert fields(c.put(CAREER, json=save(d, 0))) == {"data.furtherStudy.action.to": LINK_RULE}
    d = doc()
    d["checklist"][0]["link"] = {"kind": "forum", "to": "javascript:alert(1)", "label": "Ask"}
    assert fields(c.put(CAREER, json=save(d, 0))) == {"data.checklist.0.link.forum.to": LINK_RULE}
    assert c.put(CAREER, json=save(doc(), 0)).status_code == 200  # the real document passes


def test_the_document_has_a_size_limit(client_for: Clients, admin: User, modules: dict[str, Module]) -> None:
    d = doc()
    d["skills"].update({f"skill-{i}": {"name": f"Skill {i}", "gapNote": "x" * 600} for i in range(900)})
    assert fields(client_for(admin).put(CAREER, json=save(d, 0))) == {
        "data": "Career Navigator is too large to save. Remove some employers or roles."
    }


@pytest.mark.parametrize("key", ["tracks", "employers", "certs", "roles", "checklist"])
def test_the_seeded_document_uses_every_part(key: str) -> None:
    """The schema is made from what the page shows: the seed file fills every list the page reads."""
    assert read("career")[key]
