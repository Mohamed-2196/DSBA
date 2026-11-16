"""Rate my CV's rules (app/services/cv_rules.py): each check, the score, and the fit for a role."""

from __future__ import annotations

from app.services import cv_rules
from app.services.cv_rules import Skill

GOOD = """Sara Ahmed
sara.ahmed@example.com | +973 3300 0000 | linkedin.com/in/sara-example

Education
BSc Data Science and Business Analytics, University of London (BIBF), Sep 2024 \u2013 Jun 2027

Experience
Data intern, Example Bank, Jun 2026 \u2013 Aug 2026
• Built a Power BI dashboard that cut monthly report time by 30%
• Cleaned 12,000 rows of customer records with Python and pandas
• Presented findings to 15 people in the retail team

Projects
• Analysed 3 years of sales with SQL and forecast demand with ARIMA, within 5% of the actual figures
• Trained a logistic regression model to predict churn for 2,000 customers
• Led a team of 4 students in a case competition and won second place

Skills
SQL, Python, R, Excel (pivot tables, XLOOKUP), Power BI, Git
"""

BAD = """Ali
My Curriculum Vitae
I am a hard-working team player and detail-oriented person.
Date of birth: 1 January 2005
Marital status: Single
I was responsible for helping my manager with reports and I did many tasks for my team.
References available upon request.
"""


def checks_by_id(text: str) -> dict[str, cv_rules.Check]:
    return {c.id: c for c in cv_rules.rate([text]).checks}


def test_a_strong_cv_passes_every_check() -> None:
    rating = cv_rules.rate([GOOD])
    failing = [(c.id, c.found) for c in rating.checks if c.status != "pass" and c.id != "words"]
    assert failing == []
    assert rating.score >= 90
    assert sum(c.max for c in rating.checks) == 100


def test_a_weak_cv_scores_low_and_says_what_to_fix() -> None:
    rating = cv_rules.rate([BAD])
    assert rating.score < 40
    c = checks_by_id(BAD)
    assert c["length"].earned == 0
    assert c["length"].tip
    assert c["contact"].found == "Missing an email address, a phone number and a LinkedIn link."
    assert "“hard-working”" in c["filler"].found
    assert c["filler"].status == "fail"
    assert c["personal"].found == "Shows date of birth and marital status."
    assert c["pronouns"].status != "pass"
    assert all(ch.tip for ch in rating.checks if ch.status != "pass")


def test_length_counts_pages() -> None:
    long_page = GOOD + "\n" + "\n".join(f"• Built report number {i} for the finance team" for i in range(20))
    assert cv_rules.rate([long_page]).checks[0].earned == 10
    assert cv_rules.rate([long_page, long_page]).checks[0].earned == 5
    assert cv_rules.rate([long_page] * 3).checks[0].earned == 0


def test_sections_need_their_own_headings() -> None:
    c = checks_by_id("Education\nBSc\nWork experience\nIntern\nTechnical skills\nSQL")
    assert (c["sections"].earned, c["sections"].found) == (16, "No Projects heading found.")
    # A word in a sentence is not a heading.
    assert checks_by_id("I have skills and experience in projects at school.")["sections"].earned == 0


def test_bullets_that_start_with_a_verb_and_show_numbers() -> None:
    weak = "\n".join(["• Helped with the weekly reports for the team"] * 5)
    c = checks_by_id(weak)
    assert (c["verbs"].earned, c["numbers"].earned) == (0, 0)
    strong = "\n".join(
        [
            "• Reduced the close time by 2 days for the team",
            "• Built 3 dashboards used by 40 people in sales",
            "• Automated invoices worth BHD 5,000 a month",
            "• Grew newsletter readers by 25% in one term",
        ]
    )
    c = checks_by_id(strong)
    assert (c["verbs"].earned, c["numbers"].earned) == (15, 15)


def test_dates_written_two_ways_lose_points() -> None:
    assert checks_by_id("Sep 2024 \u2013 Jun 2025\nOct 2025 \u2013 now")["dates"].earned == 5
    assert checks_by_id("Sep 2024 \u2013 Jun 2025\n10/2025 \u2013 12/2025")["dates"].earned == 2


def test_fit_names_the_skills_the_cv_shows_and_those_it_misses() -> None:
    skills = [
        Skill("sql", "SQL and databases", ["programming-data-science"]),
        Skill("programming", "Python and R", ["programming-data-science"]),
        Skill("bi", "Dashboards", ["business-analytics"]),
        Skill("ml", "Machine learning", ["machine-learning"]),
        Skill("custom-skill", "Stakeholder interviews", []),
    ]
    fit = cv_rules.fit([GOOD], "data-analyst", "Data analyst", skills)
    assert [s.id for s in fit.found] == ["sql", "programming", "bi"]
    assert [s.id for s in fit.missing] == ["ml", "custom-skill"]
    assert fit.percent == 60
    assert fit.missing[0].modules == ["machine-learning"]


def test_r_counts_only_written_alone_and_words_need_their_edges() -> None:
    skills = [Skill("programming", "Python and R", []), Skill("sql", "SQL", [])]
    assert cv_rules.fit(["Tools: Excel, R and Tableau"], "x", "X", skills).found[0].id == "programming"
    assert cv_rules.fit(["Research Ready Reports"], "x", "X", skills).found == []
    assert cv_rules.fit(["nosqlite fans"], "x", "X", skills[1:]).found == []
