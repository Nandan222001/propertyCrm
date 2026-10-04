"""Rate limiting and anti-abuse primitives.

A fixed-window counter is used because it is atomic in both backends and easy to
reason about operationally:

* **redis** (production) — ``INCR`` + ``EXPIRE`` in a Lua-free pipeline: the
  counter is shared by every replica behind the load balancer;
* **memory** (local/test) — a bounded dict, so a single dev box still enforces
  limits without running Redis.

The limiter is keyed by *identity* (authenticated user id) when available and by
client IP otherwise; auth endpoints add an extra per-account dimension so a
distributed password-guessing run cannot hide behind rotating IPs.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque
from dataclasses import dataclass

from app.core.config import settings
from app.core.exceptions import RateLimitError
from app.core.logging import get_logger, log_security_event

logger = get_logger(__name__)


@dataclass(frozen=True)
class RateLimitRule:
    """``limit`` requests per ``window_seconds``."""

    limit: int
    window_seconds: int

    @classmethod
    def parse(cls, spec: str) -> RateLimitRule:
        """Parse ``"120/minute"`` / ``"10/second"`` / ``"5/hour"`` specs."""
        amount, _, unit = spec.partition("/")
        window = {
            "second": 1,
            "minute": 60,
            "hour": 3600,
            "day": 86400,
        }.get(unit.strip().lower().rstrip("s"), 60)
        return cls(limit=max(int(amount), 1), window_seconds=window)


class _MemoryBackend:
    """Bounded sliding window; used for local dev and the test suite."""

    def __init__(self, max_keys: int = 20_000) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()
        self._max_keys = max_keys

    def hit(self, key: str, rule: RateLimitRule) -> tuple[int, int]:
        now = time.monotonic()
        with self._lock:
            bucket = self._hits[key]
            cutoff = now - rule.window_seconds
            while bucket and bucket[0] < cutoff:
                bucket.popleft()
            bucket.append(now)
            if len(self._hits) > self._max_keys:  # evict idle keys
                for stale in [k for k, v in self._hits.items() if not v or v[-1] < cutoff][:1000]:
                    self._hits.pop(stale, None)
            remaining = max(rule.limit - len(bucket), 0)
            reset_in = int(rule.window_seconds - (now - bucket[0])) if bucket else rule.window_seconds
            return remaining, max(reset_in, 0)


class _RedisBackend:
    def __init__(self, url: str) -> None:
        import redis  # imported lazily: redis is optional in local dev

        self._client = redis.Redis.from_url(url, decode_responses=True, socket_timeout=2)

    def hit(self, key: str, rule: RateLimitRule) -> tuple[int, int]:
        pipe = self._client.pipeline()
        pipe.incr(key)
        pipe.ttl(key)
        count, ttl = pipe.execute()
        if ttl is None or ttl < 0:
            self._client.expire(key, rule.window_seconds)
            ttl = rule.window_seconds
        return max(rule.limit - int(count), 0), int(ttl)


_backend: object | None = None


def get_backend():
    global _backend
    if _backend is None:
        if settings.RATE_LIMIT_BACKEND == "redis":
            try:
                _backend = _RedisBackend(settings.REDIS_URL)
            except Exception as exc:
                log_security_event(
                    "ratelimit.redis_unavailable",
                    f"Falling back to in-memory rate limiting: {exc}",
                )
                _backend = _MemoryBackend()
        else:
            _backend = _MemoryBackend()
    return _backend


def reset_backend() -> None:
    """Test hook: clear counters between tests."""
    global _backend
    _backend = None


def check_rate_limit(*, key: str, rule_spec: str, event: str = "rate_limit.exceeded") -> dict[str, int]:
    """Raise :class:`RateLimitError` when the caller exceeds ``rule_spec``."""
    if not settings.RATE_LIMIT_ENABLED:
        return {"limit": 0, "remaining": 0, "reset": 0}
    rule = RateLimitRule.parse(rule_spec)
    remaining, reset_in = get_backend().hit(f"rl:{key}", rule)
    if remaining <= 0 and reset_in > 0:
        log_security_event(
            event=event,
            message=f"Rate limit exceeded for {key}",
            limit=rule.limit,
            window_seconds=rule.window_seconds,
        )
        raise RateLimitError(details={"retry_after_seconds": reset_in, "limit": rule.limit})
    return {"limit": rule.limit, "remaining": remaining, "reset": reset_in}


class LoginThrottle:
    """Progressive delay + lockout bookkeeping for the sign-in endpoint.

    Deliberately separate from the HTTP limiter: it counts *failures* per account
    and is consulted by ``services.auth_service`` before verifying a password.
    """

    def __init__(self, max_failures: int, lock_seconds: int) -> None:
        self.max_failures = max_failures
        self.lock_seconds = lock_seconds

    def delay_for(self, failures: int) -> float:
        """Exponential backoff (capped at 5s) applied before hashing a password."""
        return min(2 ** max(failures - 1, 0) * 0.1, 5.0) if failures else 0.0

    def is_locked(self, locked_until: float | None) -> bool:
        return bool(locked_until and locked_until > time.time())

    def seconds_remaining(self, locked_until: float | None) -> int:
        return max(int((locked_until or 0) - time.time()), 0)
