"""Manage → Forum: the categories and tags (tables), where a thread goes when no year fits, and the forum's guidelines
and tips. Holders of forum.moderate save them together from the version they loaded; every save is audited. A
category or tag that threads use is retired, never removed: its threads keep it, and it isn't offered any more."""

from __future__ import annotations

import copy
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.access import Box
from app.models import AuditEntry, Module, User
from tests.community.helpers import API, new_thread, thread_row

Client = Callable[..., TestClient]
SETTINGS = f"{API}/forum/settings"


def loaded(client: TestClient) -> dict[str, Any]:
    r = client.get(SETTINGS)
    assert r.status_code == 200, r.text
    data: dict[str, Any] = r.json()
    return data


def save(client: TestClient, version: int, data: dict[str, Any]) -> Any:
    return client.put(SETTINGS, json={"version": version, "data": data})


def category(data: dict[str, Any], category_id: str) -> dict[str, Any]:
    found: dict[str, Any] = next(c for c in data["categories"] if c["id"] == category_id)
    return found


def fields(r: Any) -> dict[str, str]:
    assert r.status_code == 422, r.text
    out: dict[str, str] = r.json()["error"]["fields"]
    return out


def test_the_settings_start_from_the_forum_as_it_was(client_for: Client, moderator: User, student: User) -> None:
    new_thread(client_for(student), category="year-2", tags=["r"])
    out = loaded(client_for(moderator))
    assert (out["version"], out["updatedAt"], out["updatedBy"]) == (0, None, None)
    data = out["data"]
    assert [c["id"] for c in data["categories"]] == ["year-1", "year-2", "year-3", "study-groups", "general"]
    assert len(data["tags"]) == 12
    assert data["defaultCategory"] == "general"
    assert data["guidelines"][0]["text"] == "Search before you post. Your question may already have an answer."
    assert out["threadsByCategory"] == {"year-2": 1}
    assert out["threadsByTag"] == {"r": 1}


def test_only_holders_of_forum_moderate_edit_them(
    client_for: Client, student: User, make_user: Callable[..., User], make_role: Callable[..., Any]
) -> None:
    for who in (None, student):
        assert client_for(who).get(SETTINGS).status_code == (401 if who is None else 403)
    make_role("forum-keepers", Box.forum_moderate)
    keeper = client_for(make_user(name="Huda Keeper", roles=("student", "forum-keepers")))
    data = loaded(keeper)["data"]
    assert save(client_for(student), 0, data).status_code == 403
    assert save(client_for(), 0, data).status_code == 401
    category(data, "study-groups")["label"] = "Revision groups"
    r = save(keeper, 0, data)
    assert r.status_code == 200, r.text
    assert category(client_for().get(f"{API}/forum/meta").json(), "study-groups")["label"] == "Revision groups"


def test_a_save_changes_the_forum_for_everyone_and_is_audited(
    client_for: Client, moderator: User, student: User, db: Session
) -> None:
    rep = client_for(moderator)
    data = loaded(rep)["data"]
    data["categories"].insert(
        3, {"id": "coursework", "label": "Coursework", "short": "Coursework", "year": 2, "blurb": "Year 2 projects"}
    )
    data["tags"].append({"id": "sql", "label": "SQL"})
    data["tags"].reverse()
    data["guidelines"][1]["text"] = "Put the unit code in your title, like ST2133."
    data["tips"].append({"id": "screenshots", "text": "Type the question out instead of a screenshot."})
    r = save(rep, 0, data)
    assert r.status_code == 200, r.text
    assert (r.json()["version"], r.json()["updatedBy"]["displayName"]) == (1, "Student Rep")
    assert save(rep, 1, r.json()["data"]).json()["version"] == 1  # nothing changed: no new version

    meta = client_for().get(f"{API}/forum/meta").json()
    ids = ["year-1", "year-2", "year-3", "coursework", "study-groups", "general"]
    assert [c["id"] for c in meta["categories"]] == ids
    assert meta["tags"][0] == {"id": "sql", "label": "SQL", "retired": False}
    assert meta["guidelines"][1]["text"] == "Put the unit code in your title, like ST2133."
    assert meta["tips"][-1]["id"] == "screenshots"

    # A new category works like the others: a Year 2 student's thread in it belongs to Year 2.
    t = new_thread(client_for(student), category="coursework", tags=["sql"])
    assert (t["category"], t["year"], t["tags"]) == ("coursework", 2, ["sql"])
    listed = client_for().get(f"{API}/forum/threads", params={"year": 2}).json()["items"]
    assert t["id"] in [x["id"] for x in listed]
    assert client_for().get(f"{API}/forum/threads", params={"year": 1}).json()["total"] == 0
    assert client_for().get(f"{API}/forum/stats").json()["byCategory"]["coursework"] == 1
    assert client_for().get(f"{API}/forum/threads", params={"q": "coursework"}).json()["total"] == 1

    entry = db.scalar(select(AuditEntry).where(AuditEntry.action == "forum.settings"))
    assert entry is not None
    assert (entry.actor_id, entry.target_type, entry.target_id) == (moderator.id, "content_doc", "forum")
    assert entry.data["title"] == "Forum settings"
    assert entry.data["parts"] == ["guidelines", "tips", "categories", "tags"]
    assert entry.data["after"]["categories"]["items"] == [data["categories"][3] | {"icon": None, "retired": False}]
    assert "order" in entry.data["after"]["tags"]


def test_a_stale_save_is_refused(client_for: Client, moderator: User, make_user: Callable[..., User]) -> None:
    first, second = loaded(client_for(moderator))["data"], loaded(client_for(moderator))["data"]
    first["tips"][0]["text"] = "One clear question in the title."
    other = client_for(make_user(name="Maryam Rep", roles=("student", "rep")))
    assert save(other, 0, first).status_code == 200
    second["tips"][0]["text"] = "A clear question in the title."
    r = save(client_for(moderator), 0, second)
    assert (r.status_code, r.json()["error"]["code"]) == (409, "forum_changed")
    assert client_for().get(f"{API}/forum/meta").json()["tips"][0]["text"] == "One clear question in the title."


def test_a_category_in_use_is_retired_not_removed(
    client_for: Client, moderator: User, student: User, modules: dict[str, Module], db: Session
) -> None:
    rep, sara = client_for(moderator), client_for(student)
    kept = new_thread(sara, title="A year one question", category="year-1")
    data = loaded(rep)["data"]
    data["categories"] = [c for c in data["categories"] if c["id"] != "year-1"]
    assert fields(save(rep, 0, data)) == {
        "data.categories": "“Year 1” has 1 thread. Retire it instead: it stops being offered, and its threads keep it."
    }

    data = loaded(rep)["data"]
    category(data, "year-1")["retired"] = True
    assert save(rep, 0, data).status_code == 200
    assert category(client_for().get(f"{API}/forum/meta").json(), "year-1")["retired"] is True

    # Not offered any more: new threads can't go there, and a Year 1 module's thread goes to the default category.
    r = sara.post(f"{API}/forum/threads", json={"title": "Another year one question", "category": "year-1"})
    assert fields(r) == {"category": "Choose a category from the list."}
    year_one = next(m for m in modules.values() if m.year == 1)
    placed = new_thread(sara, title="About a year one module", moduleId=year_one.id)
    assert placed["category"] == "general"
    # Its threads keep it, and can still be edited.
    edit = {"title": "A year one question, edited", "category": "year-1"}
    r = sara.patch(f"{API}/forum/threads/{kept['id']}", json=edit)
    assert r.status_code == 200, r.text
    assert thread_row(db, kept["id"]).category == "year-1"
    other = new_thread(sara, title="A general question", category="general")
    r = sara.patch(f"{API}/forum/threads/{other['id']}", json={"category": "year-1"})
    assert fields(r) == {"category": "Choose a category from the list."}
    assert client_for().get(f"{API}/forum/threads", params={"category": "year-1"}).json()["total"] == 1


def test_a_category_nobody_uses_is_removed(client_for: Client, moderator: User) -> None:
    rep = client_for(moderator)
    data = loaded(rep)["data"]
    data["categories"] = [c for c in data["categories"] if c["id"] != "year-3"]
    r = save(rep, 0, data)
    assert r.status_code == 200, r.text
    assert "year-3" not in [c["id"] for c in client_for().get(f"{API}/forum/meta").json()["categories"]]
    r = client_for().get(f"{API}/forum/threads", params={"category": "year-3"})
    assert fields(r) == {"category": "There is no such category."}


def test_a_tag_in_use_is_retired_not_removed(client_for: Client, moderator: User, student: User) -> None:
    rep, sara = client_for(moderator), client_for(student)
    t = new_thread(sara, tags=["excel"])
    data = loaded(rep)["data"]
    data["tags"] = [x for x in data["tags"] if x["id"] != "excel"]
    assert fields(save(rep, 0, data)) == {
        "data.tags": "“Excel” is on 1 thread. Retire it instead: it stops being offered, and those threads keep it."
    }
    data = loaded(rep)["data"]
    next(x for x in data["tags"] if x["id"] == "excel")["retired"] = True
    data["tags"] = [x for x in data["tags"] if x["id"] != "campus"]  # nobody uses it: it goes
    assert save(rep, 0, data).status_code == 200
    tags = {x["id"]: x for x in client_for().get(f"{API}/forum/meta").json()["tags"]}
    assert tags["excel"]["retired"] is True
    assert "campus" not in tags
    assert fields(sara.post(f"{API}/forum/threads", json={"title": "Pivot tables help", "tags": ["excel"]})) == {
        "tags": "Pick tags from the list."
    }
    r = sara.patch(f"{API}/forum/threads/{t['id']}", json={"tags": ["excel", "r"]})  # keeps the one it has
    assert r.status_code == 200, r.text


@pytest.mark.parametrize(
    ("change", "field"),
    [
        (lambda d: d["categories"].append(copy.deepcopy(d["categories"][0])), "data"),
        (lambda d: d["tags"].append(copy.deepcopy(d["tags"][0])), "data"),
        (lambda d: d["categories"][0].update(id="Year One"), "data.categories.0.id"),
        (lambda d: d["categories"][0].update(label=" "), "data.categories.0.label"),
        (lambda d: d["categories"][0].update(year=4), "data.categories.0.year"),
        (lambda d: d["categories"].append({**d["categories"][0], "id": "all", "label": "All"}), "data"),  # the All tab
        (lambda d: d["tags"][0].update(label="x" * 41), "data.tags.0.label"),
        (lambda d: d.update(defaultCategory="year-1"), "data"),  # a year's category
        (lambda d: d.update(defaultCategory="nowhere"), "data"),
        (lambda d: category(d, "general").update(retired=True), "data"),
        (lambda d: [c.update(retired=True) for c in d["categories"]], "data"),
        (lambda d: d["guidelines"][0].update(icon="skull"), "data.guidelines.0.icon"),
        (lambda d: d.update(tips=[]), "data.tips"),
    ],
)
def test_the_settings_are_checked(
    client_for: Client, moderator: User, change: Callable[[dict[str, Any]], None], field: str
) -> None:
    data = loaded(client_for(moderator))["data"]
    change(data)
    assert field in fields(save(client_for(moderator), 0, data))
