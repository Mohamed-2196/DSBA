"""Every section a module's study guide teaches has a video in the Hub (COM-253). The sections come from
app/seed/data/guide_sections.json, which scripts/guide_sections.py reads from the guides' PDFs (front and back matter,
worked examples and summaries are marked not taught there). guide_coverage.json says, for each taught section, the
Hub chapter it belongs to and the lessons there that teach it. The outlines (chapter_outlines.json) are not involved:
the founder kept them as they are. MN3141 isn't listed: its guide isn't in the Hub's library."""

from __future__ import annotations

from typing import Any

import pytest

from app.seed.loader import read

GUIDES: list[dict[str, Any]] = read("guide_sections")
COVERAGE = {c["unitCode"]: c for c in read("guide_coverage")}
MODULES = {m["id"]: m for m in read("modules")}


def taught(guide: dict[str, Any]) -> list[str]:
    return [s["key"] for c in guide["chapters"] for s in c["sections"] if s["taught"]]


def test_every_parsed_guide_has_its_coverage() -> None:
    assert sorted(COVERAGE) == sorted(g["unitCode"] for g in GUIDES)


@pytest.mark.parametrize("guide", GUIDES, ids=[g["unitCode"] for g in GUIDES])
def test_coverage_lists_every_taught_section_once_in_the_guides_order(guide: dict[str, Any]) -> None:
    assert [s["key"] for s in COVERAGE[guide["unitCode"]]["sections"]] == taught(guide)


@pytest.mark.parametrize("guide", GUIDES, ids=[g["unitCode"] for g in GUIDES])
def test_every_taught_section_has_a_playable_video_in_its_chapter(guide: dict[str, Any]) -> None:
    """A section's videos are lessons of its Hub chapter that play (not a class recording, not marked unavailable).
    A section the guide marks as taught but only points elsewhere (an unexamined VLE task) says why in "skip"."""
    module = MODULES[guide["module"]]
    playable = {
        c["id"]: {v["videoId"] for v in c["videos"] if v["kind"] == "youtube" and not v.get("unavailable")}
        for c in module["chapters"]
    }
    bare, stray = [], []
    for s in COVERAGE[guide["unitCode"]]["sections"]:
        if s.get("skip"):
            assert not s["videos"], s["key"]
            continue
        if not s["videos"]:
            bare.append(s["key"])
        stray += [(s["key"], v) for v in s["videos"] if v not in playable.get(s["hubChapter"], set())]
    assert not bare, f"{guide['unitCode']}: sections with no video: {bare}"
    assert not stray, f"{guide['unitCode']}: (section, video) not a playable lesson of the section's chapter: {stray}"
