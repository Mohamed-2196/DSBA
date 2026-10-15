"""Fixtures for the boards' tests: the boards switched on, a module with lessons and a calendar date, and helpers."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import date
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import CalendarEvent, Module
from tests.lessons import chapters

API = "/api/v1"


@pytest.fixture(autouse=True)
def board_on(set_feature: Callable[..., None]) -> None:
    """The board arrives switched off; these tests switch it on for everyone unless they say otherwise."""
    set_feature("board", "everyone")


@pytest.fixture
def module(db: Session) -> Module:
    """Chapter One: "Limits" and a lesson with no title; chapter Two: one lesson."""
    m_id = f"board-mod-{uuid.uuid4().hex[:6]}"
    m = Module(
        id=m_id,
        unit_code="TS1000",
        name="Test module",
        short_name="Test",
        year=1,
        description="",
        chapters=chapters(
            m_id,
            [
                {
                    "title": "One",
                    "videos": [
                        {"kind": "youtube", "video_id": "a", "title": "Limits"},
                        {"kind": "youtube", "video_id": "b"},
                    ],
                },
                {"title": "Two", "videos": [{"kind": "youtube", "video_id": "c"}]},
            ],
        ),
    )
    db.add(m)
    db.commit()
    return m


@pytest.fixture
def event(db: Session) -> CalendarEvent:
    e = CalendarEvent(
        id=f"2026-11-0{uuid.uuid4().int % 9 + 1}-coursework",
        title="Coursework due",
        type="deadline",
        date=date(2026, 11, 2),
    )
    db.add(e)
    db.commit()
    return e


# ── helpers ─────────────────────────────────────────────────────────────────────────────────


def make_board(c: TestClient, name: str = "Study", template: str = "study", **body: Any) -> dict[str, Any]:
    r = c.post(f"{API}/boards", json={"name": name, "template": template, **body})
    assert r.status_code == 201, r.text
    out: dict[str, Any] = r.json()
    return out


def detail(c: TestClient, board: dict[str, Any] | str) -> dict[str, Any]:
    board_id = board if isinstance(board, str) else board["id"]
    r = c.get(f"{API}/boards/{board_id}")
    assert r.status_code == 200, r.text
    out: dict[str, Any] = r.json()
    return out


def first_board(c: TestClient) -> dict[str, Any]:
    out: dict[str, Any] = c.get(f"{API}/boards").json()["boards"][0]
    return out


def column(board: dict[str, Any], name: str) -> str:
    """The id of the board's column called `name`."""
    found: str = next(col["id"] for col in board["columns"] if col["name"] == name)
    return found


def add(c: TestClient, **body: Any) -> dict[str, Any]:
    r = c.post(f"{API}/board-cards", json=body)
    assert r.status_code == 201, r.text
    card: dict[str, Any] = r.json()
    return card


def titles(c: TestClient, board: dict[str, Any], name: str) -> list[str]:
    """The titles of the cards in the board's column `name`, in order."""
    got = detail(c, board)
    col = column(got["board"], name)
    return [card["title"] for card in got["cards"] if card["columnId"] == col]


def move(c: TestClient, card: dict[str, Any], column_id: str, after: dict[str, Any] | None = None) -> Any:
    return c.put(
        f"{API}/board-cards/{card['id']}/place", json={"columnId": column_id, "afterId": after and after["id"]}
    )
