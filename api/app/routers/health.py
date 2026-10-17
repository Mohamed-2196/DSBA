from __future__ import annotations

from sqlalchemy import text

from app.config import get_settings
from app.core.security import DB
from app.routers._base import router_for
from app.schemas.misc import Health
from app.services.storage import get_storage

router = router_for("health")
VERSION = "0.1.0"


@router.get("/health", response_model=Health)
def health(db: DB) -> Health:
    """Liveness and dependencies (the database and the object store), and the commit this API runs, so a deploy can
    be checked against the push that made it."""
    try:
        db.execute(text("select 1"))
        database = "ok"
    except Exception:  # a health check: any failure means "down"
        database = "error"
    storage = "ok" if get_storage().ping() else "error"
    return Health(
        status="ok" if database == storage == "ok" else "degraded",
        database=database,
        storage=storage,
        version=VERSION,
        commit=get_settings().commit,
    )
