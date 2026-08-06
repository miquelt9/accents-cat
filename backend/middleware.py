"""HTTP middleware: security headers, request IDs, structured access logs.

Privacy: never log audio, bodies, filenames, consent, comarca, or recording IDs.
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Callable

from backend.observability import sentry_environment, set_request_id_tag

logger = logging.getLogger(__name__)
access_logger = logging.getLogger("accent_oracle.access")

REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{8,128}$")

DEFAULT_CORS_ORIGINS: tuple[str, ...] = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://localhost:5173",
    "https://127.0.0.1:5173",
)

_API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
_REFERRER_POLICY = "strict-origin-when-cross-origin"
_PERMISSIONS_POLICY = "microphone=(), camera=(), geolocation=()"


def parse_cors_origins(raw: str | None = None) -> list[str]:
    """Comma-separated allowlist; never returns ``*``. Empty → localhost Vite defaults."""
    value = (
        raw if raw is not None else os.environ.get("ORACLE_CORS_ORIGINS", "")
    ).strip()
    if not value:
        return list(DEFAULT_CORS_ORIGINS)
    origins: list[str] = []
    for part in value.split(","):
        origin = part.strip()
        if not origin or origin == "*":
            continue
        origins.append(origin)
    return origins or list(DEFAULT_CORS_ORIGINS)


def hsts_enabled() -> bool:
    return os.environ.get("ORACLE_ENABLE_HSTS", "").strip().lower() in {
        "1",
        "true",
        "yes",
    }


def resolve_request_id(header_value: str | None) -> str:
    """Accept a client ``X-Request-ID`` when well-formed; otherwise mint a UUID4."""
    if header_value is not None:
        candidate = header_value.strip()
        if REQUEST_ID_PATTERN.fullmatch(candidate):
            return candidate
    return str(uuid.uuid4())


def security_headers(*, enable_hsts: bool | None = None) -> list[tuple[bytes, bytes]]:
    """API response security headers (no microphone permission — SPA sets that on the proxy)."""
    use_hsts = hsts_enabled() if enable_hsts is None else enable_hsts
    headers: list[tuple[bytes, bytes]] = [
        (b"x-content-type-options", b"nosniff"),
        (b"referrer-policy", _REFERRER_POLICY.encode("latin-1")),
        (b"permissions-policy", _PERMISSIONS_POLICY.encode("latin-1")),
        (b"content-security-policy", _API_CSP.encode("latin-1")),
        (b"x-frame-options", b"DENY"),
    ]
    if use_hsts:
        headers.append(
            (b"strict-transport-security", b"max-age=31536000; includeSubDomains")
        )
    return headers


def _set_scope_request_id(scope: dict[str, Any], request_id: str) -> None:
    state = scope.get("state")
    if state is None:
        scope["state"] = {"request_id": request_id}
        return
    if isinstance(state, dict):
        state["request_id"] = request_id
        return
    try:
        setattr(state, "request_id", request_id)
    except Exception:  # noqa: BLE001 — never break the request path
        scope["state"] = {"request_id": request_id}


def get_scope_request_id(scope: dict[str, Any]) -> str | None:
    state = scope.get("state")
    if state is None:
        return None
    if isinstance(state, dict):
        value = state.get("request_id")
        return str(value) if value is not None else None
    value = getattr(state, "request_id", None)
    return str(value) if value is not None else None


class JsonLogFormatter(logging.Formatter):
    """Minimal JSON log lines for stdlib handlers."""

    _ACCESS_KEYS = ("request_id", "method", "path", "status", "duration_ms")

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(
                record.created, tz=timezone.utc
            ).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "environment": sentry_environment(),
        }
        if record.name == "accent_oracle.access":
            for key in self._ACCESS_KEYS:
                if hasattr(record, key):
                    payload[key] = getattr(record, key)
        else:
            payload["message"] = record.getMessage()
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def configure_structured_logging() -> None:
    """Attach a JSON formatter to the access logger (idempotent)."""
    handler = logging.StreamHandler()
    handler.setFormatter(JsonLogFormatter())
    access_logger.handlers.clear()
    access_logger.addHandler(handler)
    access_logger.setLevel(logging.INFO)
    access_logger.propagate = False


def emit_access_log(
    *,
    request_id: str,
    method: str,
    path: str,
    status: int,
    duration_ms: float,
) -> None:
    access_logger.info(
        "access",
        extra={
            "request_id": request_id,
            "method": method,
            "path": path,
            "status": status,
            "duration_ms": round(duration_ms, 3),
        },
    )


def _header_value(headers: list[tuple[bytes, bytes]], name: bytes) -> str | None:
    name_l = name.lower()
    for key, value in headers:
        if key.lower() == name_l:
            try:
                return value.decode("latin-1")
            except Exception:  # noqa: BLE001
                return None
    return None


class OracleHttpMiddleware:
    """Request ID + security headers + JSON access log (no bodies)."""

    def __init__(self, app: Any) -> None:
        self.app = app

    async def __call__(
        self, scope: dict[str, Any], receive: Callable, send: Callable
    ) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        raw_headers: list[tuple[bytes, bytes]] = list(scope.get("headers") or [])
        request_id = resolve_request_id(_header_value(raw_headers, b"x-request-id"))
        _set_scope_request_id(scope, request_id)
        set_request_id_tag(request_id)

        method = str(scope.get("method") or "GET")
        path = str(scope.get("path") or "/")
        start = time.perf_counter()
        status_code = 500
        sec_headers = security_headers()
        request_id_header = (b"x-request-id", request_id.encode("latin-1"))

        async def send_wrapper(message: dict[str, Any]) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = int(message.get("status", 500))
                existing: list[tuple[bytes, bytes]] = list(message.get("headers") or [])
                # Drop any prior copies so we own the final values.
                drop = {
                    b"x-request-id",
                    b"x-content-type-options",
                    b"referrer-policy",
                    b"permissions-policy",
                    b"content-security-policy",
                    b"x-frame-options",
                    b"strict-transport-security",
                }
                kept = [(k, v) for k, v in existing if k.lower() not in drop]
                # Only add HSTS from security_headers(); if disabled, do not force-remove
                # an upstream HSTS (kept filter already dropped ours).
                message = {
                    **message,
                    "headers": kept + sec_headers + [request_id_header],
                }
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            emit_access_log(
                request_id=request_id,
                method=method,
                path=path,
                status=status_code,
                duration_ms=(time.perf_counter() - start) * 1000.0,
            )
