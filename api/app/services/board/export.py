"""The student's boards in their data export: every board with its columns and cards (labels by name, files by
name and size, comments), the labels and the revision plans."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Board, BoardCard, BoardCardLabel, BoardComment, BoardLabel, BoardPlan, Upload, UploadPurpose
from app.schemas.auth import (
    ExportBoard,
    ExportBoardCard,
    ExportBoardColumn,
    ExportBoardComment,
    ExportBoardFile,
    ExportBoardPlan,
)
from app.services.board.common import columns_of, link_key


def board_export(db: Session, uid: uuid.UUID) -> tuple[list[ExportBoard], list[str], list[ExportBoardPlan]]:
    boards = list(db.scalars(select(Board).where(Board.user_id == uid).order_by(Board.created_at)))
    columns = columns_of(db, [b.id for b in boards])
    column_names = {c.id: c.name for c in columns}
    labels = {x.id: x.name for x in db.scalars(select(BoardLabel).where(BoardLabel.user_id == uid))}
    cards = list(db.scalars(select(BoardCard).where(BoardCard.user_id == uid).order_by(BoardCard.created_at)))
    ids = [c.id for c in cards]
    card_labels: dict[uuid.UUID, list[str]] = {}
    files: dict[uuid.UUID, list[ExportBoardFile]] = {}
    comments: dict[uuid.UUID, list[ExportBoardComment]] = {}
    plans = {p.id: p for p in db.scalars(select(BoardPlan).where(BoardPlan.user_id == uid))}
    if ids:
        for card_id, label_id in db.execute(
            select(BoardCardLabel.card_id, BoardCardLabel.label_id).where(BoardCardLabel.card_id.in_(ids))
        ).tuples():
            card_labels.setdefault(card_id, []).append(labels[label_id])
        for up in db.scalars(
            select(Upload)
            .where(Upload.card_id.in_(ids), Upload.purpose == UploadPurpose.board)
            .order_by(Upload.created_at)
        ):
            if up.card_id is not None:
                files.setdefault(up.card_id, []).append(
                    ExportBoardFile(
                        file_name=up.file_name,
                        content_type=up.content_type,
                        size_bytes=up.size_bytes,
                        created_at=up.created_at,
                    )
                )
        for comment in db.scalars(
            select(BoardComment).where(BoardComment.card_id.in_(ids)).order_by(BoardComment.created_at)
        ):
            comments.setdefault(comment.card_id, []).append(
                ExportBoardComment(body=comment.body, created_at=comment.created_at)
            )

    def card(c: BoardCard) -> ExportBoardCard:
        key = link_key(c)
        return ExportBoardCard.model_validate(
            {
                "id": c.id,
                "column": column_names.get(c.column_id, ""),
                "title": c.title,
                "description": c.description,
                "due_date": c.due_date,
                "due_time": c.due_time,
                "remind_before": c.remind_before,
                "priority": c.priority,
                "labels": sorted(card_labels.get(c.id, [])),
                "checklist": c.checklist,
                "link_type": key[0] if key else None,
                "link_id": key[1] if key else None,
                "plan_module_id": plans[c.plan_id].module_id if c.plan_id in plans else None,
                "files": files.get(c.id, []),
                "comments": comments.get(c.id, []),
                "created_at": c.created_at,
                "done_at": c.done_at,
            }
        )

    out = [
        ExportBoard(
            id=b.id,
            name=b.name,
            emoji=b.emoji,
            color=b.color,
            template=b.template,
            archived_at=b.archived_at,
            created_at=b.created_at,
            columns=[ExportBoardColumn(name=c.name, done=c.done) for c in columns if c.board_id == b.id],
            cards=[card(c) for c in cards if c.board_id == b.id],
        )
        for b in boards
    ]
    plan_rows = [
        ExportBoardPlan(
            module_id=p.module_id,
            board_id=p.board_id,
            exam_date=p.exam_date,
            paper_every=p.paper_every,
            created_at=p.created_at,
        )
        for p in sorted(plans.values(), key=lambda p: p.created_at)
    ]
    return out, sorted(labels.values()), plan_rows
