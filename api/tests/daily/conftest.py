"""Fixtures for Daily's tests: the feature switched on, a small made-up content (two themes with what every game
needs, and four modules for the quiz's question about them), and helpers to play.

The real content is kept out of the repository (app/services/daily/bundle.py), so the tests make their own."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

import pytest
from sqlalchemy.orm import Session

from app.models import DailyGuessWord, DailyItem, DailyNearestWord, DailyTheme, Module
from app.services.daily import editor

API = "/api/v1"

GUESSES = [
    "CRANE",
    "SLATE",
    "PIOUS",
    "MIGHT",
    "BLUNT",
    "FORGE",
    "WHISK",
    "STONE",
    "PLANT",
    "BRICK",
    "GLOVE",
    "MEANS",
    "RANGE",
    "TREND",
    "CURVE",
    "MODES",
    "RATIO",
    "SCORE",
    "TOTAL",
    "MODEL",
    "LAYER",
    "TRAIN",
    "LEARN",
    "NODES",
    "AGENT",
    "TOKEN",
    "EPOCH",
]
ANSWERS = {
    "alpha": ["MEANS", "RANGE", "TREND", "CURVE", "MODES", "RATIO", "SCORE", "TOTAL"],
    "beta": ["MODEL", "LAYER", "TRAIN", "LEARN", "NODES", "AGENT", "TOKEN", "EPOCH"],
}
GROUPS = {
    "alpha": [
        ("Colours", 1, ["RED", "BLUE", "GREEN", "PINK", "GREY"]),
        ("Fruit", 1, ["APPLE", "PEAR", "PLUM", "FIG"]),
        ("Pets", 2, ["CAT", "DOG", "HAMSTER", "RABBIT"]),
        ("Birds", 2, ["OWL", "CROW", "ROBIN", "WREN"]),
        ("Metals", 3, ["IRON", "GOLD", "TIN", "ZINC", "LEAD"]),
        ("Trees", 3, ["OAK", "ASH", "ELM", "PINE"]),
        ("Planets", 4, ["MARS", "VENUS", "EARTH", "SATURN"]),
        ("Rivers", 4, ["NILE", "AMAZON", "THAMES", "DANUBE"]),
    ],
    "beta": [
        ("Shapes", 1, ["CIRCLE", "SQUARE", "OVAL", "CUBE"]),
        ("Dairy", 1, ["MILK", "BUTTER", "CHEESE", "CREAM"]),
        ("Tools", 2, ["HAMMER", "SAW", "DRILL", "WRENCH"]),
        ("Weather", 2, ["RAIN", "SNOW", "HAIL", "FOG"]),
        ("Sports", 3, ["GOLF", "TENNIS", "RUGBY", "POLO"]),
        ("Gems", 3, ["RUBY", "OPAL", "PEARL", "JADE"]),
        ("Dances", 4, ["SALSA", "TANGO", "WALTZ", "SAMBA"]),
        ("Breads", 4, ["NAAN", "PITA", "BAGEL", "ROTI"]),
    ],
}
SEARCH = {
    "alpha": [
        "MEDIAN",
        "VARIANCE",
        "SAMPLE",
        "OUTLIER",
        "SKEW",
        "QUARTILE",
        "HISTOGRAM",
        "SCATTER",
        "NORMAL",
        "POISSON",
    ],
    "beta": ["NEURON", "LAYER", "WEIGHT", "EPOCH", "BATCH", "GRADIENT", "DROPOUT", "TOKEN", "PROMPT", "ENCODER"],
}
VOCABULARY = {
    "mean": (["stats", "average", "measure"], ["median"]),
    "median": (["stats", "average", "measure"], []),
    "mode": (["stats", "average", "count"], []),
    "variance": (["stats", "spread", "measure"], []),
    "spread": (["stats", "spread", "shape"], []),
    "chart": (["stats", "visual", "data"], []),
    "graph": (["stats", "visual", "network"], []),
    "model": (["ml", "learning", "predict"], ["neuron"]),
    "neuron": (["ml", "network", "brain"], []),
    "layer": (["ml", "network", "structure"], []),
    "train": (["ml", "learning", "process"], []),
    "table": (["data", "structure", "record"], []),
    "money": (["finance", "value", "market"], []),
    "price": (["finance", "value", "market"], []),
    "apple": (["food", "everyday", "nature"], []),
}
SECRETS = {"alpha": ["mean", "variance"], "beta": ["model", "neuron"]}
QUESTIONS = 6  # a theme's quiz questions


@dataclass(frozen=True)
class Content:
    themes: tuple[str, ...]


def question(theme: str, n: int) -> dict[str, object]:
    return {
        "question": f"Which option is right in {theme} question {n}?",
        "options": [f"Right {n}", f"Wrong {n}a", f"Wrong {n}b", f"Wrong {n}c"],
        "answer": 0,
        "explanation": f"Right {n} is right, as the question says.",
        "moduleId": None,
    }


def make_content(db: Session) -> Content:
    """Two themes in the rotation with what every game needs, the guess list, the vocabulary and four modules."""
    for i, (code, year) in enumerate((("TS1001", 1), ("TS1002", 1), ("TS2001", 2), ("TS3001", 3))):
        db.add(
            Module(id=f"test-module-{i}", unit_code=code, name=f"Test module {i}", short_name=f"Test {i}", year=year)
        )
    for position, theme in enumerate(("alpha", "beta")):
        db.add(DailyTheme(id=theme, title=f"{theme.capitalize()} week", blurb="", position=position, in_rotation=True))
    db.add_all(DailyGuessWord(word=w) for w in GUESSES)
    db.add_all(DailyNearestWord(word=w, tags=tags, near=near) for w, (tags, near) in VOCABULARY.items())
    db.flush()
    for theme in ("alpha", "beta"):
        items = [DailyItem(game="word", theme_id=theme, data={"word": w}, key=w) for w in ANSWERS[theme]]
        items += [
            DailyItem(
                game="groups",
                theme_id=theme,
                data={"label": label, "level": level, "words": words},
                key=label.casefold(),
            )
            for label, level, words in GROUPS[theme]
        ]
        items += [DailyItem(game="search", theme_id=theme, data={"word": w}, key=w) for w in SEARCH[theme]]
        for n in range(QUESTIONS):
            data = question(theme, n)
            items.append(DailyItem(game="quiz", theme_id=theme, data=data, key=str(data["question"]).casefold()))
        items += [DailyItem(game="nearest", theme_id=theme, data={"word": w}, key=w) for w in SECRETS[theme]]
        db.add_all(items)
    db.flush()
    editor.rank_secret_words(db)
    db.commit()
    return Content(themes=("alpha", "beta"))


@pytest.fixture(autouse=True)
def daily_on(set_feature: Callable[..., None]) -> None:
    """Daily arrives switched off; these tests switch it on for everyone."""
    set_feature("daily", "everyone")


@pytest.fixture(autouse=True)
def content(db: Session) -> Content:
    return make_content(db)
