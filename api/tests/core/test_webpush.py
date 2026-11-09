"""Web push encryption (RFC 8291) and the VAPID header (RFC 8292): app/services/webpush.py. Nothing here reaches the
network."""

from __future__ import annotations

import logging
import struct
from datetime import UTC, datetime

import httpx
import jwt
import pytest
from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from app.services import webpush
from app.services.webpush import VapidKey, b64decode, b64encode, vapid_header

# RFC 8291, section 5 and appendix A: the example message and the keys it was encrypted with.
RFC_PLAINTEXT = b"When I grow up, I want to be a watermelon"
RFC_AS_PRIVATE = "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw"
RFC_AS_PUBLIC = "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8"
RFC_UA_PRIVATE = "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94"
RFC_UA_PUBLIC = "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4"
RFC_SALT = "DGv6ra1nlYgDCS1FRnbzlw"
RFC_AUTH = "BTBZMqHH6r4Tts7J_aSIgg"
RFC_BODY = (
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml"
    "mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT"
    "pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN"
)
CHROME = "https://fcm.googleapis.com/fcm/send/abc:def"


def _private(b64: str) -> ec.EllipticCurvePrivateKey:
    return ec.derive_private_key(int.from_bytes(b64decode(b64), "big"), ec.SECP256R1())


def _decrypt(body: bytes, ua_private: ec.EllipticCurvePrivateKey, auth: bytes) -> bytes:
    """What a browser does with the message (RFC 8291 section 3, as the receiver)."""
    salt, record_size, id_len = body[:16], *struct.unpack("!IB", body[16:21])
    as_public = body[21 : 21 + id_len]
    ciphertext = body[21 + id_len :]
    assert len(ciphertext) <= record_size
    ua_public = ua_private.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    shared = ua_private.exchange(ec.ECDH(), ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), as_public))
    ikm = HKDF(hashes.SHA256(), 32, auth, b"WebPush: info\x00" + ua_public + as_public).derive(shared)
    cek = HKDF(hashes.SHA256(), 16, salt, b"Content-Encoding: aes128gcm\x00").derive(ikm)
    nonce = HKDF(hashes.SHA256(), 12, salt, b"Content-Encoding: nonce\x00").derive(ikm)
    record = AESGCM(cek).decrypt(nonce, ciphertext, None)
    return record.rstrip(b"\x00")[:-1]  # padding, then the last record's delimiter (0x02)


def test_encryption_matches_the_rfc_8291_example() -> None:
    body = webpush.encrypt(
        RFC_PLAINTEXT,
        b64decode(RFC_UA_PUBLIC),
        b64decode(RFC_AUTH),
        salt=b64decode(RFC_SALT),
        sender=_private(RFC_AS_PRIVATE),
    )
    assert b64encode(body) == RFC_BODY


def test_the_rfc_example_decrypts_with_the_receivers_key() -> None:
    plain = _decrypt(b64decode(RFC_BODY), _private(RFC_UA_PRIVATE), b64decode(RFC_AUTH))
    assert plain == RFC_PLAINTEXT


def test_a_fresh_message_decrypts_for_its_browser_only() -> None:
    browser = ec.generate_private_key(ec.SECP256R1())
    other = ec.generate_private_key(ec.SECP256R1())
    public = browser.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    auth = b"0123456789abcdef"
    one = webpush.encrypt(b'{"title":"Hi"}', public, auth)
    two = webpush.encrypt(b'{"title":"Hi"}', public, auth)
    assert one != two  # a new salt and sender key every time
    assert _decrypt(one, browser, auth) == b'{"title":"Hi"}'
    with pytest.raises(InvalidTag):
        _decrypt(one, other, auth)


def test_a_message_too_long_for_one_record_is_refused() -> None:
    browser = ec.generate_private_key(ec.SECP256R1())
    public = browser.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    webpush.encrypt(b"x" * webpush.MAX_PLAINTEXT, public, b"0123456789abcdef")
    with pytest.raises(ValueError, match="too long"):
        webpush.encrypt(b"x" * (webpush.MAX_PLAINTEXT + 1), public, b"0123456789abcdef")


def test_bad_browser_keys_are_refused() -> None:
    with pytest.raises(ValueError, match="key"):
        webpush.encrypt(b"x", b"\x04" + b"\x01" * 64, b"0123456789abcdef")  # not a point on P-256
    with pytest.raises(ValueError, match="auth"):
        webpush.encrypt(b"x", b64decode(RFC_UA_PUBLIC), b"short")


# ── VAPID ───────────────────────────────────────────────────────────────────────────────────


def test_the_vapid_key_reads_the_raw_form_and_pem() -> None:
    raw = webpush.VapidKey.parse(RFC_AS_PRIVATE)
    assert raw.public_b64 == RFC_AS_PUBLIC
    pem = _private(RFC_AS_PRIVATE).private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    )
    assert webpush.VapidKey.parse(pem.decode()).public_b64 == RFC_AS_PUBLIC
    with pytest.raises(ValueError, match="DSBA_VAPID_PRIVATE_KEY"):
        webpush.VapidKey.parse("not a key")


def test_a_new_vapid_key_is_a_raw_p256_key() -> None:
    made = webpush.new_vapid_key()
    assert len(b64decode(made)) == 32
    assert len(b64decode(webpush.VapidKey.parse(made).public_b64)) == 65


def test_the_vapid_header_is_signed_for_the_push_service() -> None:
    key = webpush.VapidKey.parse(RFC_AS_PRIVATE)
    now = datetime(2026, 11, 8, 12, 0, tzinfo=UTC)
    header = webpush.vapid_header(key, CHROME, "mailto:hub@example.com", now=now)
    assert header.startswith("vapid t=")
    token, k = header.removeprefix("vapid t=").split(", k=")
    assert k == RFC_AS_PUBLIC
    public_pem = _private(RFC_AS_PRIVATE).public_key()
    claims = jwt.decode(
        token, public_pem, algorithms=["ES256"], audience="https://fcm.googleapis.com", options={"verify_exp": False}
    )
    assert claims["sub"] == "mailto:hub@example.com"
    assert claims["exp"] == int(now.timestamp()) + 12 * 3600  # RFC 8292: at most 24 hours ahead
    assert jwt.get_unverified_header(token)["alg"] == "ES256"
    assert len(b64decode(token.split(".")[2])) == 64  # JOSE's raw r || s, not DER


def test_a_tampered_vapid_token_fails_to_verify() -> None:
    key = webpush.VapidKey.parse(RFC_AS_PRIVATE)
    token = webpush.vapid_header(key, CHROME, "mailto:hub@example.com").removeprefix("vapid t=").split(",")[0]
    other = ec.generate_private_key(ec.SECP256R1()).public_key()
    with pytest.raises(jwt.InvalidSignatureError):
        jwt.decode(token, other, algorithms=["ES256"], audience="https://fcm.googleapis.com")


# ── push services ───────────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "endpoint",
    [
        CHROME,
        "https://updates.push.services.mozilla.com/wpush/v2/gAAAA",
        "https://web.push.apple.com/QGuQyavXuDb",
        "https://wns2-par02p.notify.windows.com/w/?token=BQYAAA",
    ],
)
def test_the_browsers_push_services_are_accepted(endpoint: str) -> None:
    assert webpush.push_service(endpoint)


@pytest.mark.parametrize(
    "endpoint",
    [
        "http://fcm.googleapis.com/fcm/send/abc",  # not https
        "https://fcm.googleapis.com.evil.example/x",
        "https://evil.example/fcm.googleapis.com",
        "https://127.0.0.1/x",
        "https://169.254.169.254/latest/meta-data",
        "https://fcm.googleapis.com:8443/x",  # another port
        "https://user@fcm.googleapis.com/x",
        "https://notify.windows.com.example/x",
        "fcm.googleapis.com/x",
        "https://fcm.googleapis.com\\@evil.example/x",  # a backslash: parsers disagree on the host
        "https://fcm.googleapis.com/x y",
        "https://fcm.googleapis.com/\u00e9",  # not ASCII
        "https://xn--fcm-googleapis.com/x",
        "https://[::1]/x",
        "",
    ],
)
def test_anything_else_is_refused(endpoint: str) -> None:
    assert not webpush.push_service(endpoint)


def test_the_token_is_for_the_push_services_origin_even_with_its_port_written_out() -> None:
    key = VapidKey.parse(RFC_AS_PRIVATE)
    for endpoint in ("https://fcm.googleapis.com:443/fcm/send/x", "https://FCM.googleapis.com/fcm/send/x"):
        token = vapid_header(key, endpoint, "mailto:hub@example.com").removeprefix("vapid t=").split(", k=")[0]
        assert jwt.decode(token, options={"verify_signature": False})["aud"] == "https://fcm.googleapis.com"


def test_only_a_pushs_own_request_is_kept_out_of_the_logs(caplog: pytest.LogCaptureFixture) -> None:
    """httpx logs each request's URL, and a push's URL is the browser's endpoint, so post() keeps its own request out
    of the logs. Every other request in the API (Drive, mail, AI) is still logged as before."""
    http = httpx.Client(transport=httpx.MockTransport(lambda _: httpx.Response(201)))
    endpoint = "https://fcm.googleapis.com/fcm/send/the-browsers-secret"
    caplog.set_level(logging.DEBUG)
    webpush.post(http, endpoint, b"x", key=VapidKey.parse(webpush.new_vapid_key()), subject="mailto:a@b.c", ttl=60)
    http.get("https://example.com/elsewhere")
    lines = [r.getMessage() for r in caplog.records]
    assert not [line for line in lines if "the-browsers-secret" in line]
    assert any(r.name == "httpx" and "example.com/elsewhere" in r.getMessage() for r in caplog.records)
