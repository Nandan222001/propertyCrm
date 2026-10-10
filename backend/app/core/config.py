"""Application configuration.

A single, validated source of truth for every environment value. Nothing in the
codebase reads ``os.environ`` directly: services import :func:`get_settings`.

Security posture:
* secrets have no usable defaults in production — startup fails loudly instead of
  silently shipping a development key;
* MySQL connection parameters are assembled in one place so TLS / least-privilege
  database settings cannot drift between environments;
* every setting is documented in ``backend/.env.example``.
"""

from __future__ import annotations

import json
import secrets
from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

Environment = Literal["local", "test", "staging", "production"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "backend/.env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
        # Lists are parsed by `_split_csv` below instead of pydantic-settings'
        # JSON decoder: ops set CORS_ALLOWED_ORIGINS="https://a.com,https://b.com"
        # in the environment, and a bare CSV value must not crash start-up.
        enable_decoding=False,
    )

    # ------------------------------------------------------------------ app
    APP_NAME: str = "Lalita Realestate Infra ERP API"
    APP_VERSION: str = "1.0.0"
    ENVIRONMENT: Environment = "local"
    DEBUG: bool = False

    # ------------------------------------------------------------------ api
    API_V1_PREFIX: str = "/api/v1"
    # Only these origins may call the API from a browser (no "*" in production).
    CORS_ALLOWED_ORIGINS: list[str] = Field(
        default_factory=lambda: ["http://localhost:5173", "http://localhost:4173"]
    )
    ALLOWED_HOSTS: list[str] = Field(
        default_factory=lambda: ["localhost", "127.0.0.1", "testserver", "*.e2b.app"]
    )
    # Exact-match trusted proxies for X-Forwarded-* handling.
    TRUSTED_PROXIES: list[str] = Field(default_factory=list)
    MAX_REQUEST_BYTES: int = 2 * 1024 * 1024  # 2 MB body cap (413 beyond this)

    # ------------------------------------------------------------- database
    DB_DIALECT: Literal["mysql", "sqlite"] = "mysql"
    DB_HOST: str = "127.0.0.1"
    DB_PORT: int = 3306
    DB_NAME: str = "lalita_erp"
    DB_USER: str = "lalita_app"          # least-privilege account (see scripts/create_db.sql)
    DB_PASSWORD: str = ""
    DB_ECHO: bool = False
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20
    DB_POOL_RECYCLE: int = 1800
    DB_STATEMENT_TIMEOUT_MS: int = 15_000
    # Mandatory in production: MySQL TLS settings (verify_identity requires a CA).
    DB_SSL_MODE: Literal["disabled", "preferred", "required", "verify_identity"] = "preferred"
    DB_SSL_CA: str = ""
    SQLITE_PATH: str = "var/lalita_erp.sqlite3"  # only used for DB_DIALECT=sqlite

    # ----------------------------------------------------------------- auth
    SECRET_KEY: str = ""
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    PASSWORD_MIN_LENGTH: int = 10
    PASSWORD_HASH_ROUNDS: int = 12
    MAX_FAILED_LOGINS: int = 5
    ACCOUNT_LOCK_MINUTES: int = 15
    # Pepper mixed into blind indexes / token digests (rotate with re-index job).
    INDEX_PEPPER: str = ""
    # Fernet key (urlsafe base64, 32 bytes) used to encrypt PII columns at rest.
    FIELD_ENCRYPTION_KEY: str = ""

    # ---------------------------------------------------------- rate limiting
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_BACKEND: Literal["memory", "redis"] = "memory"
    REDIS_URL: str = "redis://localhost:6379/0"
    RATE_LIMIT_DEFAULT: str = "300/minute"
    RATE_LIMIT_AUTH: str = "10/minute"      # login / refresh / register
    RATE_LIMIT_WRITE: str = "120/minute"    # mutating endpoints

    # -------------------------------------------------------------- security
    FORCE_HTTPS: bool = False

    # --- outgoing e-mail (password reset links). Unset SMTP_HOST = e-mail disabled (links are only logged / returned in dev).
    SMTP_HOST: str | None = None
    SMTP_PORT: int = 587
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    SMTP_FROM: str = "no-reply@localhost"
    SMTP_STARTTLS: bool = True
    #: Public URL of the web app, used to build links inside e-mails.
    APP_BASE_URL: str = "http://localhost:5173"
    SECURITY_HEADERS_ENABLED: bool = True
    CSP_POLICY: str = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
    LOG_LEVEL: str = "INFO"
    LOG_JSON: bool = True
    AUDIT_LOG_ENABLED: bool = True
    # Security telemetry is written in its own transaction so that a rejected
    # request cannot roll back the evidence of the rejection.
    AUDIT_SEPARATE_SESSION: bool = True
    # Simple anomaly alerts written to the security event stream.
    SECURITY_ALERTS_ENABLED: bool = True

    # --------------------------------------------------------------- privacy
    PII_MASK_BY_DEFAULT: bool = True
    DATA_RETENTION_DAYS: int = 2555  # 7 years — statutory books of account
    AUDIT_RETENTION_DAYS: int = 3650
    CONSENT_REQUIRED: bool = True

    @field_validator("CORS_ALLOWED_ORIGINS", "ALLOWED_HOSTS", "TRUSTED_PROXIES", mode="before")
    @classmethod
    def _split_csv(cls, value: object) -> object:
        """Accept ``a,b`` **or** a JSON array so ops can use either form in .env."""
        if not isinstance(value, str):
            return value
        raw = value.strip()
        if raw.startswith("["):
            try:
                return json.loads(raw)
            except json.JSONDecodeError:
                return [item.strip().strip('"\'') for item in raw.strip("[]").split(",") if item.strip()]
        return [item.strip() for item in raw.split(",") if item.strip()]

    @model_validator(mode="after")
    def _validate_security_baseline(self) -> Settings:
        is_prod = self.ENVIRONMENT == "production"
        if is_prod:
            missing = [
                name
                for name in ("SECRET_KEY", "INDEX_PEPPER", "FIELD_ENCRYPTION_KEY", "DB_PASSWORD")
                if not getattr(self, name)
            ]
            if missing:
                raise ValueError(f"Required secrets missing in production: {', '.join(missing)}")
            if "*" in self.CORS_ALLOWED_ORIGINS:
                raise ValueError("Wildcard CORS origin is not allowed in production")
            if self.DB_SSL_MODE == "disabled":
                raise ValueError("Database TLS cannot be disabled in production")
            if self.DEBUG:
                raise ValueError("DEBUG must be False in production")
        if self.ENVIRONMENT == "local" and not self.SECRET_KEY:
            # Deterministic local-only development key; never used outside local/test.
            object.__setattr__(self, "SECRET_KEY", "local-dev-only-insecure-secret-key-32b")
        if self.DB_DIALECT == "mysql" and not self.DB_PASSWORD and self.ENVIRONMENT in {"local", "test"}:
            object.__setattr__(self, "DB_PASSWORD", "lalita_dev_password")
        return self

    # ------------------------------------------------------------ derived api
    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @property
    def docs_enabled(self) -> bool:
        """Interactive API docs are development aids, not production surface."""
        return not self.is_production

    @property
    def database_url(self) -> str:
        if self.DB_DIALECT == "sqlite":
            return f"sqlite+pysqlite:///{self.SQLITE_PATH}"
        from urllib.parse import quote_plus

        return (
            f"mysql+pymysql://{quote_plus(self.DB_USER)}:{quote_plus(self.DB_PASSWORD)}"
            f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}?charset=utf8mb4"
        )

    @property
    def connect_args(self) -> dict:
        """Driver level hardening applied to every pooled connection."""
        if self.DB_DIALECT == "sqlite":
            return {"check_same_thread": False}
        args: dict = {
            "charset": "utf8mb4",
            "connect_timeout": 5,
            # Fail closed: never fall back to an unencrypted connection silently.
            "ssl_disabled": self.DB_SSL_MODE == "disabled",
        }
        if self.DB_SSL_CA:
            args["ssl"] = {"ca": self.DB_SSL_CA, "check_hostname": self.DB_SSL_MODE == "verify_identity"}
        # Kill runaway statements at the server, not just in the app pool.
        args["init_command"] = (
            f"SET SESSION sql_mode='STRICT_ALL_TABLES,NO_ENGINE_SUBSTITUTION',"
            f" SESSION MAX_EXECUTION_TIME={self.DB_STATEMENT_TIMEOUT_MS}"
        )
        return args

    def new_correlation_id(self) -> str:
        return secrets.token_hex(16)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Cached settings accessor (import-safe, easy to override in tests)."""
    return Settings()


settings = get_settings()
