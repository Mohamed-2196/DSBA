"""The Sunday summary: a year's text for this week, for reps to paste into their group and admins to check, and its
words (subject line, headings, closing line and send time), which holders of summary.share edit."""

from __future__ import annotations

from typing import Annotated

from fastapi import Request

from app.core.access import Box, Feature
from app.core.pagination import YearParam
from app.core.security import DB, client_ip, needs_feature, requires
from app.core.time import bahrain_today
from app.models import User
from app.routers._base import router_for
from app.schemas.summary import SummaryDraftPreview, SummaryEditable, SummaryPreview, SummarySave
from app.services import summary as svc

router = router_for("summary", needs_feature(Feature.summary))
Sharer = Annotated[User, requires(Box.summary_share)]


@router.get("/summary/preview", response_model=SummaryPreview)
def preview(user: Sharer, db: DB, year: YearParam) -> SummaryPreview:
    """This week's Sunday summary for `year` (Sunday to Saturday, Bahrain time) as plain text with links, and how
    many people in that year get it by email. Nothing is sent."""
    return svc.preview(db, user, year, bahrain_today())


@router.get("/summary/settings", response_model=SummaryEditable)
def summary_words(_: Sharer, db: DB) -> SummaryEditable:
    """The summary's words with the version a save names (0 until the first save)."""
    return svc.editable(db)


@router.put("/summary/settings", response_model=SummaryEditable)
def save_summary_words(body: SummarySave, request: Request, user: Sharer, db: DB) -> SummaryEditable:
    """Save the subject line, the headings, the closing line and the Sunday send time, if nobody saved them since
    `version`. Audited with what changed, before and after.

    Errors: summary_changed (409: someone saved them since: load them again), invalid_input (422: a field that
    doesn't fit, a placeholder other than {year} and {week}, a time that isn't HH:MM)."""
    out = svc.save_words(db, user, body.data, body.version, client_ip(request))
    db.commit()
    return out


@router.post("/summary/settings/preview", response_model=SummaryPreview)
def preview_summary_words(body: SummaryDraftPreview, user: Sharer, db: DB) -> SummaryPreview:
    """This week's summary for a year in a draft of the words. Nothing is saved or sent."""
    return svc.preview(db, user, body.year, bahrain_today(), body.words)
