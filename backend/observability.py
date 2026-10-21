"""Sentry + Grafana Cloud OTLP metrics for the Accent Oracle API.

Privacy: never send audio, request bodies, transcripts, comarca, session or
recording IDs, consent payloads, or filenames to observability vendors.
"""

from __future__ import annotations

import logging
import os
import re
import time
from base64 import b64encode
from typing import Any, Callable

from backend.health import configured_git_sha

logger = logging.getLogger(__name__)

APP_NAME = "accent-oracle"
SERVICE_NAME = "api"
DEFAULT_RELEASE = "0.1.0"

# Allowlisted UI product events (frontend → POST /telemetry/event).
UI_TELEMETRY_EVENTS: frozenset[str] = frozenset(
    {
        "page_load",
        "homepage_viewed",
        "recording_started",
        "recording_press_hold",
        "recording_too_short",
        "recording_no_speech",
        "recording_completed",
        "analyze_pressed",
        "analysis_completed",
        "validation_started",
        "third_take_offered",
        "third_take_completed",
        "third_take_skipped",
        "analysis_finalized",
        "analysis_unresolved",
        "analysis_failed",
        "result_shown",
        "flow_retried",
        "share_clicked",
        "research_consent_accepted",
        "origin_submitted",
    }
)

# Product funnel steps, in order. Counts only — no cookies or browser storage.
# `07_retry_or_finalized` covers an explicit retry and a persisted finalize.
FUNNEL_STEP_BY_EVENT: dict[str, str] = {
    "homepage_viewed": "01_homepage",
    "recording_started": "02_recording_started",
    "recording_completed": "03_recording_completed",
    "analyze_pressed": "04_analyze_pressed",
    "analysis_completed": "05_analysis_completed",
    "result_shown": "06_result",
    "analysis_finalized": "07_retry_or_finalized",
    "flow_retried": "07_retry_or_finalized",
}

ANALYSIS_FAILURE_REASONS: frozenset[str] = frozenset(
    {"timeout", "5xx", "4xx", "network"}
)
LATENCY_BUCKETS: frozenset[str] = frozenset(
    {"under_15s", "15_to_45s", "45_to_90s", "over_90s"}
)

# Low-cardinality HTTP routes. Anything else shares the `other` label.
_KNOWN_HTTP_ROUTES: frozenset[str] = frozenset(
    {
        "/analyze",
        "/analysis-finalize",
        "/feedback",
        "/research-consent",
        "/health",
        "/live",
        "/ready",
        "/version",
        "/telemetry/event",
        "/sentry-debug",
    }
)

_SENSITIVE_KEY_RE = re.compile(
    r"(recording|session|consent|comarca|audio|prompt|transcript|filename|notes|score|password|secret|token|authorization|cookie|user_agent|ip_address|email|phone)",
    re.IGNORECASE,
)

_sentry_enabled = False
_otel_enabled = False

_analyze_counter: Any = None
_consent_counter: Any = None
_feedback_counter: Any = None
_ui_event_counter: Any = None
_funnel_counter: Any = None
_startup_seconds_gauge: Any = None
_inference_histogram: Any = None
_queue_wait_histogram: Any = None
_inference_rejected_counter: Any = None
_inference_queue_depth_gauge: Any = None
_inference_active_workers_gauge: Any = None
_http_request_counter: Any = None
_http_duration_histogram: Any = None
_inference_pool_metrics_provider: Callable[[], dict[str, float]] | None = None
_PROCESS_STARTED_AT = time.perf_counter()
_startup_seconds: float | None = None


def app_version() -> str:
    """Sentry release. An explicit release wins; otherwise the full git SHA."""
    explicit = os.environ.get("SENTRY_RELEASE", "").strip()
    if explicit:
        return explicit
    git_sha = configured_git_sha()
    if git_sha and git_sha != "dev":
        return git_sha
    return os.environ.get("ORACLE_APP_VERSION", "").strip() or DEFAULT_RELEASE


def sentry_logging_kwargs() -> dict[str, int]:
    """Breadcrumbs stay at INFO. Sentry Logs (the log product) start at WARNING."""
    return {
        "level": logging.INFO,
        "event_level": logging.ERROR,
        "sentry_logs_level": logging.WARNING,
    }


def sentry_init_options(*, dsn: str) -> dict[str, Any]:
    """SDK options shared by init and tests. No local variables or request bodies."""
    return {
        "dsn": dsn,
        "environment": sentry_environment(),
        "release": app_version(),
        "send_default_pii": False,
        "include_local_variables": False,
        "max_request_body_size": "never",
        "enable_logs": True,
        "traces_sample_rate": 0.10,
        "before_send": scrub_sentry_event,
    }


def sentry_environment() -> str:
    return os.environ.get("SENTRY_ENVIRONMENT", "development").strip() or "development"


def _truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes"}


def sentry_should_init() -> bool:
    """Init when DSN is set and not blocked for local development."""
    dsn = os.environ.get("SENTRY_DSN", "").strip()
    if not dsn:
        return False
    env = sentry_environment()
    if env == "development" and not _truthy(os.environ.get("SENTRY_ENABLE_DEV")):
        return False
    return True


def sentry_debug_enabled() -> bool:
    """Dev-only /sentry-debug endpoint."""
    env = sentry_environment()
    if env == "production":
        return False
    return env == "development" or _truthy(os.environ.get("SENTRY_ENABLE_DEV"))


def is_ui_event_allowed(event: str) -> bool:
    return event in UI_TELEMETRY_EVENTS


def http_route_label(path: str | None) -> str:
    """Map an HTTP path to a low-cardinality route label. Unknown paths are `other`."""
    if not path:
        return "other"
    normalized = path.split("?", 1)[0]
    if len(normalized) > 1:
        normalized = normalized.rstrip("/")
    if normalized in _KNOWN_HTTP_ROUTES:
        return normalized
    return "other"


class UiTelemetryError(ValueError):
    """Rejected product-telemetry payload (unknown event or disallowed property)."""


def parse_ui_telemetry(
    event: str,
    reason: str | None = None,
    latency_bucket: str | None = None,
) -> tuple[str, dict[str, str]]:
    """Validate an allowlisted event. Only `analysis_failed` may carry properties."""
    name = event.strip()
    if not is_ui_event_allowed(name):
        raise UiTelemetryError(name)
    clean_reason = (
        reason.strip() if isinstance(reason, str) and reason.strip() else None
    )
    clean_bucket = (
        latency_bucket.strip()
        if isinstance(latency_bucket, str) and latency_bucket.strip()
        else None
    )
    if name == "analysis_failed":
        if (
            clean_reason not in ANALYSIS_FAILURE_REASONS
            or clean_bucket not in LATENCY_BUCKETS
        ):
            raise UiTelemetryError(name)
        return name, {
            "event": name,
            "reason": clean_reason,
            "latency_bucket": clean_bucket,
        }
    if clean_reason or clean_bucket:
        raise UiTelemetryError(name)
    return name, {"event": name}


def mark_startup_complete() -> float:
    """Record seconds from process import until the API finished starting."""
    global _startup_seconds
    if _startup_seconds is None:
        _startup_seconds = max(0.0, time.perf_counter() - _PROCESS_STARTED_AT)
    return _startup_seconds


def startup_seconds() -> float:
    """Gauge value: 0 until startup has been marked, then the recorded duration."""
    if _startup_seconds is None:
        return 0.0
    return _startup_seconds


def _scrub_mapping(data: Any) -> Any:
    if not isinstance(data, dict):
        return data
    cleaned: dict[str, Any] = {}
    for key, value in data.items():
        key_str = str(key)
        if _SENSITIVE_KEY_RE.search(key_str):
            cleaned[key_str] = "[Filtered]"
            continue
        if isinstance(value, dict):
            cleaned[key_str] = _scrub_mapping(value)
        elif isinstance(value, list):
            cleaned[key_str] = [
                _scrub_mapping(item) if isinstance(item, dict) else item
                for item in value
            ]
        else:
            cleaned[key_str] = value
    return cleaned


def scrub_sentry_event(
    event: dict[str, Any], _hint: dict[str, Any] | None = None
) -> dict[str, Any] | None:
    """Sanitize unexpected request / extra data before sending to Sentry."""
    request = event.get("request")
    if isinstance(request, dict):
        request.pop("data", None)
        request.pop("cookies", None)
        headers = request.get("headers")
        if isinstance(headers, dict):
            scrubbed_headers: dict[str, Any] = {}
            for name, value in headers.items():
                lower = str(name).lower()
                if lower in {
                    "authorization",
                    "cookie",
                    "set-cookie",
                    "x-api-key",
                    "forwarded",
                    "x-forwarded-for",
                    "x-real-ip",
                    "user-agent",
                }:
                    scrubbed_headers[name] = "[Filtered]"
                else:
                    scrubbed_headers[name] = value
            request["headers"] = scrubbed_headers
        # Drop query strings that may contain ids.
        if "query_string" in request:
            request["query_string"] = ""
        if "url" in request and isinstance(request["url"], str):
            url = request["url"]
            if "?" in url:
                request["url"] = url.split("?", 1)[0]

    if "extra" in event and isinstance(event["extra"], dict):
        event["extra"] = _scrub_mapping(event["extra"])

    contexts = event.get("contexts")
    if isinstance(contexts, dict):
        for ctx_name, ctx in list(contexts.items()):
            if isinstance(ctx, dict):
                contexts[ctx_name] = _scrub_mapping(ctx)

    tags = event.get("tags")
    if isinstance(tags, dict):
        for key in list(tags):
            # prompt_id is an allowlisted low-sensitivity tag (id only).
            if _SENSITIVE_KEY_RE.search(str(key)) and str(key).lower() != "prompt_id":
                tags.pop(key, None)

    # Never attach user identity.
    event.pop("user", None)

    return event


def init_sentry() -> bool:
    """Initialize Sentry SDK. Must run before FastAPI app creation."""
    global _sentry_enabled
    if not sentry_should_init():
        logger.info(
            "Sentry disabled (no DSN or development without SENTRY_ENABLE_DEV)."
        )
        return False

    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.logging import LoggingIntegration
    from sentry_sdk.integrations.starlette import StarletteIntegration

    sentry_sdk.init(
        **sentry_init_options(dsn=os.environ["SENTRY_DSN"].strip()),
        integrations=[
            StarletteIntegration(transaction_style="endpoint"),
            FastApiIntegration(transaction_style="endpoint"),
            LoggingIntegration(**sentry_logging_kwargs()),
        ],
    )
    sentry_sdk.set_tag("app", APP_NAME)
    sentry_sdk.set_tag("service", SERVICE_NAME)
    _sentry_enabled = True
    logger.info(
        "Sentry initialized (env=%s, release=%s).", sentry_environment(), app_version()
    )
    return True


def set_prompt_id_tag(prompt_id: str | None) -> None:
    if not _sentry_enabled or not prompt_id:
        return
    try:
        import sentry_sdk

        sentry_sdk.set_tag("prompt_id", prompt_id[:64])
    except Exception:  # noqa: BLE001 — never break request path
        pass


def set_request_id_tag(request_id: str | None) -> None:
    """Attach correlation id to the current Sentry scope (never a recording id)."""
    if not request_id:
        return
    # Tag even when Sentry is off so local wiring stays consistent if enabled mid-process.
    if not _sentry_enabled:
        return
    try:
        import sentry_sdk

        sentry_sdk.set_tag("request_id", request_id[:128])
    except Exception:  # noqa: BLE001 — never break request path
        pass


def set_inference_pool_metrics_provider(
    provider: Callable[[], dict[str, float]] | None,
) -> None:
    """Attach the process-local pool state to observable OTLP gauges."""
    global _inference_pool_metrics_provider
    _inference_pool_metrics_provider = provider


def _observe_pool_metric(name: str) -> list[Any]:
    if _inference_pool_metrics_provider is None:
        value = 0
    else:
        value = _inference_pool_metrics_provider().get(name, 0)
    try:
        from opentelemetry.metrics import Observation

        return [Observation(value, {})]
    except ImportError:
        return []


def _observe_queue_depth(_options: Any) -> list[Any]:
    return _observe_pool_metric("queue_depth")


def _observe_active_workers(_options: Any) -> list[Any]:
    return _observe_pool_metric("active_workers")


def _observe_startup_seconds(_options: Any) -> list[Any]:
    try:
        from opentelemetry.metrics import Observation

        return [Observation(startup_seconds(), {})]
    except ImportError:
        return []


def _otlp_auth_header(api_key: str) -> str:
    key = api_key.strip()
    if key.lower().startswith("basic "):
        return key
    # Grafana Cloud expects Basic base64(instance_id:token). Callers may pass
    # either the raw token already base64-encoded, or instance_id:token.
    if ":" in key and not re.fullmatch(r"[A-Za-z0-9+/=]+", key):
        return "Basic " + b64encode(key.encode("utf-8")).decode("ascii")
    return "Basic " + key


def init_otel_metrics() -> bool:
    """Export process + custom metrics to Grafana Cloud via OTLP/HTTP."""
    global _otel_enabled
    global _analyze_counter, _consent_counter, _feedback_counter, _ui_event_counter
    global _funnel_counter, _startup_seconds_gauge
    global _inference_histogram, _queue_wait_histogram, _inference_rejected_counter
    global _inference_queue_depth_gauge, _inference_active_workers_gauge
    global _http_request_counter, _http_duration_histogram

    endpoint = os.environ.get("GRAFANA_OTLP_ENDPOINT", "").strip()
    api_key = os.environ.get("GRAFANA_OTLP_API_KEY", "").strip()
    if not endpoint or not api_key:
        logger.info("Grafana OTLP metrics disabled (missing endpoint or API key).")
        return False

    try:
        from opentelemetry import metrics
        from opentelemetry.exporter.otlp.proto.http.metric_exporter import (
            OTLPMetricExporter,
        )
        from opentelemetry.sdk.metrics import MeterProvider
        from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
        from opentelemetry.sdk.resources import Resource
    except ImportError:
        logger.warning(
            "OpenTelemetry packages not installed; skipping Grafana metrics."
        )
        return False

    # Endpoint should be the OTLP base (…/otlp); exporter appends /v1/metrics.
    export_endpoint = endpoint.rstrip("/")
    if export_endpoint.endswith("/v1/metrics"):
        export_endpoint = export_endpoint[: -len("/v1/metrics")]

    resource = Resource.create(
        {
            "service.name": "accent-oracle-api",
            "service.version": app_version(),
            "deployment.environment": sentry_environment(),
        }
    )
    exporter = OTLPMetricExporter(
        endpoint=f"{export_endpoint}/v1/metrics",
        headers={"Authorization": _otlp_auth_header(api_key)},
    )
    reader = PeriodicExportingMetricReader(exporter, export_interval_millis=60_000)
    provider = MeterProvider(resource=resource, metric_readers=[reader])
    metrics.set_meter_provider(provider)
    meter = metrics.get_meter(APP_NAME, app_version())

    _http_request_counter = meter.create_counter(
        "accent_oracle_http_requests_total",
        description="HTTP requests by route and status class",
    )
    _http_duration_histogram = meter.create_histogram(
        "accent_oracle_http_request_duration_seconds",
        description="HTTP request duration in seconds",
        unit="s",
    )
    _inference_histogram = meter.create_histogram(
        "accent_oracle_inference_duration_seconds",
        description="HuBERT + SVM inference duration",
        unit="s",
    )
    _queue_wait_histogram = meter.create_histogram(
        "accent_oracle_inference_queue_wait_seconds",
        description="Time spent waiting in the inference queue",
        unit="s",
    )
    _inference_rejected_counter = meter.create_counter(
        "accent_oracle_inference_rejected_total",
        description="Inference jobs rejected because the queue was full",
    )
    _inference_queue_depth_gauge = meter.create_observable_gauge(
        "accent_oracle_inference_queue_depth",
        callbacks=[_observe_queue_depth],
        description="Current waiting inference jobs",
    )
    _inference_active_workers_gauge = meter.create_observable_gauge(
        "accent_oracle_inference_active_workers",
        callbacks=[_observe_active_workers],
        description="Current inference workers executing jobs",
    )
    _analyze_counter = meter.create_counter(
        "accent_oracle_analyze_total",
        description="Analyze outcomes",
    )
    _consent_counter = meter.create_counter(
        "accent_oracle_consent_total",
        description="Research consent submissions",
    )
    _feedback_counter = meter.create_counter(
        "accent_oracle_feedback_total",
        description="Feedback submissions",
    )
    _ui_event_counter = meter.create_counter(
        "accent_oracle_ui_event_total",
        description="Allowlisted frontend product events",
    )
    _funnel_counter = meter.create_counter(
        "accent_oracle_funnel_total",
        description="Product funnel step counts (no cookies or browser storage)",
    )
    _startup_seconds_gauge = meter.create_observable_gauge(
        "accent_oracle_startup_seconds",
        callbacks=[_observe_startup_seconds],
        description="Seconds from process start until the API finished starting",
        unit="s",
    )

    try:
        from opentelemetry.instrumentation.system_metrics import (
            SystemMetricsInstrumentor,
        )

        SystemMetricsInstrumentor().instrument()
    except Exception as exc:  # noqa: BLE001
        logger.warning("System metrics instrumentation skipped: %s", exc)

    _otel_enabled = True
    logger.info("Grafana OTLP metrics initialized (%s).", export_endpoint)
    return True


def init_observability() -> None:
    """Initialize Sentry then OTel metrics. Call before FastAPI()."""
    init_sentry()
    init_otel_metrics()


def record_http_request(
    *, route: str, status_code: int, duration_seconds: float
) -> None:
    if not _otel_enabled:
        return
    status_class = f"{status_code // 100}xx"
    attrs = {"route": route, "status_class": status_class}
    try:
        _http_request_counter.add(1, attrs)
        _http_duration_histogram.record(duration_seconds, attrs)
    except Exception:  # noqa: BLE001
        pass


def record_analyze(result: str, duration_seconds: float | None = None) -> None:
    if not _otel_enabled:
        return
    try:
        _analyze_counter.add(1, {"result": result})
        if duration_seconds is not None:
            _inference_histogram.record(duration_seconds, {"result": result})
    except Exception:  # noqa: BLE001
        pass


def record_inference_queue_wait(duration_seconds: float) -> None:
    if not _otel_enabled:
        return
    try:
        _queue_wait_histogram.record(duration_seconds, {})
    except Exception:  # noqa: BLE001
        pass


def record_inference_rejected() -> None:
    if not _otel_enabled:
        return
    try:
        _inference_rejected_counter.add(1, {})
    except Exception:  # noqa: BLE001
        pass


def record_consent() -> None:
    if not _otel_enabled:
        return
    try:
        _consent_counter.add(1, {})
    except Exception:  # noqa: BLE001
        pass


def record_feedback() -> None:
    if not _otel_enabled:
        return
    try:
        _feedback_counter.add(1, {})
    except Exception:  # noqa: BLE001
        pass


def record_ui_event(
    event: str,
    *,
    reason: str | None = None,
    latency_bucket: str | None = None,
) -> None:
    if not _otel_enabled:
        return
    try:
        name, attrs = parse_ui_telemetry(event, reason, latency_bucket)
        _ui_event_counter.add(1, attrs)
        step = FUNNEL_STEP_BY_EVENT.get(name)
        if step is not None and _funnel_counter is not None:
            _funnel_counter.add(1, {"step": step})
    except Exception:  # noqa: BLE001
        pass


class MetricsHttpMiddleware:
    """ASGI middleware: request count + duration (no bodies)."""

    def __init__(self, app: Any) -> None:
        self.app = app

    async def __call__(
        self, scope: dict[str, Any], receive: Callable, send: Callable
    ) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        route = http_route_label(
            scope.get("path") if isinstance(scope.get("path"), str) else None
        )
        start = time.perf_counter()
        status_code = 500

        async def send_wrapper(message: dict[str, Any]) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = int(message.get("status", 500))
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            record_http_request(
                route=route,
                status_code=status_code,
                duration_seconds=time.perf_counter() - start,
            )
