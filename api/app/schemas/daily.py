"""Daily: a set of short puzzles a day, the same for everyone, released at midnight in Bahrain. Each game is a
plug-in (app/services/daily/games): the moves it takes and the view of a play it sends back are declared here."""

from __future__ import annotations

import datetime as dt
from typing import Annotated, Literal

from pydantic import Field

from app.schemas.common import ApiModel, UserPublic

GameId = Literal["word", "groups", "search", "quiz", "nearest", "sudoku"]
PlayStatus = Literal["new", "playing", "won", "lost"]
SudokuDifficulty = Literal["easy", "medium", "hard"]
BoardPeriod = Literal["week", "all"]
LetterMark = Literal["hit", "near", "miss"]  # in the word, right place / elsewhere / not in it
# A finished play's picture, square by square, in the hub's colours: hit, near and miss as The Word marks letters
# (Data Mine: found or not; Nearest Neighbour: close, warm or cold; Sudoku: a box done, done with a hint, or not), a
# wrong answer, and Correlations' four levels. Like the share text, it gives nothing away.
Mark = Literal["hit", "near", "miss", "wrong", "l1", "l2", "l3", "l4"]
Picture = list[list[Mark]]


# --- moves -------------------------------------------------------------------------------------------------------


class GuessMove(ApiModel):
    """A word: the word game's guess, or a guess at the secret word in Nearest neighbour."""

    kind: Literal["guess"]
    word: str = Field(min_length=1, max_length=24)


class GroupMove(ApiModel):
    """Four words picked as one group."""

    kind: Literal["group"]
    words: list[Annotated[str, Field(min_length=1, max_length=16)]] = Field(min_length=4, max_length=4)


class Cell(ApiModel):
    row: int = Field(ge=0, le=15)
    col: int = Field(ge=0, le=15)


class FindMove(ApiModel):
    """A straight line of letters in the word search, from its first letter to its last."""

    kind: Literal["find"]
    start: Cell
    end: Cell


class AnswerMove(ApiModel):
    """The answer to the quiz's next question: the index of an option."""

    kind: Literal["answer"]
    choice: int = Field(ge=0, le=5)


class PlaceMove(ApiModel):
    """A digit in a Sudoku cell (0-80, reading order)."""

    kind: Literal["place"]
    cell: int = Field(ge=0, le=80)
    digit: int = Field(ge=1, le=9)


class HintMove(ApiModel):
    """A hint, for a few points: Sudoku fills `cell` (or a cell it picks), the word search shows where a word
    starts, Nearest neighbour reveals a closer word."""

    kind: Literal["hint"]
    cell: int | None = Field(default=None, ge=0, le=80)


class GiveUpMove(ApiModel):
    """Ends the play as lost and shows the answer."""

    kind: Literal["give-up"]


Move = Annotated[
    GuessMove | GroupMove | FindMove | AnswerMove | PlaceMove | HintMove | GiveUpMove, Field(discriminator="kind")
]


class MoveIn(ApiModel):
    """One move. Signed in, the play is kept on the server and `history` is ignored. A guest's play lives in their
    browser: it sends the moves made so far as `history`, and nothing is saved.

    `revision` is the version of the day's puzzle the browser shows (Play.revision), and a guest's history was played
    on. When an editor fixed today's puzzle since, a move answers 409 puzzle_fixed; a guest's history that finished
    on the earlier version still shows as it finished, and one that didn't starts again on the fixed puzzle."""

    variant: str = Field(default="", max_length=12)
    move: Move | None = None  # none: only show the play (a guest reopening theirs)
    history: list[Move] = Field(default_factory=list, max_length=400)
    revision: int = Field(default=0, ge=0, le=1000)


class GuestPlayIn(ApiModel):
    """A guest's play of a day's game, kept on the account they've just signed in to: the moves their browser made
    and the version of the day's puzzle it made them on (Play.revision)."""

    variant: str = Field(default="", max_length=12)
    history: list[Move] = Field(min_length=1, max_length=400)
    revision: int = Field(default=0, ge=0, le=1000)


# --- what a play shows --------------------------------------------------------------------------------------------


class WordRow(ApiModel):
    word: str
    marks: list[LetterMark]


class WordView(ApiModel):
    kind: Literal["word"]
    length: int
    max_guesses: int
    rows: list[WordRow]
    answer: str | None  # once the play is over


class FoundGroup(ApiModel):
    label: str
    level: int  # 1 (easiest) to 4
    words: list[str]


class GroupsView(ApiModel):
    kind: Literal["groups"]
    words: list[str]  # the words still on the board, in the day's order
    found: list[FoundGroup]  # solved in order; once the play is over, every group
    mistakes_left: int
    guesses: list[list[str]]  # every group tried, to refuse a repeat in the browser
    one_away: bool  # the last try had three of a group


class SearchFound(ApiModel):
    word: str
    start: Cell
    end: Cell
    revealed: bool = False  # shown at the end of a lost play: the player didn't find it


class SearchView(ApiModel):
    kind: Literal["search"]
    grid: list[str]  # rows of letters
    words: list[str]  # the words to find, alphabetical
    found: list[SearchFound]  # once the play is over, every word
    hints: list[Cell]  # first letters shown by hints
    misses: int


class QuizQuestion(ApiModel):
    prompt: str
    options: list[str]
    source: str | None  # where a question about the hub comes from ("Modules"), or None


class QuizAnswered(ApiModel):
    choice: int
    answer: int
    correct: bool
    explain: str


class QuizView(ApiModel):
    kind: Literal["quiz"]
    questions: list[QuizQuestion]
    answered: list[QuizAnswered]


class NearestGuess(ApiModel):
    word: str
    rank: int  # 1 is the secret word; lower is closer
    hint: bool


class NearestView(ApiModel):
    kind: Literal["nearest"]
    vocabulary: int  # how many words the game knows: ranks run from 1 to this
    guesses: list[NearestGuess]  # in the order made
    answer: str | None  # once the play is over


class SudokuView(ApiModel):
    kind: Literal["sudoku"]
    difficulty: SudokuDifficulty
    givens: list[int]  # 81 cells, 0 for empty
    filled: list[int]  # 81 cells: the digits placed right (and hinted); the whole solution once the play is over
    hinted: list[int]  # cells filled by hints
    wrong: PlaceMove | None  # the last move, when it was a wrong digit


GameView = Annotated[
    WordView | GroupsView | SearchView | QuizView | NearestView | SudokuView, Field(discriminator="kind")
]


class GameInfo(ApiModel):
    """A game as the hub lists it: how to play and how it scores."""

    id: GameId
    title: str
    tagline: str
    how_to: list[str]
    scoring: str
    variants: list[str]  # Sudoku's difficulties; [""] for the others
    max_points: int


class Play(ApiModel):
    """One person's play of one game on one day, as it stands."""

    day: dt.date
    number: int  # the day's set number: 1 on the first day
    game: GameId
    variant: str
    status: PlayStatus
    # Counts for points, streaks and the leaderboard: signed in, on the puzzle's own day, and the first play of that
    # game that day. A play not started yet says whether it would.
    scored: bool
    points: int  # what it earned (scored), or would have earned
    mistakes: int
    hints: int
    seconds: int | None  # from opening today's puzzle (Sudoku: the first move) to the last move, once it's over
    result: str | None  # what the last move did: 'hit', 'miss', 'one-away', 'found', 'correct', 'wrong', ...
    share: str | None  # a result grid without spoilers, once it's over
    picture: Picture | None  # the same result in squares, once it's over
    revision: int  # the version of the day's puzzle it's on: an editor's fix to today's puzzle makes a new one
    restarted: bool  # a fix to today's puzzle started this play again; true until its next move
    view: GameView


class Theme(ApiModel):
    id: str
    title: str
    blurb: str


class PlayOut(ApiModel):
    info: GameInfo
    theme: Theme
    play: Play


class GameDay(ApiModel):
    """A game on the hub: its card, and how far the viewer got."""

    info: GameInfo
    status: PlayStatus  # Sudoku: the furthest of its difficulties
    variant: str  # the play to open: the scored one, else the furthest ("" when none, and for one-variant games)
    points: int
    scored: bool
    picture: Picture | None  # the finished play's picture (the one `variant` opens)


class Streak(ApiModel):
    current: int  # days in a row with a finished puzzle (today counts once played)
    best: int
    played_today: bool
    freeze_ready: bool  # this week's streak freeze is unused
    frozen_days: list[dt.date]  # days a freeze covered in the current streak


class DailyToday(ApiModel):
    day: dt.date
    number: int  # the day's set number: 1 on the first day
    first_day: dt.date
    theme: Theme
    games: list[GameDay]
    done: int
    points: int
    streak: Streak | None  # signed in only
    next_at: dt.datetime  # the next set comes out (midnight in Bahrain)


class CalendarDay(ApiModel):
    day: dt.date
    theme: Theme
    finished: list[GameId]  # the games you finished that day (any play, practice included), in the hub's order
    points: int  # scored points


class DailyCalendar(ApiModel):
    month: str  # 'YYYY-MM'
    total: int  # games a day
    days: list[CalendarDay]


class Badge(ApiModel):
    id: str
    title: str
    description: str
    earned: bool


class DailyStats(ApiModel):
    played: int
    won: int
    points: int
    week_points: int


class DailyMe(ApiModel):
    show_on_board: bool
    stats: DailyStats
    streak: Streak
    badges: list[Badge]


class DailyMeIn(ApiModel):
    show_on_board: bool


class BoardRow(ApiModel):
    rank: int
    user: UserPublic
    points: int
    played: int
    you: bool


class Leaderboard(ApiModel):
    period: BoardPeriod
    year: int | None
    since: dt.date | None  # the week's first day, for the weekly board
    rows: list[BoardRow]
    you: BoardRow | None  # your own place, when you're on the board; None otherwise
    your_points: int | None  # signed in: your points for the period, shown or not
