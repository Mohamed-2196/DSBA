"""scripts/guide_sections.py's choice among headings that share a section number (COM-253 review COM-297)."""

from __future__ import annotations

from scripts.guide_sections import choose

# MN1178's guide: a course Introduction numbered 1.1-1.7, then Chapter 1's own 1.1-1.9 (PDF pages).
MN1178_TOC = {"1.1": "Introduction", "1.2": "What is globalisation?"}
MN1178_BODY = [
    ("1.1", "Route map to the guide", 10),
    ("1.1.1", "How to use this guide and hours of study", 10),
    ("1.2", "Introduction to the subject area", 11),
    ("1.6.1", "Essential reading", 14),
    ("1.1", "Introduction", 26),
    ("1.1.1", "Aims of the chapter", 27),
    ("1.2", "What is globalisation?", 28),
]


def test_a_chapters_own_sections_win_over_a_front_chapter_numbered_the_same() -> None:
    chosen = choose(MN1178_BODY, MN1178_TOC)
    assert chosen["1.1"] == ("Introduction", 26)
    assert chosen["1.2"] == ("What is globalisation?", 28)


def test_a_subsection_is_the_one_after_its_sections_heading() -> None:
    assert choose(MN1178_BODY, MN1178_TOC)["1.1.1"] == ("Aims of the chapter", 27)


def test_a_subsection_with_none_after_its_section_is_left_out() -> None:
    assert "1.6.1" not in choose([*MN1178_BODY, ("1.6", "Key concepts", 36)], MN1178_TOC)


def test_a_repeated_number_keeps_the_first_heading_when_the_contents_dont_decide() -> None:
    body = [("3.2", "Sampling", 40), ("3.2", "Sampling", 90)]
    assert choose(body, {"3.2": "Sampling"}) == {"3.2": ("Sampling", 40)}
    assert choose(body, {}) == {"3.2": ("Sampling", 40)}
