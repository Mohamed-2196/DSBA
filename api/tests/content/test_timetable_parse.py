"""Reading a pasted exam timetable (services/timetable_parse.py): the shapes it comes in from the email, a web page and
a spreadsheet. Made-up rows in the University's and BIBF's formats."""

from __future__ import annotations

import datetime as dt
import time

import pytest

from app.services.timetable_parse import ParsedRow, find_date, find_time, header_columns, parse_timetable

TODAY = dt.date(2026, 10, 20)
TITLES = {
    "ST2134": "Advanced Statistics: Statistical Inference",
    "EC1002": "Introduction to Economics",
    "ST2195": "Programming for Data Science",
    "MT1186": "Mathematical Methods",
    "ST2133": "Advanced Statistics: Distribution Theory",
}


def rows(text: str) -> list[tuple[str | None, dt.date | None, str | None, str | None]]:
    return [(r.unit_code, r.date, r.time, r.place) for r in parse_timetable(text, TODAY, TITLES)]


def test_a_spreadsheet_with_a_header() -> None:
    text = (
        "Unit code\tModule title\tDate\tTime\tVenue\n"
        "ST2134\tAdvanced Statistics: Statistical Inference\t13/10/2026\t10:00 - 13:00\tBIBF Hall A\n"
        "EC1002\tIntroduction to Economics\t15/10/2026\t14:00\tExam Hall 2, Floor 3\n"
    )
    assert rows(text) == [
        ("ST2134", dt.date(2026, 10, 13), "10:00 AM to 1:00 PM", "BIBF Hall A"),
        ("EC1002", dt.date(2026, 10, 15), "2:00 PM", "Exam Hall 2, Floor 3"),
    ]


DASH = "\u2013"  # an en dash, as an email writes it


def test_an_email_in_sentences() -> None:
    text = f"""Dear students,

Please find the October 2026 examination timetable below.

ST2134 Advanced Statistics: Statistical Inference - Monday 13 October 2026, 10:00am - 1:00pm, Hall A
EC1002 Introduction to Economics {DASH} Wed 15 Oct 2026 {DASH} 2.30 pm {DASH} Room 204
MT1186 Mathematical Methods  20 Oct  AM  Auditorium

Kind regards,
Programme office"""
    assert rows(text) == [
        ("ST2134", dt.date(2026, 10, 13), "10:00 AM to 1:00 PM", "Hall A"),
        ("EC1002", dt.date(2026, 10, 15), "2:30 PM", "Room 204"),
        ("MT1186", dt.date(2026, 10, 20), "Morning", "Auditorium"),
    ]


def test_a_web_table_with_its_columns_in_another_order() -> None:
    text = (
        "Date | Time | Course code | Venue\n"
        "Tuesday, October 13, 2026 | 9:30 AM to 12:30 PM | ST 2195 | Lab 3 (Building B)\n"
        "14-10-26 | 14:00-17:00 | ST2133 | Main hall\n"
    )
    assert rows(text) == [
        ("ST2195", dt.date(2026, 10, 13), "9:30 AM to 12:30 PM", "Lab 3 (Building B)"),
        ("ST2133", dt.date(2026, 10, 14), "2:00 PM to 5:00 PM", "Main hall"),
    ]


def test_rows_without_a_title_or_a_venue() -> None:
    assert rows("ST1215 2026-10-21 13:00") == [("ST1215", dt.date(2026, 10, 21), "1:00 PM", None)]
    # a module's name nobody told the reader about, between the code and the date, isn't a venue
    assert rows("IS2184\tInformation Systems Management\t22/10/2026\t9am") == [
        ("IS2184", dt.date(2026, 10, 22), "9:00 AM", None)
    ]


def test_a_row_without_a_code_or_a_date_says_so() -> None:
    [no_code] = parse_timetable("Statistics exam 22/10/2026 10:00 Hall C", TODAY, TITLES)
    assert (no_code.unit_code, no_code.date, no_code.place) == (None, dt.date(2026, 10, 22), "Hall C")
    assert no_code.problems == ["No module code found. Add it."]
    [no_date] = parse_timetable("ST2134 10:00 Hall A", TODAY, TITLES)
    assert no_date.date is None
    assert no_date.problems == ["No date found. Add it."]


def test_lines_with_neither_are_left_out() -> None:
    assert parse_timetable("Examination timetable\n\nGood luck!\nVenue: see below", TODAY, TITLES) == []


def test_one_row_for_each_code_on_a_line() -> None:
    found = parse_timetable("ST2133 / ST2134 joint sitting 13/10/2026 10:00 Hall A", TODAY, TITLES)
    assert [r.unit_code for r in found] == ["ST2133", "ST2134"]
    assert all(isinstance(r, ParsedRow) and r.line == 1 for r in found)


def test_line_numbers_count_every_line() -> None:
    found = parse_timetable("Timetable\n\nST2134 13/10/2026\nEC1002 15/10/2026", TODAY, TITLES)
    assert [r.line for r in found] == [3, 4]


@pytest.mark.parametrize(
    ("text", "day"),
    [
        ("2026-10-13", dt.date(2026, 10, 13)),
        ("13/10/2026", dt.date(2026, 10, 13)),
        ("13.10.2026", dt.date(2026, 10, 13)),
        ("13-10-26", dt.date(2026, 10, 13)),
        ("13 October 2026", dt.date(2026, 10, 13)),
        ("Mon 13th Oct", dt.date(2026, 10, 13)),
        ("October 13, 2026", dt.date(2026, 10, 13)),
        ("Aug 3", dt.date(2027, 8, 3)),  # long gone this year: next year's
        ("5 Jan", dt.date(2027, 1, 5)),
        ("Sept 3", dt.date(2026, 9, 3)),  # a few weeks back: still this year's
    ],
)
def test_dates(text: str, day: dt.date) -> None:
    found = find_date(f"ST2134 {text} 10:00", TODAY)
    assert found is not None
    assert found[0] == day


def test_a_date_that_doesnt_exist_is_no_date() -> None:
    assert find_date("31/06/2026", TODAY) is None
    assert find_date("13 Oct 10:00", TODAY) == (dt.date(2026, 10, 13), (0, 6))  # 10 is the hour, not the year


@pytest.mark.parametrize(
    ("text", "time"),
    [
        ("10:00", "10:00 AM"),
        ("14.30", "2:30 PM"),
        ("2pm", "2:00 PM"),
        ("2:00", "2:00 PM"),  # no exam starts at two in the morning
        ("12:30 PM", "12:30 PM"),
        ("10am-1pm", "10:00 AM to 1:00 PM"),
        ("11 - 1pm", "11:00 AM to 1:00 PM"),
        ("2 to 5 pm", "2:00 PM to 5:00 PM"),
        ("09:30 \u2013 12:30", "9:30 AM to 12:30 PM"),
        ("Afternoon session", "Afternoon"),
        ("PM", "Afternoon"),
    ],
)
def test_times(text: str, time: str) -> None:
    found = find_time(f"  {text}  Hall A")
    assert found is not None
    assert found[0] == time


def test_no_time() -> None:
    assert find_time("Room 204, block 2") is None
    assert find_time("25:00") is None


def test_header_columns() -> None:
    assert header_columns("Module code\tModule\tExam date\tStart time\tExam venue") == {
        "code": 0,
        "title": 1,
        "date": 2,
        "time": 3,
        "place": 4,
    }
    assert header_columns("ST2134\tDate\tVenue") is None  # a row, not a header
    assert header_columns("Timetable") is None


def test_a_long_venue_is_cut() -> None:
    [row] = parse_timetable(f"ST2134 13/10/2026 10:00 {'Hall ' * 40}", TODAY, TITLES)
    assert row.place is not None
    assert len(row.place) <= 120


def test_codes() -> None:
    found = parse_timetable("st2134 13/10/2026\nEC-1002 14/10/2026\nMT 1186 15/10/2026\non 2026 13/10/2026", TODAY)
    assert [r.unit_code for r in found] == ["ST2134", "EC1002", "MT1186", None]


def test_long_runs_of_space_read_fast() -> None:
    start = time.perf_counter()
    assert parse_timetable("ST2134 10" + " " * 100_000 + "x", TODAY, TITLES)[0].unit_code == "ST2134"
    assert find_time("10" + " " * 100_000 + "x") is None
    assert find_time("1 " * 50_000) is None
    assert find_date("13 " + " " * 100_000 + "x", TODAY) is None
    # Linear work takes a fraction of a second even on a busy machine; the backtracking this guards against took
    # minutes, so a generous limit never flakes and still catches it.
    assert time.perf_counter() - start < 2.0
