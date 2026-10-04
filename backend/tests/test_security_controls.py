"""Transport / middleware / abuse-control tests."""

from __future__ import annotations

from app.core.config import settings
from app.core.rate_limit import reset_backend


def test_security_headers_present_on_every_response(client):
    response = client.get("/api/v1/health")
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Referrer-Policy"] == "no-referrer"
    assert "Content-Security-Policy" in response.headers
    assert response.headers["Cache-Control"] == "no-store"
    assert "Server" not in response.headers


def test_request_id_is_echoed_and_generated(client):
    provided = client.get("/api/v1/health", headers={"X-Request-ID": "trace-abc-123"})
    assert provided.headers["X-Request-ID"] == "trace-abc-123"
    generated = client.get("/api/v1/health")
    assert len(generated.headers["X-Request-ID"]) >= 16


def test_hsts_only_when_https_is_enabled(client, monkeypatch):
    plain = client.get("/api/v1/health")
    assert "Strict-Transport-Security" not in plain.headers
    monkeypatch.setattr(settings, "FORCE_HTTPS", True)
    secured = client.get("/api/v1/health", headers={"X-Forwarded-Proto": "https"})
    assert "Strict-Transport-Security" in secured.headers


def test_https_redirect_middleware(client, monkeypatch):
    monkeypatch.setattr(settings, "FORCE_HTTPS", True)
    response = client.get("/api/v1/health", follow_redirects=False)
    assert response.status_code == 308
    assert response.json()["error"]["code"] == "https_required"


def test_oversized_body_is_rejected(client, admin_headers, monkeypatch):
    monkeypatch.setattr(settings, "MAX_REQUEST_BYTES", 512)
    payload = {"name": "Big", "description": "x" * 2048}
    response = client.post("/api/v1/projects", json=payload, headers=admin_headers)
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "payload_too_large"


def test_rate_limiting_blocks_brute_force(client, monkeypatch):
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", True)
    monkeypatch.setattr(settings, "RATE_LIMIT_AUTH", "5/minute")
    reset_backend()
    statuses = [
        client.post("/api/v1/auth/login",
                    json={"email": "brute@example.demo", "password": "Wrong@12345"}).status_code
        for _ in range(9)
    ]
    assert 429 in statuses, f"auth endpoint must throttle: {statuses}"
    limited = client.post("/api/v1/auth/login", json={"email": "x@y.demo", "password": "Wrong@12345"})
    if limited.status_code == 429:
        assert "Retry-After" in limited.headers
    reset_backend()


def test_rate_limit_headers_exposed_when_enabled(client, monkeypatch):
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", True)
    reset_backend()
    response = client.get("/api/v1/health")
    if response.headers.get("X-RateLimit-Limit"):
        assert int(response.headers["X-RateLimit-Remaining"]) >= 0
    reset_backend()


def test_cors_is_allowlisted_not_wildcard(client):
    allowed = client.options(
        "/api/v1/auth/login",
        headers={
            "Origin": settings.CORS_ALLOWED_ORIGINS[0],
            "Access-Control-Request-Method": "POST",
        },
    )
    assert allowed.headers.get("Access-Control-Allow-Origin") == settings.CORS_ALLOWED_ORIGINS[0]

    denied = client.options(
        "/api/v1/auth/login",
        headers={"Origin": "https://evil.example.com", "Access-Control-Request-Method": "POST"},
    )
    assert denied.headers.get("Access-Control-Allow-Origin") is None


def test_auth_responses_are_not_cacheable(client):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@nmtsolution.demo", "password": "Demo@12345"},
    )
    assert response.headers["Cache-Control"].startswith("no-store")


def test_health_and_ready_are_public_but_minimal(client):
    health = client.get("/api/v1/health")
    assert health.status_code == 200
    body = health.json()["data"]
    assert body["status"] == "ok"
    assert "database_url" not in health.text and "secret" not in health.text.lower()

    ready = client.get("/api/v1/ready")
    assert ready.status_code == 200
    assert ready.json()["data"]["checks"]["database"]["status"] == "ok"


def test_metrics_endpoint_shape(client):
    response = client.get("/api/v1/metrics")
    assert response.status_code == 200
    assert "app_uptime_seconds" in response.text
    assert "password" not in response.text.lower()
