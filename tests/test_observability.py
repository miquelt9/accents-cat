"""Unit tests for observability privacy scrubbing (no Sentry/OTel cloud required)."""

from __future__ import annotations

from backend.observability import (
    UI_TELEMETRY_EVENTS,
    app_version,
    is_ui_event_allowed,
    scrub_sentry_event,
    sentry_debug_enabled,
    sentry_should_init,
)


def test_ui_event_allowlist() -> None:
    assert is_ui_event_allowed("page_load")
    assert is_ui_event_allowed("homepage_viewed")
    assert is_ui_event_allowed("analyze_pressed")
    assert is_ui_event_allowed("analysis_completed")
    assert is_ui_event_allowed("share_clicked")
    assert is_ui_event_allowed("research_consent_accepted")
    assert not is_ui_event_allowed("recording_id")
    assert not is_ui_event_allowed("comarca")
    assert UI_TELEMETRY_EVENTS == {
        "page_load",
        "homepage_viewed",
        "recording_started",
        "recording_completed",
        "analyze_pressed",
        "analysis_completed",
        "share_clicked",
        "research_consent_accepted",
    }


def test_scrub_sentry_event_strips_body_and_sensitive_keys() -> None:
    event = {
        "request": {
            "url": "http://localhost:8000/analyze?recordingId=secret",
            "data": {"audio": "BINARY", "promptText": "hola"},
            "cookies": {"session": "x"},
            "headers": {
                "Authorization": "Bearer secret",
                "Content-Type": "multipart/form-data",
            },
            "query_string": "recordingId=secret",
        },
        "extra": {
            "recordingId": "uuid",
            "comarca": "barcelones",
            "safe": "ok",
            "nested": {"promptText": "nope"},
        },
        "user": {"ip_address": "1.2.3.4"},
        "tags": {
            "prompt_id": "p1",
            "recording_id": "uuid",
            "consent": "true",
            "score": "0.9",
        },
    }
    cleaned = scrub_sentry_event(event, None)
    assert cleaned is not None
    assert "data" not in cleaned["request"]
    assert "cookies" not in cleaned["request"]
    assert cleaned["request"]["headers"]["Authorization"] == "[Filtered]"
    assert cleaned["request"]["headers"]["Content-Type"] == "multipart/form-data"
    assert cleaned["request"]["query_string"] == ""
    assert "?" not in cleaned["request"]["url"]
    assert cleaned["extra"]["recordingId"] == "[Filtered]"
    assert cleaned["extra"]["comarca"] == "[Filtered]"
    assert cleaned["extra"]["safe"] == "ok"
    assert cleaned["extra"]["nested"]["promptText"] == "[Filtered]"
    assert "user" not in cleaned
    assert "recording_id" not in cleaned["tags"]
    assert "consent" not in cleaned["tags"]
    assert "score" not in cleaned["tags"]
    assert cleaned["tags"]["prompt_id"] == "p1"


def test_app_version_matches_frontend_release_fallback(monkeypatch) -> None:
    monkeypatch.delenv("SENTRY_RELEASE", raising=False)
    monkeypatch.setenv("ORACLE_APP_VERSION", "1.2.3")
    monkeypatch.setenv("ORACLE_GIT_SHA", "abcdef123456")
    assert app_version() == "1.2.3+abcdef1"


def test_sentry_should_init_respects_dev_gate(monkeypatch) -> None:
    monkeypatch.delenv("SENTRY_DSN", raising=False)
    monkeypatch.delenv("SENTRY_ENABLE_DEV", raising=False)
    monkeypatch.setenv("SENTRY_ENVIRONMENT", "development")
    assert sentry_should_init() is False

    monkeypatch.setenv("SENTRY_DSN", "https://example@sentry.io/1")
    assert sentry_should_init() is False

    monkeypatch.setenv("SENTRY_ENABLE_DEV", "1")
    assert sentry_should_init() is True

    monkeypatch.delenv("SENTRY_ENABLE_DEV", raising=False)
    monkeypatch.setenv("SENTRY_ENVIRONMENT", "production")
    assert sentry_should_init() is True


def test_sentry_debug_disabled_in_production(monkeypatch) -> None:
    monkeypatch.setenv("SENTRY_ENVIRONMENT", "production")
    monkeypatch.setenv("SENTRY_ENABLE_DEV", "1")
    assert sentry_debug_enabled() is False

    monkeypatch.setenv("SENTRY_ENVIRONMENT", "development")
    assert sentry_debug_enabled() is True
