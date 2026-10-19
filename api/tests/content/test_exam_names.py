"""exam_meta_from_name over the names the programme's Drive folders really use (the archive's, the VLE's, and the
mocks and samples that belong to no sitting)."""

from __future__ import annotations

import pytest

from app.schemas.library import ZONES, ExamSession, Zone
from app.services.exam_names import (
    ExamMeta,
    SittingKey,
    exam_meta_from_name,
    sitting_label,
    sitting_order,
    tidy_title,
    unit_codes,
    zone_label,
)


def paper(year: int, session: ExamSession, zone: Zone | None = None) -> ExamMeta:
    return ExamMeta(year, zone, False, session, False, True)


def report(year: int, session: ExamSession, zone: Zone | None = None) -> ExamMeta:
    return ExamMeta(year, zone, True, session, False, True)


def solutions(year: int, session: ExamSession, zone: Zone | None = None) -> ExamMeta:
    return ExamMeta(year, zone, False, session, True, True)


NOTHING = ExamMeta(None, None, False)

NAMES: list[tuple[str, ExamMeta]] = [
    # the archive
    ("EC1002 - Introduction to Economics - 2003 Exam - Zone-A.pdf", paper(2003, "may", "A")),
    ("EC1002 - Introduction to Economics - 2003 Examiners Commentaries - Zone-B.pdf", report(2003, "may", "B")),
    ("EC1002 - Introduction to Economics - 2005 Examiners - Zone-A.pdf", paper(2005, "may", "A")),
    ("EC1002 - Introduction to Economics - 2020 Exam.pdf", paper(2020, "may")),
    ("EC1002 - Introduction to Economics - 2023 October Resit Examiners Commentaries.pdf", report(2023, "october")),
    ("EC1002 - Introduction to Economics - Paper 2 - 2014 Exam - Zone-A.pdf", paper(2014, "may", "A")),
    ("MN1178 - Business and Management in a Global Context - 2019 Exam - Zone-Apdf.pdf", paper(2019, "may", "A")),
    (
        "MN1178 - Business and Management in a Global Context - 2021 Examiners Commentaries - Autumn.pdf",
        report(2021, "october"),
    ),
    (
        "MN1178 - Business and Management in a Global Context - 2022 Examiners Commentaries- Zone-B.pdf",
        report(2022, "may", "B"),
    ),
    ("ST104a - Statistics 1 - 2004 Examiners Commentaries - Zone-A.pdf", report(2004, "may", "A")),
    ("ST2133 - Advanced Statistics - Distribution Theory - 2008 Exam - ZA-ZB.pdf", paper(2008, "may")),
    ("ST2133 - Advanced Statistics - Distribution Theory - 2022 October Resit Exam.pdf", paper(2022, "october")),
    (
        "ST3134 - Advanced Statistics - Statistical Inference - 2017 Exam - Zone-B (One Zone Only).pdf",
        paper(2017, "may", "B"),
    ),
    ("EC2020 - Elements of Econometrics - 2003 Exam - Zone-B.pdf", paper(2003, "may", "B")),  # not 2020: the code
    ("EC2020 - Elements of Econometrics - 2020 Exam.pdf", paper(2020, "may")),
    ("IS2184 - Information Systems Management - 2022 Examiner Commentaries.pdf", report(2022, "may")),
    # the VLE
    ("MN3141 ZA exam paper - May 2024.pdf", paper(2024, "may", "A")),
    ("MN3141 RTC Exam paper - May 2025.pdf", paper(2025, "may", "RTC")),
    ("MN3141 RTC Exam paper - October 2025 (final).docx", paper(2025, "october", "RTC")),
    ("MN3141 RTC Exam paper \u00e2 May 2026.pdf", paper(2026, "may", "RTC")),
    ("MN3141 RTC Commentary - May 2026 DRAFT.docx", report(2026, "may", "RTC")),
    ("MN3141 commentary May 2024 - ZB.pdf", report(2024, "may", "B")),
    ("MN3141_Commentary_2022 ZA.pdf", report(2022, "may", "A")),
    ("MT3095_Commentary_October_2025.pdf", report(2025, "october")),
    ("MT1186_Commentary_2022_October.pdf", report(2022, "october")),
    ("MT1186 Commentary - May 2026 DRAFT.pdf", report(2026, "may")),
    ("MT1186 Draft commentary - Oct 2025.pdf", report(2025, "october")),
    ("MT1186 Exam paper (October 2024).pdf", paper(2024, "october")),
    ("EC1002 ZA exam paper (May 2024).pdf", paper(2024, "may", "A")),
    ("EC1002 ZB Exam paper solutions - May 2025.pdf", solutions(2025, "may", "B")),
    ("EC1002 ZB Exam paper Section B with correct question numbering - May 2025.pdf", paper(2025, "may", "B")),
    ("EC1002 Exam Paper - October 2025 (full paper, final).pdf", paper(2025, "october")),
    ("EC1002 exam paper - October November 2022.pdf", paper(2022, "october")),
    ("EC1002 ZA Exam paper \u2013 May 2026.pdf", paper(2026, "may", "A")),
    ("ST3189 Exam paper \u00e2 May 2026.pdf", paper(2026, "may")),
    ("EC2066 ZB Exam paper \u00e2 May 2026.pdf", paper(2026, "may", "B")),
    ("EC2066 Exam ZA 2024.pdf", paper(2024, "may", "A")),
    ("EC2066 ZA Commentary - May 2026 DRAFT.pdf", report(2026, "may", "A")),
    ("FN2203 exam paper - May 2025 FINAL.pdf", paper(2025, "may")),
    ("FN2203_May 2024_FINAL_Updated.pdf", paper(2024, "may")),
    ("ST2134_May_2024.pdf", paper(2024, "may")),
    ("ST3189_Commentary_Nov2023.pdf", report(2023, "october")),
    ("MN1178_Commentary_May2025.pdf", report(2025, "may")),
    ("Finalmn1178CEcommentaryAutumn2025.pdf", report(2025, "october")),
    ("ST2133 examiner commentaries(winter_2025) FINAL.pdf", report(2025, "october")),
    ("ST2133 commentary - October 2025.PDF", report(2025, "october")),
    ("EMFSS Commentary IS2184 October 2025.docx", report(2025, "october")),
    ("ST2133_2021_ZA.pdf", paper(2021, "may", "A")),
    # no sitting: mocks, preliminary and sample papers, and names without a year
    ("EC1002 ZA.pdf", ExamMeta(None, "A", False)),
    ("MT1186 sample exam paper.pdf", NOTHING),
    ("MT1186 Sample exam paper and commentary.pdf", NOTHING),
    ("EC2066 Sample paper commentary - 2026.pdf", NOTHING),
    ("ST2195_2022_PrelimExam_comm.pdf", NOTHING),
    ("ST2195_Commentary_prelim_2022.pdf", NOTHING),
    ("ST3189_PrelimExam_2023_with_solutions.pdf", NOTHING),
    ("ST1215 Preliminary exam paper commentary - 2025.pdf", NOTHING),
    ("Math 1186-Mock Test 1 (2024-2025)-Solution.pdf", NOTHING),
    ("MT1186.Mathematical.Methods.Mock.2023.EC.pdf", NOTHING),
    ("2020-mock-examination-paper-ec1002.pdf", NOTHING),
    ("Model Answer - Test 2 - ST1215 - 2025.pdf", NOTHING),
    ("Mock Exam with answers 2023_new.pdf", NOTHING),
    ("Exam_Study_Guide.docx", NOTHING),
    ("MT1186 2022.pdf", ExamMeta(2022, None, False)),  # a year, but nothing says it is a paper
    ("EC2020_2023_VLE.pdf", ExamMeta(2023, None, False)),
    ("MT1186 Subject Guide 2025.PDF", ExamMeta(2025, None, False)),
    ("FN2203_2025-26.PDF", ExamMeta(2025, None, False)),
    ("ST2133 Exam paper 2019 and 2020.pdf", ExamMeta(None, None, False)),  # two years: neither
]


@pytest.mark.parametrize(("name", "meta"), NAMES, ids=[n for n, _ in NAMES])
def test_reads_the_real_names(name: str, meta: ExamMeta) -> None:
    assert exam_meta_from_name(name) == meta


def test_a_paper_pairs_with_its_report_by_year_session_and_zone() -> None:
    def sitting(name: str) -> tuple[int | None, str | None, str | None]:
        m = exam_meta_from_name(name)
        return m.exam_year, m.session, m.zone

    assert sitting("MT3095 Exam paper - October 2025 (final).pdf") == sitting("MT3095_Commentary_October_2025.pdf")
    assert sitting("EC2066 ZA Exam paper \u00e2 May 2026.pdf") == sitting("EC2066 ZA Commentary - May 2026 DRAFT.pdf")
    assert sitting("MT1186 Exam paper - October 2025.pdf") != sitting("MT1186 Exam paper - May 2025.pdf")


TITLES: list[tuple[str, str]] = [
    ("calculus-concepts-and-methods_compress.pdf", "Calculus concepts and methods"),
    ("1. Function Characteristics - workbook (1).pdf", "1. Function Characteristics - workbook"),
    ("EC2020_Commentary_May_2024.pdf", "EC2020 Commentary May 2024"),
    ("IS2184_SG (1).pdf", "IS2184 SG"),
    ("BMGC Notes (Chapter 1 Globalisation).docx.pdf", "BMGC Notes (Chapter 1 Globalisation)"),
    ("MT1186_Sample_Paper.pdf 2018-19.pdf", "MT1186 Sample Paper 2018-19"),
    ("EC2066 ZA Exam paper \u00e2 May 2026.pdf", "EC2066 ZA Exam paper \u2013 May 2026"),
    ("EC2066 ZB Exam paper a\u0302 May 2026.pdf", "EC2066 ZB Exam paper \u2013 May 2026"),
    ("2020-mock-examination-paper-ec1002.pdf", "2020 mock examination paper EC1002"),
    ("ST2133 examiner commentaries(winter_2025) FINAL.pdf", "ST2133 examiner commentaries (winter 2025) FINAL"),
    ("ST104a - Statistics 1 - 2008 Exam - Zone-A.pdf", "ST104A - Statistics 1 - 2008 Exam - Zone-A"),
    ("Copy of Week 3 notes copy.pdf", "Week 3 notes"),
    ("Ch3_ Random Variables.pdf", "Ch3 Random Variables"),
    ("Model Answer - Test 2 - ST1215 - 2025.pdf", "Model Answer - Test 2 - ST1215 - 2025"),
    ("allchapters.pdf", "Allchapters"),
    (".pdf", ".pdf"),
]


@pytest.mark.parametrize(("name", "title"), TITLES)
def test_a_files_title_reads_as_a_title(name: str, title: str) -> None:
    assert tidy_title(name) == title
    assert tidy_title(f"{title}.pdf") == title or title == ".pdf"  # a tidy title stays as it is


def test_zones_and_sittings_read_as_people_say_them() -> None:
    assert [zone_label(z) for z in ZONES] == ["zone A", "zone B", "RTC"]
    assert sitting_label(2024, "may") == "May 2024"
    assert sitting_label(2023, "october") == "October 2023"
    assert sitting_label(2022, None) == "2022"


def test_sittings_go_newest_first_a_years_resits_before_its_may_sitting() -> None:
    sittings: list[SittingKey] = [(2023, "may"), (2024, None), (2023, "october"), (2024, "may"), (2023, None)]
    assert sorted(sittings, key=sitting_order) == [
        (2024, "may"),
        (2024, None),
        (2023, "october"),
        (2023, "may"),
        (2023, None),
    ]


def test_unit_codes_are_read_from_a_name_in_capitals() -> None:
    assert unit_codes("MT1186_Commentary_May_2025.pdf") == {"MT1186"}
    assert unit_codes("st1215 and MT1186 formula sheet") == {"ST1215", "MT1186"}
    assert unit_codes("ST104A - Statistics 1 - 2008 Exam") == set()  # not a unit code of four digits
    assert unit_codes("Math 1186 - Mock Test 1 (2024-2025)") == set()
    assert unit_codes("EC20201 notes") == set()
