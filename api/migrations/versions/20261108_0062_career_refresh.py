# ruff: noqa: RUF001 - the page's words use typographic apostrophes and dashes, as the seed does
"""Career Navigator: every link and programme re-checked on 8 November 2026

Revision ID: 0062
Revises: 0061
Create Date: 2026-11-08 21:00:00

A saved Career Navigator document (content_docs 'career') gets the re-check's changes, part by part, so anything else
an editor changed stays as it is. The version goes up, so an editor with the old one open is asked to load it
again. The seed (app/seed/data/career.json) already has them for a new install. Sources are
in web/src/features/career/SOURCES.md.

- Bahrain EDB goes: its site has no careers pages. Four employers come in: Gulf Air, Information & eGovernment
  Authority, Singapore Gulf Bank and Bahrain Commercial Facilities Company (each added once, if it isn't there).
- Eight employers' links, buttons, programmes or text change; the CFA Research Challenge card no longer invites
  students into a season whose teams have formed; the Google Data Analytics link opens its Coursera page.
- Further study gets a short list of courses and scholarships with their dates; the certificates note and the
  employers note gain Tamkeen's funding.

Going back leaves the document as it is: the old entries were out of date.
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from typing import Any

import sqlalchemy as sa
from alembic import op

revision: str = "0062"
down_revision: str | None = "0061"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

CHECKED_ON = "8 November 2026"

# What the seed had before this re-check: a part still equal to it hasn't been changed by an editor.
OLD: dict[str, Any] = {
    "employersNote": (
        "Every button opens the employer’s own careers or programme page in a new tab. Programmes open and close "
        "during the year and each sets its own entry rules, so check the page for current dates. The track tags are "
        "our guide to the kind of work, not a list of vacancies. Logos belong to their owners and are shown only to "
        "identify each organisation; DSBA Hub is not affiliated with or endorsed by any of them."
    ),
    "certNote": "Fees, exam dates and entry rules change, so check each official page before you plan around one.",
    "furtherStudy": {
        "title": "Thinking about an MSc instead?",
        "body": (
            "Most courses publish a minimum degree class and may ask about your maths and statistics modules. Check "
            "the entry rules early, and keep an eye on your projected class."
        ),
        "action": {"to": "/grades", "label": "Open the grade calculator"},
    },
}

EMPLOYERS_NOTE = (
    "Every button opens the employer’s own careers or programme page in a new tab. Programmes open and close during "
    "the year, and many are for Bahraini nationals only, so check each page for dates and entry rules. If you’re "
    "Bahraini, Tamkeen’s National Employment Program can pay part of a new graduate’s salary for up to five years; "
    "the employer applies for it. The track tags are our guide to the kind of work, not a list of vacancies. Logos "
    "belong to their owners and are shown only to identify each organisation; DSBA Hub is not affiliated with or "
    "endorsed by any of them."
)

CERT_NOTE = (
    "Fees, exam dates and entry rules change, so check each official page before you plan around one. Bahraini job "
    "seekers can get some of these paid for by Tamkeen’s Tamakkan programme: CFA, FRM and AWS Cloud Practitioner are "
    "on its approved list."
)

REMOVED_EMPLOYERS = ("bahrain-edb",)

# Employer id → the fields that change (the rest of the entry stays as saved).
EMPLOYER_CHANGES: dict[str, dict[str, Any]] = {
    "cbb": {
        "why": "Six months of work across the central bank’s directorates, with projects, workshops and field visits.",
    },
    "stc-bahrain": {"cta": "programme"},
    "bapco-energies": {
        "offers": [
            {"type": "graduate", "name": "Information and Digital Technology Graduate Trainee Program"},
            {"type": "internship", "name": "Empower Internship Program"},
        ],
        "why": (
            "A one-year programme built on on-the-job learning in the energy group’s information and digital "
            "technology teams. Empower is an eight-week summer internship matched to your major."
        ),
    },
    "sico": {"url": "https://sicobank.com/internship", "cta": "programme"},
    "bahrain-bourse": {"cta": "programme"},
    "gib": {
        "offers": [{"type": "careers"}],
        "why": (
            "GIB has run a Bahrain internship for new graduates in past years (2022, 2024 and 2025). Check its job "
            "search for the next one."
        ),
        "url": "https://www.gib.com/en/careers-home-page.html",
    },
    "ey": {
        "offers": [{"type": "graduate", "name": "Consulting Graduate Program"}],
        "why": (
            "EY’s early careers board lists a Consulting Graduate Program and an audit graduate opening in Manama, "
            "both for recent graduates who are nationals."
        ),
    },
    "al-salam-bank": {"url": "https://www.alsalambank.com/about/careers/"},
}

NEW_EMPLOYERS: list[dict[str, Any]] = [
    {
        "id": "gulf-air",
        "name": "Gulf Air",
        "mono": "GF",
        "sector": "Airline",
        "offers": [{"type": "internship"}],
        "tracks": ["business", "tech"],
        "why": (
            "A two-month summer internship for university students, run with Bahrain Airport Company and counted "
            "towards graduation. 135 students took part in 2026."
        ),
        "url": "https://www.gulfair.com/careers",
        "cta": "roles",
    },
    {
        "id": "iga",
        "name": "Information & eGovernment Authority",
        "mono": "iGA",
        "sector": "Public body",
        "offers": [{"type": "graduate", "name": "Technical Development Program"}],
        "tracks": ["tech", "data"],
        "why": (
            "A paid year of on-the-job training in the government’s digital teams for Bahraini graduates in IT, "
            "computer science or a related field."
        ),
        "url": "https://www.iga.gov.bh/en/category/the-technical-development-program",
        "cta": "programme",
    },
    {
        "id": "sgb",
        "name": "Singapore Gulf Bank",
        "mono": "SGB",
        "sector": "Bank",
        "offers": [{"type": "graduate", "name": "Graduate Internship Programme"}],
        "tracks": ["quant", "tech"],
        "why": (
            "Three months for Bahraini graduates across banking and finance, digital finance, operations, business "
            "development and risk at a digital bank in Bahrain."
        ),
        "url": "https://www.sgb.com/insights/2026-internship-programme",
        "cta": "programme",
    },
    {
        "id": "bcfc",
        "name": "Bahrain Commercial Facilities Company",
        "mono": "BCFC",
        "sector": "Finance",
        "offers": [{"type": "internship", "name": "Bidaya"}],
        "tracks": ["quant", "business"],
        "why": (
            "Bidaya is a two-month summer programme for university students and recent graduates, rotating across "
            "the departments of a consumer finance company."
        ),
        "url": "https://www.bcfc.bh/en/about-bcfc/careers/",
        "cta": "roles",
    },
]

FEATURED_ID = "cfa-research-challenge"
FEATURED_CHANGES = {
    "badge": "This season’s teams are set",
    "open": False,
    "note": "Teams for the 2026–27 season formed in October. Ask the programme office about joining next season.",
}

CERT_CHANGES: dict[str, dict[str, Any]] = {
    "google-da": {"url": "https://www.coursera.org/professional-certificates/google-data-analytics"},
}

# Role id → skill id → the new text of that role's step for the skill.
ROLE_STEP_TEXT = {
    "financial-analyst": {
        "presenting": "Enter the CFA Institute Research Challenge next season and present to a panel.",
    },
}

FURTHER_STUDY: dict[str, Any] = {
    "title": "Thinking about an MSc instead?",
    "body": (
        "Most courses publish a minimum degree class and may ask about your maths and statistics modules. Check the "
        "entry rules early, and keep an eye on your projected class. These courses and scholarships take "
        "applications for 2027. Chevening scholarships aren’t open to Bahraini citizens."
    ),
    "action": {"to": "/grades", "label": "Open the grade calculator"},
    "options": [
        {
            "name": "Gates Cambridge Scholarship",
            "note": "The full cost of a Cambridge master’s or PhD, for applicants from outside the UK.",
            "when": "8 Dec 2026 or 6 Jan 2027, by course",
            "url": "https://www.gatescambridge.org/apply/timeline/",
        },
        {
            "name": "MBZUAI master’s, Abu Dhabi",
            "note": "AI master’s degrees, including Statistics and Data Science. Funding may be offered, not promised.",
            "when": "Closes 15 Dec 2026",
            "url": "https://mbzuai.ac.ae/study/graduate-admission-process/",
        },
        {
            "name": "KAUST MS, Saudi Arabia",
            "note": "Most admitted students get the KAUST Fellowship: tuition, a stipend and housing.",
            "when": "Closes 3 Jan 2027 (tentative)",
            "url": "https://admissions.kaust.edu.sa/how-to-apply/admission-timelines",
        },
        {
            "name": "Erasmus Mundus: CoDaS",
            "note": (
                "A two-year master’s in communications engineering and data science across two European countries, "
                "with EU scholarships for top applicants. Other Erasmus Mundus courses set their own dates."
            ),
            "when": "1 Dec 2026 to 5 Jan 2027",
            "url": "https://codas.dice.aalto.fi/admission.html",
        },
        {
            "name": "HBKU MSc Data Science and Engineering, Qatar",
            "note": "For graduates in computer science, engineering, maths or a related field, with a GPA of 3.0 or more.",
            "when": "Closes 1 Feb 2027 for international applicants",
            "url": "https://www.hbku.edu.qa/en/graduate-admissions",
        },
        {
            "name": "AlMabarrah AlKhalifia Foundation postgraduate scholarship",
            "note": (
                "For outstanding Bahrainis aged 23 and over, towards a master’s or PhD at a leading international "
                "university."
            ),
            "when": None,
            "url": "https://mkfbh.org/",
        },
    ],
}


def _unless_edited(data: dict[str, Any], key: str, new: Any) -> Any:
    """The new value, unless an editor changed this part from what the seed had before (then theirs stays)."""
    return new if key not in data or data[key] == OLD.get(key) else data[key]


def refresh(data: dict[str, Any]) -> dict[str, Any]:
    """The document with the re-check's changes. Safe to run twice: new employers are added only once.

    The two notes and the further-study title, text and button change only if an editor hasn't changed them;
    further study switched off stays off. EDB stays if the featured card uses its logo. A new employer gets only
    the tracks the document has, so the result stays a valid document.
    """
    data = dict(data)
    data["checkedOn"] = CHECKED_ON
    data["employersNote"] = _unless_edited(data, "employersNote", EMPLOYERS_NOTE)
    data["certNote"] = _unless_edited(data, "certNote", CERT_NOTE)

    featured = data.get("featured")
    logo = featured.get("logo") if isinstance(featured, dict) else None
    in_use = {logo.get("id")} if isinstance(logo, dict) and logo.get("kind") == "employer" else set()
    removed = set(REMOVED_EMPLOYERS) - in_use
    employers = [dict(e) for e in data.get("employers", []) if e.get("id") not in removed]
    for e in employers:
        e.update(EMPLOYER_CHANGES.get(e.get("id", ""), {}))
    have = {e.get("id") for e in employers}
    tracks = {t.get("id") for t in data.get("tracks", []) if isinstance(t, dict)}
    employers += [
        {**e, "tracks": [t for t in e["tracks"] if t in tracks]} for e in NEW_EMPLOYERS if e["id"] not in have
    ]
    data["employers"] = employers

    if isinstance(featured, dict) and featured.get("id") == FEATURED_ID:
        data["featured"] = {**featured, **FEATURED_CHANGES}

    data["certs"] = [{**c, **CERT_CHANGES.get(c.get("id", ""), {})} for c in data.get("certs", [])]

    roles = []
    for r in data.get("roles", []):
        texts = ROLE_STEP_TEXT.get(r.get("id", ""), {})
        close = dict(r.get("close") or {})
        for skill, text in texts.items():
            if isinstance(close.get(skill), dict):
                close[skill] = {**close[skill], "text": text}
        roles.append({**r, "close": close} if texts else r)
    data["roles"] = roles

    study = data.get("furtherStudy", OLD["furtherStudy"])
    if isinstance(study, dict):
        before = OLD["furtherStudy"]
        kept = {k: v for k, v in study.items() if k != "options" and k in before and v != before[k]}
        data["furtherStudy"] = {**FURTHER_STUDY, **kept}
    return data


def upgrade() -> None:
    db = op.get_bind()
    row = db.execute(sa.text("SELECT data FROM content_docs WHERE key = 'career'")).first()
    if row is None or not isinstance(row[0], dict):
        return  # a new install loads the seed, which has the changes
    db.execute(
        sa.text(
            "UPDATE content_docs SET data = CAST(:data AS jsonb), version = version + 1, updated_at = now(), "
            "updated_by = NULL WHERE key = 'career'"
        ),
        {"data": json.dumps(refresh(row[0]))},
    )


def downgrade() -> None:
    pass
