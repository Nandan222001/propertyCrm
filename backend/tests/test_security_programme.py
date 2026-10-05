"""Guards for the security programme itself.

The code-level controls are covered by the other test modules; these tests make
sure the *operational* artefacts (IaC, CI gates, runbooks, privacy documents,
secrets policy) cannot silently disappear in a refactor.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.core.config import Settings

REPO_ROOT = Path(__file__).resolve().parents[2]


def read(relative: str) -> str:
    path = REPO_ROOT / relative
    assert path.is_file(), f"missing required artefact: {relative}"
    return path.read_text(encoding="utf-8")


# --------------------------------------------------------------- configuration
def test_csv_and_json_list_settings_both_work(monkeypatch: pytest.MonkeyPatch) -> None:
    """Ops may write ``a,b`` or ``["a","b"]``; both must parse (no JSON-only trap)."""
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "https://erp.example,https://admin.example")
    csv_settings = Settings(_env_file=None)
    assert csv_settings.CORS_ALLOWED_ORIGINS == ["https://erp.example", "https://admin.example"]

    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", '["https://erp.example"]')
    json_settings = Settings(_env_file=None)
    assert json_settings.CORS_ALLOWED_ORIGINS == ["https://erp.example"]


@pytest.mark.parametrize(
    "overrides",
    [
        {"SECRET_KEY": ""},
        {"INDEX_PEPPER": ""},
        {"FIELD_ENCRYPTION_KEY": ""},
        {"DB_PASSWORD": ""},
    ],
)
def test_production_refuses_to_start_without_secrets(monkeypatch: pytest.MonkeyPatch, overrides: dict) -> None:
    baseline = {
        "ENVIRONMENT": "production",
        "SECRET_KEY": "x" * 48,
        "INDEX_PEPPER": "p" * 32,
        "FIELD_ENCRYPTION_KEY": "k" * 44,
        "DB_PASSWORD": "db-secret",
        "DB_SSL_MODE": "verify_identity",
    }
    for key, value in {**baseline, **overrides}.items():
        monkeypatch.setenv(key, value)
    with pytest.raises(ValueError):
        Settings(_env_file=None)


def test_production_rejects_wildcard_cors_and_disabled_db_tls(monkeypatch: pytest.MonkeyPatch) -> None:
    baseline = {
        "ENVIRONMENT": "production",
        "SECRET_KEY": "x" * 48,
        "INDEX_PEPPER": "p" * 32,
        "FIELD_ENCRYPTION_KEY": "k" * 44,
        "DB_PASSWORD": "db-secret",
        "DB_SSL_MODE": "verify_identity",
    }
    for key, value in baseline.items():
        monkeypatch.setenv(key, value)

    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "*")
    with pytest.raises(ValueError):
        Settings(_env_file=None)

    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "https://erp.example")
    monkeypatch.setenv("DB_SSL_MODE", "disabled")
    with pytest.raises(ValueError):
        Settings(_env_file=None)


def test_production_hides_interactive_docs(monkeypatch: pytest.MonkeyPatch) -> None:
    for key, value in {
        "ENVIRONMENT": "production",
        "SECRET_KEY": "x" * 48,
        "INDEX_PEPPER": "p" * 32,
        "FIELD_ENCRYPTION_KEY": "k" * 44,
        "DB_PASSWORD": "db-secret",
        # isolate from ambient CI env (which runs with DB_SSL_MODE=disabled)
        "DB_SSL_MODE": "verify_identity",
    }.items():
        monkeypatch.setenv(key, value)
    assert Settings(_env_file=None).docs_enabled is False


# ------------------------------------------------------------------- IaC + CI
def test_terraform_defines_encryption_backups_and_network_isolation() -> None:
    main = read("infra/terraform/main.tf")
    assert re.search(r"storage_encrypted\s+= true", main)
    assert "backup_retention_period" in main
    assert re.search(r"multi_az\s+= true", main)
    assert re.search(r"block_public_acls\s+= true", main)
    assert "aws_wafv2_web_acl" in main or "aws_wafv2_web_acl" in read("infra/terraform/main.tf")
    assert "aws_subnet.private" in main

    compute = read("infra/terraform/compute.tf")
    assert "readonlyRootFilesystem" in compute
    assert "assign_public_ip = false" in compute
    assert "secretsmanager:GetSecretValue" in compute
    assert "kms:Decrypt" in compute


def test_terraform_state_is_locked_encrypted_and_ignored() -> None:
    versions = read("infra/terraform/versions.tf")
    assert 'backend "s3"' in versions
    assert re.search(r"encrypt\s+= true", versions)
    assert "dynamodb_table" in versions
    assert "*.tfstate" in read(".gitignore")


def test_ci_enforces_security_gates() -> None:
    workflow = read(".github/workflows/security.yml")
    # Semgrep stands in for CodeQL: this is a private repository without
    # GitHub Advanced Security, so CodeQL/SARIF can never run here.
    for tool in ("gitleaks", "semgrep", "trivy", "tfsec"):
        assert tool.lower() in workflow.lower(), f"CI no longer runs {tool}"
    assert "github/codeql-action" not in workflow, "CodeQL must stay removed (no GHAS)"
    assert "trivy image --severity HIGH,CRITICAL" in workflow, "trivy must gate the built image"
    assert "github/codeql-action/upload-sarif" not in workflow

    ci = read(".github/workflows/ci.yml")
    assert "pytest tests -q --maxfail=0" in ci
    assert "pip-audit" in ci
    assert "bandit" in ci
    assert "npm audit" in ci
    assert "npm run smoke" in ci


def test_secrets_never_live_in_the_repository() -> None:
    example = read("backend/.env.example")
    # The template documents every key but assigns no real value to the secrets.
    for key in ("SECRET_KEY", "INDEX_PEPPER", "FIELD_ENCRYPTION_KEY", "DB_PASSWORD"):
        line = next((row for row in example.splitlines() if row.startswith(f"{key}=")), None)
        assert line is not None, f"{key} missing from .env.example"
        # Only comments may follow the `key=` token: the template ships no value.
        value = line.split("#", 1)[0].split("=", 1)[1].strip()
        assert value == "", f"{key} must be documented empty in .env.example (found {value!r})"
    assert ".env" in read(".gitignore")


# ------------------------------------------------------------------ operations
def test_backup_and_restore_tooling_exists_and_is_safe() -> None:
    backup = read("backend/scripts/backup_mysql.sh")
    assert "--single-transaction" in backup
    assert "gpg" in backup
    assert "aws s3api head-object" in backup  # verifies the upload
    restore = read("backend/scripts/restore_mysql.sh")
    assert "--verify" in restore
    assert "refusing to restore without --confirm" in restore
    assert "sha256sum -c" in restore


def test_containers_run_unprivileged_with_header_hardening() -> None:
    dockerfile = read("backend/Dockerfile")
    assert "USER app" in dockerfile
    assert "HEALTHCHECK" in dockerfile
    nginx = read("deploy/nginx.conf")
    assert "server_tokens off" in nginx
    assert "Content-Security-Policy" in nginx
    assert "client_max_body_size 2m" in nginx


def test_security_documentation_covers_every_required_area() -> None:
    security = read("docs/SECURITY.md")
    required_areas = [
        "Middleware protection",
        "Role-based access control",
        "Sensitive data handling",
        "Error handling",
        "Input validation",
        "Database security",
        "Hosting",
        "Secure communications",
        "Logging and monitoring",
        "Security testing and audits",
        "Backup and disaster recovery",
        "Dependency management",
        "Rate limiting and anti-abuse",
        "Data privacy compliance",
        "Incident response and security awareness",
        "Infrastructure as Code",
    ]
    missing = [area for area in required_areas if area.lower() not in security.lower()]
    assert not missing, f"docs/SECURITY.md no longer documents: {missing}"

    for document in (
        "SECURITY.md",
        "docs/ARCHITECTURE.md",
        "docs/DEPLOYMENT.md",
        "docs/BACKUP_AND_DR.md",
        "docs/DATA_PRIVACY.md",
        "docs/DEPENDENCY_MANAGEMENT.md",
        "docs/INCIDENT_RESPONSE.md",
        "docs/SECURITY_TESTING.md",
    ):
        assert read(document).strip(), f"{document} is empty"


def test_dependency_policy_pins_and_documents_holds() -> None:
    requirements = read("backend/requirements.txt")
    unpinned = [
        line for line in requirements.splitlines()
        if line.strip() and not line.startswith("#") and "==" not in line and not line.startswith("-r")
    ]
    assert not unpinned, f"unpinned runtime dependencies: {unpinned}"
    assert "bcrypt==4.0.1" in requirements
    assert "passlib" in read("docs/DEPENDENCY_MANAGEMENT.md")
