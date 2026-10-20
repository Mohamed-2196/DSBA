"""Security review, round 16: Mini Noora's monthly budget is one pool that any number of fresh accounts draw from.

Proof for the finding in docs/reviews/security.md (pre-launch audit): each account may ask `daily_questions` (30) a
day, a question the asker drops at once is charged its whole worst-case reservation, and nothing limits questions per
address or per new account. So a few hours of sign-ups from one address spend the month's budget, and Noora's AI
answers stop for every student until the next month."""

from __future__ import annotations

import math
from collections.abc import Callable

import anyio
import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.core.time import bahrain_today
from app.models import NooraUsage, User
from app.schemas.noora import HISTORY_MAX, NOTE_MAX, QUESTION_MAX, TURN_MAX, NooraNote, NooraQuestion, NooraTurn
from app.services.noora import ask
from tests.noora.conftest import FakeClient

MakeUser = Callable[..., User]
SIGN_UPS_PER_HOUR_PER_ADDRESS = 30  # DSBA_OTP_MAX_PER_IP_PER_HOUR's default: a fresh account needs one code


def _largest_question() -> NooraQuestion:
    """The biggest question the schema allows: the longest reservation."""
    history = [NooraTurn(role="student" if i % 2 == 0 else "noora", text="x" * TURN_MAX) for i in range(HISTORY_MAX)]
    return NooraQuestion(question="q" * QUESTION_MAX, note=NooraNote(title="n", body="n" * NOTE_MAX), history=history)


def _ask_and_drop(db: Session, user: User) -> int:
    p = ask.prepare(db, user, _largest_question())
    db.commit()

    async def drop() -> None:
        stream = ask.answer(db, p)
        await anext(stream)  # the first words arrive...
        await stream.aclose()  # ...and the browser goes away

    anyio.run(drop)
    return p.reserved


def test_sec_r16_fresh_accounts_spend_the_whole_monthly_budget_by_dropping_answers(
    make_user: MakeUser, claude: FakeClient, db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(ask, "GAP_SECONDS", 0)  # the 3 s gap only paces one account; it doesn't cap it
    lim = ask.limits(db)
    budget = lim.monthly_budget_cents * ask.MICRO_PER_CENT
    assert (lim.daily_questions, lim.monthly_budget_cents) == (30, 2500)  # the shipped defaults

    fresh = make_user()  # just signed up: no age, year or address gate before her first question
    charged = sum(_ask_and_drop(db, fresh) for _ in range(lim.daily_questions))
    db.expire_all()
    row = db.scalars(select(NooraUsage).where(NooraUsage.user_id == fresh.id, NooraUsage.day == bahrain_today())).one()

    # Claude reported 1,000 prompt tokens and a word before the drop; the budget is charged the worst case regardless.
    reported = math.ceil(row.input_tokens * 0.10 + row.cache_read_tokens * 0.01 + row.output_tokens * 0.50)
    assert row.cost_microusd == charged
    assert charged >= 30 * 5_000  # about $0.006 a question, $0.18 an account a day
    assert charged > 20 * reported

    accounts = math.ceil(budget / charged)
    hours = accounts / SIGN_UPS_PER_HOUR_PER_ADDRESS
    print(f"\nper account per day: {charged} µ$; accounts to spend $25: {accounts}; hours: {hours:.1f}")
    assert hours < 8  # one working day from one address; a second address halves it

    # And when it is spent, every student is refused until the month turns.
    monkeypatch.setattr(ask, "month_cost_microusd", lambda *_: budget)
    with pytest.raises(ApiError) as refused:
        ask.prepare(db, make_user(), NooraQuestion(question="What is an MGF?"))
    assert getattr(refused.value, "code", None) == "noora_budget_reached"
