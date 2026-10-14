"""The Sunday summary: a year's text for this week, for reps to paste into their group and admins to check."""

from __future__ import annotations

from typing import Annotated

from fastapi import Query

from app.core.access import Box, Feature
from app.core.security import DB, needs_feature, requires
from app.core.time import bahrain_today
from app.models import User
from app.routers._base import router_for
from app.schemas.common import Year
from app.schemas.summary import SummaryPreview
from app.services import summary as svc

router = router_for("summary", needs_feature(Feature.summary))


@router.get("/summary/preview", response_model=SummaryPreview)
def preview(
    user: Annotated[User, requires(Box.summary_share)], db: DB, year: Annotated[Year, Query()]
) -> SummaryPreview:
    """This week's Sunday summary for `year` (Sunday to Saturday, Bahrain time) as plain text with links, and how
    many people in that year get it by email. Nothing is sent."""
    return svc.preview(db, user, year, bahrain_today())
