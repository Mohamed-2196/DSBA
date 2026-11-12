"""Career Navigator's postgraduate options get a kind, a region and a closing day

Revision ID: 0069
Revises: 0068
Create Date: 2026-11-12 18:00:00

The Postgraduates tab filters its courses and scholarships by kind and by region and sorts them by the day they close
(app/schemas/career.py, FurtherStudyOption). A saved Career Navigator document (content_docs 'career') gets these for
the six options the seed lists, matched by their official page; an option an editor added keeps the defaults (a
course, no region, no closing day) until an editor fills them in. The version goes up, so an editor with the old one
open is asked to load it again. The seed (app/seed/data/career.json) already has them for a new install.

Going back leaves the document as it is: the extra fields are ignored by nothing and harm nothing.
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from typing import Any

import sqlalchemy as sa
from alembic import op

revision: str = "0069"
down_revision: str | None = "0068"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# An option's official page → its kind, region and closing day (as the seed has them).
BY_URL: dict[str, dict[str, Any]] = {
    "https://www.gatescambridge.org/apply/timeline/": {"kind": "scholarship", "region": "UK", "closes": "2026-12-08"},
    "https://mbzuai.ac.ae/study/graduate-admission-process/": {
        "kind": "course",
        "region": "Gulf",
        "closes": "2026-12-15",
    },
    "https://admissions.kaust.edu.sa/how-to-apply/admission-timelines": {
        "kind": "course",
        "region": "Gulf",
        "closes": "2027-01-03",
    },
    "https://codas.dice.aalto.fi/admission.html": {"kind": "course", "region": "Europe", "closes": "2027-01-05"},
    "https://www.hbku.edu.qa/en/graduate-admissions": {"kind": "course", "region": "Gulf", "closes": "2027-02-01"},
    "https://mkfbh.org/": {"kind": "scholarship", "region": "Bahrain", "closes": None},
}


def filled(doc: dict[str, Any]) -> dict[str, Any] | None:
    """The document with the known options filled in (fields an editor set are kept), or None when nothing changes."""
    study = doc.get("furtherStudy")
    if not isinstance(study, dict) or not isinstance(study.get("options"), list):
        return None
    changed = False
    options = []
    for option in study["options"]:
        known = BY_URL.get(option.get("url")) if isinstance(option, dict) else None
        if known is None:
            options.append(option)
            continue
        merged = {**option, **{k: v for k, v in known.items() if k not in option}}
        changed = changed or merged != option
        options.append(merged)
    if not changed:
        return None
    return {**doc, "furtherStudy": {**study, "options": options}}


def upgrade() -> None:
    db = op.get_bind()
    row = db.execute(sa.text("SELECT data FROM content_docs WHERE key = 'career'")).first()
    if row is None or not isinstance(row[0], dict):
        return  # a new install loads the seed, which has them
    doc = filled(row[0])
    if doc is None:
        return
    db.execute(
        sa.text(
            "UPDATE content_docs SET data = CAST(:data AS jsonb), version = version + 1, updated_at = now(), "
            "updated_by = NULL WHERE key = 'career'"
        ),
        {"data": json.dumps(doc)},
    )


def downgrade() -> None:
    pass
