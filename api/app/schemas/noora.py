"""Mini Noora's AI answers: a question with what's on the student's screen, the streamed answer, and the limits."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field

from app.schemas.common import ApiModel, Year

QUESTION_MAX = 2000  # characters
NOTE_MAX = 20_000  # characters of the open note (about 5,000 tokens)
NOTE_TITLE_MAX = 200
TURN_MAX = 4000  # characters of one earlier message
HISTORY_MAX = 8  # earlier messages sent with a question
ROUTE_MAX = 300
DAILY_QUESTIONS_MAX = 500
MONTHLY_BUDGET_CENTS_MAX = 1_000_000  # US$10,000


class NooraTurn(ApiModel):
    """An earlier message of the conversation, so a follow-up question makes sense."""

    role: Literal["student", "noora"]
    text: str = Field(min_length=1, max_length=TURN_MAX)


class NooraNote(ApiModel):
    """The note open in the editor. Sent only when the student ticks "Include my note" for this question."""

    title: str = Field(default="", max_length=NOTE_TITLE_MAX)
    body: str = Field(max_length=NOTE_MAX)


class NooraQuestion(ApiModel):
    """A question, and what's on the student's screen. The server looks the module and lesson up itself."""

    question: str = Field(min_length=1, max_length=QUESTION_MAX)
    route: str = Field(default="/", max_length=ROUTE_MAX)  # the path and query string the student is on
    year: Year | None = None  # the year the student is browsing (their own year when None)
    module_id: str | None = Field(default=None, max_length=64)
    chapter: int | None = Field(default=None, ge=0, le=500)
    video: int | None = Field(default=None, ge=0, le=500)
    note: NooraNote | None = None
    history: list[NooraTurn] = Field(default_factory=list, max_length=HISTORY_MAX)


class NooraTextEvent(ApiModel):
    """More of the answer."""

    type: Literal["text"] = "text"
    text: str


class NooraDoneEvent(ApiModel):
    """The answer is complete."""

    type: Literal["done"] = "done"
    questions_left: int  # today


class NooraErrorEvent(ApiModel):
    """The answer stopped. `code` is noora_unavailable: what came so far may be shown, with a line that it was cut
    off."""

    type: Literal["error"] = "error"
    code: Literal["noora_unavailable"] = "noora_unavailable"
    message: str


# Each `data:` line of the text/event-stream answer holds one of these, as JSON.
NooraEvent = Annotated[NooraTextEvent | NooraDoneEvent | NooraErrorEvent, Field(discriminator="type")]


class NooraStatus(ApiModel):
    """Whether her AI answers work for this student now, and how many questions are left today."""

    available: bool  # False: no key, or the month's budget is spent (she answers from her script)
    daily_questions: int
    questions_left: int


class NooraLimitsIn(ApiModel):
    daily_questions: int = Field(ge=0, le=DAILY_QUESTIONS_MAX)  # per student; 0 pauses the AI answers
    monthly_budget_cents: int = Field(ge=0, le=MONTHLY_BUDGET_CENTS_MAX)  # US cents, estimated from the tokens


class NooraTotals(ApiModel):
    questions: int
    students: int
    input_tokens: int  # cache reads and writes included
    output_tokens: int
    cost_cents: float  # estimated


class NooraUsageOut(ApiModel):
    """The limits and the totals, for Manage's numbers. Nothing per student: only counts."""

    configured: bool  # the API holds a key
    model: str
    daily_questions: int
    monthly_budget_cents: int
    today: NooraTotals
    month: NooraTotals  # this calendar month, in Bahrain
