"""Mini Noora's monthly budget against crowds of fresh accounts (SEC-51): an account under a week old asks
NEW_ACCOUNT_QUESTIONS a day, and an answer dropped after its first words costs what Claude used, not the whole answer
it reserved."""

from __future__ import annotations

import datetime as dt
import math
from collections.abc import Callable

import anyio
import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.core.time import bahrain_today, utcnow
from app.models import NooraUsage, User
from app.schemas.noora import HISTORY_MAX, NOTE_MAX, QUESTION_MAX, TURN_MAX, NooraNote, NooraQuestion, NooraTurn
from app.services.noora import ask
from tests.noora.conftest import FakeClient

MakeUser = Callable[..., User]
SIGN_UPS_PER_HOUR_PER_ADDRESS = 30  # DSBA_OTP_MAX_PER_IP_PER_HOUR's default: a fresh account needs one code


@pytest.fixture
def new_account_allowance(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ask, "NEW_ACCOUNT_DAYS", 7)
    monkeypatch.setattr(ask, "GAP_SECONDS", 0)


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


def test_a_new_account_asks_five_questions_a_day(
    make_user: MakeUser, claude: FakeClient, db: Session, new_account_allowance: None
) -> None:
    fresh = make_user()
    assert ask.status(db, fresh).daily_questions == ask.NEW_ACCOUNT_QUESTIONS == 5
    for _ in range(5):
        _ask_and_drop(db, fresh)
    with pytest.raises(ApiError) as refused:
        ask.prepare(db, fresh, NooraQuestion(question="What is an MGF?"))
    assert refused.value.code == "noora_daily_limit"
    assert "5 questions today" in refused.value.message

    settled = make_user(name="Week Old")
    settled.created_at = utcnow() - dt.timedelta(days=8)
    db.commit()
    assert ask.status(db, settled).daily_questions == ask.limits(db).daily_questions == 30


def test_fresh_accounts_no_longer_spend_the_month_by_dropping_answers(
    make_user: MakeUser, claude: FakeClient, db: Session, new_account_allowance: None
) -> None:
    lim = ask.limits(db)
    budget = lim.monthly_budget_cents * ask.MICRO_PER_CENT
    fresh = make_user()
    reserved = sum(_ask_and_drop(db, fresh) for _ in range(ask.NEW_ACCOUNT_QUESTIONS))
    db.expire_all()
    row = db.scalars(select(NooraUsage).where(NooraUsage.user_id == fresh.id, NooraUsage.day == bahrain_today())).one()

    assert row.cost_microusd < reserved / 3  # charged for what was used, not the worst case
    accounts = math.ceil(budget / row.cost_microusd)
    hours = accounts / SIGN_UPS_PER_HOUR_PER_ADDRESS
    assert hours > 7 * 24  # more than a week of sign-ups from one address, each account a week old before its fifth
