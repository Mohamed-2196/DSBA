"""The study board (R-4): each signed-in student's private cards. A suspended account reads its board only."""

from __future__ import annotations

import uuid

from fastapi import Response, status

from app.core.access import Feature
from app.core.security import DB, ActiveUser, CurrentUser, needs_feature
from app.routers._base import router_for
from app.schemas.board import Board, BoardCard, BoardCardCreate, BoardCardMove, BoardCardUpdate
from app.services import board as svc

router = router_for("board", needs_feature(Feature.board))


@router.get("/board", response_model=Board)
def get_board(user: CurrentUser, db: DB) -> Board:
    """Every card, To do first, each column in its order. Linked things are read as they are now; a thing that's
    gone has a link with no title."""
    return svc.board_of(db, user)


@router.post("/board/cards", response_model=BoardCard, status_code=status.HTTP_201_CREATED)
def create_card(body: BoardCardCreate, user: ActiveUser, db: DB) -> BoardCard:
    """A card at the end of its column; a lesson already watched goes to Done. Errors: board_full (409),
    already_on_board (409), invalid_input on `link.id` when the thing isn't there (422), rate_limited (429)."""
    card = svc.create_card(db, user, body)
    out = svc.card_out(db, user, card)
    db.commit()
    return out


@router.patch("/board/cards/{card_id}", response_model=BoardCard)
def update_card(card_id: uuid.UUID, body: BoardCardUpdate, user: ActiveUser, db: DB) -> BoardCard:
    """Fields that are not sent stay; null clears the note or the due date."""
    card = svc.get_card(db, user, card_id)
    svc.update_card(db, card, body)
    db.commit()
    return svc.card_out(db, user, card)


@router.put("/board/cards/{card_id}/place", response_model=BoardCard)
def move_card(card_id: uuid.UUID, body: BoardCardMove, user: ActiveUser, db: DB) -> BoardCard:
    """Puts the card in a column, after `afterId` or at the top. Errors: retry (409) when `afterId` is no longer
    in that column."""
    card = svc.get_card(db, user, card_id)
    svc.move_card(db, user, card, body)
    db.commit()
    return svc.card_out(db, user, card)


@router.delete("/board/cards/{card_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_card(card_id: uuid.UUID, user: ActiveUser, db: DB) -> Response:
    svc.delete_card(db, svc.get_card(db, user, card_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
