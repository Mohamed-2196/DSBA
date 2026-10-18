"""Daily's content file: what an export writes, an import brings back on a new install with the rotation, an import
adds only what the database lacks (and the shipped guess list to a short one), and an admin's upload in Manage does the
same as the command line, checked first, counted, audited with counts only, and refused to anyone else."""

from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import Engine, delete, event, func, select
from sqlalchemy.orm import Session

from app.models import AuditEntry, DailyGuessWord, DailyItem, DailyNearestWord, DailyTheme, User
from app.seed.loader import add_guess_words, daily_guess_words
from app.services.daily import bundle, content
from tests.daily.conftest import API, GUESSES, VOCABULARY

ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]
UPLOAD = f"{API}/content/daily/bundle"


def count(db: Session, model: type) -> int:
    return db.scalar(select(func.count()).select_from(model)) or 0


def load(db: Session, data: dict[str, Any]) -> bundle.ImportResult:
    return bundle.load(db, bundle.read(json.dumps(data)))


def with_shipped_list(db: Session) -> None:
    """The guess list as the seed leaves an install: the shipped list as well as the test words."""
    add_guess_words(db, daily_guess_words())
    db.commit()


def emptied(db: Session) -> dict[str, Any]:
    """The test content as a file, and a database left with its guess list only (a new install's)."""
    data = bundle.export(db)
    for model in (DailyItem, DailyNearestWord, DailyTheme):
        db.execute(delete(model))
    db.commit()
    return data


def imports(db: Session) -> list[AuditEntry]:
    return list(db.scalars(select(AuditEntry).where(AuditEntry.action == "daily.content.import")))


def test_an_export_brings_a_new_install_back_with_its_rotation(db: Session) -> None:
    with_shipped_list(db)
    db.execute(delete(DailyItem).where(DailyItem.game == "quiz", DailyItem.theme_id == "beta"))
    retired = db.scalars(select(DailyItem).where(DailyItem.game == "search").limit(1)).one()
    retired.retired = True
    db.commit()
    data = emptied(db)
    assert [(t["id"], t["inRotation"]) for t in data["themes"]] == [("alpha", True), ("beta", True)]
    assert data["guesses"] == sorted(set(GUESSES) - set(daily_guess_words()))  # the public list isn't repeated
    assert len(data["vocabulary"]) == len(VOCABULARY)
    assert sum(i["retired"] for i in data["items"]) == 1

    result = load(db, data)
    db.commit()
    assert (result.themes["added"], result.vocabulary["added"]) == (2, len(VOCABULARY))
    assert sum(c["added"] for c in result.items.values()) == len(data["items"])
    assert result.guesses["added"] == 0  # the install has its guess list
    # beta has no quiz questions now: it waits out of the rotation
    assert result.rotation == ["alpha"]
    assert any("beta" in p and "quiz" in p for p in result.problems)
    again = bundle.export(db)
    assert sorted(map(str, again["items"])) == sorted(map(str, data["items"]))
    assert content.schedule(db).rotation == ["alpha"]
    assert [e.data["via"] for e in imports(db)] == ["cli"]


def test_an_import_adds_only_what_is_missing_and_says_what_it_refused(db: Session) -> None:
    with_shipped_list(db)
    data = {
        "themes": [{"id": "alpha", "title": "Renamed", "blurb": "", "inRotation": True}],
        "guesses": ["BLORP"],
        "vocabulary": [
            {"word": "mean", "tags": ["x", "y", "z"]},
            {"word": "outlier", "tags": ["stats", "spread", "data"]},
            {"word": "broken", "tags": "not a list", "near": 3},
        ],
        "items": [
            {"game": "word", "theme": "alpha", "word": "MEANS"},
            {"game": "word", "theme": "alpha", "word": "blorp"},
            {
                "game": "quiz",
                "theme": "nowhere",
                "question": "A question long enough?",
                "options": ["a", "b"],
                "answer": 0,
                "explanation": "Yes.",
            },
            {"game": "chess", "theme": "alpha"},
            {"game": "nearest", "theme": "alpha", "word": "outlier"},
        ],
    }
    result = load(db, data)
    db.commit()
    assert (result.themes["kept"], result.guesses["added"], result.vocabulary["added"]) == (1, 1, 1)
    assert (result.items["word"]["added"], result.items["word"]["kept"], result.items["nearest"]["added"]) == (1, 1, 1)
    assert len(result.problems) == 3  # broken's tags, the unknown theme, the unknown game
    assert db.get(DailyTheme, "alpha").title == "Alpha week"  # type: ignore[union-attr]  # what was there stays
    assert db.get(DailyNearestWord, "mean").tags == ["stats", "average", "measure"]  # type: ignore[union-attr]
    outlier = db.scalars(select(DailyItem).where(DailyItem.key == "outlier")).one()
    assert outlier.ranking is not None
    assert outlier.ranking[0] == "outlier"
    assert count(db, DailyGuessWord) == len(set(GUESSES) | set(daily_guess_words())) + 1


def test_an_import_fills_a_short_guess_list_with_the_shipped_one(db: Session) -> None:
    """A guess list a content file filled holds its answers only; a full one keeps the words editors took off."""
    shipped = set(daily_guess_words())
    result = load(db, {"guesses": ["BLORP", *GUESSES[:2]]})
    db.commit()
    assert result.guesses == {"added": 1 + len(shipped - set(GUESSES)), "kept": 2}
    assert count(db, DailyGuessWord) == len(shipped | set(GUESSES)) + 1

    taken_off = sorted(shipped - set(GUESSES))[:3]
    db.execute(delete(DailyGuessWord).where(DailyGuessWord.word.in_(taken_off)))
    db.commit()
    again = load(db, {"guesses": ["BLORP"]})
    assert again.guesses == {"added": 0, "kept": 1}
    assert not db.scalars(select(DailyGuessWord.word).where(DailyGuessWord.word.in_(taken_off))).all()


def test_only_admins_upload_a_content_file(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    body = {"content": json.dumps(bundle.export(db)), "dryRun": True}
    assert client_for().post(UPLOAD, json=body).status_code == 401
    assert client_for(make_user()).post(UPLOAD, json=body).status_code == 403
    editor = client_for(make_user(roles=("student", "content-manager")))
    r = editor.post(UPLOAD, json=body)
    assert (r.status_code, r.json()["error"]["code"]) == (403, "forbidden")
    assert "MEANS" not in r.text


def test_an_upload_is_checked_then_loaded_once_and_audited_with_counts(
    client_for: ClientFor, make_user: MakeUser, db: Session
) -> None:
    with_shipped_list(db)
    data = emptied(db)
    admin = client_for(make_user(roles=("student", "admin")))
    text = json.dumps(data)
    dry = admin.post(UPLOAD, json={"content": text, "dryRun": True}).json()
    assert dry["applied"] is False
    assert (dry["themes"], dry["vocabulary"]) == ({"added": 2, "kept": 0}, {"added": len(VOCABULARY), "kept": 0})
    added = {g["game"]: g["added"] for g in dry["items"]}
    assert added == {"groups": 16, "nearest": 4, "quiz": 12, "search": 20, "word": 16}
    assert (dry["rotation"], dry["problems"]) == (["alpha", "beta"], [])
    assert count(db, DailyItem) == 0  # nothing changed

    done = admin.post(UPLOAD, json={"content": text}).json()
    assert done["applied"] is True
    assert done["themes"] == dry["themes"]
    assert count(db, DailyItem) == 68
    assert content.schedule(db).rotation == ["alpha", "beta"]

    again = admin.post(UPLOAD, json={"content": text}).json()  # the same file twice changes nothing
    assert all(g["added"] == 0 for g in again["items"])
    assert sum(g["kept"] for g in again["items"]) == 68
    assert (again["themes"], again["rotation"]) == ({"added": 0, "kept": 2}, [])
    entries = imports(db)
    assert len(entries) == 1
    assert entries[0].data == {
        "title": "Daily puzzles' content",
        "actorName": "Test Student",
        "themes": 2,
        "guesses": 0,
        "vocabulary": len(VOCABULARY),
        "items": 68,
        "rotation": ["alpha", "beta"],
    }


def test_an_upload_that_isnt_a_content_file_is_refused_on_the_field(client_for: ClientFor, make_user: MakeUser) -> None:
    admin = client_for(make_user(roles=("student", "admin")))
    for text, says in (
        ("{not json", "isn't JSON"),
        ("[1, 2]", "isn't a Daily content file"),
        ('{"name": "something else"}', "isn't a Daily content file"),
        ('{"items": "everything"}', "“items” doesn't fit"),
    ):
        r = admin.post(UPLOAD, json={"content": text, "dryRun": True})
        assert r.status_code == 422, text
        assert says in r.json()["error"]["fields"]["content"]
    big = admin.post(UPLOAD, json={"content": " " * 1_000_001})
    assert (big.status_code, list(big.json()["error"]["fields"])) == (422, ["content"])


def test_a_content_file_takes_the_same_few_statements_however_many_items_it_has(db: Session, engine: Engine) -> None:
    letters = "BCDFGHJKLMNPQRSTVWXZ"

    def file(theme: str, n: int) -> dict[str, Any]:
        words = [f"{theme[:2].upper()}{letters[i // 20]}{letters[i % 20]}A" for i in range(n)]
        groups = [
            {"game": "groups", "theme": theme, "label": f"Group {i}", "level": i % 4 + 1, "words": words[:4]}
            for i in range(n)
        ]
        return {
            "themes": [{"id": theme, "title": f"{theme.capitalize()} week", "blurb": "", "inRotation": False}],
            "guesses": words,
            "items": [
                *({"game": "word", "theme": theme, "word": w} for w in words),
                *({"game": "search", "theme": theme, "word": f"{w}S"} for w in words),
                *groups,
            ],
        }

    def statements(data: dict[str, Any]) -> int:
        seen: list[str] = []

        def count(*_: Any) -> None:
            seen.append("")

        event.listen(engine, "before_cursor_execute", count)
        try:
            result = load(db, data)
        finally:
            event.remove(engine, "before_cursor_execute", count)
        assert sum(c["added"] for c in result.items.values()) == 3 * len(data["guesses"]), result.problems
        return len(seen)

    with_shipped_list(db)
    few = statements(file("gamma", 5))
    assert statements(file("delta", 60)) == few
