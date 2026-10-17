"""Manage → Daily puzzles (holders of content.edit): the themes and their schedule, each game's items, the word
game's guess list, Nearest neighbour's vocabulary, bulk imports and a preview of any day's set. Every change is
audited; days that are out keep their puzzles."""

from __future__ import annotations

import datetime as dt
import uuid
from typing import Annotated

from fastapi import Path, Query, Request, Response, status

from app.core.access import Box, Feature
from app.core.security import DB, client_ip, needs_feature, requires
from app.models import User
from app.routers._base import router_for
from app.schemas.common import Page
from app.schemas.daily_content import (
    ContentGame,
    DailyContentOverview,
    DayPreview,
    GuessAdd,
    GuessAddReport,
    GuessList,
    ImportIn,
    ImportReport,
    ItemCreate,
    ItemOut,
    ItemSave,
    ItemStatus,
    ItemVersion,
    ThemeCreate,
    ThemeOrder,
    ThemeSave,
    VocabularyIn,
    VocabularyOut,
    VocabularySave,
    WeekSave,
)
from app.services.daily import editor as svc

router = router_for("daily-content", needs_feature(Feature.daily))
Editor = Annotated[User, requires(Box.content_edit)]
Version = Annotated[int, Query(ge=1)]
ThemeId = Annotated[str, Path(max_length=32)]
Word = Annotated[str, Path(max_length=40)]


@router.get("/content/daily", response_model=DailyContentOverview)
def overview(db: DB, _: Editor) -> DailyContentOverview:
    """The themes (the rotation first) with what each has and lacks, the weeks to come, and the lists' sizes."""
    return svc.overview(db)


# ── themes and the schedule ──────────────────────────────────────────────────────────────────


@router.post("/content/daily/themes", response_model=DailyContentOverview, status_code=status.HTTP_201_CREATED)
def create_theme(body: ThemeCreate, request: Request, user: Editor, db: DB) -> DailyContentOverview:
    """A new theme, out of the rotation. Errors: invalid_input (422), slug_taken (409)."""
    out = svc.create_theme(db, user, body, client_ip(request))
    db.commit()
    return out


@router.post("/content/daily/themes/order", response_model=DailyContentOverview)
def order_themes(body: ThemeOrder, request: Request, user: Editor, db: DB) -> DailyContentOverview:
    """The rotation in a new order; weeks that started keep their themes. Errors: puzzle_changed (409: the rotation
    changed since it was loaded)."""
    out = svc.order_themes(db, user, body, client_ip(request))
    db.commit()
    return out


@router.put("/content/daily/themes/{theme_id}", response_model=DailyContentOverview)
def save_theme(theme_id: ThemeId, body: ThemeSave, request: Request, user: Editor, db: DB) -> DailyContentOverview:
    """A theme's title, line and place in the rotation. Errors: not_found (404), invalid_input (422: the rotation
    keeps one theme), puzzle_changed (409), theme_not_ready (409: it lacks what a game needs to join)."""
    out = svc.save_theme(db, user, theme_id, body, client_ip(request))
    db.commit()
    return out


@router.delete("/content/daily/themes/{theme_id}", response_model=DailyContentOverview)
def delete_theme(theme_id: ThemeId, request: Request, user: Editor, db: DB, version: Version) -> DailyContentOverview:
    """Deletes a theme that never ran and has no items. Errors: not_found (404), puzzle_changed (409),
    content_in_use (409)."""
    out = svc.delete_theme(db, user, theme_id, version, client_ip(request))
    db.commit()
    return out


@router.put("/content/daily/weeks/{week_start}", response_model=DailyContentOverview)
def set_week(week_start: dt.date, body: WeekSave, request: Request, user: Editor, db: DB) -> DailyContentOverview:
    """Names the theme of a week to come (theme null: the rotation's turn). Errors: invalid_input (422: not a Sunday,
    a week that started, more than a year ahead, an unknown theme), theme_not_ready (409)."""
    out = svc.set_week(db, user, week_start, body, client_ip(request))
    db.commit()
    return out


# ── items ────────────────────────────────────────────────────────────────────────────────────


@router.get("/content/daily/items", response_model=Page[ItemOut])
def list_items(
    db: DB,
    _: Editor,
    game: ContentGame,
    theme: Annotated[str | None, Query(max_length=32)] = None,
    item_status: Annotated[ItemStatus, Query(alias="status")] = "active",
    q: Annotated[str, Query(max_length=100)] = "",
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Page[ItemOut]:
    """A game's items by theme and status (active, retired or all), found by any of their words; with how many
    days each ran on and the last."""
    return svc.list_items(db, game, theme, item_status, q, limit, offset)


@router.post("/content/daily/items", response_model=ItemOut, status_code=status.HTTP_201_CREATED)
def create_item(body: ItemCreate, request: Request, user: Editor, db: DB) -> ItemOut:
    """A new item. Errors: invalid_input (422, on the field: the game's rules, or one like it exists)."""
    out = svc.create_item(db, user, body, client_ip(request))
    db.commit()
    return out


@router.put("/content/daily/items/{item_id}", response_model=ItemOut)
def save_item(item_id: uuid.UUID, body: ItemSave, request: Request, user: Editor, db: DB) -> ItemOut:
    """Saves the whole item, if nobody saved it since `version`. Days that are out keep it as it was. Errors:
    not_found (404), invalid_input (422), puzzle_changed (409), theme_not_ready (409)."""
    out = svc.save_item(db, user, item_id, body, client_ip(request))
    db.commit()
    return out


@router.post("/content/daily/items/{item_id}/retire", response_model=ItemOut)
def retire_item(item_id: uuid.UUID, body: ItemVersion, request: Request, user: Editor, db: DB) -> ItemOut:
    """It never runs again; the days it ran keep it. Errors: not_found (404), puzzle_changed (409), theme_not_ready
    (409: its theme runs and would be left short)."""
    out = svc.set_retired(db, user, item_id, True, body.version, client_ip(request))
    db.commit()
    return out


@router.post("/content/daily/items/{item_id}/restore", response_model=ItemOut)
def restore_item(item_id: uuid.UUID, body: ItemVersion, request: Request, user: Editor, db: DB) -> ItemOut:
    """Brings a retired item back, checked again. Errors: not_found (404), invalid_input (422), puzzle_changed (409)."""
    out = svc.set_retired(db, user, item_id, False, body.version, client_ip(request))
    db.commit()
    return out


@router.delete("/content/daily/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(item_id: uuid.UUID, request: Request, user: Editor, db: DB, version: Version) -> Response:
    """Deletes an item that never ran. Errors: not_found (404), puzzle_changed (409), content_in_use (409: it ran;
    retire it), theme_not_ready (409)."""
    svc.delete_item(db, user, item_id, version, client_ip(request))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/content/daily/import", response_model=ImportReport)
def import_items(body: ImportIn, request: Request, user: Editor, db: DB) -> ImportReport:
    """Pasted items in bulk: a word list, or quiz questions and groups as CSV or spreadsheet rows with a header.
    `dryRun` checks each row and saves nothing; otherwise the rows that pass are added together. Errors:
    invalid_input (422: no rows, more than 500, a header that lacks a column)."""
    out = svc.import_items(db, user, body, client_ip(request))
    db.commit()
    return out


# ── the guess list and the vocabulary ────────────────────────────────────────────────────────


@router.get("/content/daily/guesses", response_model=GuessList)
def guess_list(db: DB, _: Editor, q: Annotated[str, Query(max_length=5)] = "") -> GuessList:
    """The word game's guess list: its size, and the first words starting with `q`."""
    return svc.guess_list(db, q)


@router.post("/content/daily/guesses", response_model=GuessAddReport)
def add_guesses(body: GuessAdd, request: Request, user: Editor, db: DB) -> GuessAddReport:
    """Adds pasted words to the guess list (`dryRun`: only says what would happen). Errors: invalid_input (422)."""
    out = svc.add_guesses(db, user, body, client_ip(request))
    db.commit()
    return out


@router.delete("/content/daily/guesses/{word}", status_code=status.HTTP_204_NO_CONTENT)
def remove_guess(word: Word, request: Request, user: Editor, db: DB) -> Response:
    """Takes a word off the guess list. Errors: not_found (404), content_in_use (409: an answer word, or guessed in
    a kept play)."""
    svc.remove_guess(db, user, word, client_ip(request))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/content/daily/vocabulary", response_model=Page[VocabularyOut])
def vocabulary(
    db: DB,
    _: Editor,
    q: Annotated[str, Query(max_length=40)] = "",
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Page[VocabularyOut]:
    """Nearest neighbour's words, alphabetical: those starting with `q`, or tagged with it."""
    return svc.vocabulary(db, q, limit, offset)


@router.post("/content/daily/vocabulary", response_model=VocabularyOut, status_code=status.HTTP_201_CREATED)
def add_vocabulary(body: VocabularyIn, request: Request, user: Editor, db: DB) -> VocabularyOut:
    """A new word, with its tags and close words; the secret words' rankings are worked out again. Errors:
    invalid_input (422)."""
    out = svc.add_vocabulary(db, user, body, client_ip(request))
    db.commit()
    return out


@router.put("/content/daily/vocabulary/{word}", response_model=VocabularyOut)
def save_vocabulary(word: Word, body: VocabularySave, request: Request, user: Editor, db: DB) -> VocabularyOut:
    """A word's tags and close words. Errors: not_found (404), invalid_input (422), puzzle_changed (409)."""
    out = svc.save_vocabulary(db, user, word, body, client_ip(request))
    db.commit()
    return out


@router.delete("/content/daily/vocabulary/{word}", status_code=status.HTTP_204_NO_CONTENT)
def delete_vocabulary(word: Word, request: Request, user: Editor, db: DB, version: Version) -> Response:
    """Deletes a word that isn't a secret word. Errors: not_found (404), puzzle_changed (409), content_in_use (409)."""
    svc.delete_vocabulary(db, user, word, version, client_ip(request))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── preview ──────────────────────────────────────────────────────────────────────────────────


@router.get("/content/daily/preview", response_model=DayPreview)
def preview(db: DB, _: Editor, day: dt.date) -> DayPreview:
    """A day's puzzles: as they went out for a day that's out, otherwise as the content would make them. Nothing is
    stored (only Daily's own seed, the first time it's needed). Errors: invalid_input (422: before the first day, or
    more than a year ahead)."""
    out = svc.preview(db, day)
    db.commit()
    return out
