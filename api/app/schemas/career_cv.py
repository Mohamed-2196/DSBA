"""Rate my CV, in Career Navigator: a student's kept CVs and their ratings (app/services/career_cv.py)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import Field

from app.schemas.career import CareerId
from app.schemas.common import ApiModel


class CvCheck(ApiModel):
    """One of the checks behind the score: what it saw and, when it fell short, what to do."""

    id: str
    title: str
    earned: int
    max: int
    status: Literal["pass", "warn", "fail"]
    found: str
    tip: str | None


class CvSkill(ApiModel):
    """A skill of the role: its name and the modules that teach it."""

    id: str
    name: str
    modules: list[str]


class CvFit(ApiModel):
    """How well the CV fits a role: the share of the role's skills it names, those it names and those it doesn't."""

    role_id: str
    role_title: str
    percent: int
    found: list[CvSkill]
    missing: list[CvSkill]


class CvReviewOut(ApiModel):
    """A kept CV and its latest rating."""

    id: uuid.UUID
    file_name: str
    size_bytes: int
    created_at: datetime
    rated_at: datetime
    score: int  # out of 100
    pages: int
    words: int
    checks: list[CvCheck]
    fit: CvFit


class CvRate(ApiModel):
    """Rate a CV just uploaded (purpose 'cv', completed) against a role from Career Navigator."""

    upload_id: uuid.UUID
    role_id: CareerId


class CvRerate(ApiModel):
    """Rate a kept CV again, against this role."""

    role_id: CareerId


class CvFileLink(ApiModel):
    url: str = Field(description="A short-lived link to the file")
