"""Unit tests for HTTP middleware helpers, uploads, health (no FastAPI/torch)."""

from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path

import pytest

from backend.health import (
    live_payload,
    metadata_is_loadable,
    ready_payload,
    version_payload,
)
from backend.middleware import (
    DEFAULT_CORS_ORIGINS,
    OracleHttpMiddleware,
    REQUEST_ID_PATTERN,
    configure_structured_logging,
    emit_access_log,
    get_scope_request_id,
    hsts_enabled,
    parse_cors_origins,
    resolve_request_id,
    security_headers,
)
from backend.uploads import (
    UploadValidationError,
    content_type_allowed,
    normalize_audio_suffix,
    reject_oversized_content_length,
    validate_audio_upload,
)


def test_parse_cors_origins_defaults(monkeypatch) -> None:
    monkeypatch.delenv("ORACLE_CORS_ORIGINS", raising=False)
    assert parse_cors_origins("") == list(DEFAULT_CORS_ORIGINS)
    assert parse_cors_origins(None) == list(DEFAULT_CORS_ORIGINS)


def test_parse_cors_origins_allowlist_strips_wildcard(monkeypatch) -> None:
    monkeypatch.setenv("ORACLE_CORS_ORIGINS", "https://a.example, *, https://b.example")
    assert parse_cors_origins() == ["https://a.example", "https://b.example"]
    assert "*" not in parse_cors_origins("*")
    assert parse_cors_origins("*") == list(DEFAULT_CORS_ORIGINS)


def test_resolve_request_id_valid_and_invalid() -> None:
    good = "abcde-fgh"
    assert REQUEST_ID_PATTERN.fullmatch(good)
    assert resolve_request_id(good) == good
    assert resolve_request_id("short") != "short"
    generated = resolve_request_id(None)
    assert REQUEST_ID_PATTERN.fullmatch(generated)


def test_security_headers_optional_hsts(monkeypatch) -> None:
    monkeypatch.delenv("ORACLE_ENABLE_HSTS", raising=False)
    names = {k.decode() for k, _ in security_headers(enable_hsts=False)}
    assert "x-content-type-options" in names
    assert "content-security-policy" in names
    assert "permissions-policy" in names
    assert "strict-transport-security" not in names

    hsts_names = {k.decode() for k, _ in security_headers(enable_hsts=True)}
    assert "strict-transport-security" in hsts_names

    monkeypatch.setenv("ORACLE_ENABLE_HSTS", "1")
    assert hsts_enabled() is True


def test_upload_suffix_and_content_type() -> None:
    assert normalize_audio_suffix("clip.WEBM") == ".webm"
    assert normalize_audio_suffix(None) == ".webm"
    assert content_type_allowed(None) is True
    assert content_type_allowed("audio/webm;codecs=opus") is True
    assert content_type_allowed("text/plain") is False


def test_validate_audio_upload_rejects_bad_suffix_and_size() -> None:
    with pytest.raises(UploadValidationError) as oversized:
        reject_oversized_content_length(
            str(21 * 1024 * 1024), max_bytes=20 * 1024 * 1024
        )
    assert oversized.value.status_code == 413

    with pytest.raises(UploadValidationError) as bad_type:
        validate_audio_upload(
            filename="x.exe",
            content_type="application/octet-stream",
            content_length_header="100",
            max_bytes=20 * 1024 * 1024,
        )
    assert bad_type.value.status_code == 415

    suffix = validate_audio_upload(
        filename="rec.webm",
        content_type="video/webm",
        content_length_header="1024",
        max_bytes=20 * 1024 * 1024,
    )
    assert suffix == ".webm"


def test_live_and_version_payloads(monkeypatch) -> None:
    assert live_payload() == {"ok": True}
    monkeypatch.setenv("ORACLE_APP_VERSION", "1.2.3")
    monkeypatch.setenv("ORACLE_GIT_SHA", "abc")
    monkeypatch.setenv("ORACLE_BUILT_AT", "2026-08-06T00:00:00Z")
    assert version_payload() == {
        "version": "1.2.3",
        "gitSha": "abc",
        "builtAt": "2026-08-06T00:00:00Z",
    }


def test_ready_payload_checks(tmp_path: Path) -> None:
    model = tmp_path / "model.joblib"
    meta = tmp_path / "metadata.json"
    payload = ready_payload(
        model_path=model,
        metadata_path=meta,
        storage_writable=lambda: True,
    )
    assert payload["ok"] is False
    assert payload["checks"]["modelFile"] is False

    model.write_bytes(b"x")
    meta.write_text(json.dumps({"labels": ["central"]}), encoding="utf-8")
    assert metadata_is_loadable(meta) is True
    meta.write_text("[]", encoding="utf-8")
    assert metadata_is_loadable(meta) is False
    meta.write_text(json.dumps({"labels": ["central"]}), encoding="utf-8")
    ok_payload = ready_payload(
        model_path=model,
        metadata_path=meta,
        storage_writable=lambda: True,
    )
    assert ok_payload["ok"] is True


def test_oracle_http_middleware_sets_headers_and_request_id() -> None:
    async def inner(scope, receive, send):
        assert get_scope_request_id(scope) is not None
        await send(
            {
                "type": "http.response.start",
                "status": 200,
                "headers": [(b"content-type", b"application/json")],
            }
        )
        await send({"type": "http.response.body", "body": b"{}"})

    app = OracleHttpMiddleware(inner)
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/live",
        "headers": [(b"x-request-id", b"client-id-01")],
    }
    messages: list[dict] = []

    async def receive():
        return {"type": "http.disconnect"}

    async def send(message):
        messages.append(message)

    lines: list[str] = []

    class _Capture(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            lines.append(self.format(record))

    configure_structured_logging()
    capture = _Capture()
    capture.setFormatter(
        logging.getLogger("accent_oracle.access").handlers[0].formatter
    )
    access = logging.getLogger("accent_oracle.access")
    access.addHandler(capture)
    try:
        asyncio.run(app(scope, receive, send))
    finally:
        access.removeHandler(capture)

    start = next(m for m in messages if m["type"] == "http.response.start")
    header_map = {k.decode().lower(): v.decode() for k, v in start["headers"]}
    assert header_map["x-request-id"] == "client-id-01"
    assert header_map["x-content-type-options"] == "nosniff"
    assert "microphone=()" in header_map["permissions-policy"]

    assert lines
    logged = json.loads(lines[-1])
    assert logged["request_id"] == "client-id-01"
    assert logged["method"] == "GET"
    assert logged["path"] == "/live"
    assert logged["status"] == 200
    assert "duration_ms" in logged
    assert "environment" in logged
    for banned in ("recording", "comarca", "consent", "audio", "filename"):
        assert banned not in logged


def test_emit_access_log_is_json() -> None:
    lines: list[str] = []

    class _Capture(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            lines.append(self.format(record))

    configure_structured_logging()
    capture = _Capture()
    access = logging.getLogger("accent_oracle.access")
    capture.setFormatter(access.handlers[0].formatter)
    access.addHandler(capture)
    try:
        emit_access_log(
            request_id="req-12345",
            method="POST",
            path="/analyze",
            status=204,
            duration_ms=1.5,
        )
    finally:
        access.removeHandler(capture)

    payload = json.loads(lines[-1])
    assert payload["path"] == "/analyze"
    assert payload["status"] == 204
    assert payload["request_id"] == "req-12345"
