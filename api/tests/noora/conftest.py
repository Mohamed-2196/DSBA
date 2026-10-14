"""Fixtures for Mini Noora's AI answers: the feature on, a key set, and a stand-in for the Anthropic client that
answers with fixed text and never reaches the network."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator, Callable, Iterator
from dataclasses import dataclass, field
from types import TracebackType
from typing import Any

import anthropic
import anyio
import anyio.lowlevel
import httpx2
import pytest
from anthropic.types import Usage
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import CalendarEvent, Module
from app.services.noora import ask
from tests.lessons import chapters

FAKE_KEY = "sk-ant-test-not-a-real-key"


@dataclass
class FakeStream:
    pieces: list[str]
    usage: Usage
    fail_after: int | None  # raise a connection error after this many pieces
    started: bool = False  # Claude's first event (with the prompt's tokens) arrived

    async def __aenter__(self) -> FakeStream:
        return self

    async def __aexit__(self, *_: type[BaseException] | BaseException | TracebackType | None) -> None:
        return None

    @property
    def text_stream(self) -> AsyncIterator[str]:
        return self._text()

    async def _text(self) -> AsyncIterator[str]:
        self.started = True
        for i, piece in enumerate(self.pieces):
            await anyio.lowlevel.checkpoint()  # where a dropped connection's cancellation lands, as on the network
            if self.fail_after is not None and i >= self.fail_after:
                raise anthropic.APIConnectionError(request=httpx2.Request("POST", "https://api.anthropic.com"))
            yield piece
        if self.fail_after is not None and self.fail_after >= len(self.pieces):
            raise anthropic.APIConnectionError(request=httpx2.Request("POST", "https://api.anthropic.com"))

    async def get_final_message(self) -> Any:
        return type("Final", (), {"usage": self.usage})()

    @property
    def current_message_snapshot(self) -> Any:
        """As the SDK: an assertion error before the first event, then the prompt's tokens and one output token."""
        assert self.started
        so_far = self.usage.model_copy(update={"output_tokens": 1})
        return type("Snapshot", (), {"usage": so_far})()


@dataclass
class FakeMessages:
    pieces: list[str] = field(default_factory=lambda: ["The MGF is ", "in [ST2133 lessons](/modules/x?tab=lessons)."])
    usage: Usage = field(
        default_factory=lambda: Usage(
            input_tokens=1000, output_tokens=200, cache_read_input_tokens=3000, cache_creation_input_tokens=0
        )
    )
    fail_after: int | None = None
    calls: list[dict[str, Any]] = field(default_factory=list)

    def stream(self, **kwargs: Any) -> FakeStream:
        self.calls.append(kwargs)
        return FakeStream(list(self.pieces), self.usage, self.fail_after)


@dataclass
class FakeClient:
    messages: FakeMessages = field(default_factory=FakeMessages)


@pytest.fixture(autouse=True)
def noora_ai_on(set_feature: Callable[..., None]) -> None:
    """The AI answers arrive switched off: these tests switch them on for everyone."""
    set_feature("noora.ai", "everyone")


@pytest.fixture
def with_key(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setenv("DSBA_ANTHROPIC_API_KEY", FAKE_KEY)
    get_settings.cache_clear()
    yield
    monkeypatch.delenv("DSBA_ANTHROPIC_API_KEY")
    get_settings.cache_clear()


@pytest.fixture
def claude(monkeypatch: pytest.MonkeyPatch, with_key: None) -> FakeClient:
    """The stand-in client every question in the test goes to."""
    fake = FakeClient()
    monkeypatch.setattr(ask, "make_client", lambda settings: fake)
    return fake


@pytest.fixture
def module(db: Session) -> Module:
    m_id = f"noora-mod-{uuid.uuid4().hex[:6]}"
    m = Module(
        id=m_id,
        unit_code="ST2133",
        name="Advanced statistics: distribution theory",
        short_name="Distribution theory",
        year=2,
        description="",
        resources={},
        chapters=chapters(
            m_id,
            [
                {"title": "Moments", "videos": [{"kind": "youtube", "video_id": "a", "title": "The MGF"}]},
                {"title": "Transformations", "videos": [{"kind": "youtube", "video_id": "b"}]},
            ],
        ),
    )
    db.add(m)
    db.commit()
    return m


@pytest.fixture
def exam(db: Session, module: Module) -> CalendarEvent:
    import datetime as dt

    from app.core.time import bahrain_today

    e = CalendarEvent(
        id=f"exam-{uuid.uuid4().hex[:6]}",
        date=bahrain_today() + dt.timedelta(days=10),
        title="ST2133 exam",
        type="exam",
        year=2,
        module_id=module.id,
        unit_code="ST2133",
        sample=True,
    )
    db.add(e)
    db.commit()
    return e
