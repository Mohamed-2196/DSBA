"""Notifications on this device (web push; app/services/push.py): the hub's public key, and turning it on or off for
the browser that asks."""

from __future__ import annotations

from fastapi import Response, status

from app.core.access import Feature
from app.core.errors import feature_off, unauthenticated
from app.core.security import DB, CurrentSession, CurrentUser, needs_feature
from app.routers._base import router_for
from app.schemas.push import PushEndpointIn, PushKeyOut, PushSubscriptionIn
from app.services import push as svc

router = router_for("push", needs_feature(Feature.push))


@router.get("/push/key", response_model=PushKeyOut)
def key(user: CurrentUser) -> PushKeyOut:
    """The key a browser subscribes with. 404 feature_off when the hub has no VAPID key."""
    vapid = svc.vapid_key()
    if vapid is None:
        raise feature_off()
    return PushKeyOut(public_key=vapid.public_b64)


@router.post("/push/subscriptions", status_code=status.HTTP_204_NO_CONTENT)
def subscribe(body: PushSubscriptionIn, user: CurrentUser, sess: CurrentSession, db: DB) -> Response:
    """This browser gets the signed-in person's pushes until they turn it off or this session ends. Sending it again
    is harmless (the web app does on every start, so the session it is tied to stays the current one)."""
    if not svc.configured():
        raise feature_off()
    if sess is None:
        raise unauthenticated()
    svc.subscribe(db, user, sess, body.endpoint, body.keys.p256dh, body.keys.auth)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/push/subscriptions/remove", status_code=status.HTTP_204_NO_CONTENT)
def unsubscribe(body: PushEndpointIn, user: CurrentUser, db: DB) -> Response:
    """This browser gets no more pushes. 204 whether or not it had any (in the body, not the path: an endpoint is a
    browser's address and stays out of logs)."""
    svc.unsubscribe(db, user, body.endpoint)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
