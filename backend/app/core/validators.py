"""Reusable validation helpers shared by every Pydantic schema.

Business rules live here once (DRY) instead of being re-implemented per schema:
Indian mobile numbers, GSTIN, PAN, strong passwords, money amounts, safe text
(HTML/script stripped), enum coercion for the frontend's display labels and a
whitelist-based sort field resolver that makes ORDER BY injection impossible.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from app.core.config import settings
from app.core.exceptions import ValidationError

# --------------------------------------------------------------- primitives
EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")
MOBILE_IN_RE = re.compile(r"^[6-9]\d{9}$")
GSTIN_RE = re.compile(r"^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$")
PAN_RE = re.compile(r"^[A-Z]{5}\d{4}[A-Z]$")
PINCODE_RE = re.compile(r"^[1-9]\d{5}$")
TAG_RE = re.compile(r"<[^>]*>")
DANGEROUS_RE = re.compile(
    r"(<\s*script|javascript:|on\w+\s*=|--\s|/\*|\*/|\bunion\b\s+\bselect\b|\bdrop\b\s+\btable\b"
    r"|\binsert\b\s+\binto\b|\bor\b\s+1\s*=\s*1)",
    re.IGNORECASE,
)
CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def clean_text(value: str, *, max_length: int = 500, allow_newlines: bool = False) -> str:
    """Strip markup, control characters and SQL/script-shaped payloads."""
    if value is None:
        return value
    text = TAG_RE.sub("", str(value))
    text = CONTROL_RE.sub("", text)
    if not allow_newlines:
        text = re.sub(r"\s+", " ", text).strip()
    if len(text) > max_length:
        raise ValidationError(f"Value exceeds {max_length} characters", code="value_too_long")
    if DANGEROUS_RE.search(text):
        raise ValidationError("Value contains a disallowed pattern", code="unsafe_input")
    return text


def validate_email(value: str) -> str:
    email = (value or "").strip().lower()
    if not EMAIL_RE.match(email) or len(email) > 254:
        raise ValidationError("Enter a valid e-mail address", code="invalid_email")
    return email


def normalise_mobile(value: str) -> str:
    """Accept ``+91 98765 43210`` / ``098765...`` and return a 10-digit number."""
    digits = re.sub(r"\D", "", str(value or ""))
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    if len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    if not MOBILE_IN_RE.match(digits):
        raise ValidationError("Enter a valid 10-digit Indian mobile number", code="invalid_mobile")
    return digits


def validate_gstin(value: str) -> str:
    gstin = (value or "").strip().upper()
    if not GSTIN_RE.match(gstin):
        raise ValidationError("Enter a valid 15-character GSTIN", code="invalid_gstin")
    return gstin


def validate_pan(value: str) -> str:
    pan = (value or "").strip().upper()
    if not PAN_RE.match(pan):
        raise ValidationError("Enter a valid 10-character PAN", code="invalid_pan")
    return pan


def validate_password(value: str) -> str:
    """Enforce the password policy of ``docs/SECURITY.md`` §3."""
    password = value or ""
    problems = []
    if len(password) < settings.PASSWORD_MIN_LENGTH:
        problems.append(f"at least {settings.PASSWORD_MIN_LENGTH} characters")
    if not re.search(r"[A-Z]", password):
        problems.append("an uppercase letter")
    if not re.search(r"[a-z]", password):
        problems.append("a lowercase letter")
    if not re.search(r"\d", password):
        problems.append("a digit")
    if not re.search(r"[^A-Za-z0-9]", password):
        problems.append("a symbol")
    if password.lower() in {"password", "12345678", "qwerty123", "admin@123"}:
        problems.append("not a commonly breached password")
    if password.encode()[:72] != password.encode():  # bcrypt truncation guard
        problems.append("not longer than 72 bytes")
    if problems:
        raise ValidationError("Password must contain " + ", ".join(problems), code="weak_password")
    return password


def to_decimal(value: Any, *, minimum: Decimal | None = None, maximum: Decimal | None = None) -> Decimal:
    """Money-safe conversion: ``₹18,40,000`` → ``Decimal('1840000')``."""
    if isinstance(value, Decimal):
        amount = value
    else:
        cleaned = re.sub(r"[^0-9.\-]", "", str(value or "0"))
        try:
            amount = Decimal(cleaned or "0").quantize(Decimal("0.01"))
        except InvalidOperation as exc:
            raise ValidationError("Enter a valid amount", code="invalid_amount") from exc
    if minimum is not None and amount < minimum:
        raise ValidationError(f"Amount must be at least {minimum}", code="amount_too_small")
    if maximum is not None and amount > maximum:
        raise ValidationError(f"Amount must not exceed {maximum}", code="amount_too_large")
    return amount


def to_date(value: Any, *, field: str = "date") -> date:
    """Parse ``YYYY-MM-DD`` or ``DD Mon YYYY`` (the UI's display format)."""
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value or "").strip()
    for fmt in ("%Y-%m-%d", "%d %b %Y", "%d-%m-%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    raise ValidationError(f"Enter a valid {field} (YYYY-MM-DD)", code="invalid_date")


def normalise_enum(value: Any, allowed: Iterable[str], *, field: str) -> str:
    """Coerce UI labels (``"Pending Approval"``) to canonical enum values."""
    raw = str(value or "").strip()
    candidates = {raw.upper().replace(" ", "_").replace("-", "_"), raw.upper(), raw}
    for candidate in candidates:
        if candidate in set(allowed):
            return candidate
    raise ValidationError(f"{field} must be one of: {', '.join(sorted(allowed))}", code="invalid_option")


def resolve_sort(
    requested: str | None, allowed: dict[str, Any], default: str
) -> tuple[Any, str]:
    """Whitelist sort resolution — a column name from a user is never trusted."""
    if not requested:
        return allowed[default], "desc"
    field, _, direction = requested.partition(":")
    column = allowed.get(field.strip())
    if column is None:
        raise ValidationError(
            f"Sort field must be one of: {', '.join(sorted(allowed))}", code="invalid_sort_field"
        )
    order = "asc" if direction.lower() == "asc" else "desc"
    return column, order


def mask_email(email: str | None) -> str | None:
    """``rajesh.sharma@mail.com`` → ``ra***@ma**.com`` (privacy-by-default)."""
    if not email or "@" not in email:
        return None
    local, _, domain = email.partition("@")
    name, _, tld = domain.partition(".")
    return f"{local[:2]}***@{name[:2]}***.{tld or 'com'}"


def mask_phone(phone: str | None) -> str | None:
    """``9876500101`` → ``98******01`` (keeps first/last two digits for support)."""
    if not phone:
        return None
    digits = re.sub(r"\D", "", phone)
    if len(digits) <= 4:
        return "*" * len(digits)
    return f"{digits[:2]}{'*' * (len(digits) - 4)}{digits[-2:]}"


def mask_address(address: str | None) -> str | None:
    """Keep only the first token (area) — street/house details stay hidden."""
    if not address:
        return None
    head = address.split(",")[0].strip()
    if len(head) <= 4:
        return "****"
    return f"{head[:4]}{'*' * min(len(head) - 4, 8)} (masked)"


def mask_name(name: str | None) -> str | None:
    if not name:
        return None
    parts = name.split()
    return " ".join(f"{p[0]}{'*' * max(len(p) - 1, 1)}" for p in parts)
