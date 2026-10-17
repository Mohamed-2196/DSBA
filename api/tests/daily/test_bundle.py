"""Daily's content file: what an export writes, an import brings back on a new install with the rotation, and an
import adds only what the database lacks, checked with the editor's rules."""

from __future__ import annotations

from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models import AuditEntry, DailyGuessWord, DailyItem, DailyNearestWord, DailyTheme
from app.seed.loader import daily_guess_words
from app.services.daily import bundle, content
from tests.daily.conftest import GUESSES, VOCABULARY


def count(db: Session, model: type) -> int:
    return db.scalar(select(func.count()).select_from(model)) or 0


def test_an_export_brings_a_new_install_back_with_its_rotation(db: Session) -> None:
    db.execute(delete(DailyItem).where(DailyItem.game == "quiz", DailyItem.theme_id == "beta"))
    retired = db.scalars(select(DailyItem).where(DailyItem.game == "search").limit(1)).one()
    retired.retired = True
    db.commit()
    data: dict[str, Any] = bundle.export(db)
    assert [(t["id"], t["inRotation"]) for t in data["themes"]] == [("alpha", True), ("beta", True)]
    assert data["guesses"] == sorted(set(GUESSES) - set(daily_guess_words()))  # the public list isn't repeated
    assert len(data["vocabulary"]) == len(VOCABULARY)
    assert sum(i["retired"] for i in data["items"]) == 1

    for model in (DailyItem, DailyNearestWord, DailyTheme):
        db.execute(delete(model))
    db.commit()
    result = bundle.load(db, data)
    db.commit()
    assert (result.themes, result.vocabulary, result.items, result.kept) == (2, len(VOCABULARY), len(data["items"]), 0)
    assert result.guesses == 0  # the install has its guess list
    # beta has no quiz questions now: it waits out of the rotation
    assert result.rotation == ["alpha"]
    assert any("beta" in p and "quiz" in p for p in result.problems)
    again = bundle.export(db)
    assert sorted(map(str, again["items"])) == sorted(map(str, data["items"]))
    assert content.schedule(db).rotation == ["alpha"]
    assert db.scalars(select(AuditEntry.action).where(AuditEntry.action == "daily.content.import")).all()


def test_an_import_adds_only_what_is_missing_and_says_what_it_refused(db: Session) -> None:
    data = {
        "themes": [{"id": "alpha", "title": "Renamed", "blurb": "", "inRotation": True}],
        "guesses": ["QUACK"],
        "vocabulary": [
            {"word": "mean", "tags": ["x", "y", "z"]},
            {"word": "outlier", "tags": ["stats", "spread", "data"]},
        ],
        "items": [
            {"game": "word", "theme": "alpha", "word": "MEANS"},
            {"game": "word", "theme": "alpha", "word": "quack"},
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
    result = bundle.load(db, data)
    db.commit()
    assert (result.themes, result.guesses, result.vocabulary, result.items, result.kept) == (0, 1, 1, 2, 1)
    assert len(result.problems) == 2
    assert db.get(DailyTheme, "alpha").title == "Alpha week"  # type: ignore[union-attr]  # what was there stays
    assert db.get(DailyNearestWord, "mean").tags == ["stats", "average", "measure"]  # type: ignore[union-attr]
    outlier = db.scalars(select(DailyItem).where(DailyItem.key == "outlier")).one()
    assert outlier.ranking is not None
    assert outlier.ranking[0] == "outlier"
    assert count(db, DailyGuessWord) == len(GUESSES) + 1
