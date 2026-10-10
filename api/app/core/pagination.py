from __future__ import annotations

from typing import Annotated

from fastapi import Query

Limit = Annotated[int, Query(ge=1, le=100, description="Page size")]
Offset = Annotated[int, Query(ge=0, description="Items to skip")]
