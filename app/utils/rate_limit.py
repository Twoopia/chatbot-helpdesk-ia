import time
from collections import defaultdict

from fastapi import HTTPException, Request

_calls: dict = defaultdict(list)
_WINDOW = 60  # seconds


def rate_limit(max_per_minute: int):
    """Simple in-memory rate limiter keyed by client IP."""
    def dependency(request: Request) -> None:
        ip = request.client.host if request.client else "unknown"
        now = time.time()
        _calls[ip] = [t for t in _calls[ip] if now - t < _WINDOW]
        if len(_calls[ip]) >= max_per_minute:
            raise HTTPException(
                status_code=429,
                detail="Muitas requisições. Aguarde um momento e tente novamente.",
            )
        _calls[ip].append(now)
    return dependency
