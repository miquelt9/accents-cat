"""Telemetry hardening: Sentry options, funnel, routes, startup, release SHA."""

from __future__ import annotations

import json
import logging
import sys
import types
from pathlib import Path

from backend.health import version_payload
from backend.observability import (
    FUNNEL_STEP_BY_EVENT,
    app_version,
    http_route_label,
    mark_startup_complete,
    parse_ui_telemetry,
    sentry_init_options,
    sentry_logging_kwargs,
    startup_seconds,
)
from backend.observability import UiTelemetryError


ROOT = Path(__file__).resolve().parents[1]


def test_sentry_options_drop_locals_and_bodies() -> None:
    options = sentry_init_options(dsn="https://public@sentry.example/1")
    assert options["include_local_variables"] is False
    assert options["max_request_body_size"] == "never"
    assert options["send_default_pii"] is False
    logging_options = sentry_logging_kwargs()
    assert logging_options["sentry_logs_level"] == logging.WARNING
    assert logging_options["sentry_logs_level"] > logging.INFO


def test_init_sentry_passes_hardened_options(monkeypatch) -> None:
    monkeypatch.setenv("SENTRY_DSN", "https://public@sentry.example/1")
    monkeypatch.setenv("SENTRY_ENVIRONMENT", "production")
    monkeypatch.delenv("SENTRY_ENABLE_DEV", raising=False)

    captured: dict[str, object] = {}

    class LoggingIntegration:
        def __init__(self, **kwargs: object) -> None:
            captured["logging"] = kwargs

    class FastApiIntegration:
        def __init__(self, **kwargs: object) -> None:
            captured["fastapi"] = kwargs

    class StarletteIntegration:
        def __init__(self, **kwargs: object) -> None:
            captured["starlette"] = kwargs

    sentry_sdk = types.ModuleType("sentry_sdk")

    def _init(**kwargs: object) -> None:
        captured["init"] = kwargs

    sentry_sdk.init = _init  # type: ignore[attr-defined]
    sentry_sdk.set_tag = lambda *_args, **_kwargs: None  # type: ignore[attr-defined]
    fastapi_mod = types.ModuleType("sentry_sdk.integrations.fastapi")
    fastapi_mod.FastApiIntegration = FastApiIntegration  # type: ignore[attr-defined]
    starlette_mod = types.ModuleType("sentry_sdk.integrations.starlette")
    starlette_mod.StarletteIntegration = StarletteIntegration  # type: ignore[attr-defined]
    logging_mod = types.ModuleType("sentry_sdk.integrations.logging")
    logging_mod.LoggingIntegration = LoggingIntegration  # type: ignore[attr-defined]

    monkeypatch.setitem(sys.modules, "sentry_sdk", sentry_sdk)
    monkeypatch.setitem(
        sys.modules,
        "sentry_sdk.integrations",
        types.ModuleType("sentry_sdk.integrations"),
    )
    monkeypatch.setitem(sys.modules, "sentry_sdk.integrations.fastapi", fastapi_mod)
    monkeypatch.setitem(sys.modules, "sentry_sdk.integrations.starlette", starlette_mod)
    monkeypatch.setitem(sys.modules, "sentry_sdk.integrations.logging", logging_mod)

    import backend.observability as obs

    previous = obs._sentry_enabled
    try:
        assert obs.init_sentry() is True
    finally:
        obs._sentry_enabled = previous

    init_options = captured["init"]
    assert isinstance(init_options, dict)
    assert init_options["include_local_variables"] is False
    assert init_options["max_request_body_size"] == "never"
    logging_options = captured["logging"]
    assert isinstance(logging_options, dict)
    assert logging_options["sentry_logs_level"] == logging.WARNING


def test_unknown_http_routes_collapse_to_other() -> None:
    assert http_route_label("/analyze") == "/analyze"
    assert http_route_label("/version/") == "/version"
    assert http_route_label("/telemetry/event") == "/telemetry/event"
    assert http_route_label("/does-not-exist") == "other"
    assert http_route_label("/analyze/extra") == "other"
    assert http_route_label(None) == "other"
    assert http_route_label("") == "other"


def test_metrics_middleware_records_other_for_unknown_paths(monkeypatch) -> None:
    recorded: dict[str, object] = {}

    def capture(*, route: str, status_code: int, duration_seconds: float) -> None:
        recorded["route"] = route
        recorded["status"] = status_code
        recorded["duration"] = duration_seconds

    monkeypatch.setattr("backend.observability.record_http_request", capture)
    from backend.observability import MetricsHttpMiddleware

    async def inner(scope, receive, send):  # noqa: ANN001
        await send({"type": "http.response.start", "status": 404, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    app = MetricsHttpMiddleware(inner)

    async def receive():
        return {"type": "http.disconnect"}

    async def send(message):  # noqa: ANN001
        recorded.setdefault("messages", []).append(message["type"])

    import asyncio

    asyncio.run(
        app(
            {"type": "http", "path": "/scanner.php", "method": "GET"},
            receive,
            send,
        )
    )
    assert recorded["route"] == "other"
    assert recorded["status"] == 404


def test_analysis_failed_requires_coarse_fields() -> None:
    name, attrs = parse_ui_telemetry("analysis_failed", "timeout", "over_90s")
    assert name == "analysis_failed"
    assert attrs == {
        "event": "analysis_failed",
        "reason": "timeout",
        "latency_bucket": "over_90s",
    }
    for reason in ("timeout", "5xx", "4xx", "network"):
        parse_ui_telemetry("analysis_failed", reason, "under_15s")
    try:
        parse_ui_telemetry("analysis_failed", "timeout", None)
        raise AssertionError("missing bucket should fail")
    except UiTelemetryError:
        pass
    try:
        parse_ui_telemetry("homepage_viewed", "timeout", "under_15s")
        raise AssertionError("properties on other events should fail")
    except UiTelemetryError:
        pass


def test_funnel_steps_cover_the_product_path() -> None:
    assert [
        FUNNEL_STEP_BY_EVENT[event]
        for event in (
            "homepage_viewed",
            "recording_started",
            "recording_completed",
            "analyze_pressed",
            "analysis_completed",
            "result_shown",
        )
    ] == [
        "01_homepage",
        "02_recording_started",
        "03_recording_completed",
        "04_analyze_pressed",
        "05_analysis_completed",
        "06_result",
    ]
    assert FUNNEL_STEP_BY_EVENT["flow_retried"] == "07_retry_or_finalized"
    assert FUNNEL_STEP_BY_EVENT["analysis_finalized"] == "07_retry_or_finalized"
    assert "analysis_failed" not in FUNNEL_STEP_BY_EVENT


def test_startup_seconds_stay_zero_until_marked() -> None:
    import backend.observability as obs

    previous = obs._startup_seconds
    obs._startup_seconds = None
    try:
        assert startup_seconds() == 0.0
        marked = mark_startup_complete()
        assert marked > 0
        assert startup_seconds() == marked
        assert mark_startup_complete() == marked
    finally:
        obs._startup_seconds = previous


def test_version_payload_reads_git_sha_file(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.delenv("ORACLE_GIT_SHA", raising=False)
    sha = "0123456789abcdef0123456789abcdef01234567"
    sha_file = tmp_path / "git-sha.txt"
    sha_file.write_text(sha + "\n", encoding="utf-8")
    monkeypatch.setattr("backend.health.git_sha_file_candidates", lambda: [sha_file])
    assert version_payload()["gitSha"] == sha
    monkeypatch.delenv("SENTRY_RELEASE", raising=False)
    assert app_version() == sha


def test_oracle_git_sha_rejects_non_hex(monkeypatch, tmp_path: Path) -> None:
    sha_file = tmp_path / "git-sha.txt"
    sha_file.write_text("0123456789abcdef\n", encoding="utf-8")
    monkeypatch.setattr("backend.health.git_sha_file_candidates", lambda: [sha_file])
    monkeypatch.delenv("SENTRY_RELEASE", raising=False)
    monkeypatch.setenv("ORACLE_GIT_SHA", "abcdef1")
    assert version_payload()["gitSha"] == "abcdef1"
    monkeypatch.setenv("ORACLE_GIT_SHA", "A" * 40)
    assert version_payload()["gitSha"] == "A" * 40
    for invalid in ("abc", "not a sha", "g" * 7, "a" * 41, "abc123\n"):
        monkeypatch.setenv("ORACLE_GIT_SHA", invalid)
        assert version_payload()["gitSha"] == "unknown"
        assert app_version() == "unknown"
    # A bad env value does not fall through to git-sha.txt.
    assert version_payload()["gitSha"] != "0123456789abcdef"


def test_version_payload_ignores_non_sha_file(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.delenv("ORACLE_GIT_SHA", raising=False)
    sha_file = tmp_path / "git-sha.txt"
    sha_file.write_text("not a sha\n", encoding="utf-8")
    monkeypatch.setattr("backend.health.git_sha_file_candidates", lambda: [sha_file])
    assert version_payload()["gitSha"] is None


def test_operations_dashboard_funnel_panel() -> None:
    dashboard = json.loads(
        (ROOT / "ops/grafana/accent-oracle-operations.json").read_text(encoding="utf-8")
    )
    funnel = next(
        panel for panel in dashboard["panels"] if panel["title"] == "Product funnel"
    )
    blob = json.dumps(funnel)
    for step in (
        "01_homepage",
        "02_recording_started",
        "03_recording_completed",
        "04_analyze_pressed",
        "05_analysis_completed",
        "06_result",
        "07_retry_or_finalized",
    ):
        assert step in blob
    assert "accent_oracle_funnel_total" in blob
    assert "Step to step %" in blob
    startup = next(
        panel for panel in dashboard["panels"] if panel["title"] == "Startup seconds"
    )
    assert "accent_oracle_startup_seconds" in json.dumps(startup)


def test_deploy_workflows_carry_sha_and_drop_posthog() -> None:
    pages = (ROOT / ".github/workflows/deploy-pages.yml").read_text(encoding="utf-8")
    assert "VITE_GIT_SHA: ${{ github.sha }}" in pages
    assert "VITE_SENTRY_RELEASE: ${{ github.sha }}" in pages
    assert "SENTRY_AUTH_TOKEN" in pages
    assert "find dist -name '*.map' -delete" in pages
    assert "POSTHOG" not in pages
    space = (ROOT / ".github/workflows/sync-hf-space.yml").read_text(encoding="utf-8")
    assert "git-sha.txt" in space
    package = json.loads((ROOT / "web/package.json").read_text(encoding="utf-8"))
    assert "posthog-js" not in package.get("dependencies", {})
    assert "posthog-js" not in package.get("devDependencies", {})
