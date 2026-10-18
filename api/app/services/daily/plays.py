"""Plays: checking and keeping moves, the day's set as the hub shows it, the calendar, streaks, badges and the
leaderboard.

Signed in, a play lives in `daily_plays` with its moves; each new move is checked by replaying the play. Today's
row is made when the person first opens the puzzle, so its clock starts then (Sudoku's at the first move: opening a
difficulty to look at it doesn't choose it). A guest's play lives in their browser, which sends its moves with each
new one; nothing is kept. A guest's play gets the game's usual feedback, but a guest's play of today's set never
shows the answers it didn't find, even once it's over. A play counts (`scored`) when it's the person's first of that
game on the puzzle's own day."""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from typing import Any

from pydantic import TypeAdapter
from sqlalchemy import Integer, and_, cast, func, select
from sqlalchemy.orm import Session

from app.core.errors import ApiError, conflict, invalid
from app.core.time import BAHRAIN, bahrain_today, utcnow
from app.models import DailyPlay, DailyProfile, User, UserStatus
from app.schemas.daily import (
    BoardPeriod,
    BoardRow,
    CalendarDay,
    DailyCalendar,
    DailyMe,
    DailyStats,
    DailyToday,
    GameDay,
    GameId,
    Leaderboard,
    Move,
    MoveIn,
    Play,
    PlayOut,
    PlayStatus,
)
from app.services import accounts, ratelimit
from app.services.daily import content
from app.services.daily.badges import badges_of
from app.services.daily.games import GAMES
from app.services.daily.games.base import Game
from app.services.daily.streaks import streak_of

MOVES = TypeAdapter(list[Move])
FINISHED = ("won", "lost")
BOARD_SIZE = 50
_RANK: dict[str, int] = {"new": 0, "playing": 1, "lost": 2, "won": 3}


def cast_status(stored: str) -> PlayStatus:
    if stored not in _RANK:
        raise ValueError(stored)
    return stored  # type: ignore[return-value]  # the database checks the column holds a PlayStatus


def game_of(game_id: GameId) -> Game[Any, Any]:
    return GAMES[game_id]


def check_day(day: dt.date) -> None:
    if day < content.FIRST_DAY or day > bahrain_today():
        raise ApiError(404, "not_out_yet", "That day's puzzles aren't out yet.")


def check_variant(game: Game[Any, Any], variant: str) -> str:
    if variant == "" and game.variants != ("",):
        return game.variants[0]
    if variant not in game.variants:
        raise invalid("variant", f"{game.title} has no “{variant}”.")
    return variant


@dataclass
class _Replay:
    state: Any
    result: str | None


def _over() -> ApiError:
    return conflict("game_over", "This puzzle is finished. Try another one.")


def _replay(game: Game[Any, Any], puzzle: Any, moves: list[Move]) -> _Replay:
    """The play after `moves`. A move after the end, or past the game's last move, is refused (a guest's history
    is whatever their browser sends)."""
    if len(moves) > game.max_moves:
        raise _over()
    state = game.start(puzzle)
    result = None
    for move in moves:
        if game.status(puzzle, state) in FINISHED:
            raise _over()
        result = game.apply(puzzle, state, move)
    return _Replay(state, result)


def _row(db: Session, user: User, day: dt.date, game: GameId, variant: str) -> DailyPlay | None:
    return db.scalar(
        select(DailyPlay).where(
            DailyPlay.user_id == user.id, DailyPlay.day == day, DailyPlay.game == game, DailyPlay.variant == variant
        )
    )


def number_of(day: dt.date) -> int:
    """The day's set number, as players count them: 1 on the first day."""
    return (day - content.FIRST_DAY).days + 1


def _scored_play(db: Session, user: User, day: dt.date, game: GameId) -> DailyPlay | None:
    return db.scalar(
        select(DailyPlay).where(
            DailyPlay.user_id == user.id, DailyPlay.day == day, DailyPlay.game == game, DailyPlay.scored
        )
    )


def _counts(db: Session, user: User | None, day: dt.date, game: GameId, row: DailyPlay | None) -> bool:
    """Whether the play counts for points: kept (signed in), on its own day, and the person's first of that game
    that day. A play not started yet says whether it would."""
    if row is not None:
        return row.scored
    if user is None or day != bahrain_today():
        return False
    return _scored_play(db, user, day, game) is None


def _seconds(row: DailyPlay | None) -> int | None:
    if row is None or row.finished_at is None:
        return None
    return int((row.finished_at - row.started_at).total_seconds())


def _play_out(
    db: Session,
    game: Game[Any, Any],
    day: dt.date,
    variant: str,
    puzzle: Any,
    replay: _Replay,
    moves: int,
    row: DailyPlay | None,
    scored: bool,
    secret: bool,
) -> PlayOut:
    """The play as its player sees it. `secret`: a guest's play of today's set, which doesn't show the answers it
    didn't find once it's over."""
    played = game.status(puzzle, replay.state)
    status: PlayStatus = played if moves else "new"
    over = moves > 0 and played in FINISHED
    seconds = _seconds(row)
    # Kept plays carry what they earned; a guest's shows what it would have earned.
    points = row.points if row else (game.points(puzzle, replay.state, variant, seconds or 0) if over else 0)
    mistakes, hints = game.counts(replay.state)
    share = f"DSBA Daily #{number_of(day)}\n{game.share(puzzle, replay.state, played)}" if over else None
    return PlayOut(
        info=game.info(),
        theme=content.theme_of(db, day),
        play=Play(
            day=day,
            number=number_of(day),
            game=game.id,
            variant=variant,
            status=status,
            scored=scored,
            points=points,
            mistakes=mistakes,
            hints=hints,
            seconds=seconds,
            too_fast=bool(row and row.too_fast),
            result=replay.result,
            share=share,
            view=game.view(puzzle, replay.state, over and not secret),
        ),
    )


def _secret(user: User | None, day: dt.date) -> bool:
    return user is None and day == bahrain_today()


def get_play(db: Session, user: User | None, day: dt.date, game_id: GameId, variant: str) -> PlayOut:
    """The play as it stands: signed in, as kept; a guest gets a fresh one (their browser replays its own). Signed
    in, the first look at one of today's puzzles makes its row, which starts its clock."""
    check_day(day)
    game = game_of(game_id)
    variant = check_variant(game, variant)
    puzzle = game.puzzle(db, day, variant)
    row = _row(db, user, day, game_id, variant) if user else None
    if user is not None and row is None and day == bahrain_today() and game.variants == ("",) and _may_play(user):
        ratelimit.lock(db, f"daily:{user.id}")  # one at a time per person, like moves
        row = _row(db, user, day, game_id, variant) or _open(db, user, game, day, variant)
    moves = MOVES.validate_python(row.moves) if row else []
    scored = _counts(db, user, day, game_id, row)
    replay = _replay(game, puzzle, moves)
    return _play_out(db, game, day, variant, puzzle, replay, len(moves), row, scored, _secret(user, day))


def _may_play(user: User) -> bool:
    """An account whose plays are kept: active, with a profile (a suspended one plays nothing it could keep)."""
    return user.status == UserStatus.active and bool(user.display_name)


def _open(db: Session, user: User, game: Game[Any, Any], day: dt.date, variant: str) -> DailyPlay:
    """A new row for a play: not started, its clock running."""
    row = DailyPlay(
        user_id=user.id,
        day=day,
        game=game.id,
        variant=variant,
        status="new",
        scored=_counts(db, user, day, game.id, None),
        started_at=utcnow(),
    )
    db.add(row)
    db.flush()
    return row


def make_move(db: Session, user: User | None, day: dt.date, game_id: GameId, body: MoveIn) -> PlayOut:
    """Checks one move against the play so far and keeps it (signed in). A move that doesn't count raises and
    changes nothing. Without a move, it only replays (a guest reopening their play)."""
    check_day(day)
    game = game_of(game_id)
    variant = check_variant(game, body.variant)
    puzzle = game.puzzle(db, day, variant)
    if user is not None:
        ratelimit.lock(db, f"daily:{user.id}")  # one move at a time per person: the scored check below races otherwise
    row = _row(db, user, day, game_id, variant) if user else None
    moves = MOVES.validate_python(row.moves) if row else ([] if user else list(body.history))
    replay = _replay(game, puzzle, moves)
    secret = _secret(user, day)
    if body.move is None:
        scored = _counts(db, user, day, game_id, row)
        return _play_out(db, game, day, variant, puzzle, replay, len(moves), row, scored, secret)
    if body.move.kind not in game.moves:
        raise invalid("move", f"{game.title} doesn't take that move.")
    if (moves and game.status(puzzle, replay.state) in FINISHED) or len(moves) >= game.max_moves:
        raise _over()
    replay.result = game.apply(puzzle, replay.state, body.move)
    moves.append(body.move)
    if user is not None:
        row = _keep(db, user, game, day, variant, puzzle, replay, moves, row)
    scored = _counts(db, user, day, game_id, row)
    return _play_out(db, game, day, variant, puzzle, replay, len(moves), row, scored, secret)


def _keep(
    db: Session,
    user: User,
    game: Game[Any, Any],
    day: dt.date,
    variant: str,
    puzzle: Any,
    replay: _Replay,
    moves: list[Move],
    row: DailyPlay | None,
) -> DailyPlay:
    now = utcnow()
    if row is None:
        row = _open(db, user, game, day, variant)
    status = game.status(puzzle, replay.state)
    row.moves = [m.model_dump(mode="json", by_alias=True) for m in moves]
    row.status = status
    row.mistakes, row.hints = game.counts(replay.state)
    row.updated_at = now
    if status in FINISHED and row.finished_at is None:  # a play is priced once, when it first finishes
        row.finished_at = now
        seconds = int((now - row.started_at).total_seconds())
        row.too_fast = status == "won" and seconds < game.min_seconds
        row.points = 0 if row.too_fast else game.points(puzzle, replay.state, variant, seconds)
    db.flush()
    return row


# ── the hub ───────────────────────────────────────────────────────────────────────────────


def next_set_at(today: dt.date) -> dt.datetime:
    return dt.datetime.combine(today + dt.timedelta(days=1), dt.time(), tzinfo=BAHRAIN)


def _played_days(db: Session, user: User) -> list[dt.date]:
    q = select(DailyPlay.day).where(DailyPlay.user_id == user.id, DailyPlay.scored, DailyPlay.status.in_(FINISHED))
    return list(db.scalars(q.distinct()))


def today_of(db: Session, user: User | None) -> DailyToday:
    today = bahrain_today()
    rows = (
        list(db.scalars(select(DailyPlay).where(DailyPlay.user_id == user.id, DailyPlay.day == today))) if user else []
    )
    games: list[GameDay] = []
    for game in GAMES.values():
        mine = [r for r in rows if r.game == game.id]
        status = max((cast_status(r.status) for r in mine), key=_RANK.__getitem__, default="new")
        # The play to open: the scored one, else the furthest (Sudoku's difficulties are plays of their own).
        lead = next((r for r in mine if r.scored), None) or max(mine, key=lambda r: _RANK[r.status], default=None)
        games.append(
            GameDay(
                info=game.info(),
                status=status,
                variant=lead.variant if lead else "",
                points=sum(r.points for r in mine if r.scored),
                scored=any(r.scored for r in mine),
            )
        )
    return DailyToday(
        day=today,
        number=number_of(today),
        first_day=content.FIRST_DAY,
        theme=content.theme_of(db, today),
        games=games,
        done=sum(g.status in FINISHED for g in games),
        points=sum(g.points for g in games),
        streak=streak_of(_played_days(db, user), today) if user else None,
        next_at=next_set_at(today),
    )


def calendar_of(db: Session, user: User | None, month: str) -> DailyCalendar:
    today = bahrain_today()
    try:
        first = dt.date.fromisoformat(f"{month}-01")
    except ValueError:
        raise invalid("month", "Months look like 2026-10.") from None
    if not content.FIRST_DAY.year <= first.year <= today.year + 1:
        raise invalid("month", "There are no puzzles in that year.")
    after = (first + dt.timedelta(days=32)).replace(day=1)
    start, end = max(first, content.FIRST_DAY), min(after - dt.timedelta(days=1), today)
    finished: dict[dt.date, set[str]] = {}
    points: dict[dt.date, int] = {}
    if user and start <= end:
        q = select(DailyPlay.day, DailyPlay.game, DailyPlay.status, DailyPlay.scored, DailyPlay.points).where(
            DailyPlay.user_id == user.id, DailyPlay.day.between(start, end)
        )
        for day, game, status, scored, earned in db.execute(q):
            if status in FINISHED:
                finished.setdefault(day, set()).add(game)
            if scored:
                points[day] = points.get(day, 0) + earned
    span = [start + dt.timedelta(days=n) for n in range((end - start).days + 1)]
    days = [
        CalendarDay(
            day=d, theme=theme, finished=[g for g in GAMES if g in finished.get(d, set())], points=points.get(d, 0)
        )
        for d, theme in zip(span, content.themes_of(db, span), strict=True)
    ]
    return DailyCalendar(month=month, total=len(GAMES), days=days)


# ── you and the leaderboard ───────────────────────────────────────────────────────────────


def _counted() -> Any:
    """Plays that count for points: scored and finished."""
    return and_(DailyPlay.scored, DailyPlay.finished_at.is_not(None))


def me_of(db: Session, user: User) -> DailyMe:
    today = bahrain_today()
    since = content.week_start(today)
    played, won, points, week = db.execute(
        select(
            func.count(),
            func.count().filter(DailyPlay.status == "won"),
            func.coalesce(func.sum(DailyPlay.points), 0),
            func.coalesce(func.sum(DailyPlay.points).filter(DailyPlay.day >= since), 0),
        ).where(DailyPlay.user_id == user.id, _counted())
    ).one()
    streak = streak_of(_played_days(db, user), today)
    profile = db.get(DailyProfile, user.id)
    return DailyMe(
        show_on_board=bool(profile and profile.show_on_board),
        stats=DailyStats(played=played, won=won, points=points, week_points=week),
        streak=streak,
        badges=badges_of(db, user, streak.best, int(points), len(GAMES)),
    )


def set_show_on_board(db: Session, user: User, show: bool) -> None:
    profile = db.get(DailyProfile, user.id)
    if profile is None:
        profile = DailyProfile(user_id=user.id)
        db.add(profile)
    profile.show_on_board = show
    profile.updated_at = utcnow()
    db.flush()


def leaderboard(db: Session, viewer: User | None, period: BoardPeriod, year: int | None) -> Leaderboard:
    """The opted-in players by points: this week's (from Sunday) or of all time, for one year or all."""
    since = content.week_start(bahrain_today()) if period == "week" else None
    where = [_counted()]
    if since is not None:
        where.append(DailyPlay.day >= since)
    totals = (
        select(
            DailyPlay.user_id.label("user_id"),
            func.sum(cast(DailyPlay.points, Integer)).label("points"),
            func.count().label("played"),
        )
        .where(*where)
        .group_by(DailyPlay.user_id)
        .subquery()
    )
    ranked_q = (
        select(
            User.id.label("user_id"),
            User.display_name.label("name"),
            totals.c.points,
            totals.c.played,
            func.rank().over(order_by=totals.c.points.desc()).label("rank"),
        )
        .join(totals, totals.c.user_id == User.id)
        .join(DailyProfile, and_(DailyProfile.user_id == User.id, DailyProfile.show_on_board))
        .where(User.status == UserStatus.active, User.display_name.is_not(None), totals.c.points > 0)
    )
    if year is not None:
        ranked_q = ranked_q.where(User.year == year)
    ranked = ranked_q.subquery()
    top = list(db.execute(select(ranked).order_by(ranked.c.rank, ranked.c.name).limit(BOARD_SIZE)))
    mine = None
    if viewer is not None:
        mine = (
            next((r for r in top if r.user_id == viewer.id), None)
            or db.execute(select(ranked).where(ranked.c.user_id == viewer.id)).first()
        )
    ids = {r.user_id for r in top} | ({mine.user_id} if mine else set())
    users = {u.id: u for u in db.scalars(select(User).where(User.id.in_(ids)))} if ids else {}
    rows = [_board_row(users[r.user_id], r.points, r.played, r.rank, viewer) for r in top]
    you = _board_row(users[mine.user_id], mine.points, mine.played, mine.rank, viewer) if mine else None
    your_points = None
    if viewer is not None:
        your_points = int(
            db.scalar(
                select(func.coalesce(func.sum(DailyPlay.points), 0)).where(*where, DailyPlay.user_id == viewer.id)
            )
            or 0
        )
    return Leaderboard(period=period, year=year, since=since, rows=rows, you=you, your_points=your_points)


def _board_row(user: User, points: int, played: int, rank: int, viewer: User | None) -> BoardRow:
    public = accounts.public_user(user)
    assert public is not None
    return BoardRow(
        rank=rank, user=public, points=int(points), played=int(played), you=viewer is not None and user.id == viewer.id
    )
