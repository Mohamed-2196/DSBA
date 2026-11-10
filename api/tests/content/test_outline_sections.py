"""Every module's outline is its study guide's own sections (COM-253): each section the guide teaches is exactly one
topic, titled as the guide titles it ("8.2 Sets and functions: some terminology"), in the guide's order within its
chapter, and no topic is anything else. The sections come from app/seed/data/guide_sections.json, which
scripts/guide_sections.py reads from the guides' PDFs (front and back matter, worked examples and summaries are
marked not taught there). A module the guides file doesn't list (MN3141: its guide isn't readable) isn't checked."""

from __future__ import annotations

from collections import Counter
from typing import Any

import pytest

from app.seed.loader import read

GUIDES: list[dict[str, Any]] = read("guide_sections")
OUTLINES = {m["module"]: m for m in read("chapter_outlines")}


def taught(guide: dict[str, Any]) -> list[dict[str, Any]]:
    return [s for c in guide["chapters"] for s in c["sections"] if s["taught"]]


def title_of(section: dict[str, Any]) -> str:
    return f"{section['number']} {section['title']}" if section["number"] else section["title"]


def topics(module: str) -> list[tuple[str, dict[str, Any]]]:
    """(chapter id, topic) for every topic of the module's outline."""
    return [(c["id"], t) for c in OUTLINES[module]["chapters"] for t in c["topics"]]


@pytest.mark.parametrize("guide", GUIDES, ids=[g["unitCode"] for g in GUIDES])
def test_every_taught_section_is_one_topic(guide: dict[str, Any]) -> None:
    """Nothing skipped and nothing merged: each taught section is the section of exactly one topic, and every topic
    is one taught section."""
    keys = [s["key"] for s in taught(guide)]
    assert len(keys) == len(set(keys)), "a section key twice in guide_sections.json"
    have = Counter(t.get("section") for _, t in topics(guide["module"]))
    missing = [k for k in keys if not have[k]]
    twice = [k for k, n in have.items() if n > 1]
    stray = [k for k in have if k not in set(keys)]
    assert not missing, f"{guide['unitCode']}: sections with no topic: {missing}"
    assert not twice, f"{guide['unitCode']}: sections that are more than one topic: {twice}"
    assert not stray, f"{guide['unitCode']}: topics that aren't a taught section: {stray}"


@pytest.mark.parametrize("guide", GUIDES, ids=[g["unitCode"] for g in GUIDES])
def test_topics_are_titled_as_the_guide_titles_them(guide: dict[str, Any]) -> None:
    by_key = {s["key"]: s for s in taught(guide)}
    wrong = [
        (t["title"], title_of(by_key[t["section"]]))
        for _, t in topics(guide["module"])
        if t.get("section") in by_key and t["title"] != title_of(by_key[t["section"]])
    ]
    assert not wrong, f"{guide['unitCode']}: (topic, guide's title): {wrong}"


@pytest.mark.parametrize("guide", GUIDES, ids=[g["unitCode"] for g in GUIDES])
def test_a_chapters_topics_are_in_the_guides_order(guide: dict[str, Any]) -> None:
    order = {s["key"]: i for i, s in enumerate(taught(guide))}
    for chapter in OUTLINES[guide["module"]]["chapters"]:
        at = [order[t["section"]] for t in chapter["topics"] if t.get("section") in order]
        assert at == sorted(at), f"{guide['unitCode']} chapter {chapter['id']}: topics out of the guide's order"


def test_every_module_with_an_outline_has_its_guide_or_is_listed_without_one() -> None:
    """A module's guide is parsed, or its outline says why not (MN3141)."""
    parsed = {g["module"] for g in GUIDES}
    without = {m for m, o in OUTLINES.items() if m not in parsed}
    assert all(OUTLINES[m].get("guideMissing") for m in without), sorted(without)


def test_question_tags_name_topics_the_outlines_have() -> None:
    names = {f"{c}:{t['id']}" for m in OUTLINES for c, t in topics(m)}
    stray = sorted(
        {tag for paper in read("paper_questions") for q in paper["questions"] for tag in q.get("topics") or []} - names
    )
    assert not stray, stray[:20]
