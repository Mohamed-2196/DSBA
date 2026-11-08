from __future__ import annotations

from typing import Annotated

from pydantic import Field, StringConstraints

from app.models.push import ENDPOINT_MAX
from app.schemas.common import ApiModel

Endpoint = Annotated[str, StringConstraints(min_length=1, max_length=ENDPOINT_MAX)]


class PushKeyOut(ApiModel):
    public_key: str  # the hub's VAPID public key, base64url: the browser subscribes with it (applicationServerKey)


class PushKeys(ApiModel):
    # "p256dh", as browsers write it (not the camelCase the other fields get)
    p256dh: Annotated[str, StringConstraints(min_length=1, max_length=100)] = Field(alias="p256dh")
    auth: Annotated[str, StringConstraints(min_length=1, max_length=40)]


class PushSubscriptionIn(ApiModel):
    """A browser's PushSubscription, as its toJSON() gives it (expirationTime is ignored)."""

    endpoint: Endpoint
    keys: PushKeys


class PushEndpointIn(ApiModel):
    endpoint: Endpoint
