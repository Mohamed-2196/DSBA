"""Boards: each signed-in student's private boards, columns, cards, labels, files on cards, comments to self and
revision plans. A suspended account reads its boards only."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import Query, Response, status
from fastapi.responses import RedirectResponse

from app.core.access import Feature
from app.core.security import DB, ActiveUser, CurrentUser, needs_feature
from app.routers._base import router_for
from app.schemas.board import (
    AfterId,
    Agenda,
    AttachmentCreate,
    BoardCard,
    BoardCardCreate,
    BoardCardDetail,
    BoardCardMove,
    BoardCardUpdate,
    BoardCreate,
    BoardDetail,
    BoardLabel,
    BoardLinkState,
    BoardPlanCreate,
    BoardPlanMade,
    Boards,
    BoardSummary,
    BoardUpdate,
    CardAttachment,
    CardComment,
    ColumnCreate,
    ColumnUpdate,
    CommentCreate,
    LabelCreate,
    LabelUpdate,
)
from app.services.board import boards, cards, files, plans
from app.services.board.common import column_on, get_board, get_card

router = router_for("board", needs_feature(Feature.board))

NO_CONTENT = status.HTTP_204_NO_CONTENT
FILE_CACHE = "private, max-age=240"  # the presigned link lives 300 s by default


def _summary(db: DB, user: CurrentUser, board_id: uuid.UUID) -> BoardSummary:
    return boards.summaries(db, [get_board(db, user, board_id)])[0]


# ── boards ──────────────────────────────────────────────────────────────────────────────────


@router.get("/boards", response_model=Boards)
def list_boards(user: CurrentUser, db: DB) -> Boards:
    """Every board (active ones in order, then the archived ones), the student's labels, and what they hold of
    their limits."""
    return cards.overview(db, user)


@router.post("/boards", response_model=BoardSummary, status_code=status.HTTP_201_CREATED)
def create_board(body: BoardCreate, user: ActiveUser, db: DB) -> BoardSummary:
    """A board after the others, with the template's columns. Errors: boards_full (409), rate_limited (429)."""
    board = boards.create_board(db, user, body)
    db.commit()
    return _summary(db, user, board.id)


@router.get("/boards/{board_id}", response_model=BoardDetail)
def get_board_detail(board_id: uuid.UUID, user: CurrentUser, db: DB) -> BoardDetail:
    """The board, its cards column by column, each in order, and its revision plans. Linked things are read as
    they are now; a thing that's gone has a link with no title."""
    return cards.board_detail(db, user, get_board(db, user, board_id))


@router.patch("/boards/{board_id}", response_model=BoardSummary)
def update_board(board_id: uuid.UUID, body: BoardUpdate, user: ActiveUser, db: DB) -> BoardSummary:
    """Name, emoji, colour, archived. A board back from the archive goes after the active ones."""
    boards.update_board(db, user, get_board(db, user, board_id), body)
    db.commit()
    return _summary(db, user, board_id)


@router.put("/boards/{board_id}/place", response_model=BoardSummary)
def place_board(board_id: uuid.UUID, body: AfterId, user: ActiveUser, db: DB) -> BoardSummary:
    """Among the active boards, after `afterId` or first. Errors: retry (409)."""
    boards.place_board(db, user, get_board(db, user, board_id), body)
    db.commit()
    return _summary(db, user, board_id)


@router.delete("/boards/{board_id}", status_code=NO_CONTENT)
def delete_board(board_id: uuid.UUID, user: ActiveUser, db: DB) -> Response:
    """The board with its columns, cards, comments, files and revision plans."""
    boards.delete_board(db, get_board(db, user, board_id))
    db.commit()
    return Response(status_code=NO_CONTENT)


# ── columns ─────────────────────────────────────────────────────────────────────────────────


@router.post("/boards/{board_id}/columns", response_model=BoardSummary, status_code=status.HTTP_201_CREATED)
def add_column(board_id: uuid.UUID, body: ColumnCreate, user: ActiveUser, db: DB) -> BoardSummary:
    """A column at the end of the board. Errors: limit_reached (409)."""
    boards.add_column(db, get_board(db, user, board_id), body)
    db.commit()
    return _summary(db, user, board_id)


@router.patch("/boards/{board_id}/columns/{column_id}", response_model=BoardSummary)
def update_column(
    board_id: uuid.UUID, column_id: uuid.UUID, body: ColumnUpdate, user: ActiveUser, db: DB
) -> BoardSummary:
    """Rename it, or mark it done (its cards count as done) or not."""
    column, _board = column_on(db, user, board_id, column_id)
    boards.update_column(db, column, body)
    db.commit()
    return _summary(db, user, board_id)


@router.put("/boards/{board_id}/columns/{column_id}/place", response_model=BoardSummary)
def place_column(board_id: uuid.UUID, column_id: uuid.UUID, body: AfterId, user: ActiveUser, db: DB) -> BoardSummary:
    """After the column `afterId`, or first. Errors: retry (409)."""
    column, board = column_on(db, user, board_id, column_id)
    boards.place_column(db, board, column, body)
    db.commit()
    return _summary(db, user, board_id)


@router.delete("/boards/{board_id}/columns/{column_id}", response_model=BoardSummary)
def delete_column(
    board_id: uuid.UUID,
    column_id: uuid.UUID,
    user: ActiveUser,
    db: DB,
    move_to: Annotated[uuid.UUID | None, Query(alias="moveTo")] = None,
) -> BoardSummary:
    """Deletes the column; its cards move to the end of `moveTo` first. Errors: invalid_input on moveTo when the
    column has cards and `moveTo` isn't another column of the board (422), limit_reached for the last column
    (409)."""
    column, board = column_on(db, user, board_id, column_id)
    boards.delete_column(db, board, column, move_to)
    db.commit()
    return _summary(db, user, board_id)


# ── across boards ───────────────────────────────────────────────────────────────────────────


@router.get("/board-agenda", response_model=Agenda)
def agenda(user: CurrentUser, db: DB, days: Annotated[int, Query(ge=0, le=31)] = cards.AGENDA_DAYS) -> Agenda:
    """The cards not done on the active boards that are overdue or due within `days`: by day, then time."""
    return cards.agenda(db, user, days)


@router.get("/board-links", response_model=list[BoardLinkState])
def board_links(user: CurrentUser, db: DB) -> list[BoardLinkState]:
    """Every calendar date, lesson, module and library file on the student's boards, and whether it's done."""
    return cards.link_states(db, user)


@router.post("/board-labels", response_model=BoardLabel, status_code=status.HTTP_201_CREATED)
def create_label(body: LabelCreate, user: ActiveUser, db: DB) -> BoardLabel:
    """Errors: invalid_input on name when another label has it (422), limit_reached (409)."""
    label = boards.create_label(db, user, body)
    db.commit()
    return boards.label_out(label)


@router.patch("/board-labels/{label_id}", response_model=BoardLabel)
def update_label(label_id: uuid.UUID, body: LabelUpdate, user: ActiveUser, db: DB) -> BoardLabel:
    """Errors: invalid_input on name when another label has it (422)."""
    label = boards.update_label(db, user, label_id, body)
    db.commit()
    return boards.label_out(label)


@router.delete("/board-labels/{label_id}", status_code=NO_CONTENT)
def delete_label(label_id: uuid.UUID, user: ActiveUser, db: DB) -> Response:
    """The label goes from every card."""
    boards.delete_label(db, user, label_id)
    db.commit()
    return Response(status_code=NO_CONTENT)


# ── cards ───────────────────────────────────────────────────────────────────────────────────


@router.post("/board-cards", response_model=BoardCard, status_code=status.HTTP_201_CREATED)
def create_card(body: BoardCardCreate, user: ActiveUser, db: DB) -> BoardCard:
    """A card at the end of a column: `columnId`, or the first column of `boardId`, or of the student's first board
    (made from the Study template when there's none). A lesson already watched goes to the board's first done
    column. Errors: board_full (409), already_on_board (409), invalid_input on `link.id` when the thing isn't there
    (422), rate_limited (429)."""
    card = cards.create_card(db, user, body)
    db.commit()
    return cards.card_out(db, user, card)


@router.get("/board-cards/{card_id}", response_model=BoardCardDetail)
def get_card_detail(card_id: uuid.UUID, user: CurrentUser, db: DB) -> BoardCardDetail:
    """The card with its files and comments."""
    return files.detail(db, user, get_card(db, user, card_id))


@router.patch("/board-cards/{card_id}", response_model=BoardCard)
def update_card(card_id: uuid.UUID, body: BoardCardUpdate, user: ActiveUser, db: DB) -> BoardCard:
    """Fields that are not sent stay; null clears. A checklist replaces the whole checklist. Errors: invalid_input
    on coverId when it isn't one of the card's pictures, on labelIds for a label that's gone (422)."""
    card = get_card(db, user, card_id)
    cards.update_card(db, user, card, body)
    db.commit()
    return cards.card_out(db, user, card)


@router.put("/board-cards/{card_id}/place", response_model=BoardCard)
def move_card(card_id: uuid.UUID, body: BoardCardMove, user: ActiveUser, db: DB) -> BoardCard:
    """Puts the card in a column (of any of the student's boards), after `afterId` or at the top. Errors: retry
    (409) when `afterId` is no longer in that column, already_on_board (409)."""
    card = get_card(db, user, card_id)
    cards.move_card(db, user, card, body)
    db.commit()
    return cards.card_out(db, user, card)


@router.delete("/board-cards/{card_id}", status_code=NO_CONTENT)
def delete_card(card_id: uuid.UUID, user: ActiveUser, db: DB) -> Response:
    """The card with its comments and files."""
    cards.delete_card(db, get_card(db, user, card_id))
    db.commit()
    return Response(status_code=NO_CONTENT)


@router.post("/board-cards/{card_id}/attachments", response_model=CardAttachment, status_code=status.HTTP_201_CREATED)
def attach_file(card_id: uuid.UUID, body: AttachmentCreate, user: ActiveUser, db: DB) -> CardAttachment:
    """Attaches a checked upload (purpose 'board'); the first picture becomes the cover. Errors: not_found (404),
    not_uploaded (409), limit_reached (409)."""
    out = files.attach(db, user, get_card(db, user, card_id), body.upload_id)
    db.commit()
    return out


@router.delete("/board-cards/{card_id}/attachments/{upload_id}", status_code=NO_CONTENT)
def detach_file(card_id: uuid.UUID, upload_id: uuid.UUID, user: ActiveUser, db: DB) -> Response:
    """Deletes the file. Errors: storage_unavailable (503)."""
    files.detach(db, get_card(db, user, card_id), upload_id)
    db.commit()
    return Response(status_code=NO_CONTENT)


@router.post("/board-cards/{card_id}/comments", response_model=CardComment, status_code=status.HTTP_201_CREATED)
def add_comment(card_id: uuid.UUID, body: CommentCreate, user: ActiveUser, db: DB) -> CardComment:
    """A comment to self. Errors: limit_reached (409), rate_limited (429)."""
    out = files.add_comment(db, user, get_card(db, user, card_id), body)
    db.commit()
    return out


@router.delete("/board-cards/{card_id}/comments/{comment_id}", status_code=NO_CONTENT)
def delete_comment(card_id: uuid.UUID, comment_id: uuid.UUID, user: ActiveUser, db: DB) -> Response:
    files.delete_comment(db, get_card(db, user, card_id), comment_id)
    db.commit()
    return Response(status_code=NO_CONTENT)


@router.get("/board-files/{upload_id}", response_class=RedirectResponse, status_code=status.HTTP_302_FOUND)
def open_file(upload_id: uuid.UUID, user: CurrentUser, db: DB, download: bool = False) -> RedirectResponse:
    """302 to a short-lived link to one of the student's card files: shown in the browser for pictures and PDFs
    (other files download), or, with `download`, saved under its name. 404 for anyone else."""
    url = files.file_link(db, user, upload_id, download=download)
    return RedirectResponse(url, status_code=status.HTTP_302_FOUND, headers={"Cache-Control": FILE_CACHE})


# ── revision plans ──────────────────────────────────────────────────────────────────────────


@router.post("/board-plans", response_model=BoardPlanMade)
def make_plan(body: BoardPlanCreate, user: ActiveUser, db: DB) -> BoardPlanMade:
    """Plans a module's revision up to the exam: a card for each lesson not watched yet and a past paper every few
    days, in the board's first column. Planning the module again keeps its cards and board, adds what's missing and
    takes the new date. Errors: invalid_input on `moduleId` or `examDate` (422), board_full (409), rate_limited
    (429)."""
    made = plans.make_plan(db, user, body)
    db.commit()
    return made


@router.delete("/board-plans/{module_id}", status_code=NO_CONTENT)
def delete_plan(module_id: str, user: ActiveUser, db: DB) -> Response:
    """Removes the module's plan and its cards still to do; cards done stay. Errors: not_found (404)."""
    plans.delete_plan(db, user, module_id)
    db.commit()
    return Response(status_code=NO_CONTENT)
