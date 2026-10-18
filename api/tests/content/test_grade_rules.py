"""The grades calculator's rules: public to read, starting as today's programme regulations, saved by admins from the
version they loaded (audited), and checked so the calculator can always apply them."""

from __future__ import annotations

import copy
import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AuditEntry, Module, User
from tests.content.conftest import API

Clients = Callable[..., TestClient]
RULES, EDIT = f"{API}/grades/rules", f"{API}/grades/rules/edit"
SEED = Path(__file__).resolve().parents[2] / "app" / "seed" / "data" / "grades.json"


def seed() -> dict[str, Any]:
    data: dict[str, Any] = json.loads(SEED.read_text(encoding="utf-8"))
    return copy.deepcopy(data)


def fields(r: Any) -> dict[str, str]:
    assert r.status_code == 422, r.text
    out: dict[str, str] = r.json()["error"]["fields"]
    return out


@pytest.fixture
def every_module(db: Session) -> None:
    """The modules the rules name, as the catalogue has them."""
    ids = {s["moduleId"] for s in seed()["subjects"] if s["moduleId"]}
    ids |= {o["moduleId"] for o in [*seed()["year2Options"], *seed()["electives"]] if o["moduleId"]}
    for i, module_id in enumerate(sorted(ids)):
        if db.get(Module, module_id) is None:
            db.add(
                Module(
                    id=module_id,
                    name=module_id.replace("-", " ").title(),
                    short_name=module_id,
                    year=1,
                    position=100 + i,
                )
            )
    db.commit()


def test_the_rules_are_public_and_start_as_the_regulations(client_for: Clients, admin: User) -> None:
    rules = client_for().get(RULES).json()
    assert rules == seed()
    assert (rules["needed"], rules["fewer"], rules["averageCounts"]) == (10, 8, 2)
    assert [rules["bands"][b]["floor"] for b in ("first", "upper", "lower", "third")] == [70, 60, 50, 40]
    loaded = client_for(admin).get(EDIT).json()
    assert (loaded["version"], loaded["data"]) == (0, seed())


def test_only_admins_edit_them(client_for: Clients, student: User, moderator: User) -> None:
    for who in (None, student, moderator):
        assert client_for(who).get(EDIT).status_code == (401 if who is None else 403)
        assert client_for(who).put(RULES, json={"version": 0, "data": seed()}).status_code == (
            401 if who is None else 403
        )


def test_an_admin_saves_them_and_it_is_audited(
    client_for: Clients, admin: User, make_user: Callable[..., User], every_module: None, db: Session
) -> None:
    data = seed()
    data["bands"]["first"]["floor"] = 72
    data["subjects"].append(
        {"id": "dissertation", "name": "Dissertation", "year": 3, "moduleId": None, "choice": None, "counts": 2}
    )
    data["needed"] = 11
    r = client_for(admin).put(RULES, json={"version": 0, "data": data})
    assert r.status_code == 200, r.text
    assert r.json()["version"] == 1
    assert client_for().get(RULES).json() == data
    entry = db.scalar(select(AuditEntry).where(AuditEntry.action == "grades.rules"))
    assert entry is not None
    assert (entry.target_id, entry.data["title"]) == ("grades", "Grades calculator")
    assert entry.data["parts"] == ["subjects", "bands", "needed"]

    stale = client_for(make_user(name="Omar Admin", roles=("student", "admin"))).put(
        RULES, json={"version": 0, "data": seed()}
    )
    assert (stale.status_code, stale.json()["error"]["code"]) == (409, "grades_changed")


def test_they_follow_the_grades_switch(client_for: Clients, student: User, set_feature: Callable[..., None]) -> None:
    set_feature("grades", "off")
    r = client_for(student).get(RULES)
    assert (r.status_code, r.json()["error"]["code"]) == (404, "feature_off")


@pytest.mark.parametrize(
    ("change", "field"),
    [
        (lambda d: d["bands"]["upper"].update(floor=75), "data"),  # above the First's floor
        (lambda d: d.update(fewer=11), "data"),  # more than `needed`
        (lambda d: d.update(needed=19), "data"),  # more than the 18 marks the subjects give
        (lambda d: d["subjects"].append(dict(d["subjects"][0])), "data"),
        (lambda d: d["subjects"][8].update(moduleId="econometrics"), "data"),  # a module and a choice
        (lambda d: d.update(year2Options=[]), "data"),
        (lambda d: d.update(electives=d["electives"][:1]), "data"),
        (lambda d: d["subjects"][0].update(counts=4), "data.subjects.0.counts"),
        (lambda d: d["bands"]["third"].update(floor=0), "data.bands.third.floor"),
        (lambda d: d["year2Options"][2].update(label=None), "data"),
        (lambda d: d.update(subjects=[]), "data.subjects"),
        (lambda d: d["subjects"][0].update(moduleId="basket-weaving"), "data"),  # no such module
    ],
)
def test_the_rules_are_checked(
    client_for: Clients, admin: User, every_module: None, change: Callable[[dict[str, Any]], None], field: str
) -> None:
    data = seed()
    change(data)
    assert field in fields(client_for(admin).put(RULES, json={"version": 0, "data": data}))
