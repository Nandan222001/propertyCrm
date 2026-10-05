"""Field-level encryption for sensitive data (PII at rest).

Sensitive columns (customer e-mail / phone / address / KYC reference) are stored
as Fernet ciphertext. Lookups use the deterministic :func:`blind_index` instead of
decrypting in SQL, so equality searches never require plaintext in the database.

Key management
--------------
``FIELD_ENCRYPTION_KEY`` comes from the secret manager (AWS Secrets Manager /
Vault) and supports a comma-separated rotation ring: the first key encrypts, the
remaining keys still decrypt during rotation.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import logging

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings

logger = logging.getLogger(__name__)

_PREFIX = "enc::"


def _derive_key(raw: str) -> bytes:
    """Accept a real Fernet key, or derive one from an arbitrary secret string."""
    try:
        decoded = base64.urlsafe_b64decode(raw.encode())
    except (ValueError, binascii.Error):
        decoded = b""
    if len(decoded) == 32:
        return raw.encode()
    logger.debug("FIELD_ENCRYPTION_KEY is not a raw Fernet key; deriving one via SHA-256")
    digest = hashlib.sha256(raw.encode()).digest()
    return base64.urlsafe_b64encode(digest)


def _ring() -> list[Fernet]:
    raw_keys = [k for k in (settings.FIELD_ENCRYPTION_KEY or settings.SECRET_KEY).split(",") if k]
    return [Fernet(_derive_key(key)) for key in raw_keys]


def encrypt(value: str | None) -> str | None:
    """Encrypt a PII value. ``None``/empty stays ``None`` (NULL on MySQL)."""
    if value is None or value == "":
        return None
    if value.startswith(_PREFIX):  # already encrypted (idempotent re-save)
        return value
    return _PREFIX + _ring()[0].encrypt(value.encode()).decode()


def decrypt(value: str | None) -> str | None:
    """Decrypt a PII value, tolerating legacy plaintext rows."""
    if value is None or value == "":
        return None
    if not value.startswith(_PREFIX):
        return value  # pre-migration row
    payload = value[len(_PREFIX):]
    for fernet in _ring():
        try:
            return fernet.decrypt(payload.encode()).decode()
        except InvalidToken:
            continue
    logger.error("Unable to decrypt a PII column with any configured key")
    return None


def rotate(value: str | None) -> str | None:
    """Re-encrypt with the primary key (used by the key-rotation script)."""
    return encrypt(decrypt(value))
