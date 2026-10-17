"""Daily puzzles' content as Manage edits it (holders of content.edit): themes and their schedule, each game's items,
the word game's guess list and Nearest neighbour's vocabulary, bulk imports, and a preview of any day's set.

The bodies take text loosely (lengths only): the editor's rules, with messages people can act on, are checked by
app/services/daily/editor.py and reported on the field."""

from __future__ import annotations

import datetime as dt
from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field

from app.schemas.common import ApiModel
from app.schemas.daily import Theme

ContentGame = Literal["word", "groups", "search", "quiz", "nearest"]  # the games whose puzzles come from content
ItemStatus = Literal["active", "retired", "all"]

Text = Annotated[str, Field(max_length=160)]

# --- items ---------------------------------------------------------------------------------------------------------


class WordData(ApiModel):
    """The word: an answer, five letters, in the guess list."""

    game: Literal["word"]
    word: str = Field(max_length=40)


class GroupData(ApiModel):
    """Groups: what the group's words share (shown once it's found), how hard it is (1 plainest to 4 trickiest), and
    its words: four or more, a day shows four of them. No word may be in two groups of the same theme."""

    game: Literal["groups"]
    label: str = Field(max_length=120)
    level: int = Field(ge=1, le=4)
    words: list[Text] = Field(max_length=12)


class SearchData(ApiModel):
    """Word search: a word to hide in the grid, 4 to 10 letters."""

    game: Literal["search"]
    word: str = Field(max_length=40)


class QuizData(ApiModel):
    """The quiz: a question, its options (2 to 6, one of them right: `answer` is its index) and the explanation shown
    after answering. A question can name the module it comes from (`moduleId`). The options are shuffled each day."""

    game: Literal["quiz"]
    question: str = Field(max_length=400)
    options: list[Text] = Field(max_length=8)
    answer: int = Field(ge=0, le=7)
    explanation: str = Field(max_length=600)
    module_id: str | None = Field(default=None, max_length=120)


class NearestData(ApiModel):
    """Nearest neighbour: a secret word. It must be in the vocabulary."""

    game: Literal["nearest"]
    word: str = Field(max_length=40)


ItemData = Annotated[WordData | GroupData | SearchData | QuizData | NearestData, Field(discriminator="game")]


class ItemCreate(ApiModel):
    theme: str = Field(max_length=32)
    data: ItemData


class ItemSave(ItemCreate):
    """The whole item, and the version it was edited from."""

    version: int = Field(ge=1)


class ItemVersion(ApiModel):
    version: int = Field(ge=1)


class ItemOut(ApiModel):
    id: UUID
    game: ContentGame
    theme: str
    data: ItemData
    retired: bool
    version: int
    uses: int  # days it went out on
    last_used: dt.date | None
    closest: list[str] | None  # Nearest neighbour's secret words: the closest words, nearest first
    updated_at: datetime


# --- themes and the schedule ---------------------------------------------------------------------------------------


class GameCounts(ApiModel):
    """Items in use (not retired), per game."""

    word: int
    groups: int
    search: int
    quiz: int
    nearest: int


class ThemeOut(ApiModel):
    id: str
    title: str
    blurb: str
    in_rotation: bool
    position: int
    version: int
    counts: GameCounts
    problems: list[str]  # what it needs before it can run ("Groups need a group at level 4."); empty when ready
    used: bool  # it has run: it can't be deleted


class WeekOut(ApiModel):
    week_start: dt.date  # a Sunday
    theme: str
    pinned: bool  # chosen for this week; otherwise the rotation's turn
    started: bool  # this week or an earlier one: its theme can't change


class DailyContentOverview(ApiModel):
    today: dt.date
    first_day: dt.date
    themes: list[ThemeOut]  # the rotation in order, then the themes out of it
    weeks: list[WeekOut]  # this week and the next ones
    guess_words: int
    vocabulary_words: int
    tags: list[str]  # every tag the vocabulary uses, alphabetical


class ThemeCreate(ApiModel):
    id: str = Field(max_length=40)  # lower-case letters, digits and hyphens; never changes
    title: str = Field(max_length=120)
    blurb: str = Field(default="", max_length=400)


class ThemeSave(ApiModel):
    title: str = Field(max_length=120)
    blurb: str = Field(default="", max_length=400)
    in_rotation: bool
    version: int = Field(ge=1)


class ThemeOrder(ApiModel):
    """The themes in the rotation, in their new order."""

    ids: list[Annotated[str, Field(max_length=32)]] = Field(max_length=100)


class WeekSave(ApiModel):
    """The theme for a week to come, or null to follow the rotation."""

    theme: str | None = Field(default=None, max_length=32)


# --- bulk import ---------------------------------------------------------------------------------------------------


class ImportIn(ApiModel):
    """Items pasted in bulk. Word lists (the word, word search, Nearest neighbour's secret words): words separated
    by new lines, commas or spaces. Quiz questions and groups: CSV or a spreadsheet's rows, with a header row (the
    editor shows the columns). `dryRun` checks every row and saves nothing. `addGuesses` (the word only) adds the
    answer words to the guess list too."""

    game: ContentGame
    theme: str = Field(max_length=32)
    text: str = Field(max_length=200_000)
    dry_run: bool = False
    add_guesses: bool = False


class ImportRow(ApiModel):
    line: int  # where it was in the pasted text, from 1
    text: str  # the row as read, shortened
    data: ItemData | None  # what it reads as, when it does
    problem: str | None  # why it can't be added (None: it can)


class ImportReport(ApiModel):
    rows: list[ImportRow]
    added: int  # 0 on a dry run


# --- the word game's guess list ------------------------------------------------------------------------------------


class GuessList(ApiModel):
    total: int  # words in the list
    words: list[str]  # the first words starting with the query, alphabetical
    more: bool  # more words start with it


class GuessAdd(ApiModel):
    text: str = Field(max_length=200_000)  # words separated by new lines, commas or spaces
    dry_run: bool = False


class GuessAddReport(ApiModel):
    new: list[str]  # added (or, on a dry run, would be)
    known: list[str]  # already in the list
    refused: list[str]  # not five letters A to Z
    total: int


# --- Nearest neighbour's vocabulary --------------------------------------------------------------------------------


class VocabularyIn(ApiModel):
    word: str = Field(max_length=40)
    tags: list[Annotated[str, Field(max_length=40)]] = Field(max_length=12)
    near: list[Annotated[str, Field(max_length=40)]] = Field(default_factory=list, max_length=12)


class VocabularySave(ApiModel):
    tags: list[Annotated[str, Field(max_length=40)]] = Field(max_length=12)
    near: list[Annotated[str, Field(max_length=40)]] = Field(default_factory=list, max_length=12)
    version: int = Field(ge=1)


class VocabularyOut(ApiModel):
    word: str
    tags: list[str]
    near: list[str]  # words listed as close to this one (closeness works both ways)
    secret_in: str | None  # the theme it is a secret word in, if it is one
    version: int
    updated_at: datetime


# --- preview -------------------------------------------------------------------------------------------------------


class PreviewWord(ApiModel):
    game: Literal["word"]
    answer: str


class PreviewGroup(ApiModel):
    label: str
    level: int
    words: list[str]


class PreviewGroups(ApiModel):
    game: Literal["groups"]
    groups: list[PreviewGroup]  # easiest first, four words each


class PreviewSearch(ApiModel):
    game: Literal["search"]
    words: list[str]
    grid: list[str]


class PreviewQuestion(ApiModel):
    prompt: str
    options: list[str]
    answer: int
    explain: str
    source: str | None


class PreviewQuiz(ApiModel):
    game: Literal["quiz"]
    questions: list[PreviewQuestion]


class PreviewNearest(ApiModel):
    game: Literal["nearest"]
    target: str
    closest: list[str]  # the closest words, nearest first


PreviewPuzzle = Annotated[
    PreviewWord | PreviewGroups | PreviewSearch | PreviewQuiz | PreviewNearest, Field(discriminator="game")
]


class PreviewGame(ApiModel):
    game: ContentGame
    fixed: bool  # the day is out: this is the puzzle as it went out, and it won't change
    puzzle: PreviewPuzzle | None
    problem: str | None  # why there's no puzzle (the theme isn't ready for this game)


class DayPreview(ApiModel):
    day: dt.date
    theme: Theme
    games: list[PreviewGame]
