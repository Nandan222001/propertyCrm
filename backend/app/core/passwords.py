"""Starting password for accounts created by someone else.

The rule is deliberately simple so the account holder can work it out themselves and nobody ever
has to see, copy or send a password: the first four letters of the name (lower case) followed by
the last five digits of the mobile number — ``Sanjay Patel`` / ``98765 43210`` -> ``sanj43210``.
The password is never returned by the API, written to a log or put in an e-mail, and every such
account is forced to choose its own password at the first sign-in.
"""

from __future__ import annotations

import re
import unicodedata

from app.core.exceptions import ValidationError


def initial_password(name: str | None, phone: str | None) -> str:
    folded = unicodedata.normalize("NFKD", name or "")
    letters = "".join(ch for ch in folded if ch.isascii() and ch.isalpha())[:4].lower()
    digits = re.sub(r"\D", "", phone or "")[-5:]
    if len(letters) < 4:
        raise ValidationError("The name needs at least four letters to set the starting password", code="initial_password")
    if len(digits) < 5:
        raise ValidationError("A mobile number is required to set the starting password", code="initial_password")
    return letters + digits
