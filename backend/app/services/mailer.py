"""Minimal outgoing e-mail (stdlib SMTP). Never raises into a request: delivery problems are logged."""

from __future__ import annotations

import json
import smtplib
import ssl
import urllib.request
from email.message import EmailMessage

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


def mail_enabled() -> bool:
    return bool(settings.RESEND_API_KEY or settings.SMTP_HOST)


def _send_resend(to: str, subject: str, body: str) -> None:
    request = urllib.request.Request(
        "https://api.resend.com/emails",
        data=json.dumps({"from": settings.SMTP_FROM, "to": [to], "subject": subject, "text": body}).encode(),
        headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}", "Content-Type": "application/json",
                 "User-Agent": "lalita-erp/1.0"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=15):  # raises HTTPError on any non-2xx
        pass


def send_mail(to: str, subject: str, body: str) -> bool:
    """Send a plain-text message. Returns False (and logs) when disabled or on any SMTP error."""
    if not mail_enabled():
        logger.warning("E-mail disabled (no RESEND_API_KEY / SMTP_HOST): message '%s' was not sent", subject)
        return False
    if settings.RESEND_API_KEY:
        try:
            _send_resend(to, subject, body)
            return True
        except Exception:
            logger.exception("Could not send e-mail '%s' through Resend", subject)
            return False
    message = EmailMessage()
    message["From"] = settings.SMTP_FROM
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)
    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as smtp:
            if settings.SMTP_STARTTLS:
                smtp.starttls(context=ssl.create_default_context())
            if settings.SMTP_USER:
                smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD or "")
            smtp.send_message(message)
        return True
    except Exception:
        logger.exception("Could not send e-mail '%s'", subject)
        return False


def reset_link(token: str) -> str:
    return f"{settings.APP_BASE_URL.rstrip('/')}/reset-password?token={token}"
