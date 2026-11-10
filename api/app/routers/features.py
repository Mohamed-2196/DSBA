"""Which features are on, and which outside services the privacy notice names. Owner: lead."""

from __future__ import annotations

from app.core.security import DB, OptionalUser
from app.routers._base import router_for
from app.schemas.access import FeaturesOut, PrivacyOut
from app.services import access, privacy

router = router_for("features")


@router.get("/features", response_model=FeaturesOut)
def features(db: DB, user: OptionalUser) -> FeaturesOut:
    """The features on for whoever asks: for a guest, those switched on for everyone. Signed in, the same list as
    /me's `features`."""
    return FeaturesOut(features=[f.value for f in access.features_on(db, user)])


@router.get("/privacy", response_model=PrivacyOut)
def privacy_services(db: DB) -> PrivacyOut:
    """The outside services that handle people's data right now, for the privacy notice: the same for everyone."""
    return privacy.services(db)
