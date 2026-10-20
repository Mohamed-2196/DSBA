"""Claude tags each new past paper by itself: publishing one queues a job (queue()), and the mail worker runs the jobs
one at a time, off the request path (run_due()). Admins see every paper's job and run one again in Manage
(GET /admin/paper-tagging, POST /admin/paper-tagging/{item_id}/run, audited).

A job, in order:
1. waits while the text worker hasn't read the paper yet (no text row, or one still 'working'), for up to TEXT_WAIT;
2. is skipped, with why, when the library.autotag switch is off (on for any role counts as on), there is no
   DSBA_ANTHROPIC_API_KEY, the paper is no longer a module's published past paper, or its module has no chapters;
   the paper is published all the same, and an admin can run it again later;
3. fails, with why, when the paper has no text (a scan) or too much for one request;
4. waits for next month while the hub's monthly budget for Claude (Manage → Numbers, shared with Mini Noora's answers)
   can't take this request's worst case;
5. asks Claude (question_tagging.build_request(): the paper's pages and the chapters with their study-guide outlines;
   structured output: each question's section, number, page, first words, chapters and topics), counts what it cost in
   noora_usage (a row without a person or questions: the budget sees it, Noora's numbers don't), and saves the tags
   with question_tagging.replace_tags(): Claude's earlier tags of the paper that the new ones don't repeat go, a
   student's never, and a tag a moderator removed stays removed.
An error from the API is tried again (MAX_ATTEMPTS in all, RETRY_AFTER apart); a refusal or a reply that isn't the
schema fails at once. A job left 'working' longer than STALE (the worker died) is queued again."""

from __future__ import annotations

import logging
import uuid
from collections.abc import Callable
from contextlib import AbstractContextManager
from datetime import datetime, timedelta

import anthropic
from anthropic.types import Message
from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.core.access import Feature
from app.core.errors import conflict, not_found
from app.core.time import bahrain_today, utcnow
from app.models import (
    ItemSource,
    ItemStatus,
    LibraryItem,
    LibraryText,
    NooraUsage,
    PaperTagging,
    TaggingStatus,
    TextStatus,
    User,
)
from app.schemas.library import PAST_PAPER, PaperTaggingJob, PaperTaggingOut
from app.services import access, past_questions
from app.services import question_tagging as qt
from app.services.content import record
from app.services.library import covered
from app.services.noora import ask

log = logging.getLogger("dsba.tagging")

MAX_ATTEMPTS = 3
RETRY_AFTER = timedelta(minutes=10)
STALE = timedelta(minutes=15)
TEXT_WAIT = timedelta(days=1)  # how long a job waits for the text worker before it fails
BUDGET_WAIT = timedelta(hours=6)  # how often a job waiting for the budget looks again
LIST_MAX = 200  # jobs Manage lists

Connect = Callable[[Settings], qt.Claude | None]


def wanted(item: LibraryItem) -> bool:
    """A file that Claude may tag: a module's published past paper."""
    return (
        item.status == ItemStatus.published
        and item.kind == PAST_PAPER
        and item.module_id is not None
        and item.source == ItemSource.file
    )


def queue(db: Session, item: LibraryItem, by: User | None = None) -> bool:
    """Queues the paper's job (again), when it is one Claude may tag. Whether it did. The caller commits."""
    if not wanted(item):
        return False
    values = {
        "status": TaggingStatus.queued,
        "reason": None,
        "attempts": 0,
        "queued_by": by.id if by else None,
        "queued_at": utcnow(),
        "next_attempt_at": None,
        "started_at": None,
        "finished_at": None,
    }
    db.execute(
        insert(PaperTagging)
        .values(item_id=item.id, **values)
        .on_conflict_do_update(index_elements=[PaperTagging.item_id], set_=values)
    )
    return True


def run_again(db: Session, user: User, item_id: uuid.UUID, ip: str | None) -> PaperTagging:
    """An admin queues a paper's job again (audited). 404 for anything that isn't a published past paper; 409 while
    the job is running."""
    item = db.get(LibraryItem, item_id)
    if item is None or not wanted(item):
        raise not_found("This past paper doesn't exist or isn't published.")
    job = db.get(PaperTagging, item.id, with_for_update=True)
    if job is not None and job.status == TaggingStatus.working:
        raise conflict("tagging_running", "Claude is tagging this paper now. Check again in a minute.")
    queue(db, item, by=user)
    record(db, user, "library.tagging_run", "library_item", item.id, item.title, ip)
    db.flush()
    return db.get_one(PaperTagging, item.id, populate_existing=True)


# ── the worker ───────────────────────────────────────────────────────────────────────────────


def _requeue_stale(db: Session, now: datetime) -> None:
    """Jobs left 'working' (the worker died): queued again, or failed after MAX_ATTEMPTS."""
    stale = and_(PaperTagging.status == TaggingStatus.working, PaperTagging.started_at < now - STALE)
    db.execute(
        update(PaperTagging)
        .where(stale, PaperTagging.attempts >= MAX_ATTEMPTS)
        .values(status=TaggingStatus.failed, reason="The worker stopped while tagging it, every time.", finished_at=now)
    )
    db.execute(
        update(PaperTagging)
        .where(stale)
        .values(status=TaggingStatus.queued, reason="The worker stopped while tagging it: queued again.")
    )


def _claim(db: Session, now: datetime) -> PaperTagging | None:
    """The oldest job that is due and whose paper's text was read (or that has waited TEXT_WAIT), locked."""
    text_read = (
        select(LibraryText.item_id)
        .where(LibraryText.item_id == PaperTagging.item_id, LibraryText.status != TextStatus.working)
        .exists()
    )
    return db.scalar(
        select(PaperTagging)
        .where(
            PaperTagging.status == TaggingStatus.queued,
            or_(PaperTagging.next_attempt_at.is_(None), PaperTagging.next_attempt_at <= now),
            or_(text_read, PaperTagging.queued_at <= now - TEXT_WAIT),
        )
        .order_by(PaperTagging.queued_at)
        .limit(1)
        .with_for_update(skip_locked=True)
        .execution_options(populate_existing=True)  # queue() writes past the session's copy
    )


def _finish(job: PaperTagging, status: TaggingStatus, reason: str | None, now: datetime) -> None:
    job.status, job.reason, job.finished_at, job.next_attempt_at = status, reason, now, None


def _why_not(db: Session, item: LibraryItem | None, claude: qt.Claude | None) -> str | None:
    """Why the job is skipped, or None to go on."""
    if item is None or not wanted(item):
        return "It's no longer a module's published past paper."
    switch = access.switches(db).get(Feature.library_autotag)
    if switch is None or switch.mode == "off":
        return "The switch “Tag new past papers with Claude” is off."
    if claude is None:
        return "There is no Anthropic API key (DSBA_ANTHROPIC_API_KEY)."
    return None


def _charge(db: Session, message: Message, s: Settings) -> int:
    """What the request cost, counted toward the hub's monthly budget (a row of noora_usage without a person)."""
    u = message.usage
    cost = ask.cost_microusd(u, s)
    db.add(
        NooraUsage(
            user_id=None,
            day=bahrain_today(),
            questions=0,
            input_tokens=u.input_tokens,
            output_tokens=u.output_tokens,
            cache_read_tokens=u.cache_read_input_tokens or 0,
            cache_write_tokens=u.cache_creation_input_tokens or 0,
            cost_microusd=cost,
        )
    )
    return cost


def run_one(db: Session, connect: Connect = qt.connect, settings: Settings | None = None) -> bool:
    """Runs the next due job, if any. Whether there was one. Commits as it goes; never raises for one paper's
    trouble."""
    s = settings or get_settings()
    now = utcnow()
    _requeue_stale(db, now)
    job = _claim(db, now)
    if job is None:
        db.commit()
        return False
    item = db.get(LibraryItem, job.item_id)
    claude = connect(s)
    why = _why_not(db, item, claude)
    if why is not None:
        _finish(job, TaggingStatus.skipped, why, now)
        db.commit()
        return True
    assert item is not None
    assert claude is not None
    try:
        paper = qt.load_paper(db, item.id)
    except qt.TaggingError as e:
        status = TaggingStatus.skipped if "no chapters" in str(e) else TaggingStatus.failed
        _finish(job, status, _reason(e), now)
        db.commit()
        return True
    request = qt.build_request(paper)
    worst = ask.estimate_microusd([{"type": "text", "text": qt.SYSTEM}], list(request["messages"]), qt.MAX_TOKENS, s)
    lim = ask.limits(db)
    if ask.month_cost_microusd(db, bahrain_today()) + worst > lim.monthly_budget_cents * ask.MICRO_PER_CENT:
        job.reason = "Waiting for the monthly budget for Claude (Manage → Numbers)."
        job.next_attempt_at = now + BUDGET_WAIT
        db.commit()
        return True
    job.status, job.reason, job.started_at = TaggingStatus.working, None, now
    job.attempts += 1
    db.commit()

    try:
        message = claude.create(request)
    except anthropic.APIError as e:
        job.reason = f"The API said: {e.message}"[:200]
        if job.attempts >= MAX_ATTEMPTS:
            _finish(job, TaggingStatus.failed, job.reason, utcnow())
        else:
            job.status, job.next_attempt_at = TaggingStatus.queued, utcnow() + RETRY_AFTER * job.attempts
        db.commit()
        log.warning("tagging %s (%s): %s", item.title, item.id, job.reason)
        return True

    job.cost_microusd += _charge(db, message, s)
    job.model = message.model[:40]
    try:
        tags = qt.tags_from_message(message, paper)
        with db.begin_nested():
            qt.replace_tags(db, item.id, tags, model=job.model)
    except qt.TaggingError as e:
        _finish(job, TaggingStatus.failed, _reason(e), utcnow())
        db.commit()
        return True
    job.questions = len(tags)
    _finish(job, TaggingStatus.done, None if tags else "Claude found no questions to tag.", utcnow())
    db.commit()
    log.info("tagged %s (%s): %d questions", item.title, item.id, len(tags))
    return True


def _reason(e: Exception) -> str:
    text = str(e)
    return (text[:1].upper() + text[1:] + ".")[:200]


def run_due(sessions: Callable[[], AbstractContextManager[Session]], limit: int = 1) -> int:
    """Runs up to `limit` due jobs (the mail worker calls it each round). How many it ran."""
    ran = 0
    with sessions() as db:
        while ran < limit and run_one(db):
            ran += 1
    return ran


# ── Manage ───────────────────────────────────────────────────────────────────────────────────


def _job_out(job: PaperTagging, item: LibraryItem, covers: set[uuid.UUID]) -> PaperTaggingJob:
    return PaperTaggingJob(
        paper=past_questions.paper_ref(item, covers),
        module_id=item.module_id,
        status=job.status.value,
        reason=job.reason,
        questions=job.questions,
        model=job.model,
        attempts=job.attempts,
        cost_cents=round(job.cost_microusd / ask.MICRO_PER_CENT, 2),
        queued_at=job.queued_at,
        next_attempt_at=job.next_attempt_at,
        finished_at=job.finished_at,
    )


def overview(db: Session, status: TaggingStatus | None = None, limit: int = LIST_MAX) -> PaperTaggingOut:
    """The papers' jobs, the latest queued first (of one status, when given), and how many are in each status."""
    q = (
        select(PaperTagging, LibraryItem)
        .join(LibraryItem, LibraryItem.id == PaperTagging.item_id)
        .order_by(PaperTagging.queued_at.desc(), PaperTagging.item_id)
        .limit(limit)
    )
    if status is not None:
        q = q.where(PaperTagging.status == status)
    rows = list(db.execute(q).tuples())
    covers = covered(db, [item.id for _, item in rows])
    counts = dict.fromkeys(TaggingStatus, 0)
    for state, n in db.execute(select(PaperTagging.status, func.count()).group_by(PaperTagging.status)).tuples():
        counts[TaggingStatus(state)] = n
    switch = access.switches(db).get(Feature.library_autotag)
    return PaperTaggingOut(
        on=switch is not None and switch.mode != "off",
        configured=get_settings().anthropic_api_key is not None,
        counts={k.value: v for k, v in counts.items()},
        jobs=[_job_out(job, item, covers) for job, item in rows],
    )


def job_out(db: Session, job: PaperTagging) -> PaperTaggingJob:
    item = db.get_one(LibraryItem, job.item_id)
    return _job_out(job, item, covered(db, [item.id]))
