"""HTTP middleware stack (registered outermost-last in ``main.create_app``).

1. :class:`RequestContextMiddleware` — correlation id, duration, security log.
2. :class:`SecurityHeadersMiddleware` — hardening headers (HSTS, CSP, …).
3. :class:`HTTPSRedirectMiddleware` — forces TLS when ``FORCE_HTTPS`` is on.
4. :class:`BodySizeLimitMiddleware` — rejects oversized bodies before parsing.
5. :class:`RateLimitMiddleware` — per-identity throttling + abuse counters.
"""

from __future__ import annotations

import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp

from app.core.config import settings
from app.core.exceptions import PayloadTooLargeError, RateLimitError
from app.core.logging import (
    client_ip_var,
    get_logger,
    log_security_event,
    request_id_var,
    user_id_var,
)
from app.core.rate_limit import check_rate_limit

logger = get_logger(__name__)

SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})
#: Static/relative paths that must never be throttled (probes, docs, preflight).
EXEMPT_PATHS = ("/health", "/ready", "/metrics", "/openapi.json", "/docs", "/redoc")


def client_ip(request: Request) -> str:
    """Resolve the client IP, honouring X-Forwarded-For only from trusted proxies."""
    peer = request.client.host if request.client else "unknown"
    if settings.TRUSTED_PROXIES and peer in settings.TRUSTED_PROXIES:
        forwarded = request.headers.get("x-forwarded-for", "")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return peer


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Attaches a correlation id and emits one structured access log per request."""

    async def dispatch(self, request: Request, call_next):
        incoming = request.headers.get("x-request-id", "")
        request_id = incoming[:64] if incoming.isascii() and incoming else uuid.uuid4().hex
        token_id = request_id_var.set(request_id)
        token_ip = client_ip_var.set(client_ip(request))
        started = time.perf_counter()
        try:
            response: Response = await call_next(request)
        finally:
            duration_ms = round((time.perf_counter() - started) * 1000, 2)
        response.headers["X-Request-ID"] = request_id
        logger.info(
            "%s %s -> %s",
            request.method,
            request.url.path,
            response.status_code,
            extra={
                "event": "http.request",
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "duration_ms": duration_ms,
            },
        )
        if duration_ms > 3000:
            logger.warning(
                "Slow request",
                extra={"event": "http.slow", "path": request.url.path, "duration_ms": duration_ms},
            )
        request_id_var.reset(token_id)
        client_ip_var.reset(token_ip)
        user_id_var.set("-")
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Baseline response hardening for an API (see docs/SECURITY.md §8)."""

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        if not settings.SECURITY_HEADERS_ENABLED:
            return response
        headers = {
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            # Same value as the SPA/nignx/vercel policy so browsers see one story.
            "Referrer-Policy": "strict-origin-when-cross-origin",
            "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
            "Cross-Origin-Opener-Policy": "same-origin",
            "Cross-Origin-Resource-Policy": "same-site",
            "Content-Security-Policy": settings.CSP_POLICY,
            "Cache-Control": "no-store" if not request.url.path.startswith("/static") else "public, max-age=31536000, immutable",
        }
        if settings.FORCE_HTTPS or request.url.scheme == "https":
            headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
        for key, value in headers.items():
            response.headers.setdefault(key, value)
        if "server" in response.headers:
            del response.headers["server"]
        return response


class HTTPSRedirectMiddleware(BaseHTTPMiddleware):
    """Redirect http→https when running behind a TLS-terminating proxy."""

    async def dispatch(self, request: Request, call_next):
        if settings.FORCE_HTTPS and request.url.scheme != "https":
            forwarded_proto = request.headers.get("x-forwarded-proto", "").split(",")[0].strip()
            if forwarded_proto != "https":
                url = request.url.replace(scheme="https")
                return JSONResponse(
                    status_code=308,
                    content={"success": False, "error": {"code": "https_required", "message": "HTTPS is required", "redirect": str(url)}},
                    headers={"Location": str(url)},
                )
        return await call_next(request)


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    """Reject bodies over ``MAX_REQUEST_BYTES`` using the declared Content-Length."""

    async def dispatch(self, request: Request, call_next):
        declared = request.headers.get("content-length")
        if declared and declared.isdigit() and int(declared) > settings.MAX_REQUEST_BYTES:
            log_security_event(
                "security.oversized_body",
                "Rejected oversized request body",
                path=request.url.path,
                content_length=int(declared),
            )
            exc = PayloadTooLargeError()
            return JSONResponse(
                status_code=exc.status_code,
                content={"success": False, "error": {"code": exc.code, "message": exc.message}},
            )
        return await call_next(request)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Global throttle. Auth routes get a stricter, account-aware limit."""

    async def dispatch(self, request: Request, call_next):
        if not settings.RATE_LIMIT_ENABLED or request.method == "OPTIONS":
            return await call_next(request)
        path = request.url.path
        if any(path.startswith(p) for p in EXEMPT_PATHS):
            return await call_next(request)

        auth_path = "/auth/" in path
        bucket = "auth" if auth_path else ("write" if request.method not in SAFE_METHODS else "read")
        spec = {
            "auth": settings.RATE_LIMIT_AUTH,
            "write": settings.RATE_LIMIT_WRITE,
            "read": settings.RATE_LIMIT_DEFAULT,
        }[bucket]
        identity = request.headers.get("authorization", "")[-24:] or client_ip(request)
        try:
            result = check_rate_limit(key=f"{bucket}:{identity}", rule_spec=spec)
        except RateLimitError as exc:
            retry_after = exc.details["retry_after_seconds"] if exc.details else 60
            return JSONResponse(
                status_code=exc.status_code,
                content={
                    "success": False,
                    "error": {
                        "code": exc.code,
                        "message": exc.message,
                        "request_id": request_id_var.get(),
                        "details": {"retry_after_seconds": retry_after},
                    },
                },
                headers={"Retry-After": str(retry_after), "X-RateLimit-Limit": spec},
            )
        response: Response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(result["limit"])
        response.headers["X-RateLimit-Remaining"] = str(result["remaining"])
        response.headers["X-RateLimit-Reset"] = str(result["reset"])
        return response
