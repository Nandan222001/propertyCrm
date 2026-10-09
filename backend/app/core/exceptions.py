"""Application exception hierarchy + FastAPI exception handlers.

Rules enforced here:
* every error returns the same envelope shape;
* internal details (SQL, stack traces, driver messages) never reach the client
  in production — they are logged with the request id and the client receives
  that id so support can correlate;
* validation errors are rendered field-by-field for form usability;
* security-relevant failures (401/403/429) are written to the security log.
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.logging import get_logger, log_security_event, request_id_var
from app.db.tenancy import TenantIsolationError

logger = get_logger(__name__)


# Starlette renamed these constants (422 -> UNPROCESSABLE_CONTENT,
# 413 -> CONTENT_TOO_LARGE). Resolve them lazily-with-`or` so the *deprecated*
# name is only touched when the new name is absent — a plain getattr(default=…)
# would evaluate the deprecated attribute eagerly and still warn.
_HTTP_422 = getattr(status, "HTTP_422_UNPROCESSABLE_CONTENT", None) or status.HTTP_422_UNPROCESSABLE_ENTITY
_HTTP_413 = getattr(status, "HTTP_413_CONTENT_TOO_LARGE", None) or status.HTTP_413_REQUEST_ENTITY_TOO_LARGE


class AppError(Exception):
    """Base class for expected, business-level failures."""

    status_code: int = status.HTTP_400_BAD_REQUEST
    code: str = "app_error"
    message: str = "Request could not be processed"
    #: Canonical security-event name used for telemetry/alerts.
    security_event: str = "error.app_error"

    def __init__(self, message: str | None = None, *, details: Any = None, code: str | None = None):
        self.message = message or self.message
        self.details = details
        self.code = code or self.code
        super().__init__(self.message)


class ValidationError(AppError, ValueError):
    """Invalid input.

    Also inherits ``ValueError`` so Pydantic wraps it into a field-level
    ``RequestValidationError`` (with location info) when raised from a schema
    validator, while services can still catch it as an :class:`AppError`.
    """

    status_code = _HTTP_422
    code = "validation_error"
    message = "Submitted data failed validation"


class AuthenticationError(AppError):
    security_event = "auth.failed"
    status_code = status.HTTP_401_UNAUTHORIZED
    code = "authentication_failed"
    message = "Authentication is required or the credentials are invalid"


class PermissionDeniedError(AppError):
    security_event = "rbac.denied"
    status_code = status.HTTP_403_FORBIDDEN
    code = "permission_denied"
    message = "Your role is not permitted to perform this action"


class NotFoundError(AppError):
    status_code = status.HTTP_404_NOT_FOUND
    code = "not_found"
    message = "The requested resource was not found"


class ConflictError(AppError):
    status_code = status.HTTP_409_CONFLICT
    code = "conflict"
    message = "The resource conflicts with the current state"


class BusinessRuleError(AppError):
    status_code = status.HTTP_409_CONFLICT
    code = "business_rule_violated"
    message = "The request violates a domain rule"


class AccountLockedError(AppError):
    security_event = "auth.account_locked"
    status_code = status.HTTP_423_LOCKED
    code = "account_locked"
    message = "Account temporarily locked after repeated failed sign-in attempts"


class RateLimitError(AppError):
    security_event = "security.rate_limited"
    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    code = "rate_limited"
    message = "Too many requests — please slow down"


class PayloadTooLargeError(AppError):
    security_event = "security.oversized_body"
    status_code = _HTTP_413
    code = "payload_too_large"
    message = "Request body is larger than the allowed limit"


class DependencyUnavailableError(AppError):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    code = "dependency_unavailable"
    message = "A required downstream dependency is unavailable"


def _envelope(
    *,
    status_code: int,
    code: str,
    message: str,
    details: Any = None,
) -> JSONResponse:
    body: dict[str, Any] = {
        "success": False,
        "error": {"code": code, "message": message, "request_id": request_id_var.get()},
    }
    if details is not None:
        body["error"]["details"] = details
    return JSONResponse(status_code=status_code, content=body)


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(request: Request, exc: AppError):
        if exc.status_code in (401, 403, 423, 429):
            log_security_event(
                event=exc.security_event,
                message=exc.message,
                status_code=exc.status_code,
            )
            # Persist the rejection outside the request transaction so the
            # evidence survives the rollback that this exception triggers.
            from app.core.config import settings

            if settings.AUDIT_SEPARATE_SESSION:
                from app.services.audit_service import persist_security_event

                persist_security_event(
                    event=exc.security_event,
                    severity="warning" if exc.status_code == 403 else "error",
                    message=exc.message,
                    ip_address=request.client.host if request.client else None,
                    path=request.url.path,
                    context={"status_code": exc.status_code},
                )
        else:
            logger.info("Handled application error", extra={"event": exc.code, "status_code": exc.status_code})
        return _envelope(
            status_code=exc.status_code,
            code=exc.code,
            message=exc.message,
            # Validation failures always carry a (possibly empty) field list so
            # clients can rely on the shape.
            details=exc.details if exc.details is not None else ([] if isinstance(exc, ValidationError) else None),
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError):
        fields = [
            {
                "field": ".".join(str(part) for part in err.get("loc", []) if part != "body"),
                "message": err.get("msg", "invalid value"),
                "type": err.get("type", "value_error"),
            }
            for err in exc.errors()
        ]
        return _envelope(
            status_code=_HTTP_422,
            code="validation_error",
            message="Submitted data failed validation",
            details=fields,
        )

    @app.exception_handler(IntegrityError)
    async def _integrity_error(request: Request, exc: IntegrityError):
        # Never echo the raw driver message: it leaks table/column names.
        logger.warning("Database integrity error", extra={"path": request.url.path, "event": "db.integrity"})
        logger.debug("Integrity error detail: %s", exc)
        return _envelope(
            status_code=status.HTTP_409_CONFLICT,
            code="conflict",
            message="The record conflicts with existing data (duplicate or missing reference)",
        )

    @app.exception_handler(TenantIsolationError)
    async def _tenant_isolation(request: Request, exc: TenantIsolationError):
        # Deliberately indistinguishable from "does not exist": no cross-tenant oracle.
        logger.warning("Tenant isolation violation on %s: %s", request.url.path, exc,
                       extra={"event": "security.tenant_isolation"})
        return _envelope(
            status_code=status.HTTP_404_NOT_FOUND,
            code="not_found",
            message="A referenced record was not found",
        )

    @app.exception_handler(SQLAlchemyError)
    async def _database_error(request: Request, exc: SQLAlchemyError):
        logger.error("Database error on %s", request.url.path, exc_info=exc)
        return _envelope(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            code="database_unavailable",
            message="The database is temporarily unavailable. Please retry shortly.",
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException):
        code = {
            401: "authentication_failed",
            403: "permission_denied",
            404: "not_found",
            405: "method_not_allowed",
            429: "rate_limited",
        }.get(exc.status_code, "http_error")
        return _envelope(status_code=exc.status_code, code=code, message=str(exc.detail))

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception):
        logger.exception("Unhandled error on %s", request.url.path, exc_info=exc)
        from app.core.config import settings

        return _envelope(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            code="internal_error",
            message=(
                f"Unexpected server error. Reference {request_id_var.get()} when contacting support."
                if settings.is_production
                else f"{type(exc).__name__}: {exc}"
            ),
        )
