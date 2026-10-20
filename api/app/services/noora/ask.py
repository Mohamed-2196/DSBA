"""Mini Noora's AI answers: the checks before a question, the streamed answer from Claude, and the usage counts.

A question goes through, in order:
1. the key: without DSBA_ANTHROPIC_API_KEY, 503 noora_unavailable;
2. the hub's monthly budget (estimated from the tokens used this month in Bahrain), with this answer's worst case
   reserved: 503 noora_budget_reached;
3. the student's questions today: 429 noora_daily_limit until midnight in Bahrain;
4. a short gap between two questions from one student, and one answer at a time each: 429 rate_limited;
5. the answers streaming hub-wide (settings.noora_answers_at_once): 503 noora_busy.
These checks run one question at a time hub-wide (an advisory lock), so parallel questions can't pass them together.
The question is counted and its worst-case cost reserved before the answer starts. When the answer ends, the cost is
settled from Claude's usage; an answer the student dropped keeps at least its reservation, and a reservation whose
answer never settles (the process died) stays counted. A question Claude failed before a word of the answer is given
back. The answer streams asynchronously, so it holds no worker thread while it waits for Claude.

Claude thinks before it answers (adaptive thinking, at settings.noora_effort); the thinking isn't shown, and the
student sees the answer's text as it comes. When Claude's safeguards decline a question (stop reason "refusal"), the
student is told plainly, the decline is logged with its category only, and the question counts as asked.

Nothing a student asks or Noora answers is stored or logged: only the counts in noora_usage."""

from __future__ import annotations

import datetime as dt
import json
import logging
import math
import uuid
from collections.abc import AsyncGenerator
from dataclasses import dataclass
from functools import partial
from typing import Any, Literal, Protocol

import anthropic
import anyio
from anthropic.lib.streaming import AsyncMessageStream
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
from app.services import access, audit, ratelimit
from app.services.calendar import events_query
from app.services.noora import paper, prompt, settings

log = logging.getLogger("dsba.noora")

GAP_SECONDS = 3  # between two questions from one student
CACHE_WRITE_FACTOR = 1.25  # a cache write costs 1.25 times an input token
CACHE_READ_FACTOR = 0.1  # a cache read, a tenth
MICRO_PER_CENT = 10_000
CUT_OFF = "My answer was cut off. Try asking again in a minute."
DECLINED = "I can't help with that one. Try asking it another way, or ask a student rep."
CHARS_PER_TOKEN = 3  # a cautious estimate of a prompt's tokens from its characters
BYTES_PER_TOKEN = 2  # and from its UTF-8 bytes, for text of rare symbols
RATE_CARD_MARGIN = 1.5  # how far short of the real tokens a character count may fall
ANSWER_STALE = dt.timedelta(minutes=2)  # an answer still marked as streaming after this ended without settling
LOCK = "noora:answers"
# A new account's allowance (SEC-51): fresh sign-ups are free, so they ask fewer questions a day until they're a week
# old, and a crowd of them can't spend the month's budget.
NEW_ACCOUNT_DAYS = 7
NEW_ACCOUNT_QUESTIONS = 5
# A dropped answer is charged what Claude reported for the prompt and the words it streamed, plus this much thinking
# that its usage can't show yet: not the whole answer it reserved (SEC-51).
DROPPED_THINKING_TOKENS = 1_000


class MessagesClient(Protocol):
    """What Noora needs of the Anthropic client (tests pass a stand-in)."""

    @property
    def messages(self) -> anthropic.resources.AsyncMessages: ...


def make_client(settings: Settings) -> MessagesClient | None:
    """The Anthropic client, or None without a key. Tests replace this function: they never reach the network."""
    if settings.anthropic_api_key is None:
        return None
    return anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key.get_secret_value(), max_retries=1, timeout=60.0)


def unavailable() -> ApiError:
    return ApiError(503, "noora_unavailable", "Mini Noora's AI answers aren't available right now.")


def budget_reached() -> ApiError:
    return ApiError(503, "noora_budget_reached", "Mini Noora's AI answers are paused until next month.")


def busy() -> ApiError:
    return ApiError(
        503, "noora_busy", "Mini Noora is answering a lot of students right now. Try again in a minute.", retry_after=30
    )


# ── limits and usage ────────────────────────────────────────────────────────────────────────


def limits(db: Session) -> NooraLimits:
    """The one row of limits (the migrations make it)."""
    return db.get_one(NooraLimits, 1)


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
    allowed = daily_allowance(user, lim)
    left = max(0, allowed - _used_today(db, user, today))
    return NooraStatus(available=available, daily_questions=allowed, questions_left=left)


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


def prices(prompt_tokens: int, s: Settings) -> tuple[float, float]:
    """The input and output prices (US dollars per million tokens) for a prompt of this many tokens."""
    if prompt_tokens > s.noora_long_prompt_tokens:
        return s.noora_long_input_usd_per_mtok, s.noora_long_output_usd_per_mtok
    return s.noora_input_usd_per_mtok, s.noora_output_usd_per_mtok


def cost_microusd(u: Usage, s: Settings) -> int:
    """What an answer cost, estimated from its tokens and the model's list prices (per million tokens), on the rate
    card its prompt's length picks."""
    cache_write, cache_read = u.cache_creation_input_tokens or 0, u.cache_read_input_tokens or 0
    price_in, price_out = prices(u.input_tokens + cache_write + cache_read, s)
    total = (
        u.input_tokens * price_in
        + cache_write * price_in * CACHE_WRITE_FACTOR
        + cache_read * price_in * CACHE_READ_FACTOR
        + u.output_tokens * price_out
    )
    return math.ceil(total)


def estimate_microusd(system: list[TextBlockParam], messages: list[MessageParam], max_tokens: int, s: Settings) -> int:
    """The most an answer can cost: the prompt at the full input price (no cache discount), and a whole answer (its
    thinking included). The prompt's tokens are counted cautiously (_tokens()). A count can still fall short of the
    real tokens, so a prompt within RATE_CARD_MARGIN of the long-prompt line is reserved on the long rate card."""
    texts = [b["text"] for b in system] + [t for m in messages for t in _content_texts(m["content"])]
    tokens_in = sum(_tokens(t) for t in texts)
    price_in, price_out = prices(math.ceil(tokens_in * RATE_CARD_MARGIN), s)
    return math.ceil(tokens_in * price_in + max_tokens * price_out)


def _tokens(text: str) -> int:
    """A cautious count of a text's tokens: plain ASCII at CHARS_PER_TOKEN characters a token, anything else at
    BYTES_PER_TOKEN of its UTF-8 bytes, since rare symbols take several tokens a character (SEC-61)."""
    ascii_chars = sum(1 for c in text if c < "\x80")
    other_bytes = len(text.encode("utf-8")) - ascii_chars
    return math.ceil(ascii_chars / CHARS_PER_TOKEN) + math.ceil(other_bytes / BYTES_PER_TOKEN)


def _content_texts(content: object) -> list[str]:
    """A message's texts, whether it is a string or a list of blocks."""
    if isinstance(content, str):
        return [content]
    if isinstance(content, list):
        return [b["text"] for b in content if isinstance(b, dict) and isinstance(b.get("text"), str)]
    return []


def _seconds_to_midnight() -> int:
    now = utcnow().astimezone(BAHRAIN)
    midnight = dt.datetime.combine(now.date() + dt.timedelta(days=1), dt.time(), tzinfo=BAHRAIN)
    return max(1, math.ceil((midnight - now).total_seconds()))


def daily_allowance(user: User, lim: NooraLimits) -> int:
    """Questions a day: the limit admins set, or NEW_ACCOUNT_QUESTIONS while the account is under a week old."""
    if user.created_at is not None and utcnow() - user.created_at < dt.timedelta(days=NEW_ACCOUNT_DAYS):
        return min(lim.daily_questions, NEW_ACCOUNT_QUESTIONS)
    return lim.daily_questions


def _reserve(db: Session, user: User, lim: NooraLimits, today: dt.date) -> NooraUsage:
    """Counts one question for the student today, under a row lock, or refuses it."""
    db.execute(insert(NooraUsage).values(user_id=user.id, day=today).on_conflict_do_nothing())
    row = db.scalars(
        select(NooraUsage).where(NooraUsage.user_id == user.id, NooraUsage.day == today).with_for_update()
    ).one()
    allowed = daily_allowance(user, lim)
    if row.questions >= allowed:
        raise ApiError(
            429,
            "noora_daily_limit",
            f"You've asked Mini Noora {allowed} questions today. Ask again tomorrow.",
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


def _streaming(db: Session, today: dt.date, user: User | None = None) -> int:
    """Answers streaming now (to `user`, or hub-wide): marked, and not so old that they ended without settling."""
    q = select(func.count()).where(
        NooraUsage.day >= today - dt.timedelta(days=1),  # an answer may run past midnight
        NooraUsage.answering_since > utcnow() - ANSWER_STALE,
    )
    if user is not None:
        q = q.where(NooraUsage.user_id == user.id)
    return int(db.scalar(q) or 0)


# ── a question ──────────────────────────────────────────────────────────────────────────────


@dataclass
class Prepared:
    """A question that passed the checks and was counted: what to send, and where to count the answer."""

    client: MessagesClient
    model: str
    effort: Literal["low", "medium", "high"]
    max_tokens: int
    system: list[TextBlockParam]
    messages: list[MessageParam]
    usage_id: uuid.UUID
    daily_questions: int
    reserved: int  # micro-dollars added to the usage row before the answer, settled when it ends


def _screen(db: Session, user: User, body: NooraQuestion, today: dt.date) -> prompt.Screen:
    module = db.get(Module, body.module_id) if body.module_id else None
    if module is not None and module.hidden:  # hidden modules are 404 to students, and unknown to Noora
        module = None
    year = body.year or user.year
    dates = None
    if access.feature_on(db, user, Feature.calendar):
        dates = list(db.scalars(events_query(start=today, year=year).limit(prompt.CALENDAR_DATES)))
    return prompt.Screen(today=today, year=year, route=body.route, module=module, lesson_id=body.lesson_id, dates=dates)


def prepare(db: Session, user: User, body: NooraQuestion) -> Prepared:
    """Checks the question against the key, the budget and the limits, counts it, reserves its worst-case cost and
    builds the prompt. The caller commits, then streams answer()."""
    s = get_settings()
    client = make_client(s)
    if client is None:
        raise unavailable()
    asked = paper.load(db, user, body.paper) if body.paper else None
    lim, today = limits(db), bahrain_today()
    modules = list(db.scalars(select(Module).where(Module.hidden.is_(False))))
    stable = prompt.stable_block(modules, access.features_on(db, user), settings.words(db))
    system = prompt.system(stable, _screen(db, user, body, today))
    messages = prompt.messages(body.question, body.history, body.note)
    if asked is not None:
        instructions, material = paper.block(asked)
        system.append({"type": "text", "text": instructions})
        if material is not None:  # the PDFs' words go in the student's turn, not among the instructions
            last = messages[-1]
            question = last["content"] if isinstance(last["content"], str) else ""
            last["content"] = [{"type": "text", "text": material}, {"type": "text", "text": question}]
    reserved = estimate_microusd(system, messages, s.noora_max_answer_tokens, s)
    ratelimit.lock(db, LOCK)
    if month_cost_microusd(db, today) + reserved > lim.monthly_budget_cents * MICRO_PER_CENT:
        raise budget_reached()
    row = _reserve(db, user, lim, today)
    if _streaming(db, today, user):
        raise rate_limited(GAP_SECONDS, "One question at a time. Wait for Mini Noora's answer to finish.")
    if _streaming(db, today) >= s.noora_answers_at_once:
        raise busy()
    row.cost_microusd += reserved
    row.answering_since = utcnow()
    return Prepared(
        client=client,
        model=s.noora_model,
        effort=s.noora_effort,
        max_tokens=s.noora_max_answer_tokens,
        system=system,
        messages=messages,
        usage_id=row.id,
        daily_questions=daily_allowance(user, lim),
        reserved=reserved,
    )


def sse(event: NooraTextEvent | NooraDoneEvent | NooraErrorEvent) -> str:
    return f"data: {json.dumps(event.model_dump(by_alias=True), ensure_ascii=False)}\n\n"


# How an answer ended: done (complete), unanswered (Claude failed before a word: the question is given back) or cut
# (the student dropped it, or Claude failed partway: it costs at least its reservation).
Ended = Literal["done", "unanswered", "cut"]


def _charge(p: Prepared, used: Usage | None, ended: Ended, streamed_chars: int = 0) -> int:
    """What the answer is counted as costing, in micro-dollars. A cut answer's usage covers the prompt, but not yet
    the words Claude wrote before the drop: those are counted from the text streamed, plus DROPPED_THINKING_TOKENS of
    thinking, up to the whole answer reserved. Cut before Claude reported anything, it costs its reservation."""
    s = get_settings()
    known = cost_microusd(used, s) if used is not None else 0
    if ended == "done" or ended == "unanswered":
        return known
    if used is None:
        return p.reserved
    prompt_tokens = used.input_tokens + (used.cache_creation_input_tokens or 0) + (used.cache_read_input_tokens or 0)
    _, price_out = prices(prompt_tokens, s)
    written = min(p.max_tokens, math.ceil(streamed_chars / CHARS_PER_TOKEN) + DROPPED_THINKING_TOKENS)
    unreported = max(0, written - used.output_tokens)
    return max(known, min(p.reserved, known + math.ceil(unreported * price_out)))


def _settle(db: Session, p: Prepared, used: Usage | None, ended: Ended, streamed_chars: int = 0) -> int:
    """Settles the reservation with what the answer cost, adds its tokens, gives the question back if it went
    unanswered, and ends the answer's streaming mark. Returns the questions left today."""
    try:
        db.rollback()
        row = db.get(NooraUsage, p.usage_id, with_for_update=True, populate_existing=True)
        if row is None:  # the usage row is gone: nothing to count against
            db.commit()
            return 0
        if ended == "unanswered":
            row.questions = max(0, row.questions - 1)
        if used is not None:
            row.input_tokens += used.input_tokens
            row.output_tokens += used.output_tokens
            row.cache_read_tokens += used.cache_read_input_tokens or 0
            row.cache_write_tokens += used.cache_creation_input_tokens or 0
        row.cost_microusd = max(0, row.cost_microusd - p.reserved + _charge(p, used, ended, streamed_chars))
        row.answering_since = None
        left = max(0, p.daily_questions - row.questions)
        db.commit()
        return left
    except BaseException:
        db.rollback()
        raise


async def _settled(db: Session, p: Prepared, used: Usage | None, ended: Ended, streamed_chars: int = 0) -> int:
    """_settle() on a worker thread, finished even when the answer's task is being cancelled (a dropped stream)."""
    with anyio.CancelScope(shield=True):
        return await anyio.to_thread.run_sync(partial(_settle, db, p, used, ended, streamed_chars))
    raise AssertionError("unreachable: a shielded scope that isn't cancelled itself swallows nothing")


def _usage_so_far(stream: AsyncMessageStream[Any]) -> Usage | None:
    """The usage Claude reported so far (the prompt's tokens arrive before the first word), or None before any."""
    try:
        return stream.current_message_snapshot.usage
    except AssertionError:  # no event has arrived yet
        return None


async def answer(db: Session, p: Prepared) -> AsyncGenerator[str]:
    """The answer as Server-Sent Events: text pieces, then done; or error, after which the student sees what came
    with a line that it was cut off (noora_unavailable) or that she can't help with it (noora_declined: what came is
    to be dropped). The cost is settled on every way out, a dropped connection included."""
    said = False
    streamed = 0  # characters sent so far: a cut answer is charged for them
    used: Usage | None = None
    settled = False
    try:
        async with p.client.messages.stream(
            model=p.model,
            max_tokens=p.max_tokens,
            thinking={"type": "adaptive"},  # its text is omitted: the answer's text streams as Claude writes it
            output_config={"effort": p.effort},
            system=p.system,
            messages=p.messages,
        ) as stream:
            try:
                async for text in stream.text_stream:
                    said = True
                    streamed += len(text)
                    yield sse(NooraTextEvent(text=text))
                final = await stream.get_final_message()
                used = final.usage
            finally:
                if used is None:
                    used = _usage_so_far(stream)
        left = await _settled(db, p, used, "done")
        settled = True
        if final.stop_reason == "refusal":
            # A safeguard's decline, not a failure: its category only, never the question or the answer.
            category = final.stop_details.category if final.stop_details is not None else None
            log.info("Claude declined a Noora question: category %s", category)
            yield sse(NooraErrorEvent(code="noora_declined", message=DECLINED))
        elif not said:  # the whole answer went on thinking (max_tokens), or Claude ended without a word
            yield sse(NooraErrorEvent(message=CUT_OFF))
        else:
            yield sse(NooraDoneEvent(questions_left=left))
    except anthropic.APIError as e:
        # The status and the error's type only: never the question, the note or the answer.
        log.warning("Claude failed for a Noora question: %s %s", type(e).__name__, getattr(e, "status_code", ""))
        if not settled:
            await _settled(db, p, used, "cut" if said else "unanswered", streamed)
            settled = True
        yield sse(NooraErrorEvent(message=CUT_OFF if said else "Mini Noora's AI answers aren't available right now."))
    finally:
        if not settled:  # the student closed the panel, or something unexpected
            await _settled(db, p, used, "cut", streamed)
