"""The rules a Daily puzzle item meets, checked the same way in Manage, in a paste and in a content file (editor.py,
bundle.py): an answer word is five letters and in the guess list; a group has four to eight different words (another
group of its theme may share some: a day with both shows neither group those words); a word search word is 4 to 10
letters; a quiz question has two to six different options and one right answer; a secret word is in the vocabulary;
and what must be unique (a word, a group's name, a question) is. Each refusal says what to fix, on the field.

A check reads the database through Lookups: a query at a time for one item, or everything once for a batch (Batch),
so a content file of hundreds of items takes a handful of statements."""

from __future__ import annotations

import re
import uuid
from collections.abc import Callable
from typing import Any, NamedTuple

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ApiError, invalid
from app.models import DailyGuessWord, DailyItem, DailyNearestWord, DailyTheme, Module
from app.models.daily_content import UNIQUE_IN_THEME
from app.schemas.daily_content import GroupData, ItemData, NearestData, QuizData, SearchData, WordData
from app.services.daily.games import search as search_game
from app.services.daily.games import word as word_game

ANSWER = re.compile(r"[A-Z]{5}")
GROUP_WORD = re.compile(r"[A-Z]{2,12}")
SEARCH_WORD = re.compile(rf"[A-Z]{{{search_game.MIN_LETTERS},{search_game.MAX_LETTERS}}}")
VOCABULARY_WORD = re.compile(r"[a-z]{2,24}")
GROUP_WORDS = (4, 8)
OPTIONS = (2, 6)
KEY_FIELD = {"groups": "data.label", "quiz": "data.question"}  # where a clash shows: else on data.word


class Checked(NamedTuple):
    data: dict[str, Any]  # as stored: the game's fields, camelCase
    key: str  # what must be unique


class Holder(NamedTuple):
    """The item that already has a key."""

    theme_id: str
    retired: bool


def tidy(raw: str) -> str:
    """Text with its spaces made single."""
    return " ".join(raw.split())


def unknown_theme() -> ApiError:
    return invalid("theme", "Pick one of the themes.")


def key_of(data: ItemData) -> str:
    """What must be unique about an item: its word, its group's name or its question, as stored."""
    if isinstance(data, GroupData):
        return tidy(data.label).casefold()
    if isinstance(data, QuizData):
        return tidy(data.question).casefold()
    if isinstance(data, NearestData):
        return data.word.strip().lower()
    return data.word.strip().upper()


def _scope(game: str, theme: str) -> str | None:
    """Where a key must be unique: in the game (an answer word, a question, a secret word), or in the theme (a
    group's name, a word search word)."""
    return theme if game in UNIQUE_IN_THEME else None


class Lookups:
    """What an item's check reads from the database, a query at a time."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def theme(self, theme_id: str) -> DailyTheme | None:
        return self.db.get(DailyTheme, theme_id)

    def guess(self, word: str) -> bool:
        return word_game.in_guess_list(self.db, word)

    def vocabulary(self, word: str) -> bool:
        return self.db.get(DailyNearestWord, word) is not None

    def module(self, module_id: str) -> bool:
        return self.db.get(Module, module_id) is not None

    def holder(self, game: str, theme: str, key: str, item_id: uuid.UUID | None = None) -> Holder | None:
        q = select(DailyItem.theme_id, DailyItem.retired).where(DailyItem.game == game, DailyItem.key == key)
        scope = _scope(game, theme)
        if scope is not None:
            q = q.where(DailyItem.theme_id == scope)
        if item_id is not None:
            q = q.where(DailyItem.id != item_id)
        found = self.db.execute(q.limit(1)).first()
        return Holder(found.theme_id, found.retired) if found is not None else None


class Batch(Lookups):
    """Lookups read once, for checking many new items together (a paste, a content file). `add()` makes an item
    taken by the batch count for the ones after it."""

    def __init__(self, db: Session) -> None:
        super().__init__(db)
        self.themes = {t.id: t for t in db.scalars(select(DailyTheme))}
        self.guesses = set(db.scalars(select(DailyGuessWord.word)))
        self.words = set(db.scalars(select(DailyNearestWord.word)))
        self.modules = set(db.scalars(select(Module.id)))
        self.keys: dict[tuple[str, str | None, str], Holder] = {}
        for game, theme_id, key, retired in db.execute(
            select(DailyItem.game, DailyItem.theme_id, DailyItem.key, DailyItem.retired)
        ):
            self.keys.setdefault((game, _scope(game, theme_id), key), Holder(theme_id, retired))

    def theme(self, theme_id: str) -> DailyTheme | None:
        return self.themes.get(theme_id)

    def guess(self, word: str) -> bool:
        return word in self.guesses

    def vocabulary(self, word: str) -> bool:
        return word in self.words

    def module(self, module_id: str) -> bool:
        return module_id in self.modules

    def holder(self, game: str, theme: str, key: str, item_id: uuid.UUID | None = None) -> Holder | None:
        return self.keys.get((game, _scope(game, theme), key))

    def add(self, item: DailyItem) -> None:
        self.keys[(item.game, _scope(item.game, item.theme_id), item.key)] = Holder(item.theme_id, item.retired)


def known_theme(look: Lookups, theme_id: str) -> DailyTheme:
    """The theme, or 422 on `theme`."""
    theme = look.theme(theme_id)
    if theme is None:
        raise unknown_theme()
    return theme


def _check_word(look: Lookups, data: WordData) -> Checked:
    word = data.word.strip().upper()
    if not ANSWER.fullmatch(word):
        raise invalid("data.word", "Answer words are five letters, A to Z.")
    if not look.guess(word):
        raise invalid("data.word", f"“{word}” isn't in the guess list. Add it there first, so it can be guessed.")
    return Checked({"word": word}, word)


def _check_group(data: GroupData) -> Checked:
    label = tidy(data.label)
    if not 2 <= len(label) <= 60:
        raise invalid("data.label", "Say what the words share in 2 to 60 characters.")
    words = [w.strip().upper() for w in data.words if w.strip()]
    bad = next((w for w in words if not GROUP_WORD.fullmatch(w)), None)
    if bad is not None:
        raise invalid("data.words", f"Group words are 2 to 12 letters, A to Z, with no spaces: “{bad}” isn't.")
    if len(set(words)) != len(words):
        raise invalid("data.words", "Each word can be in the group once.")
    least, most = GROUP_WORDS
    if not least <= len(words) <= most:
        raise invalid("data.words", f"Give {least} to {most} words. A day shows four of them.")
    return Checked({"label": label, "level": data.level, "words": words}, label.casefold())


def _check_search(data: SearchData) -> Checked:
    word = data.word.strip().upper()
    if not SEARCH_WORD.fullmatch(word):
        least, most = search_game.MIN_LETTERS, search_game.MAX_LETTERS
        raise invalid(
            "data.word",
            f"{search_game.SearchGame.title}'s words are {least} to {most} letters, A to Z, with no spaces.",
        )
    return Checked({"word": word}, word)


def _check_quiz(look: Lookups, data: QuizData) -> Checked:
    question = tidy(data.question)
    if not 10 <= len(question) <= 200:
        raise invalid("data.question", "Write the question in 10 to 200 characters.")
    options = [tidy(o) for o in data.options]
    if not all(options):
        raise invalid("data.options", "Fill in every option, or remove the empty ones.")
    least, most = OPTIONS
    if not least <= len(options) <= most:
        raise invalid("data.options", f"Give {least} to {most} options.")
    if any(len(o) > 80 for o in options):
        raise invalid("data.options", "Keep each option to 80 characters.")
    if len({o.casefold() for o in options}) != len(options):
        raise invalid("data.options", "Make every option different, so only one of them is right.")
    if not 0 <= data.answer < len(options):
        raise invalid("data.answer", "Pick the right answer.")
    explanation = tidy(data.explanation)
    if not 1 <= len(explanation) <= 300:
        raise invalid("data.explanation", "Explain the answer in 300 characters or fewer.")
    module_id = (data.module_id or "").strip() or None
    if module_id is not None and not look.module(module_id):
        raise invalid("data.moduleId", "Pick one of the modules.")
    fields = {
        "question": question,
        "options": options,
        "answer": data.answer,
        "explanation": explanation,
        "moduleId": module_id,
    }
    return Checked(fields, question.casefold())


def _check_nearest(look: Lookups, data: NearestData) -> Checked:
    word = data.word.strip().lower()
    if not VOCABULARY_WORD.fullmatch(word):
        raise invalid("data.word", "Secret words are 2 to 24 letters, a to z.")
    if not look.vocabulary(word):
        raise invalid("data.word", f"“{word}” isn't in the vocabulary. Add it there first, with its tags.")
    return Checked({"word": word}, word)


_DUPLICATE: dict[str, Callable[[str, str], str]] = {
    "word": lambda key, where: f"“{key}” is already an answer word in {where}.",
    "groups": lambda key, where: f"{where} already has a group called “{key}”.",
    "search": lambda key, where: f"“{key}” is already a {search_game.SearchGame.title} word in {where}.",
    "quiz": lambda key, where: f"{where} already has this question.",
    "nearest": lambda key, where: f"“{key}” is already a secret word in {where}.",
}


def _check_unique(look: Lookups, game: str, theme: str, checked: Checked, item_id: uuid.UUID | None) -> None:
    other = look.holder(game, theme, checked.key, item_id)
    if other is None:
        return
    shown = checked.data.get("label") or checked.data.get("word") or checked.key
    message = _DUPLICATE[game](str(shown), known_theme(look, other.theme_id).title)
    if other.retired:
        message += " It's retired: bring it back instead."
    raise invalid(KEY_FIELD.get(game, "data.word"), message)


def check_item(look: Lookups, theme: str, data: ItemData, item_id: uuid.UUID | None = None) -> Checked:
    """The item's fields as stored, or 422 with what to fix on the field."""
    known_theme(look, theme)
    if isinstance(data, WordData):
        checked = _check_word(look, data)
    elif isinstance(data, GroupData):
        checked = _check_group(data)
    elif isinstance(data, SearchData):
        checked = _check_search(data)
    elif isinstance(data, QuizData):
        checked = _check_quiz(look, data)
    else:
        checked = _check_nearest(look, data)
    _check_unique(look, data.game, theme, checked, item_id)
    return checked
