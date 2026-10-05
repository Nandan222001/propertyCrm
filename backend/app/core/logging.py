"""Structured logging with request correlation and automatic redaction.

Two streams are produced:
* **application log** — JSON (or plain text for local dev) with a ``request_id``
  so a user-visible error id can be traced end-to-end;
* **security log** — ``security.*`` events (denied permissions, rate limits,
  failed logins). These are the raw material for the monitoring/alerts described
  in ``docs/INCIDENT_RESPONSE.md``.

The :class:`RedactionFilter` is defence in depth: even if a developer logs a
whole model by mistake, sensitive keys never reach disk.
"""

from __future__ import annotations

import json
import logging
import sys
import time
from contextvars import ContextVar
from typing import Any

from app.core.config import settings

SENSITIVE_KEYS = frozenset(
    {
        "password", "passwd", "password_hash", "new_password", "current_password",
        "confirm_password", "token", "access_token", "refresh_token", "authorization",
        "secret", "secret_key", "api_key", "index_pepper", "field_encryption_key",
        "cookie", "set-cookie", "otp", "totp", "aadhaar", "pan", "card", "cvv",
        "phone", "mobile", "email", "address", "kyc_reference",
    }
)

#: Correlation id + actor, propagated through async/sync call stacks.
request_id_var: ContextVar[str] = ContextVar("request_id", default="-")
user_id_var: ContextVar[str] = ContextVar("user_id", default="-")
client_ip_var: ContextVar[str] = ContextVar("client_ip", default="-")


def _redact(value: Any, depth: int = 0) -> Any:
    if depth > 6:
        return "…"
    if isinstance(value, dict):
        return {
            key: ("***redacted***" if str(key).lower() in SENSITIVE_KEYS else _redact(val, depth + 1))
            for key, val in value.items()
        }
    if isinstance(value, tuple):
        # ``record.args`` must stay a tuple or ``msg % args`` breaks.
        return tuple(_redact(item, depth + 1) for item in value)
    if isinstance(value, list):
        return [_redact(item, depth + 1) for item in value]
    return value


class RedactionFilter(logging.Filter):
    """Masks sensitive keys on record extras and on message args."""

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, dict):
            record.msg = _redact(record.msg)
        if record.args:
            record.args = _redact(record.args)  # type: ignore[assignment]
        for key in list(record.__dict__):
            if key.lower() in SENSITIVE_KEYS:
                record.__dict__[key] = "***redacted***"
        return True


class CorrelationFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        record.user_id = user_id_var.get()
        record.client_ip = client_ip_var.get()
        record.environment = settings.ENVIRONMENT
        return True


class JsonFormatter(logging.Formatter):
    _EXTRA = ("request_id", "user_id", "client_ip", "environment", "event", "action",
              "resource", "resource_id", "status_code", "duration_ms", "path", "method")

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(record.created))
                  + f".{int(record.msecs):03d}Z",
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        for key in self._EXTRA:
            if hasattr(record, key):
                payload[key] = getattr(record, key)
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def _build_handler(stream, json_output: bool) -> logging.Handler:
    handler = logging.StreamHandler(stream)
    if json_output:
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(
            logging.Formatter("%(levelname)-8s [%(request_id)s] %(name)s: %(message)s")
        )
    handler.addFilter(RedactionFilter())
    handler.addFilter(CorrelationFilter())
    return handler


def configure_logging() -> None:
    """Idempotent logging setup — called once from the app factory."""
    root = logging.getLogger()
    if getattr(root, "_lalita_configured", False):
        return
    root.handlers.clear()
    root.setLevel(settings.LOG_LEVEL.upper())
    root.addHandler(_build_handler(sys.stdout, settings.LOG_JSON))

    # Uvicorn's access log duplicates our request middleware — keep only errors.
    logging.getLogger("uvicorn.access").disabled = True
    for noisy in ("sqlalchemy.engine.Engine", "passlib"):
        logging.getLogger(noisy).setLevel(logging.WARNING if not settings.DB_ECHO else logging.INFO)

    security_logger = logging.getLogger("security")
    security_logger.setLevel(logging.INFO)
    security_logger.propagate = True
    root._lalita_configured = True  # type: ignore[attr-defined]


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)


def log_security_event(
    event: str,
    message: str,
    *,
    level: int = logging.WARNING,
    **fields: Any,
) -> None:
    """Emit a security event (also persisted by ``services.audit_service``)."""
    logging.getLogger("security").log(
        level, message, extra={"event": event, **fields}
    )
