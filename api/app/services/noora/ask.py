"""Mini Noora's AI answers: the checks before a question, the streamed answer from Claude, and the usage counts.

A question goes through, in order:
1. the key: without DSBA_ANTHROPIC_API_KEY, 503 noora_unavailable;
2. the hub's monthly budget (estimated from the tokens used this month in Bahrain): 503 noora_budget_reached;
3. the student's questions today: 429 noora_daily_limit until midnight in Bahrain;
4. a short gap between two questions from one student: 429 rate_limited.
The question is counted before the answer starts (so parallel questions can't pass the cap together) and given back
if Claude fails before a word of the answer arrives. The tokens and the estimated cost are added when it ends.

Nothing a student asks or Noora answers is stored or logged: only the counts in noora_usage."""

from __future__ import annotations

import datetime as dt
import json
import logging
import math
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Protocol

import anthropic
from anthropic.types import MessageParam, TextBlockParam, Usage
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.core.access import Feature
from app.core.errors import ApiError, rate_limited
from app.core.time import BAHRAIN, bahrain_today, utcnow
from app.models import Module, NooraLimits, NooraUsage, User
from app.schemas.noora import (
    NooraDoneEvent,
    NooraErrorEvent,
    NooraLimitsIn,
    NooraQuestion,
    NooraStatus,
    NooraTextEvent,
    NooraTotals,
    NooraUsageOut,
)
from app.services import access, audit
from app.services.calendar import events_query
from app.services.noora import prompt

log = logging.getLogger("dsba.noora")

GAP_SECONDS = 3  # between two questions from one student
CACHE_WRITE_FACTOR = 1.25  # a cache write costs 1.25 times an input token
CACHE_READ_FACTOR = 0.1  # a cache read, a tenth
MICRO_PER_CENT = 10_000
CUT_OFF = "My answer was cut off. Try asking again in a minute."


class MessagesClient(Protocol):
    """What Noora needs of the Anthropic client (tests pass a stand-in)."""

    @property
    def messages(self) -> anthropic.resources.Messages: ...


def make_client(settings: Settings) -> MessagesClient | None:
    """The Anthropic client, or None without a key. Tests replace this function: they never reach the network."""
    if settings.anthropic_api_key is None:
        return None
    return anthropic.Anthropic(api_key=settings.anthropic_api_key.get_secret_value(), max_retries=1, timeout=60.0)


def unavailable() -> ApiError:
    return ApiError(503, "noora_unavailable", "Mini Noora's AI answers aren't available right now.")


def budget_reached() -> ApiError:
    return ApiError(503, "noora_budget_reached", "Mini Noora's AI answers are paused until next month.")


# ── limits and usage ────────────────────────────────────────────────────────────────────────


def limits(db: Session) -> NooraLimits:
    row = db.get(NooraLimits, 1)
    if row is None:  # the migration makes it; a test database emptied by hand may not have it
        row = NooraLimits(id=1)
        db.add(row)
        db.flush()
    return row


def _month_start(today: dt.date) -> dt.date:
    return today.replace(day=1)


def month_cost_microusd(db: Session, today: dt.date) -> int:
    q = select(func.coalesce(func.sum(NooraUsage.cost_microusd), 0)).where(NooraUsage.day >= _month_start(today))
    return int(db.scalar(q) or 0)


def _over_budget(db: Session, lim: NooraLimits, today: dt.date) -> bool:
    return month_cost_microusd(db, today) >= lim.monthly_budget_cents * MICRO_PER_CENT


def _used_today(db: Session, user: User, today: dt.date) -> int:
    q = select(NooraUsage.questions).where(NooraUsage.user_id == user.id, NooraUsage.day == today)
    return int(db.scalar(q) or 0)


def status(db: Session, user: User) -> NooraStatus:
    lim, today = limits(db), bahrain_today()
    available = get_settings().anthropic_api_key is not None and not _over_budget(db, lim, today)
    left = max(0, lim.daily_questions - _used_today(db, user, today))
    return NooraStatus(available=available, daily_questions=lim.daily_questions, questions_left=left)


def _totals(db: Session, since: dt.date) -> NooraTotals:
    u = NooraUsage
    row = db.execute(
        select(
            func.coalesce(func.sum(u.questions), 0),
            func.count(func.distinct(u.user_id)),
            func.coalesce(func.sum(u.input_tokens + u.cache_read_tokens + u.cache_write_tokens), 0),
            func.coalesce(func.sum(u.output_tokens), 0),
            func.coalesce(func.sum(u.cost_microusd), 0),
        ).where(u.day >= since, u.questions > 0)
    ).one()
    questions, students, tokens_in, tokens_out, cost = (int(x) for x in row)
    return NooraTotals(
        questions=questions,
        students=students,
        input_tokens=tokens_in,
        output_tokens=tokens_out,
        cost_cents=round(cost / MICRO_PER_CENT, 2),
    )


def usage(db: Session) -> NooraUsageOut:
    s, lim, today = get_settings(), limits(db), bahrain_today()
    return NooraUsageOut(
        configured=s.anthropic_api_key is not None,
        model=s.noora_model,
        daily_questions=lim.daily_questions,
        monthly_budget_cents=lim.monthly_budget_cents,
        today=_totals(db, today),
        month=_totals(db, _month_start(today)),
    )


def set_limits(db: Session, user: User, body: NooraLimitsIn, ip: str | None) -> NooraLimits:
    lim = limits(db)
    before = {"dailyQuestions": lim.daily_questions, "monthlyBudgetCents": lim.monthly_budget_cents}
    lim.daily_questions = body.daily_questions
    lim.monthly_budget_cents = body.monthly_budget_cents
    lim.updated_by, lim.updated_at = user.id, utcnow()
    after = {"dailyQuestions": lim.daily_questions, "monthlyBudgetCents": lim.monthly_budget_cents}
    audit.record(db, user, "noora.limits", data={"before": before, "after": after}, ip=ip)
    return lim


def cost_microusd(u: Usage, s: Settings) -> int:
    """What an answer cost, estimated from its tokens and the model's list prices (per million tokens)."""
    price_in, price_out = s.noora_input_usd_per_mtok, s.noora_output_usd_per_mtok
    total = (
        u.input_tokens * price_in
        + (u.cache_creation_input_tokens or 0) * price_in * CACHE_WRITE_FACTOR
        + (u.cache_read_input_tokens or 0) * price_in * CACHE_READ_FACTOR
        + u.output_tokens * price_out
    )
    return math.ceil(total)


def _seconds_to_midnight() -> int:
    now = utcnow().astimezone(BAHRAIN)
    midnight = dt.datetime.combine(now.date() + dt.timedelta(days=1), dt.time(), tzinfo=BAHRAIN)
    return max(1, math.ceil((midnight - now).total_seconds()))


def _reserve(db: Session, user: User, lim: NooraLimits, today: dt.date) -> NooraUsage:
    """Counts one question for the student today, under a row lock, or refuses it."""
    db.execute(insert(NooraUsage).values(user_id=user.id, day=today).on_conflict_do_nothing())
    row = db.scalars(
        select(NooraUsage).where(NooraUsage.user_id == user.id, NooraUsage.day == today).with_for_update()
    ).one()
    if row.questions >= lim.daily_questions:
        raise ApiError(
            429,
            "noora_daily_limit",
            f"You've asked Mini Noora {lim.daily_questions} questions today. Ask again tomorrow.",
            retry_after=_seconds_to_midnight(),
        )
    now = utcnow()
    if row.last_asked_at is not None:
        wait = GAP_SECONDS - (now - row.last_asked_at).total_seconds()
        if wait > 0:
            raise rate_limited(math.ceil(wait), "One question at a time. Try again in a moment.")
    row.questions += 1
    row.last_asked_at = now
    return row


# ── a question ──────────────────────────────────────────────────────────────────────────────


@dataclass
class Prepared:
    """A question that passed the checks and was counted: what to send, and where to count the answer."""

    client: MessagesClient
    model: str
    max_tokens: int
    system: list[TextBlockParam]
    messages: list[MessageParam]
    usage_id: object
    daily_questions: int


def _screen(db: Session, user: User, body: NooraQuestion, today: dt.date) -> prompt.Screen:
    module = db.get(Module, body.module_id) if body.module_id else None
    year = body.year or user.year
    dates = None
    if access.feature_on(db, user, Feature.calendar):
        dates = list(db.scalars(events_query(start=today, year=year).limit(prompt.CALENDAR_DATES)))
    return prompt.Screen(
        today=today, year=year, route=body.route, module=module, chapter=body.chapter, video=body.video, dates=dates
    )


def prepare(db: Session, user: User, body: NooraQuestion) -> Prepared:
    """Checks the question against the key, the budget and the limits, counts it and builds the prompt. The caller
    commits, then streams answer()."""
    s = get_settings()
    client = make_client(s)
    if client is None:
        raise unavailable()
    lim, today = limits(db), bahrain_today()
    if _over_budget(db, lim, today):
        raise budget_reached()
    row = _reserve(db, user, lim, today)
    modules = list(db.scalars(select(Module)))
    stable = prompt.stable_block(modules, access.features_on(db, user))
    return Prepared(
        client=client,
        model=s.noora_model,
        max_tokens=s.noora_max_answer_tokens,
        system=prompt.system(stable, _screen(db, user, body, today)),
        messages=prompt.messages(body.question, body.history, body.note),
        usage_id=row.id,
        daily_questions=lim.daily_questions,
    )


def sse(event: NooraTextEvent | NooraDoneEvent | NooraErrorEvent) -> str:
    return f"data: {json.dumps(event.model_dump(by_alias=True), ensure_ascii=False)}\n\n"


def _record(db: Session, p: Prepared, used: Usage | None, *, give_back: bool) -> int:
    """Adds the answer's tokens and cost to today's row (or gives the question back). Returns the questions left."""
    row = db.get(NooraUsage, p.usage_id, with_for_update=True, populate_existing=True)
    if row is None:  # the account was deleted meanwhile: nothing to count against
        db.commit()
        return 0
    if give_back:
        row.questions = max(0, row.questions - 1)
    if used is not None:
        row.input_tokens += used.input_tokens
        row.output_tokens += used.output_tokens
        row.cache_read_tokens += used.cache_read_input_tokens or 0
        row.cache_write_tokens += used.cache_creation_input_tokens or 0
        row.cost_microusd += cost_microusd(used, get_settings())
    left = max(0, p.daily_questions - row.questions)
    db.commit()
    return left


def answer(db: Session, p: Prepared) -> Iterator[str]:
    """The answer as Server-Sent Events: text pieces, then done (or error, after which the student sees what came
    with a line that it was cut off)."""
    said = False
    used: Usage | None = None
    recorded = False
    try:
        with p.client.messages.stream(
            model=p.model, max_tokens=p.max_tokens, system=p.system, messages=p.messages
        ) as stream:
            for text in stream.text_stream:
                said = True
                yield sse(NooraTextEvent(text=text))
            used = stream.get_final_message().usage
        left = _record(db, p, used, give_back=False)
        recorded = True
        yield sse(NooraDoneEvent(questions_left=left))
    except anthropic.APIError as e:
        # The status and the error's type only: never the question, the note or the answer.
        log.warning("Claude failed for a Noora question: %s %s", type(e).__name__, getattr(e, "status_code", ""))
        _record(db, p, used, give_back=not said)
        recorded = True
        yield sse(NooraErrorEvent(message=CUT_OFF if said else "Mini Noora's AI answers aren't available right now."))
    finally:
        if not recorded:  # the student closed the panel, or something unexpected: keep the count right
            db.rollback()
            _record(db, p, used, give_back=not said)
