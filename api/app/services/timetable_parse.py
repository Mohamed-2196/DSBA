"""Reading an exam timetable pasted as text: rows copied from the university's or BIBF's email, a web page or a
spreadsheet, each with a module code, a date, a time and a venue, in whatever order and wording they came in.

Pure: no database. `parse_timetable` turns the text into rows; services/timetable.py matches them to modules and
exams. A line is a row when it holds a module code ('ST2134', 'EC 1002'); a line without one that holds a date is
kept as a row too, so the preview can say it found no code. Other lines (headings, blank lines, a column header) are
left out, though a column header names the columns of the lines under it.

Dates are read day first, as Bahrain writes them ('13/10/2026'); month names can lead ('October 13, 2026'). A date
without a year takes the year that puts it nearest after today, less a few weeks (a timetable lists the coming
session). Times come out as the calendar writes them: '10:00 AM', or '10:00 AM to 1:00 PM'."""

from __future__ import annotations

import datetime as dt
import re
from collections.abc import Mapping
from dataclasses import dataclass, field

MAX_PLACE = 120
# A pasted line is read up to this many characters (services/timetable.py refuses longer ones): the patterns stay
# linear, and no timetable row is this long.
MAX_LINE = 500
MAX_TIME = 40
# A date without a year falls on or after this many days before today.
PAST_DAYS = 60

_I = re.IGNORECASE
# 'ST2134', 'ST 2134', 'ST-2134' and 'st2134' (lower case only when it touches its number: 'on 2026' is no code)
CODE = re.compile(r"(?<![A-Za-z0-9])([A-Z]{2}[ -]?|[A-Za-z]{2})(\d{4})(?![\d/.\-]\d)")

MONTHS = {
    "jan": 1,
    "feb": 2,
    "mar": 3,
    "apr": 4,
    "may": 5,
    "jun": 6,
    "jul": 7,
    "aug": 8,
    "sep": 9,
    "oct": 10,
    "nov": 11,
    "dec": 12,
}
_MONTH = (
    r"(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?"
    r"|nov(?:ember)?|dec(?:ember)?)\.?"
)
_WEEKDAY = r"(?:(?:mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri|sat(?:ur)?|sun)(?:day)?\.?,?\s+)?"
_ORD = r"(?:st|nd|rd|th)?"
DATE_FORMS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("iso", re.compile(rf"\b{_WEEKDAY}(\d{{4}})-(\d{{1,2}})-(\d{{1,2}})\b", _I)),
    ("dmy", re.compile(rf"\b{_WEEKDAY}(\d{{1,2}})[/.\-](\d{{1,2}})[/.\-](\d{{4}}|\d{{2}})\b", _I)),
    (
        "d_month",
        re.compile(rf"\b{_WEEKDAY}(\d{{1,2}}){_ORD}[\s\-]+{_MONTH}(?:,?[\s\-]+(\d{{4}}|\d{{2}})(?![:.]\d))?\b", _I),
    ),
    ("month_d", re.compile(rf"\b{_WEEKDAY}{_MONTH}\s+(\d{{1,2}}){_ORD}(?:,?\s+(\d{{4}}))?\b", _I)),
)

# the am/pm group owns the space before it, so only one \s* comes before a range's separator (no backtracking)
_CLOCK = r"(\d{1,2})(?:[:.](\d{2}))?(?:\s*([ap]\.?m\.?))?"
TIME_RANGE = re.compile(rf"\b{_CLOCK}\s*(?:-|\u2013|\u2014|to|until)\s*{_CLOCK}(?![\w:])", _I)
TIME_ONE = re.compile(r"\b(\d{1,2})[:.](\d{2})(?:\s*([ap]\.?m\.?))?(?![\w:])|\b(\d{1,2})\s*([ap]\.?m\.?)(?!\w)", _I)
SESSION = re.compile(r"\b(morning|afternoon|evening|am|pm)\b(?:\s+session)?", _I)
SESSIONS = {"am": "Morning", "morning": "Morning", "pm": "Afternoon", "afternoon": "Afternoon", "evening": "Evening"}

CELL_SPLIT = re.compile(r"\t|\s*\|\s*|\s*;\s*|\s{2,}")
LABEL = re.compile(r"^(?:venue|location|place|room no\.?|hall|date|time|session|module|code|unit|paper)\s*[:\-]\s*", _I)
WEEKDAY_ONLY = re.compile(r"^(?:mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri|sat(?:ur)?|sun)(?:day)?\.?$", _I)
JUNK = " ,;|:-\u2013\u2014"

# A column header names its columns by these words.
HEADER_WORDS: dict[str, tuple[str, ...]] = {
    "code": ("code", "unit", "course code", "module code", "paper code"),
    "title": ("title", "module", "course", "paper", "subject", "name"),
    "date": ("date", "day"),
    "time": ("time", "session", "start"),
    "place": ("venue", "room", "location", "place", "hall", "centre", "center"),
}


@dataclass
class ParsedRow:
    """One row of the timetable as it was read. `problems` says what the reader couldn't find."""

    line: int  # 1-based, in the pasted text
    text: str  # the line as pasted
    unit_code: str | None = None
    date: dt.date | None = None
    time: str | None = None
    place: str | None = None
    problems: list[str] = field(default_factory=list)


# ── pieces of a line ─────────────────────────────────────────────────────────────────────────


def _year(raw: str | None, month: int, day: int, today: dt.date) -> int:
    if raw:
        n = int(raw)
        return n + 2000 if n < 100 else n
    year = today.year
    try:
        if dt.date(year, month, day) < today - dt.timedelta(days=PAST_DAYS):
            year += 1
    except ValueError:
        pass
    return year


def find_date(text: str, today: dt.date) -> tuple[dt.date, tuple[int, int]] | None:
    """The first date in `text` and where it is, or None. A date that doesn't exist (31 June) is no date."""
    found: list[tuple[int, int, dt.date]] = []
    for form, pattern in DATE_FORMS:
        for m in pattern.finditer(text):
            g = m.groups()
            try:
                if form == "iso":
                    day = dt.date(int(g[0]), int(g[1]), int(g[2]))
                elif form == "dmy":
                    d, mo = int(g[0]), int(g[1])
                    day = dt.date(_year(g[2], mo, d, today), mo, d)
                elif form == "d_month":
                    d, mo = int(g[0]), MONTHS[g[1][:3].lower()]
                    day = dt.date(_year(g[2], mo, d, today), mo, d)
                else:
                    mo, d = MONTHS[g[0][:3].lower()], int(g[1])
                    day = dt.date(_year(g[2], mo, d, today), mo, d)
            except ValueError:
                continue
            found.append((m.start(), m.end(), day))
    if not found:
        return None
    start, end, day = min(found, key=lambda f: (f[0], -f[1]))
    return day, (start, end)


def _clock(hour: str, minute: str | None, half: str | None, *, assume_pm: bool) -> str | None:
    h, mi = int(hour), int(minute or 0)
    if mi > 59:
        return None
    if half:
        if not 1 <= h <= 12:
            return None
        pm = half.lower().startswith("p")
    elif h > 23:
        return None
    elif h >= 12:
        pm = True
    elif h == 0:
        h, pm = 12, False
    else:
        pm = assume_pm or 1 <= h <= 7  # exams don't start before 8 in the morning
    if h > 12:
        h -= 12
    return f"{h}:{mi:02d} {'PM' if pm else 'AM'}"


def find_time(text: str) -> tuple[str, tuple[int, int]] | None:
    """The time in `text` ('10:00 AM', '10:00 AM to 1:00 PM', 'Morning') and where it is, or None. Read after the
    date has been taken out of the text, so '13.10' of a date is never a time."""
    for m in TIME_RANGE.finditer(text):
        h1, m1, a1, h2, m2, a2 = m.groups()
        if m1 is None and a1 is None and m2 is None and a2 is None:
            continue  # '2026 - 13': numbers, not times
        start = _clock(h1, m1, a1 or (a2 if int(h1) <= int(h2) else None), assume_pm=False)
        end = _clock(h2, m2, a2, assume_pm=int(h2) < int(h1))
        if start and end:
            return f"{start} to {end}", m.span()
    one = TIME_ONE.search(text)
    if one:
        g = one.groups()
        hour, minute, half = (g[0], g[1], g[2]) if g[0] else (g[3], None, g[4])
        clock = _clock(hour, minute, half, assume_pm=False)
        if clock:
            return clock, one.span()
    session = SESSION.search(text)
    if session:
        return SESSIONS[session.group(1).lower()], session.span()
    return None


def clean(text: str) -> str:
    """A leftover piece of a line without labels, stray punctuation and a weekday on its own."""
    text = LABEL.sub("", text.strip(JUNK + " "))
    text = re.sub(r"\s+", " ", text).strip(JUNK + " ")
    return "" if WEEKDAY_ONLY.match(text) else text


def _is_title(piece: str, title: str | None) -> bool:
    if not title:
        return False
    a, b = piece.lower(), title.lower()
    return a == b or (b.startswith(a) and len(a) >= 8)


def _strip_title(piece: str, title: str | None) -> str:
    """`piece` without the module's title in front ('Statistical Inference Hall A' -> 'Hall A')."""
    if title and piece.lower().startswith(title.lower()):
        return clean(piece[len(title) :])
    return piece


def _cut(text: str, spans: list[tuple[int, int]]) -> list[tuple[int, str]]:
    """The pieces of `text` between `spans`, each with where it starts."""
    pieces, at = [], 0
    for start, end in sorted(spans):
        if start > at:
            pieces.append((at, text[at:start]))
        at = max(at, end)
    pieces.append((at, text[at:]))
    return [(pos, c) for pos, raw in pieces if (c := clean(raw))]


# ── columns ──────────────────────────────────────────────────────────────────────────────────


def cells_of(line: str) -> list[str]:
    return [c.strip() for c in CELL_SPLIT.split(line.strip())]


def _column_role(word: str) -> str | None:
    """What a header cell names: 'Module code' is the code, 'Module' the title, 'Exam venue' the place."""
    for role in ("code", "place", "date", "time", "title"):
        if any(re.search(rf"\b{w}\b", word) for w in HEADER_WORDS[role]):
            return role
    return None


def header_columns(line: str) -> dict[str, int] | None:
    """What each column of a header line holds ({'place': 4, ...}), or None when `line` isn't a header: at least two
    cells that name a column, and no module code."""
    if CODE.search(line):
        return None
    cells = cells_of(line)
    if len(cells) < 2:
        return None
    roles: dict[str, int] = {}
    for i, cell in enumerate(cells):
        role = _column_role(cell.lower().strip(" :*"))
        if role is not None and role not in roles:
            roles[role] = i
    return roles if len(roles) >= 2 else None


# ── a row ────────────────────────────────────────────────────────────────────────────────────


def parse_line(
    line: str,
    number: int,
    today: dt.date,
    titles: Mapping[str, str],
    columns: dict[str, int] | None = None,
) -> list[ParsedRow]:
    """The rows on one line (one for each module code on it; none when it holds neither a code nor a date)."""
    codes = [f"{m.group(1)[:2].upper()}{m.group(2)}" for m in CODE.finditer(line)]
    code_spans = [m.span() for m in CODE.finditer(line)]
    rest = line
    date_found = find_date(rest, today)
    if not codes and date_found is None:
        return []
    row = ParsedRow(line=number, text=line.strip())
    spans = list(code_spans)
    if date_found is not None:
        row.date, span = date_found
        spans.append(span)
        rest = rest[: span[0]] + " " * (span[1] - span[0]) + rest[span[1] :]
    for start, end in code_spans:
        rest = rest[:start] + " " * (end - start) + rest[end:]
    time_found = find_time(rest)
    if time_found is not None:
        row.time, span = time_found
        spans.append(span)
    title = titles.get(codes[0]) if codes else None
    cells = cells_of(line)
    if columns and "place" in columns and len(cells) > columns["place"]:
        row.place = clean(cells[columns["place"]]) or None
    else:
        row.place = _place(line, spans, code_spans, date_found, time_found, title)
    if row.place and len(row.place) > MAX_PLACE:
        row.place = row.place[:MAX_PLACE].rstrip()
    if row.date is None:
        row.problems.append("No date found. Add it.")
    if not codes:
        row.problems.append("No module code found. Add it.")
        return [row]
    return [
        ParsedRow(
            line=number,
            text=row.text,
            unit_code=c,
            date=row.date,
            time=row.time,
            place=row.place,
            problems=list(row.problems),
        )
        for c in dict.fromkeys(codes)
    ]


def _place(
    line: str,
    spans: list[tuple[int, int]],
    code_spans: list[tuple[int, int]],
    date_found: tuple[dt.date, tuple[int, int]] | None,
    time_found: tuple[str, tuple[int, int]] | None,
    title: str | None,
) -> str | None:
    """The venue: what is left of the line once the code, date and time are out and the module's title is dropped.
    In cells, the last cell left; in running text, the last piece after the date or time. A lone piece between the
    code and the date is taken for a title, not a venue."""
    cells = cells_of(line)
    if len(cells) > 1:
        left = []
        for cell in cells:
            for piece in _cut_cell(cell):
                piece = _strip_title(piece, title)
                if piece and not _is_title(piece, title):
                    left.append(piece)
        if len(left) == 1 and _between_code_and_date(line, left[0], code_spans, date_found):
            return None
        return left[-1] if left else None
    pieces = [(pos, _strip_title(p, title)) for pos, p in _cut(line, spans)]
    pieces = [(pos, p) for pos, p in pieces if p and not _is_title(p, title)]
    after = max((s[1][1] for s in (date_found, time_found) if s is not None), default=-1)
    later = [p for pos, p in pieces if pos >= after]
    if later:
        return later[-1]
    if len(pieces) > 1:
        return pieces[-1][1]
    return None


def _cut_cell(cell: str) -> list[str]:
    """What is left of one cell once codes, a date and a time are out of it."""
    spans = [m.span() for m in CODE.finditer(cell)]
    found = find_date(cell, dt.date(2000, 1, 1))
    if found:
        spans.append(found[1])
    rest = cell
    for start, end in spans:
        rest = rest[:start] + " " * (end - start) + rest[end:]
    t = find_time(rest)
    if t:
        spans.append(t[1])
    return [p for _, p in _cut(cell, spans)]


def _between_code_and_date(
    line: str, piece: str, code_spans: list[tuple[int, int]], date_found: tuple[dt.date, tuple[int, int]] | None
) -> bool:
    if not code_spans or date_found is None:
        return False
    at = line.find(piece)
    return code_spans[0][1] <= at < date_found[1][0]


def parse_timetable(text: str, today: dt.date, titles: Mapping[str, str] | None = None) -> list[ParsedRow]:
    """Every row of a pasted timetable, in order. `titles` maps unit codes to module names, so a module's name
    beside its code is never taken for the venue."""
    titles = titles or {}
    rows: list[ParsedRow] = []
    columns: dict[str, int] | None = None
    for number, raw in enumerate(text.splitlines(), start=1):
        line = raw[:MAX_LINE].replace("\u00a0", " ").rstrip()
        if not line.strip():
            continue
        header = header_columns(line)
        if header is not None and find_date(line, today) is None:
            columns = header
            continue
        rows += parse_line(line, number, today, titles, columns)
    return rows
