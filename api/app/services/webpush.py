"""Web push to one browser: the message encrypted for it (RFC 8291, the aes128gcm content coding of RFC 8188), the
VAPID header that says this hub sent it (RFC 8292), and the POST to the browser's push service (RFC 8030).

Built on `cryptography` (ECDH on P-256, HKDF, AES-GCM) and PyJWT (the ES256 token), both already in the API. What
to send and when is app/services/push.py.

- The VAPID key is DSBA_VAPID_PRIVATE_KEY: the raw P-256 private key in base64url (as `python -m app.cli vapid-key`
  prints it, and as other web push tools write it), or a PEM. Its public half goes to the browser when it subscribes;
  a new key makes every browser's subscription stop working, so it is set once.
- A subscription's endpoint comes from the browser, so it is only ever posted to when it is one of the browsers' own
  push services (push_service()): never an address someone typed, an internal host or another port."""

from __future__ import annotations

import base64
import os
import struct
from dataclasses import dataclass
from datetime import datetime, timedelta
from urllib.parse import urlsplit

import httpx
import jwt
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from app.core.time import utcnow

RECORD_SIZE = 4096  # one record holds the whole message; push services take at most 4096 bytes of body
_HEADER = 16 + 4 + 1 + 65  # salt, record size, key length, the sender's public key
_TAG = 16  # AES-GCM's
# The longest message: a body of RECORD_SIZE minus the header, the tag and the last record's delimiter octet.
MAX_PLAINTEXT = RECORD_SIZE - _HEADER - _TAG - 1
TOKEN_LIFETIME = timedelta(hours=12)  # RFC 8292 allows up to 24 hours
TIMEOUT = httpx.Timeout(10.0, connect=5.0)

# The browsers' push services (Chrome, Edge, Firefox, Safari): exact hosts, and the domains whose sub-hosts serve it.
PUSH_HOSTS = frozenset({"fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"})
PUSH_DOMAINS = (".notify.windows.com", ".push.apple.com", ".push.services.mozilla.com")


def b64encode(data: bytes) -> str:
    """base64url with no padding, as web push writes keys."""
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def b64decode(text: str) -> bytes:
    """base64url, with or without padding. Raises ValueError for anything else."""
    try:
        return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))
    except (ValueError, TypeError) as e:
        raise ValueError("not base64url") from e


def _public_bytes(key: ec.EllipticCurvePrivateKey) -> bytes:
    return key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)


def _hkdf(salt: bytes, info: bytes, length: int, ikm: bytes) -> bytes:
    return HKDF(hashes.SHA256(), length, salt, info).derive(ikm)


def browser_key(p256dh: bytes) -> ec.EllipticCurvePublicKey:
    """The browser's public key (its subscription's `p256dh`). Raises ValueError when it isn't a P-256 point."""
    if len(p256dh) != 65 or p256dh[0] != 4:
        raise ValueError("the browser's key isn't an uncompressed P-256 point")
    try:
        return ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), p256dh)
    except ValueError as e:
        raise ValueError("the browser's key isn't a point on P-256") from e


def encrypt(
    plaintext: bytes,
    p256dh: bytes,
    auth: bytes,
    *,
    salt: bytes | None = None,
    sender: ec.EllipticCurvePrivateKey | None = None,
) -> bytes:
    """The push message's body: `plaintext` encrypted for the browser whose subscription keys are `p256dh` and `auth`
    (RFC 8291), in one aes128gcm record. `salt` and `sender` are random unless given (the RFC's example gives them).
    Raises ValueError for bad keys or a message longer than MAX_PLAINTEXT."""
    if len(auth) != 16:
        raise ValueError("the browser's auth secret must be 16 bytes")
    if len(plaintext) > MAX_PLAINTEXT:
        raise ValueError(f"the message is too long: {len(plaintext)} bytes, at most {MAX_PLAINTEXT}")
    receiver = browser_key(p256dh)
    sender = sender or ec.generate_private_key(ec.SECP256R1())
    salt = salt if salt is not None else os.urandom(16)
    as_public = _public_bytes(sender)
    shared = sender.exchange(ec.ECDH(), receiver)
    ikm = _hkdf(auth, b"WebPush: info\x00" + p256dh + as_public, 32, shared)
    cek = _hkdf(salt, b"Content-Encoding: aes128gcm\x00", 16, ikm)
    nonce = _hkdf(salt, b"Content-Encoding: nonce\x00", 12, ikm)
    ciphertext = AESGCM(cek).encrypt(nonce, plaintext + b"\x02", None)  # 0x02: the last record, no padding
    return salt + struct.pack("!IB", RECORD_SIZE, len(as_public)) + as_public + ciphertext


@dataclass(frozen=True)
class VapidKey:
    """This hub's VAPID key pair (RFC 8292)."""

    private: ec.EllipticCurvePrivateKey

    @classmethod
    def parse(cls, value: str) -> VapidKey:
        """From DSBA_VAPID_PRIVATE_KEY: the raw private key in base64url, or a PEM. Raises ValueError, naming the
        setting but never echoing it."""
        text = value.strip()
        try:
            if text.startswith("-----BEGIN"):
                key = serialization.load_pem_private_key(text.encode(), password=None)
            else:
                raw = b64decode(text)
                if len(raw) != 32:
                    raise ValueError("wrong length")
                key = ec.derive_private_key(int.from_bytes(raw, "big"), ec.SECP256R1())
        except (ValueError, TypeError) as e:
            raise ValueError("DSBA_VAPID_PRIVATE_KEY isn't a P-256 private key (python -m app.cli vapid-key)") from e
        if not isinstance(key, ec.EllipticCurvePrivateKey) or not isinstance(key.curve, ec.SECP256R1):
            raise ValueError("DSBA_VAPID_PRIVATE_KEY isn't a P-256 private key (python -m app.cli vapid-key)")
        return cls(key)

    @property
    def public_b64(self) -> str:
        """The public key in base64url: the `applicationServerKey` a browser subscribes with, and the header's k."""
        return b64encode(_public_bytes(self.private))


def new_vapid_key() -> str:
    """A new VAPID private key, raw and base64url, for DSBA_VAPID_PRIVATE_KEY."""
    key = ec.generate_private_key(ec.SECP256R1())
    return b64encode(key.private_numbers().private_value.to_bytes(32, "big"))


def vapid_header(key: VapidKey, endpoint: str, subject: str, *, now: datetime | None = None) -> str:
    """The Authorization header for a message to `endpoint`: a token signed by this hub for that push service's
    origin, and the public key it checks it with. `subject` is a mailto: or https: contact for the push service."""
    parts = urlsplit(endpoint)
    expires = (now or utcnow()) + TOKEN_LIFETIME
    claims = {"aud": f"{parts.scheme}://{parts.netloc}", "exp": int(expires.timestamp()), "sub": subject}
    token = jwt.encode(claims, key.private, algorithm="ES256")
    return f"vapid t={token}, k={key.public_b64}"


def push_service(endpoint: str) -> bool:
    """Whether `endpoint` is on one of the browsers' push services: https, the default port, no user name, and a host
    in PUSH_HOSTS or under PUSH_DOMAINS."""
    try:
        parts = urlsplit(endpoint)
        port = parts.port
    except ValueError:
        return False
    host = (parts.hostname or "").lower()
    if parts.scheme != "https" or port not in (None, 443) or parts.username is not None or parts.password is not None:
        return False
    return host in PUSH_HOSTS or any(host.endswith(d) and len(host) > len(d) for d in PUSH_DOMAINS)


def post(
    http: httpx.Client,
    endpoint: str,
    body: bytes,
    *,
    key: VapidKey,
    subject: str,
    ttl: int,
    urgency: str = "normal",
    topic: str | None = None,
) -> httpx.Response:
    """POSTs an encrypted message to the push service. Raises ValueError for an endpoint that isn't a push service's,
    and httpx.HTTPError when the service can't be reached."""
    if not push_service(endpoint):
        raise ValueError("not a push service's endpoint")
    headers = {
        "Authorization": vapid_header(key, endpoint, subject),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        "TTL": str(ttl),
        "Urgency": urgency,
    }
    if topic:
        headers["Topic"] = topic
    return http.post(endpoint, content=body, headers=headers, follow_redirects=False)
