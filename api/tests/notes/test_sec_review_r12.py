"""The round 12 security review's proofs for the notebook. Each test passes while the problem it shows is still there:
one free account keeps 250 MB of ink in Postgres, and every read of it loads all of it into the API's memory."""

from __future__ import annotations

import json
import tracemalloc
from collections.abc import Callable
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import NoteInk, User
from app.schemas.notes import MAX_POINTS, MAX_STROKES
from app.services import notes as svc

API = "/api/v1"
ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]

CADDY_BODY_CAP = 1_000_000  # web/deploy/Caddyfile: request_body max_size 1MB (go-humanize: SI megabytes)
SEC27_CAP = 10_000_000  # the 10 MB a student's notes could hold before round 11 (SEC-27's fix)
JSON = {"Content-Type": "application/json"}


def sheet_body(strokes: int, numbers: int) -> bytes:
    """One sheet's ink as the browser sends it: `strokes` strokes of `numbers` coordinates each (all valid)."""
    drawn = [
        {"id": f"s{i}", "tool": "pen", "color": "#1f2933", "width": 2.5, "points": [12345.67] * numbers}
        for i in range(strokes)
    ]
    return json.dumps({"strokes": drawn, "version": 0}, separators=(",", ":")).encode()


def new_note(c: TestClient) -> dict[str, Any]:
    r = c.post(f"{API}/notes", json={"title": "Lecture 4"})
    assert r.status_code == 201, r.text
    note: dict[str, Any] = r.json()
    return note


def test_sec36_one_account_keeps_250_mb_of_ink_and_every_read_loads_all_of_it(
    client_for: ClientFor, make_user: MakeUser, db: Session
) -> None:
    c = client_for(make_user())
    note = new_note(c)
    body = sheet_body(6, 18_000)
    assert len(body) < CADDY_BODY_CAP  # each save passes production's 1 MB body cap
    for sheet in range(11):  # 11 requests, about a second: past SEC-27's 10 MB already
        r = c.put(f"{API}/notes/{note['id']}/ink/{svc.PAPER_SHEETS_FROM + sheet}", content=body, headers=JSON)
        assert r.status_code == 200, r.text[:200]

    storage = c.get(f"{API}/notebooks").json()["storage"]
    assert storage["limitBytes"] == 250 * 1024 * 1024  # 25 times SEC-27's cap, all of it allowed as ink or text
    in_postgres = db.scalar(select(func.sum(NoteInk.size_bytes)).where(NoteInk.note_id == note["id"]))
    assert in_postgres is not None
    assert in_postgres > SEC27_CAP
    assert storage["usedBytes"] >= in_postgres

    # Opening the note sends every sheet at once; the export holds all of it too, as often as it is asked for.
    opened = c.get(f"{API}/notes/{note['id']}")
    assert opened.status_code == 200
    assert len(opened.content) > in_postgres
    for _ in range(2):
        exported = c.get(f"{API}/me/export")
        assert exported.status_code == 200
        assert len(exported.content) > in_postgres

    # Each read builds the ink in the API's memory several times over (measured on a smaller note: the ratio holds
    # at any size; about 7 times here, so 250 MB of ink is about 2 GB per request).
    small = new_note(c)
    for sheet in range(2):
        r = c.put(f"{API}/notes/{small['id']}/ink/{svc.PAPER_SHEETS_FROM + sheet}", content=body, headers=JSON)
        assert r.status_code == 200, r.text[:200]
    small_ink = db.scalar(select(func.sum(NoteInk.size_bytes)).where(NoteInk.note_id == small["id"]))
    assert small_ink is not None
    tracemalloc.start()
    try:
        assert c.get(f"{API}/notes/{small['id']}").status_code == 200
        _, peak = tracemalloc.get_traced_memory()
    finally:
        tracemalloc.stop()
    assert peak > 4 * small_ink


def test_sec36_the_api_takes_a_sheet_of_any_size_only_caddy_stops_it(
    client_for: ClientFor, make_user: MakeUser
) -> None:
    # The schema's own ceiling for one sheet: 4,000 strokes of 18,000 numbers, about 650 MB of JSON.
    assert MAX_STROKES * MAX_POINTS * 3 * len("12345.67,") > 600_000_000
    c = client_for(make_user())
    note = new_note(c)
    body = sheet_body(18, 18_000)  # about 3 MB on one sheet, in one request
    assert len(body) > 2 * CADDY_BODY_CAP
    r = c.put(f"{API}/notes/{note['id']}/ink/{svc.PAPER_SHEETS_FROM}", content=body, headers=JSON)
    assert r.status_code == 200, r.text[:200]
