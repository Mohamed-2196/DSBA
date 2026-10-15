"""Every daily game, in the order the hub shows them. A new game is a module here and one line in GAMES."""

from __future__ import annotations

from typing import Any

from app.schemas.daily import GameId
from app.services.daily.games.base import Game
from app.services.daily.games.groups import GroupsGame
from app.services.daily.games.nearest import NearestGame
from app.services.daily.games.quiz import QuizGame
from app.services.daily.games.search import SearchGame
from app.services.daily.games.sudoku import SudokuGame
from app.services.daily.games.word import WordGame

GAMES: dict[GameId, Game[Any, Any]] = {
    game.id: game for game in (WordGame(), GroupsGame(), SearchGame(), QuizGame(), NearestGame(), SudokuGame())
}
