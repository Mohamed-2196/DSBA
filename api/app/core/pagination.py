from __future__ import annotations

from typing import Annotated

from fastapi import Query

Limit = Annotated[int, Query(ge=1, le=100, description="Page size")]
# Bounded: no list is anywhere near this long, and a huge value would overflow the database's integer (SEC-5).
Offset = Annotated[int, Query(ge=0, le=100_000, description="Items to skip")]

# A cohort in a query string ("?year=2"). Body fields use schemas.common.Year (a JSON number 1-3).
YearParam = Annotated[int, Query(ge=1, le=3, description="Cohort: 1, 2 or 3")]
