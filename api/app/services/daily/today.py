"""Today's puzzles in Manage → Daily puzzles, and fixing them (holders of content.edit).

A day's puzzle never changes once it's out (content.py), with one exception: an editor who finds a mistake in today's
puzzle (a typo in a question, a wrong word in a group, a wrong answer) corrects the item it took, and the fix reaches
today as well as the days to come.

- The fix saves the item as an edit does (its game's rules, its version, the theme's readiness), then makes today's
  puzzle again from the same items as they are now (ContentGame.rebuild), changing only what the fix needs: a word
  fixed in a group changes that word on the board.
- The new puzzle is a new version of the day (daily_sets.revision). The one it replaces is kept for the plays finished
  on it, which keep their results and points; the plays not finished start again on the new version, and a player who
  had made moves is told why (plays.py). A guest's browser finds out on its next request, the same way.
- A dry run shows today before and after, what changes in plain words and how many plays it touches, and changes
  nothing. The fix goes to the activity log with the item before and after and what changed today.
- A game's puzzle takes MAX_FIXES fixes a day: each one starts players' games again.
Services leave the commit to the handler."""

from __future__ import annotations

import datetime as dt
import uuid
from collections.abc import Sequence
from typing import Any, cast

from sqlalchemy import CursorResult, func, select, update
from sqlalchemy.orm import Session

from app.core.errors import conflict, invalid, rate_limited
from app.core.time import bahrain_today, utcnow
from app.models import DailyItem, DailyPlay, DailySet, DailySetItem, DailySetRevision, User
from app.schemas.daily_content import (
    ContentGame,
    GroupData,
    ItemOut,
    PreviewGroups,
    PreviewNearest,
    PreviewPuzzle,
    PreviewQuestion,
    PreviewQuiz,
    PreviewSearch,
    PreviewWord,
    TodayFixIn,
    TodayFixOut,
    TodayGame,
    TodayPuzzles,
)
from app.services.content import record
from app.services.daily import content, editor
from app.services.daily.content import CantFixError, NoThemeError, NotReadyError
from app.services.daily.plays import FINISHED, next_set_at

MAX_FIXES = 5  # a day, for each game

NEW_DAY = "It's a new day, so this is yesterday's puzzle. Open today's puzzles again."
FIXED_SINCE = "Someone fixed today's puzzle after you opened it. Open it again to see their fix, then make yours."
NOT_TODAY = "Today's puzzle doesn't use this item, so saving it is enough: your change reaches the days to come."


def _taken_ids(db: Session, day: dt.date, game: str) -> list[uuid.UUID]:
    q = select(DailySetItem.item_id).where(
        DailySetItem.day == day, DailySetItem.game == game, DailySetItem.variant == ""
    )
    return list(db.scalars(q))


def _plays(db: Session, day: dt.date, game: str) -> tuple[int, int]:
    """(plays partway through, plays finished) of the day's puzzle: signed-in players'."""
    q = select(
        func.count().filter(DailyPlay.status == "playing"),
        func.count().filter(DailyPlay.status.in_(FINISHED)),
    ).where(DailyPlay.day == day, DailyPlay.game == game, DailyPlay.variant == "")
    playing, finished = db.execute(q).one()
    return int(playing), int(finished)


def _in_order(puzzle: Any, items: Sequence[DailyItem]) -> list[DailyItem]:
    """The items a day's puzzle took, in the order the puzzle shows them: groups by level, the word search's words
    alphabetical, the quiz's questions as it asks them."""
    preview = editor.preview_of(puzzle)

    def place(item: DailyItem) -> tuple[int, str]:
        if isinstance(preview, PreviewGroups):
            levels = [g.level for g in preview.groups]
            level = int(item.data["level"])
            return (levels.index(level) if level in levels else len(levels), item.key)
        if isinstance(preview, PreviewQuiz):
            prompts = [q.prompt for q in preview.questions]
            question = str(item.data["question"])
            return (prompts.index(question) if question in prompts else len(prompts), item.key)
        return (0, item.key)

    return sorted(items, key=place)


def today_puzzles(db: Session) -> TodayPuzzles:
    """Each game's puzzle today with the items it took (or, before anyone has opened it, would take) and how many
    signed-in players are partway through it or finished. Raises not_out_yet (404) while no theme runs."""
    today = bahrain_today()
    try:
        theme = content.schedule(db).theme(today)
    except NoThemeError:
        raise content.not_set_up() from None
    games: list[TodayGame] = []
    for game_id, maker in editor.MAKERS.items():
        stored = db.get(DailySet, (today, game_id, ""))
        puzzle: Any | None = None
        problem: str | None = None
        ids: list[uuid.UUID] = []
        if stored is not None:
            puzzle = maker.load(db, stored.puzzle)
            ids = _taken_ids(db, today, game_id)
        else:
            try:
                used = content.uses(db, game_id)
                chosen, puzzle = content.make(db, maker, today, theme.id, used, content.daily_seed(db))
                ids = [e.id for e in chosen]
            except NotReadyError:
                problem = editor.problem_of(game_id, content.entries(db, game_id, theme.id))
        items = list(db.scalars(select(DailyItem).where(DailyItem.id.in_(ids)))) if ids else []
        playing, finished = _plays(db, today, game_id)
        revision = stored.revision if stored is not None else 0
        games.append(
            TodayGame(
                game=cast(ContentGame, game_id),
                out=stored is not None,
                revision=revision,
                fixes_left=max(0, MAX_FIXES - revision),
                puzzle=editor.preview_of(puzzle) if puzzle is not None else None,
                problem=problem,
                items=editor.items_out(db, _in_order(puzzle, items) if puzzle is not None else items),
                playing=playing,
                finished=finished,
            )
        )
    return TodayPuzzles(day=today, theme=theme.public(), games=games)


# ── a fix ────────────────────────────────────────────────────────────────────────────────────


def fix_today(db: Session, user: User, item_id: uuid.UUID, body: TodayFixIn, ip: str | None) -> TodayFixOut:
    """Saves the item as corrected and makes today's puzzle again with it (only `body.dryRun`: shows what it would
    do). Raises not_found (404), invalid_input (422: the game's rules, a group's level, a fix today's puzzle can't
    take), puzzle_changed (409: the item or today's puzzle changed since they were loaded, a new day, or today's
    puzzle doesn't use the item), theme_not_ready (409) and rate_limited (429: the most fixes a day)."""
    today = bahrain_today()
    if body.day != today:
        raise conflict("puzzle_changed", NEW_DAY)
    item = editor.locked_item(db, item_id)
    editor.check_version(item, body.version)
    if body.data.game != item.game:
        raise invalid("data.game", "An item stays in its game.")
    game = editor.MAKERS[item.game]
    day_set = db.scalars(
        select(DailySet)
        .where(DailySet.day == today, DailySet.game == item.game, DailySet.variant == "")
        .with_for_update()  # plays of it wait (content.day_puzzle holds it FOR SHARE), and so does another fix
    ).first()
    if day_set is None or item.id not in _taken_ids(db, today, item.game):
        raise conflict("puzzle_changed", NOT_TODAY)
    if day_set.revision != body.revision:
        raise conflict("puzzle_changed", FIXED_SINCE)
    if isinstance(body.data, GroupData) and body.data.level != item.data["level"]:
        level = item.data["level"]
        raise invalid(
            "data.level",
            f"Today's board has one group a level, so a fix keeps this group at level {level}. To change its level "
            "for the days to come, save it without fixing today.",
        )
    stored = game.load(db, day_set.puzzle)
    before = content.taken(db, today, item.game)
    playing, finished = _plays(db, today, item.game)
    as_loaded = editor.item_out(db, item)

    attempt = db.begin_nested()  # undone on a dry run, and when today's puzzle can't take the fix
    try:
        saved = editor.edit_item(db, item, item.theme_id, body.data)
        fixed = game.rebuild(db, today, stored, before, content.taken(db, today, item.game), content.daily_seed(db))
        puzzle = game.dump(fixed)
        changes = describe(editor.preview_of(stored), editor.preview_of(fixed)) if puzzle != day_set.puzzle else []
        if changes and day_set.revision >= MAX_FIXES:
            title = editor.MAKERS[item.game].title
            raise rate_limited(
                int((next_set_at(today) - utcnow()).total_seconds()),
                f"{title} has been fixed {MAX_FIXES} times today, the most a day takes, because each fix starts "
                "players' games again. Save the item instead: your change reaches the days to come.",
            )
    except CantFixError as e:
        attempt.rollback()
        raise invalid(e.field, e.message) from None
    except Exception:
        attempt.rollback()
        raise
    shown = (editor.preview_of(stored), editor.preview_of(fixed))

    def result(applied: bool, item_now: ItemOut) -> TodayFixOut:
        return TodayFixOut(
            applied=applied,
            game=as_loaded.game,
            revision=day_set.revision,
            before=shown[0],
            after=shown[1],
            changes=changes,
            playing=playing,
            finished=finished,
            item=item_now,
        )

    if body.dry_run:
        attempt.rollback()
        return result(False, as_loaded)
    attempt.commit()

    item_changes = editor.what_changed(saved.before, saved.after) if saved is not None else {}
    if changes:
        db.add(
            DailySetRevision(day=today, game=item.game, variant="", revision=day_set.revision, puzzle=day_set.puzzle)
        )
        day_set.puzzle = puzzle
        day_set.revision += 1
        restarted = _restart(db, today, item.game, day_set.revision)
        record(
            db,
            user,
            "daily.today.fix",
            "daily_item",
            item.id,
            editor.label_of(item),
            ip,
            game=item.game,
            day=today.isoformat(),
            revision=day_set.revision,
            changes=changes,
            restarted=restarted,
            finished=finished,
            **item_changes,
        )
    elif saved is not None:
        record(
            db,
            user,
            "daily.item.update",
            "daily_item",
            item.id,
            editor.label_of(item),
            ip,
            game=item.game,
            **item_changes,
        )
    db.flush()
    return result(True, editor.item_out(db, item))


def _restart(db: Session, day: dt.date, game: str, revision: int) -> int:
    """Moves the plays of the fixed puzzle that aren't finished to its new version: those partway through start again,
    marked so the player is told why. Returns how many started again."""
    now = utcnow()
    of_puzzle = (DailyPlay.day == day, DailyPlay.game == game, DailyPlay.variant == "")
    again = db.execute(
        update(DailyPlay)
        .where(*of_puzzle, DailyPlay.status == "playing")
        .values(
            moves=[],
            status="new",
            mistakes=0,
            hints=0,
            revision=revision,
            restarted=True,
            started_at=now,
            updated_at=now,
        )
        .execution_options(synchronize_session=False)
    )
    db.execute(
        update(DailyPlay)
        .where(*of_puzzle, DailyPlay.status == "new")
        .values(revision=revision)
        .execution_options(synchronize_session=False)
    )
    return cast(CursorResult[Any], again).rowcount


# ── what a fix changes, in plain words ─────────────────────────────────────────────────────────


def describe(before: PreviewPuzzle, after: PreviewPuzzle) -> list[str]:
    """What changes from `before` to `after`, today's puzzle as it is and with a fix, one line a change. Never empty:
    it's asked only when the two differ."""
    lines: list[str] = []
    if isinstance(before, PreviewWord) and isinstance(after, PreviewWord):
        if before.answer != after.answer:
            lines.append(f"The answer is {after.answer}, not {before.answer}.")
    elif isinstance(before, PreviewGroups) and isinstance(after, PreviewGroups):
        for old, new in zip(before.groups, after.groups, strict=True):
            if old.label != new.label:
                lines.append(f"The level {new.level} group is “{new.label}”, not “{old.label}”.")
            lines += [
                f"{b} replaces {a} in “{new.label}”." for a, b in zip(old.words, new.words, strict=True) if a != b
            ]
    elif isinstance(before, PreviewSearch) and isinstance(after, PreviewSearch):
        gone = [w for w in before.words if w not in after.words]
        came = [w for w in after.words if w not in before.words]
        lines += [f"{b} replaces {a} in the word list." for a, b in zip(gone, came, strict=False)]
        if before.grid != after.grid:
            lines.append("The grid is laid out again, so the words sit in new places.")
    elif isinstance(before, PreviewQuiz) and isinstance(after, PreviewQuiz):
        for n, (asked, fixed) in enumerate(zip(before.questions, after.questions, strict=True), 1):
            lines += _question_changes(n, asked, fixed)
    elif isinstance(before, PreviewNearest) and isinstance(after, PreviewNearest):
        if before.target != after.target:
            lines.append(f"The secret word is “{after.target}”, not “{before.target}”.")
        elif before.closest != after.closest:
            lines.append("The words closest to the secret word change.")
    return lines or ["How close each word is to the secret word changes."]


def _question_changes(n: int, old: PreviewQuestion, new: PreviewQuestion) -> list[str]:
    lines: list[str] = []
    if old.prompt != new.prompt:
        lines.append(f"Question {n} now reads “{new.prompt}”.")
    rights = {old.options[old.answer], new.options[new.answer]}
    if len(rights) > 1:
        lines.append(f"Question {n}'s right answer is “{new.options[new.answer]}”, not “{old.options[old.answer]}”.")
    if set(old.options) - rights != set(new.options) - rights:
        lines.append(f"Question {n}'s wrong answers change.")
    if old.explain != new.explain:
        lines.append(f"Question {n}'s explanation changes.")
    if old.source != new.source:
        lines.append(f"Question {n} names {new.source}." if new.source else f"Question {n} names no module.")
    return lines
