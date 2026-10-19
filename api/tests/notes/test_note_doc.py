"""What a note's document may hold (services/note_doc.py): pictures in the text and free on the pages, in range."""

from __future__ import annotations

import math
import uuid
from typing import Any

import pytest

from app.core.errors import ApiError
from app.schemas.notes import PAPER_SHEETS_FROM, SHEET_HEIGHT, SHEET_WIDTH
from app.services import note_doc

UPLOAD = str(uuid.uuid4())


def free(**changes: Any) -> dict[str, Any]:
    """A free picture on the first sheet of paper: 300 x 200 units, 100 units in and down."""
    picture: dict[str, Any] = {
        "id": "p1",
        "upload": UPLOAD,
        "sheet": PAPER_SHEETS_FROM,
        "x": 100,
        "y": 100,
        "w": 300,
        "h": 200,
        "angle": 0,
        "ratio": 1.5,
        "cropX": 0,
        "cropY": 0,
        "cropW": 1,
        "cropH": 1,
        "alt": "",
        "caption": "",
    }
    return picture | changes


def with_free(*pictures: dict[str, Any], content: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    return {"type": "doc", "attrs": {"pictures": list(pictures)}, "content": content or []}


def inline(**attrs: Any) -> dict[str, Any]:
    return {"type": "image", "attrs": {"upload": str(uuid.uuid4())} | attrs}


def para(text: str) -> dict[str, Any]:
    return {"type": "paragraph", "content": [{"type": "text", "text": text}]}


def refused(doc: dict[str, Any], sheets: int = 1) -> str:
    with pytest.raises(ApiError) as e:
        note_doc.check(doc, sheets=sheets)
    assert e.value.status == 422
    assert e.value.fields is not None
    assert list(e.value.fields) == ["doc"]
    return str(e.value.fields["doc"])


def test_free_pictures_are_read_after_the_text_page_by_page() -> None:
    second = str(uuid.uuid4())
    doc = with_free(
        free(id="low", y=700, caption="Bayes tree", alt="A tree of two splits"),
        free(id="other", upload=second, sheet=PAPER_SHEETS_FROM + 1, y=10, alt="Normal curve"),
        free(id="high", y=20, x=400, w=200, alt="Mean"),
        content=[para("Week 4")],
    )
    checked = note_doc.check(doc, sheets=2)
    assert checked.text == "Week 4\nMean\nBayes tree\nA tree of two splits\nNormal curve"
    assert checked.uploads == {uuid.UUID(UPLOAD), uuid.UUID(second)}


def test_a_document_without_free_pictures() -> None:
    for doc in (
        {"type": "doc", "content": [para("x")]},
        {"type": "doc", "attrs": None, "content": [para("x")]},
        {"type": "doc", "attrs": {"pictures": []}, "content": [para("x")]},
        {"type": "doc", "attrs": {"pictures": None}, "content": [para("x")]},
    ):
        assert note_doc.check(doc, sheets=1).text == "x"


def test_a_free_picture_may_be_turned_and_cropped_and_reach_the_edges() -> None:
    edge = free(x=-150, y=SHEET_HEIGHT - 100, angle=359.5, cropX=0.25, cropY=0.1, cropW=0.75, cropH=0.9)
    note_doc.check(with_free(edge), sheets=1)  # its middle is on the sheet: x -150 + 150, y 1020 + 100
    whole = free(x=0, y=0, w=SHEET_WIDTH, h=SHEET_HEIGHT, angle=90)
    note_doc.check(with_free(whole), sheets=1)


def test_a_free_picture_on_a_pdf_page() -> None:
    """A PDF's page keeps its own shape and the server doesn't read the PDF: a tall page is taken on trust."""
    note_doc.check(with_free(free(sheet=0, y=5000)), sheets=0)
    note_doc.check(with_free(free(sheet=PAPER_SHEETS_FROM - 1, y=40)), sheets=0)
    assert "off its page" in refused(with_free(free(sheet=2, y=note_doc.PDF_PAGE_MAX)), sheets=0)


@pytest.mark.parametrize(
    ("change", "why"),
    [
        ({"x": SHEET_WIDTH - 140}, "off its page"),  # its middle is past the right edge
        ({"y": -101}, "off its page"),
        ({"y": SHEET_HEIGHT - 99}, "off its page"),
        ({"sheet": PAPER_SHEETS_FROM + 1}, "a page the note doesn't have"),
        ({"sheet": -1}, "a page the note doesn't have"),
        ({"w": 10}, "reload"),
        ({"w": SHEET_WIDTH + 1, "x": 0}, "reload"),
        ({"h": SHEET_HEIGHT + 1, "y": 0}, "reload"),
        ({"angle": 360}, "reload"),
        ({"angle": -1}, "reload"),
        ({"angle": math.nan}, "reload"),
        ({"x": math.inf}, "reload"),
        ({"w": True}, "reload"),
        ({"x": "100"}, "reload"),
        ({"sheet": 1000.0}, "reload"),
        ({"ratio": 0}, "reload"),
        ({"ratio": 25}, "reload"),
        ({"cropX": 0.5, "cropW": 0.6}, "reload"),
        ({"cropH": 0.01}, "reload"),
        ({"cropY": -0.1}, "reload"),
        ({"id": "has space"}, "reload"),
        ({"id": "x" * 33}, "reload"),
        ({"upload": "not-a-uuid"}, "reload"),
        ({"caption": "x" * (note_doc.CAPTION_MAX + 1)}, "reload"),
        ({"alt": 5}, "reload"),
        ({"style": "color: red"}, "reload"),
    ],
)
def test_a_free_picture_out_of_range_is_refused(change: dict[str, Any], why: str) -> None:
    assert why in refused(with_free(free(**change)))


@pytest.mark.parametrize(
    "attrs",
    [
        {"pictures": [free()], "style": "x"},
        {"pictures": {"p1": free()}},
        {"pictures": [free(), free()]},  # the same id twice
        {"pictures": [{k: v for k, v in free().items() if k != "angle"}]},
        "pictures",
    ],
)
def test_the_documents_own_attributes_are_its_free_pictures(attrs: Any) -> None:
    refused({"type": "doc", "attrs": attrs, "content": []})


@pytest.mark.parametrize(
    "attrs",
    [
        {"width": 0.05},
        {"width": 1.5},
        {"x": -0.1},
        {"ratio": 0.001},
        {"rotate": 45},
        {"rotate": 360},
        {"cropX": 0.9, "cropW": 0.5},
        {"cropW": 0},
        {"width": math.nan},
        {"caption": "x" * (note_doc.CAPTION_MAX + 1)},
        {"alt": "x" * (note_doc.ALT_MAX + 1)},
    ],
)
def test_a_picture_in_the_text_out_of_range_is_refused(attrs: dict[str, Any]) -> None:
    refused({"type": "doc", "content": [inline(**attrs)]})


def test_a_picture_in_the_text_in_range() -> None:
    doc = {
        "type": "doc",
        "content": [
            inline(),
            inline(width=0.12, x=1, ratio=None, rotate=270, cropX=0.95, cropW=0.05, caption="c", alt="a"),
            inline(width=1, x=0, ratio=20, rotate=90.0, cropY=0.5, cropH=0.5),
        ],
    }
    assert note_doc.check(doc, sheets=1).text == "c\na"


def test_numbers_that_json_cant_hold_are_refused_anywhere() -> None:
    refused({"type": "doc", "content": [{"type": "heading", "attrs": {"level": math.inf}, "content": []}]})


def test_a_note_holds_a_limited_number_of_pictures(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(note_doc, "MAX_PICTURES", 3)
    pictures = [free(id=f"p{i}") for i in range(2)]
    note_doc.check(with_free(*pictures, content=[inline()]), sheets=1)
    assert "up to 3 pictures" in refused(with_free(*pictures, content=[inline(), inline()]))
    assert "up to 3 pictures" in refused(with_free(*[free(id=f"p{i}") for i in range(4)]))
