from __future__ import annotations

from backend.limits import SlidingWindowRateLimiter


def test_sliding_window_allows_up_to_max() -> None:
    limiter = SlidingWindowRateLimiter(max_requests=3, window_seconds=60.0)
    assert limiter.allow("a") is True
    assert limiter.allow("a") is True
    assert limiter.allow("a") is True
    assert limiter.allow("a") is False
    assert limiter.allow("b") is True


def test_sliding_window_expires(monkeypatch) -> None:
    limiter = SlidingWindowRateLimiter(max_requests=1, window_seconds=10.0)
    clock = {"t": 1000.0}
    monkeypatch.setattr("backend.limits.time.monotonic", lambda: clock["t"])

    assert limiter.allow("x") is True
    assert limiter.allow("x") is False
    clock["t"] = 1010.1
    assert limiter.allow("x") is True
