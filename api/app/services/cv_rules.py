"""Rate my CV: the rules that score a CV's text, with no AI and nothing sent anywhere (app/services/career_cv.py).

A CV gets two results:
- a score out of 100 from ten checks a recruiter's first look makes: length, contact details, the usual sections,
  bullets that start with a verb, results with numbers, filler, "I" and "my", personal details a CV leaves out, one
  way of writing dates, and how many words. Each check says what it found and, when it falls short, what to do.
- how well it fits a role from Career Navigator: which of the role's skills the CV names (each skill has words that
  show it, SKILL_WORDS) and which are missing, with the modules that teach them.

Pure: text in, result out, so every rule is unit-tested (tests/content/test_cv_rules.py)."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Literal

Status = Literal["pass", "warn", "fail"]


@dataclass(frozen=True)
class Check:
    id: str
    title: str
    earned: int
    max: int
    found: str  # what the check saw, in a sentence
    tip: str | None  # what to do, when it fell short

    @property
    def status(self) -> Status:
        if self.earned >= self.max:
            return "pass"
        return "warn" if self.earned * 2 >= self.max else "fail"


@dataclass(frozen=True)
class SkillHit:
    id: str
    name: str
    modules: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class Fit:
    role_id: str
    role_title: str
    percent: int
    found: list[SkillHit]
    missing: list[SkillHit]


@dataclass(frozen=True)
class Rating:
    score: int
    words: int
    pages: int
    checks: list[Check]


@dataclass(frozen=True)
class Skill:
    """A skill as the rules need it: its name and the modules that teach it."""

    id: str
    name: str
    modules: list[str]


# ── reading the text ─────────────────────────────────────────────────────────────────────────

BULLET = re.compile(r"^\s*(?:[•●▪◦‣∙·\-\u2013—*>]|\d{1,2}[.)])\s*")
WORD = re.compile(r"[A-Za-z][A-Za-z'\u2019-]*")


def _lines(text: str) -> list[str]:
    return [ln.strip() for ln in text.splitlines() if ln.strip()]


def _words(text: str) -> list[str]:
    return WORD.findall(text)


def _sentences(text: str) -> list[str]:
    """Bullet-sized pieces: each line, without its bullet mark, with at least four words."""
    out = []
    for ln in _lines(text):
        body = BULLET.sub("", ln)
        if len(_words(body)) >= 4:
            out.append(body)
    return out


# ── the checks ───────────────────────────────────────────────────────────────────────────────


def _length(pages: int, words: int) -> Check:
    if words < 60:
        return Check(
            "length",
            "Length",
            0,
            10,
            f"Only {words} words could be read.",
            "If your CV is a scanned picture or exported as an image, save it as a PDF from Word or Google Docs so "
            "its text can be read (by us and by recruiters' systems).",
        )
    if pages <= 1:
        return Check("length", "Length", 10, 10, "One page.", None)
    if pages == 2:
        return Check(
            "length",
            "Length",
            5,
            10,
            "Two pages.",
            "As a student or new graduate, keep it to one page: cut the oldest and least relevant lines first.",
        )
    return Check(
        "length", "Length", 0, 10, f"{pages} pages.", "Cut it to one page. Recruiters spend seconds on a first look."
    )


EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
PHONE = re.compile(r"(?:\+?\d[\d\s().-]{6,}\d)")
LINKEDIN = re.compile(r"linkedin\.com/|\blinkedin\b", re.IGNORECASE)


def _contact(text: str) -> Check:
    parts = [
        ("an email address", 5, bool(EMAIL.search(text))),
        ("a phone number", 3, any(len(re.sub(r"\D", "", m)) >= 8 for m in PHONE.findall(text))),
        ("a LinkedIn link", 2, bool(LINKEDIN.search(text))),
    ]
    earned = sum(points for _, points, ok in parts if ok)
    missing = [name for name, _, ok in parts if not ok]
    if not missing:
        return Check("contact", "Contact details", earned, 10, "Email, phone and LinkedIn are all there.", None)
    return Check(
        "contact",
        "Contact details",
        earned,
        10,
        f"Missing {_join(missing)}.",
        f"Add {_join(missing)} at the top, so a recruiter can reach you in one click.",
    )


SECTIONS: list[tuple[str, int, tuple[str, ...]]] = [
    ("Education", 6, ("education", "academic", "qualifications")),
    ("Experience", 6, ("experience", "employment", "internship", "internships", "work history")),
    ("Skills", 4, ("skills", "technical skills", "tools", "competencies")),
    ("Projects", 4, ("projects", "project", "portfolio")),
]


def _is_heading(line: str, names: tuple[str, ...]) -> bool:
    words = line.lower().strip(" :|-\u2013—").split()
    if not words or len(words) > 4:
        return False
    joined = " ".join(words)
    return any(joined == n or joined.endswith(n) or joined.startswith(n) for n in names)


def _sections(text: str) -> Check:
    lines = _lines(text)
    have = [(title, points) for title, points, names in SECTIONS if any(_is_heading(ln, names) for ln in lines)]
    earned = sum(p for _, p in have)
    missing = [title for title, _, _ in SECTIONS if title not in {t for t, _ in have}]
    if not missing:
        return Check("sections", "Sections", earned, 20, "Education, experience, skills and projects.", None)
    return Check(
        "sections",
        "Sections",
        earned,
        20,
        f"No {_join(missing, 'or')} heading found.",
        "Give each part a short heading of its own (Education, Experience, Skills, Projects). With little work "
        "experience yet, projects from your modules show what you can do.",
    )


ACTION_VERBS = frozenset(
    [
        "achieved",
        "analysed",
        "analyzed",
        "automated",
        "built",
        "calculated",
        "cleaned",
        "coached",
        "collaborated",
        "compiled",
        "completed",
        "conducted",
        "coordinated",
        "created",
        "cut",
        "decreased",
        "defined",
        "delivered",
        "designed",
        "developed",
        "drafted",
        "drove",
        "engineered",
        "established",
        "evaluated",
        "forecasted",
        "forecast",
        "founded",
        "generated",
        "grew",
        "identified",
        "implemented",
        "improved",
        "increased",
        "initiated",
        "introduced",
        "launched",
        "led",
        "maintained",
        "managed",
        "mapped",
        "measured",
        "mentored",
        "migrated",
        "modelled",
        "modeled",
        "monitored",
        "negotiated",
        "optimised",
        "optimized",
        "organised",
        "organized",
        "oversaw",
        "planned",
        "prepared",
        "presented",
        "produced",
        "programmed",
        "proposed",
        "published",
        "raised",
        "ran",
        "rebuilt",
        "reconciled",
        "redesigned",
        "reduced",
        "researched",
        "resolved",
        "reviewed",
        "saved",
        "scaled",
        "scraped",
        "simplified",
        "solved",
        "streamlined",
        "structured",
        "supervised",
        "supported",
        "taught",
        "tested",
        "trained",
        "translated",
        "tracked",
        "validated",
        "visualised",
        "visualized",
        "volunteered",
        "won",
        "wrote",
    ]
)


def _verbs(text: str) -> Check:
    lines = _sentences(text)
    if not lines:
        return Check("verbs", "Strong verbs", 0, 15, "No bullet points found.", _VERB_TIP)
    starts = sum(1 for ln in lines if (w := _words(ln)) and w[0].lower() in ACTION_VERBS)
    share = starts / len(lines)
    earned = min(15, round(15 * share / 0.4))
    found = f"{starts} of {len(lines)} lines start with an action verb."
    return Check("verbs", "Strong verbs", earned, 15, found, None if earned >= 15 else _VERB_TIP)


_VERB_TIP = (
    "Start each bullet with what you did: “Built”, “Analysed”, “Led”, “Reduced”. Not “Responsible for” or "
    "“Duties included”."
)

QUANTITY = re.compile(
    r"\d+(?:[.,]\d+)?\s*(?:%|percent|x\b|k\b|m\b)"  # 30%, 3x, 5k
    r"|(?:bhd|bd|usd|\$|£|€)\s?\d"  # money
    r"|\d[\d,]*\s+(?:users|customers|clients|people|students|rows|records|reports|hours|days|weeks|members|"
    r"transactions|accounts|participants|teams|projects|files|dashboards|models)\b",
    re.IGNORECASE,
)


def _numbers(text: str) -> Check:
    hits = sum(1 for ln in _sentences(text) if QUANTITY.search(ln))
    earned = min(15, round(15 * hits / 4))
    found = f"{hits} {'line shows' if hits == 1 else 'lines show'} a result with a number."
    tip = (
        None
        if earned >= 15
        else "Show results with numbers: “cut report time by 30%”, “cleaned 12,000 rows”, “taught 25 students”. "
        "Aim for at least four."
    )
    return Check("numbers", "Results with numbers", earned, 15, found, tip)


FILLER = (
    "hard-working",
    "hardworking",
    "team player",
    "detail-oriented",
    "detail oriented",
    "go-getter",
    "results-driven",
    "self-motivated",
    "think outside the box",
    "responsible for",
    "duties included",
    "references available",
    "references upon request",
    "excellent communication skills",
    "dynamic individual",
)


def _filler(text: str) -> Check:
    low = text.lower()
    used = [f for f in FILLER if f in low]
    earned = max(0, 10 - 3 * len(used))
    if not used:
        return Check("filler", "No filler", 10, 10, "No stock phrases found.", None)
    return Check(
        "filler",
        "No filler",
        earned,
        10,
        f"Found {_join([f'“{u}”' for u in used[:4]])}.",
        "Swap stock phrases for evidence: instead of “team player”, say what the team did and your part in it.",
    )


PRONOUNS = re.compile(r"\b(?:I|me|my|myself)\b")


def _pronouns(text: str) -> Check:
    n = len(PRONOUNS.findall(text))
    if n <= 2:
        return Check("pronouns", "No “I” or “my”", 5, 5, "Written without “I” and “my”.", None)
    return Check(
        "pronouns",
        "No “I” or “my”",
        2 if n <= 6 else 0,
        5,
        f"“I”, “me” or “my” appears {n} times.",
        "Drop “I” and “my” from bullets: “Built a dashboard”, not “I built a dashboard”.",
    )


PERSONAL = (
    ("date of birth", re.compile(r"\b(?:date of birth|d\.?o\.?b\.?|birth ?date)\b", re.IGNORECASE)),
    ("marital status", re.compile(r"\bmarital status\b|\b(?:single|married)\b(?=\s*(?:\n|$|,))", re.IGNORECASE)),
    ("religion", re.compile(r"\breligion\b", re.IGNORECASE)),
    ("a CPR or passport number", re.compile(r"\b(?:cpr|passport)\s*(?:no\.?|number|#)?\s*:?\s*\d{6,}", re.IGNORECASE)),
)


def _personal(text: str) -> Check:
    found = [name for name, rx in PERSONAL if rx.search(text)]
    if not found:
        return Check("personal", "Private details left out", 5, 5, "No private details found.", None)
    return Check(
        "personal",
        "Private details left out",
        0,
        5,
        f"Shows {_join(found)}.",
        "Leave out your date of birth, marital status, religion and ID numbers: they don't help you get the job, "
        "and anyone you send the CV to keeps them.",
    )


MONTHS = r"(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*"
DATE_STYLES = {
    "Month Year": re.compile(rf"\b{MONTHS}\.?\s+(?:19|20)\d\d\b", re.IGNORECASE),
    "MM/YYYY": re.compile(r"\b(?:0?[1-9]|1[0-2])\s*[/.-]\s*(?:19|20)\d\d\b"),
    "YYYY-MM": re.compile(r"\b(?:19|20)\d\d-(?:0[1-9]|1[0-2])\b"),
}


def _dates(text: str) -> Check:
    styles = [name for name, rx in DATE_STYLES.items() if rx.search(text)]
    if len(styles) <= 1:
        return Check("dates", "Dates written one way", 5, 5, "Dates follow one style.", None)
    return Check(
        "dates",
        "Dates written one way",
        2,
        5,
        f"Dates are written as {_join(styles)}.",
        "Pick one way of writing dates, such as “Sep 2025 \u2013 Jun 2026”, and use it everywhere.",
    )


def _word_count(words: int) -> Check:
    if 250 <= words <= 700:
        return Check("words", "Amount of text", 5, 5, f"{words} words.", None)
    if words < 250:
        return Check(
            "words",
            "Amount of text",
            2 if words >= 150 else 0,
            5,
            f"{words} words.",
            "There's room to say more: add a project from a module, with what you built and what it showed.",
        )
    return Check(
        "words",
        "Amount of text",
        2 if words <= 900 else 0,
        5,
        f"{words} words.",
        "It's wordy: keep each bullet to one line and cut anything older than school leaving.",
    )


def _join(items: list[str], last: str = "and") -> str:
    if len(items) <= 1:
        return "".join(items)
    return f"{', '.join(items[:-1])} {last} {items[-1]}"


def rate(pages: list[str]) -> Rating:
    """The CV's score out of 100 and the checks behind it."""
    text = "\n".join(pages)
    words = len(_words(text))
    checks = [
        _length(len(pages), words),
        _contact(text),
        _sections(text),
        _verbs(text),
        _numbers(text),
        _filler(text),
        _pronouns(text),
        _personal(text),
        _dates(text),
        _word_count(words),
    ]
    return Rating(score=sum(c.earned for c in checks), words=words, pages=len(pages), checks=checks)


# ── fit for a role ───────────────────────────────────────────────────────────────────────────

# The words that show a skill on a CV, by Career Navigator's skill id. A skill the editors add later is matched by
# the longer words of its name.
SKILL_WORDS: dict[str, tuple[str, ...]] = {
    "sql": ("sql", "mysql", "postgres", "postgresql", "sqlite", "t-sql", "database", "databases", "bigquery"),
    "programming": ("python", "r programming", "rstudio", "tidyverse", "jupyter", "pandas", "numpy", "java", "c++"),
    "wrangling": (
        "data cleaning",
        "cleaned",
        "wrangling",
        "pandas",
        "dplyr",
        "etl",
        "preprocessing",
        "data preparation",
    ),
    "git": ("git", "github", "gitlab", "version control"),
    "software-eng": (
        "object-oriented",
        "oop",
        "unit test",
        "testing",
        "api",
        "software development",
        "flask",
        "django",
    ),
    "excel": ("excel", "spreadsheet", "spreadsheets", "vlookup", "xlookup", "pivot table", "pivot tables", "solver"),
    "dataviz": (
        "visualisation",
        "visualization",
        "visualised",
        "visualized",
        "matplotlib",
        "ggplot",
        "seaborn",
        "charts",
    ),
    "bi": ("power bi", "powerbi", "tableau", "looker", "qlik", "dashboard", "dashboards"),
    "bi-modelling": ("dax", "data model", "data modelling", "data modeling", "star schema", "power query"),
    "cloud": ("aws", "azure", "google cloud", "gcp", "cloud"),
    "deployment": ("deployed", "deployment", "docker", "mlops", "production", "streamlit"),
    "inference": ("hypothesis", "t-test", "confidence interval", "statistical", "statistics", "anova", "p-value"),
    "probability": ("probability", "distribution", "distributions", "bayesian", "monte carlo", "stochastic"),
    "regression": ("regression", "linear model", "logistic", "econometrics"),
    "forecasting": ("forecast", "forecasting", "forecasted", "time series", "arima"),
    "ml": (
        "machine learning",
        "scikit-learn",
        "sklearn",
        "classification",
        "clustering",
        "random forest",
        "xgboost",
        "neural network",
        "deep learning",
        "tensorflow",
        "pytorch",
    ),
    "decision": (
        "decision analysis",
        "optimisation",
        "optimization",
        "linear programming",
        "simulation",
        "decision tree",
    ),
    "maths": ("calculus", "linear algebra", "mathematics", "mathematical", "matrix", "matrices"),
    "experiments": ("a/b test", "a/b testing", "experiment", "experiments", "experimental design", "randomised"),
    "survey": ("survey", "surveys", "questionnaire", "sampling"),
    "business": ("business", "stakeholder", "stakeholders", "strategy", "requirements", "process improvement"),
    "economics": ("economics", "economic", "microeconomics", "macroeconomics", "market analysis"),
    "systems": ("information systems", "erp", "sap", "crm", "systems analysis", "process mapping", "uml"),
    "project": ("project management", "agile", "scrum", "jira", "led a team", "coordinated", "timeline"),
    "valuation": (
        "valuation",
        "dcf",
        "discounted cash flow",
        "financial model",
        "financial modelling",
        "equity research",
    ),
    "accounting": (
        "accounting",
        "financial statements",
        "ifrs",
        "balance sheet",
        "income statement",
        "bookkeeping",
        "reconciled",
        "reconciliation",
    ),
    "credit-risk": (
        "credit risk",
        "risk management",
        "credit scoring",
        "basel",
        "value at risk",
        "probability of default",
    ),
    "presenting": ("presented", "presentation", "presentations", "public speaking", "storytelling", "reported to"),
    "structuring": ("case study", "case competition", "problem solving", "structured", "framework", "consulting"),
    "product-metrics": (
        "product analytics",
        "kpi",
        "kpis",
        "metrics",
        "funnel",
        "retention",
        "churn",
        "cohort",
        "google analytics",
    ),
}

_SHORT = {"r", "c", "a", "an", "and", "or", "of", "the", "with", "for", "to", "in", "on"}


def _shows(text_low: str, word: str) -> bool:
    # Word edges, so "sql" doesn't match inside another word and "var" needs to stand alone.
    return re.search(rf"(?<![a-z0-9]){re.escape(word)}(?![a-z0-9])", text_low) is not None


def _words_for(skill: Skill) -> tuple[str, ...]:
    words = SKILL_WORDS.get(skill.id)
    if words:
        return words
    return tuple(w for w in re.findall(r"[a-z][a-z+#-]+", skill.name.lower()) if len(w) >= 4 and w not in _SHORT)


R_LANGUAGE = re.compile(r"(?:^|[\s,(/])R(?=[\s,)/;.]|$)", re.MULTILINE)


def fit(pages: list[str], role_id: str, role_title: str, skills: list[Skill]) -> Fit:
    """Which of the role's skills (most important first) the CV names, and which it doesn't."""
    text = "\n".join(pages)
    low = text.lower()
    found: list[SkillHit] = []
    missing: list[SkillHit] = []
    for s in skills:
        hit = any(_shows(low, w) for w in _words_for(s))
        if s.id == "programming" and not hit:
            hit = R_LANGUAGE.search(text) is not None  # R written alone, as in "Python, R and SQL"
        (found if hit else missing).append(SkillHit(s.id, s.name, s.modules))
    percent = round(100 * len(found) / len(skills)) if skills else 0
    return Fit(role_id=role_id, role_title=role_title, percent=percent, found=found, missing=missing)
