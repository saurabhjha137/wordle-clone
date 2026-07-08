"""Shared SlowAPI rate-limiter instance.

Import this in main.py to attach to app.state, and in any router that
needs to decorate endpoints with @limiter.limit().

Note: the default in-memory store is per-process. On Azure Functions
consumption plan, each cold-start instance has its own counter — limits
apply per-instance, not globally. This still provides meaningful brute-
force protection within a single warm instance.
"""
from fastapi import Request
from slowapi import Limiter


def _get_real_ip(request: Request) -> str:
    """Return the true client IP, honouring X-Forwarded-For if present."""
    xff = request.headers.get("X-Forwarded-For")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


limiter = Limiter(key_func=_get_real_ip)
