"""Polls in newsletter issues (needs the newsletter.polls feature).

A poll is a block in an issue's sections (PollBlock). Each signed-in student votes once; the vote can't be changed.
The counts show once you have voted, and to people who manage the newsletter. Votes are kept only to count them and
to stop a second vote: no response says who voted. They are in the voter's export and go with their account.

Editing an answer's text after votes came in keeps the votes on that position; a removed answer's votes stop
counting."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.access import Box, Feature
from app.core.errors import ApiError, conflict, invalid, not_found
from app.models import IssueStatus, NewsletterIssue, PollVote, User
from app.schemas.newsletter import IssueSection, PollBlock, PollResult
from app.services import access


def polls_in(sections: list[IssueSection]) -> dict[str, PollBlock]:
    """The issue's polls, by id."""
    return {b.id: b for s in sections for b in [*s.blocks, *s.after] if isinstance(b, PollBlock)}


def results(
    db: Session, issue: NewsletterIssue, user: User | None, polls: dict[str, PollBlock]
) -> dict[str, PollResult]:
    """Each poll's total, its counts when the viewer may see them, and the viewer's answer. Empty while polls are
    off for the viewer."""
    if not polls or not access.feature_on(db, user, Feature.newsletter_polls):
        return {}
    counts: dict[str, list[int]] = {pid: [0] * len(p.answers) for pid, p in polls.items()}
    rows = db.execute(
        select(PollVote.poll_id, PollVote.choice, func.count())
        .where(PollVote.issue_id == issue.id, PollVote.poll_id.in_(list(polls)))
        .group_by(PollVote.poll_id, PollVote.choice)
    ).all()
    for pid, choice, n in rows:
        if 0 <= choice < len(counts[pid]):
            counts[pid][choice] = int(n)
    mine: dict[str, int] = {}
    if user is not None:
        mine = dict(
            db.execute(
                select(PollVote.poll_id, PollVote.choice).where(
                    PollVote.issue_id == issue.id, PollVote.user_id == user.id
                )
            )
            .tuples()
            .all()
        )
    manager = access.can(user, Box.newsletter_manage)
    out: dict[str, PollResult] = {}
    for pid, c in counts.items():
        chose = mine.get(pid)
        out[pid] = PollResult(total=sum(c), counts=c if chose is not None or manager else None, mine=chose)
    return out


def vote(
    db: Session, user: User, issue: NewsletterIssue, sections: list[IssueSection], poll_id: str, choice: int
) -> PollResult:
    """One vote, once. Published issues only."""
    if issue.status != IssueStatus.published:
        if access.can(user, Box.newsletter_manage):
            raise ApiError(409, "not_published", "Voting opens when the issue is published.")
        raise not_found("This issue doesn't exist.")
    polls = polls_in(sections)
    poll = polls.get(poll_id)
    if poll is None:
        raise not_found("This poll doesn't exist.")
    if choice >= len(poll.answers):
        raise invalid("choice", "Pick one of the answers.")
    added = db.execute(
        pg_insert(PollVote)
        .values(user_id=user.id, issue_id=issue.id, poll_id=poll_id, choice=choice)
        .on_conflict_do_nothing()
        .returning(PollVote.poll_id)
    ).first()
    if added is None:
        raise conflict("already_voted", "You've already voted in this poll.")
    return results(db, issue, user, {poll_id: poll})[poll_id]
