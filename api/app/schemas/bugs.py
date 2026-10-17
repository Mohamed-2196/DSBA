"""Bug reports: anyone tells the admins what went wrong, and admins mark each one fixed or won't fix."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import StringConstraints

from app.schemas.common import ApiModel, Page, UserPublic

BugStatus = Literal["open", "fixed", "wont_fix"]


class BugReportCreate(ApiModel):
    """`pageUrl` is the page the person was on: a path inside the app ('/library/abc?x=1'), or the app's full
    address, which is cut down to its path."""

    what_happened: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
    expected: Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)] = ""
    page_url: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
    app_version: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]
    browser: Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)] = ""
    screenshot_upload_id: UUID | None = None  # a bug_screenshot upload of the reporter's (signed in only)


class BugReportCreated(ApiModel):
    id: UUID


class BugReportOut(ApiModel):
    id: UUID
    created_at: datetime
    status: BugStatus
    what_happened: str
    expected: str
    page_url: str
    app_version: str
    browser: str
    reporter: UserPublic | None  # None: a guest
    screenshot_url: str | None  # '/api/v1/media/<upload id>'
    resolved_at: datetime | None
    resolved_by: UserPublic | None


class BugReportUpdate(ApiModel):
    status: BugStatus


class BugReportPage(Page[BugReportOut]):
    open_count: int  # every open report, whatever the filter


class ExportBugReport(ApiModel):
    """A bug report the person sent, in their data download (GET /me/export)."""

    id: UUID
    created_at: datetime
    status: BugStatus
    what_happened: str
    expected: str
    page_url: str
    app_version: str
    browser: str
    screenshot: str | None  # the attached screenshot's file name
    resolved_at: datetime | None
