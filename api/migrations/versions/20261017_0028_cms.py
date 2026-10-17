"""module art as data, its uploads, and the box for editing the guides

Revision ID: 0028
Revises: 0026
Create Date: 2026-10-17 12:00:00

A module's art is a picture path, like a newsletter cover: a picture of the web app ('modules/module-ec1002.png') or an
uploaded image ('/api/v1/media/<id>'). The column becomes `modules.art`, and the modules that came from the seed get
their pictures, which until now were mapped to module ids in the web app's code. Uploads gain the `module_art`
purpose. The guides (Start here, Results day, Choosing your electives) get a box of their own, `guides.edit`, which
the Rep and Content manager roles hold from the start: reps check the guides every term. A request's `wanted_kind`
takes every library kind, exam solutions included, as the model says.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0028"
down_revision: str | None = "0026"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UPLOAD_PURPOSES = ("library", "forum_image", "board", "note_file", "career_logo", "newsletter_image", "bug_screenshot")
SEEDED_ART = {
    "economics": "modules/module-ec1002.png",
    "business": "modules/module-mn1178.png",
    "mathematics": "modules/module-mt1186.png",
    "statistics": "modules/module-st1215.png",
    "advanced-stats-distribution": "modules/module-st2133.png",
    "advanced-stats-inferential": "modules/module-st2134.png",
    "programming-data-science": "modules/module-st2195.png",
    "business-analytics": "modules/module-st2187.png",
    "econometrics": "modules/module-ec2020.png",
    "information-systems": "modules/module-is2184.png",
    "machine-learning": "modules/module-machine-learning.png",
    "market-research": "modules/module-market-research.png",
    "microeconomics": "modules/module-microeconomics.png",
    "asset-pricing": "modules/module-asset-pricing.png",
    "marketing-management": "modules/module-marketing-management.png",
    "further-maths-economists": "modules/module-further-maths.png",
}
GUIDE_EDITORS = ("rep", "content-manager")
WANTED_KINDS = (
    "past-paper",
    "examiners-report",
    "subject-guide",
    "reading",
    "study-guide",
    "exercises",
    "notes",
    "cheat-sheet",
    "course-materials",
    "vle-materials",
    "other",
)


def _check(table: str, name: str, column: str, values: Sequence[str]) -> None:
    op.drop_constraint(op.f(name), table, type_="check")
    op.create_check_constraint(op.f(name), table, f"{column} IN ({', '.join(repr(v) for v in values)})")


def upgrade() -> None:
    op.alter_column("modules", "art_url", new_column_name="art")
    art = sa.text("UPDATE modules SET art = :art WHERE id = :id AND art IS NULL")
    for module_id, path in SEEDED_ART.items():
        op.execute(art.bindparams(id=module_id, art=path))
    _check("uploads", "ck_uploads_uploadpurpose", "purpose", (*UPLOAD_PURPOSES, "module_art"))
    _check("requests", "ck_requests_wanted_kind", "wanted_kind", (*WANTED_KINDS, "exam-solutions"))
    op.execute(
        sa.text(
            "INSERT INTO role_boxes (role_id, box) SELECT id, 'guides.edit' FROM roles WHERE slug IN :slugs "
            "ON CONFLICT DO NOTHING"
        ).bindparams(sa.bindparam("slugs", value=GUIDE_EDITORS, expanding=True))
    )


def downgrade() -> None:
    op.execute("DELETE FROM role_boxes WHERE box = 'guides.edit'")
    op.execute("UPDATE requests SET wanted_kind = NULL WHERE wanted_kind = 'exam-solutions'")
    _check("requests", "ck_requests_wanted_kind", "wanted_kind", WANTED_KINDS)
    op.execute("UPDATE modules SET art = NULL WHERE art LIKE '/api/v1/media/%'")
    op.execute("DELETE FROM uploads WHERE purpose = 'module_art'")
    _check("uploads", "ck_uploads_uploadpurpose", "purpose", UPLOAD_PURPOSES)
    art = sa.text("UPDATE modules SET art = NULL WHERE id = :id AND art = :art")
    for module_id, path in SEEDED_ART.items():
        op.execute(art.bindparams(id=module_id, art=path))
    op.alter_column("modules", "art", new_column_name="art_url")
