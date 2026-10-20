"""Site settings and the guides: public to read, their starting content until the first save, saved as a whole from
the version the editor loaded (admins for the site, holders of guides.edit for the guides), audited with what
changed, and checked: https:// links, pages of the Hub, real modules, ids used once."""

from __future__ import annotations

import copy
import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core.access import Box
from app.core.errors import ApiError
from app.models import AuditEntry, ContentDoc, Module, User
from app.schemas.guides import GuidesDoc
from app.services import documents, site
from tests.content.conftest import API

Clients = Callable[..., TestClient]
SEED = Path(__file__).resolve().parents[2] / "app" / "seed" / "data"
SITE, SITE_EDIT = f"{API}/site", f"{API}/site/edit"
GUIDES, GUIDES_EDIT = f"{API}/guides", f"{API}/guides/edit"


def seed(name: str) -> dict[str, Any]:
    data: dict[str, Any] = json.loads((SEED / f"{name}.json").read_text(encoding="utf-8"))
    return copy.deepcopy(data)


def fields(r: Any) -> dict[str, str]:
    assert r.status_code == 422, r.text
    out: dict[str, str] = r.json()["error"]["fields"]
    return out


# ── site settings ────────────────────────────────────────────────────────────────────────────


def test_the_site_settings_are_public_and_start_from_the_seed(client_for: Clients, admin: User) -> None:
    assert client_for().get(SITE).json() == seed("site")
    loaded = client_for(admin).get(SITE_EDIT).json()
    assert (loaded["version"], loaded["updatedAt"], loaded["updatedBy"]) == (0, None, None)
    assert loaded["data"] == seed("site")


def test_only_admins_edit_the_site(
    client_for: Clients, student: User, moderator: User, make_user: Callable[..., User], modules: dict[str, Module]
) -> None:
    manager = make_user(name="Noor Content", roles=("student", "content-manager"))
    for who in (None, student, moderator, manager):
        assert client_for(who).get(SITE_EDIT).status_code == (401 if who is None else 403)
        r = client_for(who).put(SITE, json={"version": 0, "data": seed("site")})
        assert r.status_code == (401 if who is None else 403)


def test_admins_save_the_site_and_it_is_audited(
    client_for: Clients, admin: User, modules: dict[str, Module], db: Session
) -> None:
    c = client_for(admin)
    data = seed("site")
    data["links"]["uolPortal"]["url"] = "https://my.london.ac.uk/new-portal"
    data["contributors"].append({"id": "noor", "name": "Noor", "role": "Design", "affiliation": None, "url": None})
    r = c.put(SITE, json={"version": 0, "data": data})
    assert r.status_code == 200, r.text
    assert (r.json()["version"], r.json()["updatedBy"]["displayName"]) == (1, "Ali Admin")
    assert client_for().get(SITE).json() == data
    assert c.put(SITE, json={"version": 1, "data": data}).json()["version"] == 1  # nothing changed: no new version

    entry = db.scalar(select(AuditEntry).where(AuditEntry.action == "site.update"))
    assert entry is not None
    assert (entry.actor_id, entry.target_type, entry.target_id) == (admin.id, "content_doc", "site")
    assert entry.data["title"] == "Site settings"
    assert entry.data["parts"] == ["links", "contributors"]
    assert entry.data["before"]["links"] == {"uolPortal": seed("site")["links"]["uolPortal"]}
    assert entry.data["after"]["contributors"] == {"items": [data["contributors"][-1]]}


def test_admins_set_what_leads_home_in_exam_week(client_for: Clients, admin: User, modules: dict[str, Module]) -> None:
    """IDEA-48: exam week is a setting, not code: on or off, how many days before an exam, and what leads."""
    assert client_for().get(SITE).json()["examWeek"] == {
        "on": True,
        "daysBefore": 7,
        "lead": ["countdown", "practice", "papers", "dates"],
    }
    data = seed("site")
    data["examWeek"] = {"on": False, "daysBefore": 3, "lead": ["papers", "countdown"]}
    assert client_for(admin).put(SITE, json={"version": 0, "data": data}).status_code == 200
    assert client_for().get(SITE).json()["examWeek"] == data["examWeek"]


def test_a_stale_site_save_is_refused(
    client_for: Clients, admin: User, make_user: Callable[..., User], modules: dict[str, Module]
) -> None:
    first, second = seed("site"), seed("site")
    first["tagline"], second["tagline"] = "Made by students.", "Made by DSBA students."
    other = client_for(make_user(name="Omar Admin", roles=("student", "admin")))
    assert other.put(SITE, json={"version": 0, "data": first}).status_code == 200
    r = client_for(admin).put(SITE, json={"version": 0, "data": second})
    assert (r.status_code, r.json()["error"]["code"]) == (409, "site_changed")
    assert client_for().get(SITE).json()["tagline"] == "Made by students."


def test_a_save_checks_the_version_in_the_database_not_the_one_read_before(db: Session, admin: User) -> None:
    """The row is read again when a save locks it: a version someone saved after this session read the document is
    the one checked, so their save is never overwritten."""
    start = GuidesDoc.model_validate(seed("guides"))

    def intro(words: str) -> GuidesDoc:
        return start.model_copy(update={"electives": start.electives.model_copy(update={"intro": words})})

    assert documents.save(db, admin, site.GUIDES, intro("Pick two."), 0, None).version == 1
    held = db.get(ContentDoc, "guides")  # the session still has the row it read, at version 1
    db.execute(text("UPDATE content_docs SET version = version + 1 WHERE key = 'guides'"))  # someone else's save
    mine = intro("Pick three.")
    with pytest.raises(ApiError) as refused:
        documents.save(db, admin, site.GUIDES, mine, 1, None)
    assert (refused.value.status, refused.value.code) == (409, "guides_changed")
    assert held is not None
    assert held.version == 2


def test_of_two_first_saves_the_second_is_refused(db: Session, admin: User, monkeypatch: pytest.MonkeyPatch) -> None:
    """Two first saves at once: the second finds the document saved when it makes the row, and is refused (409)
    rather than failing on the row the first one made."""
    start = GuidesDoc.model_validate(seed("guides"))
    mine = start.model_copy(update={"electives": start.electives.model_copy(update={"intro": "Pick two."})})
    real = documents.locked_row

    def read_before_theirs(session: Session, kind: Any, version: int) -> ContentDoc | None:
        monkeypatch.setattr(documents, "locked_row", real)  # only the first read comes before their save
        found = real(session, kind, version)
        session.execute(text("INSERT INTO content_docs (key, data, version) VALUES ('guides', '{}', 1)"))  # theirs
        return found

    monkeypatch.setattr(documents, "locked_row", read_before_theirs)
    with pytest.raises(ApiError) as refused:
        documents.save(db, admin, site.GUIDES, mine, 0, None)
    assert (refused.value.status, refused.value.code) == (409, "guides_changed")


@pytest.mark.parametrize(
    ("change", "field"),
    [
        (lambda d: d["links"]["myclass"].update(url="http://myclass.bibf.com"), "data.links.myclass.url"),
        (lambda d: d["links"]["results"].update(url="/calendar"), "data.links.results.url"),
        (
            lambda d: d["links"]["regulations"].update(url="https://drive.google.com/file/d/1abc/view"),
            "data.links.regulations.url",
        ),
        (lambda d: d["contributors"][0].update(url="javascript:alert(1)"), "data.contributors.0.url"),
        (lambda d: d["links"]["myclass"].update(url="https://myclass.bibf.com.evil.com"), "data.links.myclass.url"),
        (lambda d: d["links"]["uolPortal"].update(url="https://london.ac.uk@evil.com"), "data.links.uolPortal.url"),
        (lambda d: d["contributors"].append(dict(d["contributors"][0])), "data"),
        (lambda d: d["noteCredits"][0].update(modules=[]), "data.noteCredits.0.modules"),
        (lambda d: d["noteCredits"][0].update(modules=["economics", "economics"]), "data"),
        (lambda d: d.update(about="[Click](javascript:alert(1))"), "data.about"),
        (lambda d: d.update(launchYear=1999), "data.launchYear"),
        (lambda d: d.update(tagline=" "), "data.tagline"),
        (lambda d: d["homeBlocks"].append("modules"), "data"),
        (lambda d: d["homeBlocks"].append("weather"), "data.homeBlocks.11"),
        (lambda d: d.update(homeBlocks=[]), "data.homeBlocks"),
        (lambda d: d["tour"][0].update(art="rocket"), "data.tour.0.art"),
        (lambda d: d.update(tour=[]), "data.tour"),
        (lambda d: d["searchNicknames"][0].update(word="big data"), "data.searchNicknames.0.word"),
        (lambda d: d["searchNicknames"][0].update(finds="stat.*"), "data.searchNicknames.0.finds"),
        (lambda d: d.update(searchSuggestions=[]), "data.searchSuggestions"),
        (lambda d: d["examWeek"].update(daysBefore=0), "data.examWeek.daysBefore"),
        (lambda d: d["examWeek"].update(daysBefore=29), "data.examWeek.daysBefore"),
        (lambda d: d["examWeek"].update(lead=[]), "data.examWeek.lead"),
        (lambda d: d["examWeek"].update(lead=["countdown", "countdown"]), "data.examWeek"),
        (lambda d: d["examWeek"].update(lead=["weather"]), "data.examWeek.lead.0"),
    ],
)
def test_the_site_is_checked(
    client_for: Clients, admin: User, modules: dict[str, Module], change: Callable[[dict[str, Any]], None], field: str
) -> None:
    data = seed("site")
    change(data)
    assert field in fields(client_for(admin).put(SITE, json={"version": 0, "data": data}))


@pytest.mark.parametrize(
    "url", ["https://myclass.bibf.com.evil.com/login", "https://evilbibf.edu.bh", "https://bibf.edu.bh@evil.com"]
)
def test_the_portal_links_go_only_to_bibf_and_the_university(
    client_for: Clients, admin: User, modules: dict[str, Module], url: str
) -> None:
    data = seed("site")
    data["links"]["myclass"]["url"] = url
    r = client_for(admin).put(SITE, json={"version": 0, "data": data})
    assert fields(r) == {"data.links.myclass.url": "Links here must go to BIBF or University of London sites."}
    data["links"]["myclass"]["url"] = "https://myclass.bibf.edu.bh"
    data["links"]["uolPortal"]["url"] = "https://london.ac.uk/students"
    assert client_for(admin).put(SITE, json={"version": 0, "data": data}).status_code == 200


def test_a_contributor_may_link_anywhere_on_https(client_for: Clients, admin: User, modules: dict[str, Module]) -> None:
    data = seed("site")
    data["contributors"][0]["url"] = "https://example.com/me"
    assert client_for(admin).put(SITE, json={"version": 0, "data": data}).status_code == 200


def test_notes_are_credited_to_real_modules(client_for: Clients, admin: User, modules: dict[str, Module]) -> None:
    data = seed("site")
    data["noteCredits"][0]["modules"] = ["economics", "basket-weaving"]
    r = client_for(admin).put(SITE, json={"version": 0, "data": data})
    assert fields(r) == {"data": "There is no module “basket-weaving”. Choose one from the list."}


# ── the guides ───────────────────────────────────────────────────────────────────────────────


def test_the_guides_are_public_and_start_from_the_seed(client_for: Clients, moderator: User) -> None:
    assert client_for().get(GUIDES).json() == seed("guides")
    loaded = client_for(moderator).get(GUIDES_EDIT).json()  # reps hold guides.edit from the start
    assert (loaded["version"], loaded["data"]) == (0, seed("guides"))


def test_holders_of_guides_edit_save_them(
    client_for: Clients,
    student: User,
    make_user: Callable[..., User],
    make_role: Callable[..., Any],
    db: Session,
) -> None:
    for who in (None, student):
        assert client_for(who).get(GUIDES_EDIT).status_code == (401 if who is None else 403)
        assert client_for(who).put(GUIDES, json={"version": 0, "data": seed("guides")}).status_code == (
            401 if who is None else 403
        )
    make_role("guide-writers", Box.guides_edit)
    writer = make_user(name="Huda Guides", roles=("student", "guide-writers"))
    data = seed("guides")
    data["startHere"]["steps"][0]["title"] = "Get your UoL login"
    data["electives"]["title"] = "Choosing your electives"
    r = client_for(writer).put(GUIDES, json={"version": 0, "data": data})
    assert r.status_code == 200, r.text
    assert r.json()["version"] == 1
    assert client_for().get(GUIDES).json() == data
    entry = db.scalar(select(AuditEntry).where(AuditEntry.action == "guides.update"))
    assert entry is not None
    assert (entry.target_id, entry.data["title"]) == ("guides", "The guides")
    assert entry.data["parts"] == ["startHere", "electives"]
    assert entry.data["before"]["electives"] == {"title": "Choosing your Year 3 electives"}
    assert entry.data["after"]["electives"] == {"title": "Choosing your electives"}

    stale = client_for(make_user(name="Maryam Rep", roles=("student", "rep"))).put(
        GUIDES, json={"version": 0, "data": seed("guides")}
    )
    assert (stale.status_code, stale.json()["error"]["code"]) == (409, "guides_changed")


@pytest.mark.parametrize(
    ("change", "field"),
    [
        (lambda g: g["startHere"]["steps"].append(dict(g["startHere"]["steps"][0])), "data.startHere"),
        (lambda g: g["startHere"]["steps"][0].update(id="Get Login"), "data.startHere.steps.0.id"),
        (lambda g: g["startHere"].update(steps=[]), "data.startHere.steps"),
        (
            lambda g: g["startHere"]["steps"][2]["links"][0].update(to="https://example.com"),
            "data.startHere.steps.2.links.0.page.to",
        ),
        (
            lambda g: g["resultsDay"]["steps"][0]["links"].append(
                {"kind": "web", "href": "http://example.com", "label": "Example"}
            ),
            "data.resultsDay.steps.0.links.2.web.href",
        ),
        (
            lambda g: g["startHere"]["steps"][0]["links"].append(
                {"kind": "web", "href": "https://docs.google.com/document/d/1abc", "label": "Notes"}
            ),
            "data.startHere.steps.0.links.1.web.href",
        ),
        (
            lambda g: g["resultsDay"]["steps"][0]["links"].append({"kind": "site", "link": "vle", "label": "The VLE"}),
            "data.resultsDay.steps.0.links.2.site.link",
        ),
        (lambda g: g["startHere"]["termStart"].update(month=13), "data.startHere.termStart.month"),
    ],
)
def test_the_guides_are_checked(
    client_for: Clients, moderator: User, change: Callable[[dict[str, Any]], None], field: str
) -> None:
    data = seed("guides")
    change(data)
    assert field in fields(client_for(moderator).put(GUIDES, json={"version": 0, "data": data}))
