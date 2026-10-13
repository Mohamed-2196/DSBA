"""Roles and feature switches, for admins (the Access screen). Changes need a recent step-up (POST /me/step-up).
Owner: lead."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import Request, Response, status

from app.core.access import Feature
from app.core.security import DB, client_ip, requires_admin
from app.models import User
from app.routers._base import SteppedUpAdmin, router_for
from app.schemas.access import FeatureKey, FeatureOut, RoleCatalogue, RoleCreate, RoleOut, RoleUpdate, SwitchUpdate
from app.services import roles

router = router_for("access")

AdminOnly = Annotated[User, requires_admin()]


@router.get("/admin/roles", response_model=RoleCatalogue)
def list_roles(user: AdminOnly, db: DB) -> RoleCatalogue:
    """Every role with its boxes and how many people hold it, and every box with its area and label."""
    return roles.catalogue(db)


@router.post("/admin/roles", response_model=RoleOut, status_code=status.HTTP_201_CREATED)
def create_role(body: RoleCreate, request: Request, user: SteppedUpAdmin, db: DB) -> RoleOut:
    """Errors: step_up_required (403), invalid_input (422: another role has this name or badge, or the badge passes
    for staff), rate_limited (429). Audited."""
    role = roles.create_role(db, user, body, client_ip(request))
    db.commit()
    return roles.role_out(db, role)


@router.patch("/admin/roles/{role_id}", response_model=RoleOut)
def update_role(role_id: UUID, body: RoleUpdate, request: Request, user: SteppedUpAdmin, db: DB) -> RoleOut:
    """Send the `version` you loaded. Errors: step_up_required (403), role_locked (409: Admin), role_changed (409:
    changed since you loaded it), invalid_input (422: as for a new role, or a box beyond the student-level ones on
    Student), rate_limited (429). Audited."""
    role = roles.update_role(db, user, role_id, body, client_ip(request))
    db.commit()
    return roles.role_out(db, role)


@router.delete("/admin/roles/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_role(role_id: UUID, request: Request, user: SteppedUpAdmin, db: DB) -> Response:
    """Its holders lose it and are told. Errors: step_up_required (403), role_locked (409: a built-in role),
    role_in_use (409: a feature switch is on for it), rate_limited (429). Audited."""
    roles.delete_role(db, user, role_id, client_ip(request))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/admin/features", response_model=list[FeatureOut])
def list_features(user: AdminOnly, db: DB) -> list[FeatureOut]:
    return roles.switch_list(db)


@router.put("/admin/features/{feature}", response_model=FeatureOut)
def set_feature(feature: FeatureKey, body: SwitchUpdate, request: Request, user: SteppedUpAdmin, db: DB) -> FeatureOut:
    """Off, on for some roles (`roleIds`), or on for everyone. Errors: step_up_required (403), invalid_input (422: no
    roles, or a role that doesn't exist), rate_limited (429). Audited."""
    out = roles.set_switch(db, user, Feature(feature), body, client_ip(request))
    db.commit()
    return out
