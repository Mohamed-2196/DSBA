"""Each day's puzzles: made once from the day's theme and kept, the same for everyone, and never changed by editing
the content afterwards; the editor's preview of a day to come is what that day gets; groups take one group a level;
the quiz shuffles its options each day and names a question's module."""

from __future__ import annotations

import datetime as dt
from collections.abc import Callable
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.time import bahrain_today
from app.models import DailyItem, DailySet, DailySetItem, User
from app.services.daily import content
from app.services.daily.games import GAMES
from tests.daily.conftest import API

ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]
CONTENT_GAMES = ("word", "groups", "search", "quiz", "nearest")


def puzzle(db: Session, game: str, day: dt.date, variant: str = "") -> Any:
    return GAMES[game].puzzle(db, day, variant)  # type: ignore[index]


def plan(db: Session, game: str, day: dt.date, today: dt.date) -> content.Planned:
    return content.plan_day(db, GAMES[game], day, today)  # type: ignore[index, arg-type]


def test_a_day_is_made_once_kept_and_the_same_for_everyone(db: Session) -> None:
    today = bahrain_today()
    made = {(game.id, v): game.puzzle(db, today, v) for game in GAMES.values() for v in game.variants}
    db.commit()
    again = {(game.id, v): game.puzzle(db, today, v) for game in GAMES.values() for v in game.variants}
    assert again == made
    assert db.scalar(select(func.count()).select_from(DailySet).where(DailySet.day == today)) == 8  # 5 games, 3 Sudokus
    took = db.scalar(select(func.count()).select_from(DailySetItem).where(DailySetItem.day == today))
    assert took == 1 + 4 + 8 + 4 + 1  # an answer, four groups, eight words, four questions, a secret word
    theme = content.theme_of(db, today).id
    answers = {i.data["word"] for i in db.scalars(select(DailyItem).where(DailyItem.game == "word"))}
    assert puzzle(db, "word", today).answer in answers
    assert db.scalar(select(DailySet.theme_id).where(DailySet.day == today, DailySet.game == "word")) == theme


def test_editing_the_content_leaves_a_day_that_is_out_as_it_went_out(
    db: Session, client_for: ClientFor, make_user: MakeUser
) -> None:
    today = bahrain_today()
    c = client_for(make_user())
    before = {game: puzzle(db, game, today) for game in CONTENT_GAMES}
    guess = c.post(f"{API}/daily/{today}/word/moves", json={"move": {"kind": "guess", "word": "CRANE"}}).json()
    # Every item is retired and reworded.
    for item in db.scalars(select(DailyItem)):
        item.retired = True
        item.data = {**item.data, "label": "Changed", "question": "Changed?", "options": ["X", "Y"]}
    db.commit()
    assert {game: puzzle(db, game, today) for game in CONTENT_GAMES} == before
    replayed = c.get(f"{API}/daily/{today}/word").json()["play"]
    assert replayed["view"]["rows"] == guess["play"]["view"]["rows"]
    assert plan(db, "groups", today, today).fixed
    # A day still to come has nothing left to make it from.
    tomorrow = today + dt.timedelta(days=1)
    assert plan(db, "word", tomorrow, today).puzzle is None


def test_the_preview_of_a_day_to_come_is_what_that_day_gets(db: Session) -> None:
    today = bahrain_today()
    day = today + dt.timedelta(days=12)
    previews = {g: plan(db, g, day, today) for g in CONTENT_GAMES}
    assert not any(p.fixed for p in previews.values())
    for n in range(13):  # the days come, one after the other
        for g in CONTENT_GAMES:
            puzzle(db, g, today + dt.timedelta(days=n))
    assert {g: puzzle(db, g, day) for g in CONTENT_GAMES} == {g: p.puzzle for g, p in previews.items()}
    assert plan(db, "quiz", day, today).fixed


def test_groups_take_one_group_a_level_with_sixteen_different_words(db: Session) -> None:
    for n in range(14):
        p = puzzle(db, "groups", content.FIRST_DAY + dt.timedelta(days=n))
        assert [g.level for g in p.groups] == [1, 2, 3, 4]
        assert len(set(p.order)) == 16
        assert all(len(g.words) == 4 for g in p.groups)


def test_the_quiz_shuffles_its_options_each_day_and_names_a_questions_module(db: Session) -> None:
    for item in db.scalars(select(DailyItem).where(DailyItem.game == "quiz")):
        item.data = {**item.data, "moduleId": "test-module-2"}
    db.commit()
    places = set()
    for n in range(10):
        questions = puzzle(db, "quiz", content.FIRST_DAY + dt.timedelta(days=n))
        assert len(questions) == 5
        *themed, about = questions
        assert about.source == "Modules"
        for q in themed:
            assert q.source == "TS2001 Test 2"
            assert q.options[q.answer].startswith("Right")
            places.add(q.answer)
    assert len(places) > 1  # the right option isn't always in the same place


def test_two_weeks_of_puzzles_build_and_answers_run_through_before_repeating(db: Session) -> None:
    days = [content.FIRST_DAY + dt.timedelta(days=n) for n in range(14)]
    for day in days:
        for g in CONTENT_GAMES:
            game = GAMES[g]  # type: ignore[index]
            made = game.puzzle(db, day, "")
            game.view(made, game.start(made), over=True)
    for theme in ("alpha", "beta"):
        answers = [puzzle(db, "word", d).answer for d in days if content.theme_of(db, d).id == theme]
        assert len(set(answers)) == len(answers) == 7


def test_everyone_gets_the_same_puzzle(client_for: ClientFor, make_user: MakeUser) -> None:
    today = bahrain_today()
    browsers = (client_for(make_user()), client_for(make_user()), client_for())
    grids = [c.get(f"{API}/daily/{today}/search").json()["play"]["view"]["grid"] for c in browsers]
    assert grids[0] == grids[1] == grids[2]
