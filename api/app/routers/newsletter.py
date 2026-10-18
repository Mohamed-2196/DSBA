"""The DSBA Newsletter. Owner: content agent."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import Request, Response, status

from app.core.access import Box, Feature
from app.core.security import DB, OptionalUser, client_ip, needs_feature, requires
from app.models import User
from app.routers._base import router_for
from app.schemas.newsletter import (
    IssueCreate,
    IssueDetail,
    IssueSummary,
    IssueUpdate,
    NewsletterSettings,
    NewsletterSettingsEditable,
    NewsletterSettingsSave,
    PollResult,
    PollVoteRequest,
    PublishedIssue,
    Reaction,
    ReactionCounts,
)
from app.services import access, polls
from app.services import newsletter as svc
from app.services import newsletter_settings as settings_svc

router = router_for("newsletter", needs_feature(Feature.newsletter))
NewsletterManager = Annotated[User, requires(Box.newsletter_manage)]
Reader = Annotated[User, requires(Box.newsletter_react)]  # reacts to issues


@router.get("/newsletter/settings", response_model=NewsletterSettings)
def newsletter_settings(db: DB) -> NewsletterSettings:
    """The line under the newsletter's name, and the pictures its editor offers."""
    return settings_svc.settings(db)


@router.get("/newsletter/settings/edit", response_model=NewsletterSettingsEditable)
def newsletter_settings_for_editing(db: DB, _: NewsletterManager) -> NewsletterSettingsEditable:
    """The settings with the version a save names (0 until the first save)."""
    return settings_svc.editable(db)


@router.put("/newsletter/settings", response_model=NewsletterSettingsEditable)
def save_newsletter_settings(
    body: NewsletterSettingsSave, request: Request, user: NewsletterManager, db: DB
) -> NewsletterSettingsEditable:
    """Save the masthead's line and the pictures the editor offers, if nobody saved them since `version`. An uploaded
    picture is kept while it's offered. Audited with what changed, before and after.

    Errors: newsletter_settings_changed (409: someone saved them since: load them again), invalid_input (422: a field
    that doesn't fit, a picture that isn't one of the newsletter's, a picture offered twice)."""
    out = settings_svc.save(db, user, body.data, body.version, client_ip(request))
    db.commit()
    return out


@router.get("/newsletter/issues", response_model=list[IssueSummary])
def list_issues(db: DB, user: OptionalUser, include_drafts: bool = False) -> list[IssueSummary]:
    """Published issues, newest first (drafts too for people who manage the newsletter and ask for them; ignored for
    everyone else)."""
    return [svc.to_summary(i) for i in svc.list_issues(db, include_drafts and access.can(user, Box.newsletter_manage))]


@router.get("/newsletter/issues/{slug}", response_model=IssueDetail)
def get_issue(slug: str, db: DB, user: OptionalUser) -> IssueDetail:
    """An issue with its sections and the reactions to each section. Drafts: for people who manage the newsletter."""
    return svc.to_detail(db, svc.get_by_slug(db, slug, user), user)


@router.post("/newsletter/issues", response_model=IssueDetail, status_code=status.HTTP_201_CREATED)
def create_issue(body: IssueCreate, request: Request, user: NewsletterManager, db: DB) -> IssueDetail:
    """A draft. Errors: slug_taken (409); invalid_input (422: the content doesn't fit the schema, a link isn't
    https://, mailto: or a page of the Hub, or the issue is over 256 KB of JSON)."""
    issue = svc.create_issue(db, user, body, client_ip(request))
    db.commit()
    return svc.to_detail(db, issue, user)


@router.patch("/newsletter/issues/{issue_id}", response_model=IssueDetail)
def update_issue(issue_id: UUID, body: IssueUpdate, request: Request, user: NewsletterManager, db: DB) -> IssueDetail:
    """Edit a draft or a published issue (fields that are not sent stay as they are; `sections` and `cover` are
    replaced as a whole). Errors: slug_taken (409), poll_has_votes (409: a poll's answers changed after it got
    votes), invalid_input (422)."""
    issue = svc.get_by_id(db, issue_id)
    svc.update_issue(db, user, issue, body, client_ip(request))
    db.commit()
    return svc.to_detail(db, issue, user)


@router.post("/newsletter/issues/{issue_id}/publish", response_model=PublishedIssue)
def publish_issue(issue_id: UUID, request: Request, user: NewsletterManager, db: DB) -> PublishedIssue:
    """Publishes the issue and tells every account in the Hub. It also goes by email to those who keep "New
    newsletter issues" on, unless an issue email went out in the last 24 hours: `emailed` says which. Audited.
    Publishing an issue that is already out changes nothing."""
    issue = svc.get_by_id(db, issue_id)
    emailed = svc.publish(db, user, issue, client_ip(request))
    db.commit()
    return PublishedIssue(**dict(svc.to_detail(db, issue, user)), emailed=emailed)


@router.delete("/newsletter/issues/{issue_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_issue(issue_id: UUID, request: Request, user: NewsletterManager, db: DB) -> Response:
    svc.delete_issue(db, user, svc.get_by_id(db, issue_id), client_ip(request))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/newsletter/issues/{issue_id}/sections/{section_id}/reactions/{reaction}", response_model=ReactionCounts)
def react(issue_id: UUID, section_id: str, reaction: Reaction, user: Reader, db: DB) -> ReactionCounts:
    """Idempotent. Published issues only. Errors: not_found (404: no such issue or section)."""
    counts = svc.set_reaction(db, user, svc.get_by_id(db, issue_id), section_id, reaction, True)
    db.commit()
    return counts


@router.delete(
    "/newsletter/issues/{issue_id}/sections/{section_id}/reactions/{reaction}", response_model=ReactionCounts
)
def unreact(issue_id: UUID, section_id: str, reaction: Reaction, user: Reader, db: DB) -> ReactionCounts:
    counts = svc.set_reaction(db, user, svc.get_by_id(db, issue_id), section_id, reaction, False)
    db.commit()
    return counts


@router.put(
    "/newsletter/issues/{issue_id}/polls/{poll_id}/vote",
    response_model=PollResult,
    dependencies=[needs_feature(Feature.newsletter_polls)],
)
def vote_in_poll(issue_id: UUID, poll_id: str, body: PollVoteRequest, user: Reader, db: DB) -> PollResult:
    """One vote per person, and it can't be changed. The counts come back with it. Published issues only.
    Errors: already_voted (409), poll_closed (409), not_found (404: no such issue or poll), invalid_input (422: no
    such answer)."""
    issue = svc.get_by_id(db, issue_id)
    result = polls.vote(db, user, issue, svc.read_sections(issue), poll_id, body.choice)
    db.commit()
    return result
