from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time
from contextlib import asynccontextmanager
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

# Keep model-only dependencies lazy so route and health tests stay model-free.
from backend import storage
from backend.health import live_payload, ready_payload, version_payload
from backend.inference_pool import (
    InferencePool,
    InferencePoolClosed,
    InferencePoolFull,
    configure_torch_threads,
    resolve_queue_size,
    resolve_worker_count,
)
from backend.limits import SlidingWindowRateLimiter
from backend.middleware import (
    OracleHttpMiddleware,
    configure_structured_logging,
    parse_cors_origins,
)
from backend.observability import (
    MetricsHttpMiddleware,
    init_observability,
    is_ui_event_allowed,
    record_analyze,
    record_consent,
    record_feedback,
    record_inference_queue_wait,
    record_inference_rejected,
    record_ui_event,
    sentry_debug_enabled,
    set_inference_pool_metrics_provider,
    set_prompt_id_tag,
)
from backend.scoring import (
    build_result as _build_result,
    confidence_summary as _confidence_summary,
    evidence_band as _evidence_band,
)
from backend.uploads import UploadValidationError, validate_audio_upload

# Sentry (and optional OTel) must initialize before the FastAPI app is created.
init_observability()
configure_structured_logging()

logger = logging.getLogger(__name__)


PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = PROJECT_ROOT / "models/cv26-hubert-svm-calibrated"
MODEL_PATH = MODEL_DIR / "model.joblib"
METADATA_PATH = MODEL_DIR / "metadata.json"
MIN_AUDIO_SECONDS = 3.0
MAX_AUDIO_SECONDS = float(os.environ.get("ORACLE_MAX_AUDIO_SECONDS", "20"))
MAX_UPLOAD_BYTES = 20 * 1024 * 1024
MAX_NOTES_CHARS = 2000
MAX_PROMPT_TEXT_CHARS = 500
MAX_PROMPT_ID_CHARS = 64
MAX_SENTENCE_IDS = 4
MAX_FEEDBACK_ID_CHARS = 64
MAX_COMARCA_CHARS = 48
MAX_COMARQUES = 12
# Encoded multi-comarca JSON fits within this (slugs × max length + JSON overhead).
MAX_COMARQUES_STORED_CHARS = 640
COMARCA_SLUG_PATTERN = re.compile(r"^[a-z0-9-]{1,48}$")
CV26_SENTENCE_ID_PATTERN = re.compile(r"^[0-9a-f]{64}$")

# Viral-load guards (stdlib; in-process only — not multi-worker safe)
CPU_COUNT = os.cpu_count() or 1
WORKER_COUNT = resolve_worker_count(
    explicit=os.environ.get("ORACLE_WORKERS"),
    legacy=os.environ.get("ORACLE_ENCODE_CONCURRENCY"),
    cpu_count=CPU_COUNT,
)
MAX_QUEUE_SIZE = resolve_queue_size(os.environ.get("ORACLE_MAX_QUEUE_SIZE"))
ANALYZE_RATE_LIMIT = max(1, int(os.environ.get("ORACLE_ANALYZE_RATE_LIMIT", "10")))
ANALYZE_RATE_WINDOW_SECONDS = float(os.environ.get("ORACLE_ANALYZE_RATE_WINDOW", "60"))
FEEDBACK_RATE_LIMIT = max(1, int(os.environ.get("ORACLE_FEEDBACK_RATE_LIMIT", "30")))
FEEDBACK_RATE_WINDOW_SECONDS = float(
    os.environ.get("ORACLE_FEEDBACK_RATE_WINDOW", "60")
)
ENCODE_RETRY_AFTER_SECONDS = int(os.environ.get("ORACLE_ENCODE_RETRY_AFTER", "5"))
TELEMETRY_RATE_LIMIT = max(1, int(os.environ.get("ORACLE_TELEMETRY_RATE_LIMIT", "60")))
TELEMETRY_RATE_WINDOW_SECONDS = float(
    os.environ.get("ORACLE_TELEMETRY_RATE_WINDOW", "60")
)
TRUST_PROXY = os.environ.get("ORACLE_TRUST_PROXY", "").strip().lower() in {
    "1",
    "true",
    "yes",
}
# Must stay aligned with web/src/lib/legalDocs.ts LEGAL_POLICY_VERSION.
DEFAULT_POLICY_VERSION = os.environ.get(
    "ORACLE_POLICY_VERSION",
    "15 d'agost de 2026",
)
MAX_POLICY_VERSION_CHARS = 64

_inference_pool: InferencePool | None = None


@asynccontextmanager
async def lifespan(_: FastAPI):
    global _inference_pool

    import torch

    intra_threads, interop_threads = configure_torch_threads(
        workers=WORKER_COUNT,
        cpu_count=CPU_COUNT,
        torch_module=torch,
    )
    pool = InferencePool(
        workers=WORKER_COUNT,
        max_queue_size=MAX_QUEUE_SIZE,
    )
    pool.start()
    _inference_pool = pool
    set_inference_pool_metrics_provider(pool.snapshot)
    logger.info(
        "inference pool started workers=%d max_queue=%d cpu_count=%d "
        "torch_threads=%d torch_interop_threads=%d",
        WORKER_COUNT,
        MAX_QUEUE_SIZE,
        CPU_COUNT,
        intra_threads,
        interop_threads,
    )
    try:
        yield
    finally:
        logger.info("inference pool stopping")
        await pool.shutdown(cancel_queued=True)
        set_inference_pool_metrics_provider(None)
        _inference_pool = None
        logger.info("inference pool stopped")


app = FastAPI(title="Catalan Accent Oracle API", lifespan=lifespan)
# Last added = outermost. CORS → Oracle HTTP (request id / headers / access log) → metrics.
app.add_middleware(MetricsHttpMiddleware)
app.add_middleware(OracleHttpMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=parse_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)


class TelemetryEventRequest(BaseModel):
    event: str = Field(max_length=64)


class FeedbackRequest(BaseModel):
    feedbackId: str | None = Field(default=None, max_length=MAX_FEEDBACK_ID_CHARS)
    recordingId: str | None = None
    analysisSessionId: str | None = Field(default=None, max_length=64)
    wasCorrect: bool | None = None
    selfReportedDialect: str | None = None
    # Prefer ``comarques``; ``comarca`` remains for single-slug / older clients.
    comarca: str | None = Field(default=None, max_length=MAX_COMARCA_CHARS)
    comarques: list[str] | None = Field(default=None, max_length=MAX_COMARQUES)
    notes: str | None = Field(default=None, max_length=MAX_NOTES_CHARS)


class ResearchConsentRequest(BaseModel):
    recordingId: str | None = None
    analysisSessionId: str | None = Field(default=None, max_length=64)
    consent: bool
    policyVersion: str | None = Field(default=None, max_length=MAX_POLICY_VERSION_CHARS)
    ageConfirmed: bool = False


class AnalysisFinalizeRequest(BaseModel):
    analysisSessionId: str = Field(min_length=1, max_length=64)
    finalResult: dict[str, Any]
    takeCount: int = Field(ge=1, le=3)
    terminalState: str = Field(min_length=1, max_length=32)


_analyze_limiter = SlidingWindowRateLimiter(
    ANALYZE_RATE_LIMIT, ANALYZE_RATE_WINDOW_SECONDS
)
_feedback_limiter = SlidingWindowRateLimiter(
    FEEDBACK_RATE_LIMIT, FEEDBACK_RATE_WINDOW_SECONDS
)
_telemetry_limiter = SlidingWindowRateLimiter(
    TELEMETRY_RATE_LIMIT, TELEMETRY_RATE_WINDOW_SECONDS
)


def _rate_limit_key(request: Request) -> str:
    return client_ip(request) or "unknown"


def _raise_rate_limited() -> None:
    raise HTTPException(
        status_code=429,
        detail="Massa peticions. Torna-ho a provar d'aquí a uns segons.",
        headers={"Retry-After": str(ENCODE_RETRY_AFTER_SECONDS)},
    )


def _raise_saturated() -> None:
    raise HTTPException(
        status_code=503,
        detail="El servei està saturat. Torna-ho a provar d'aquí a uns segons.",
        headers={"Retry-After": str(ENCODE_RETRY_AFTER_SECONDS)},
    )


@lru_cache(maxsize=1)
def load_metadata() -> dict[str, Any]:
    return json.loads(METADATA_PATH.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def load_classifier() -> Any:
    import joblib

    return joblib.load(MODEL_PATH)


@lru_cache(maxsize=1)
def load_encoder() -> tuple[Any, Any, Any]:
    import torch
    from transformers import AutoFeatureExtractor, AutoModel

    metadata = load_metadata()
    device = torch.device("cpu")
    feature_extractor = AutoFeatureExtractor.from_pretrained(
        metadata["encoder_model_name"]
    )
    model = AutoModel.from_pretrained(metadata["encoder_model_name"])
    model.to(device)
    model.eval()
    return feature_extractor, model, device


def load_audio(path: Path, sampling_rate: int) -> np.ndarray:
    import librosa

    audio, _ = librosa.load(path, sr=sampling_rate, mono=True)
    return audio.astype(np.float32)


def pool_hidden_state(hidden: Any) -> np.ndarray:
    import torch

    hidden = hidden.squeeze(0)
    mean = hidden.mean(dim=0)
    std = hidden.std(dim=0, unbiased=False)
    pooled = torch.cat([mean, std], dim=0)
    return pooled.detach().cpu().numpy().astype(np.float32)


def extract_embedding(path: Path) -> np.ndarray:
    import torch

    feature_extractor, model, device = load_encoder()
    sampling_rate = int(getattr(feature_extractor, "sampling_rate", 16_000) or 16_000)
    audio = load_audio(path, sampling_rate)
    duration = len(audio) / sampling_rate if sampling_rate else 0
    if duration < MIN_AUDIO_SECONDS:
        min_secs = f"{MIN_AUDIO_SECONDS:.1f}".replace(".", ",")
        raise HTTPException(
            status_code=422,
            detail=f"La gravació és massa curta. Calen almenys {min_secs} segons.",
        )
    if duration > MAX_AUDIO_SECONDS:
        audio = audio[: int(MAX_AUDIO_SECONDS * sampling_rate)]
    if not np.isfinite(audio).all() or float(np.max(np.abs(audio))) < 0.005:
        raise HTTPException(
            status_code=422,
            detail="La gravació és silenciosa o massa fluixa per analitzar-la.",
        )
    inputs = feature_extractor(
        audio, sampling_rate=sampling_rate, return_tensors="pt", padding=True
    )
    inputs = {key: value.to(device) for key, value in inputs.items()}
    with torch.inference_mode():
        outputs = model(**inputs)
    return pool_hidden_state(outputs.last_hidden_state)


def evidence_band(top_two_gap: float, confidence: float) -> str:
    return _evidence_band(top_two_gap, confidence)


def confidence_summary(band: str, ambiguous: bool) -> str:
    return _confidence_summary(band, ambiguous)


def build_result(probabilities: np.ndarray) -> dict[str, Any]:
    labels = load_metadata()["labels"]
    return _build_result(probabilities, labels)


def run_inference(path: Path) -> tuple[dict[str, Any], float]:
    """Run CPU-bound embedding and classification in an inference worker."""
    inference_started = time.perf_counter()
    embedding = extract_embedding(path).reshape(1, -1)
    classifier = load_classifier()
    probabilities = classifier.predict_proba(embedding)[0]
    probabilities = probabilities / probabilities.sum()
    result = build_result(probabilities)
    return result, time.perf_counter() - inference_started


def client_ip(request: Request) -> str | None:
    """Caller IP for the in-memory rate limiters only; never persisted."""
    if TRUST_PROXY:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            first = forwarded.split(",")[0].strip()
            if first:
                return first
    if request.client is None:
        return None
    return request.client.host


@app.get("/live")
def live() -> dict[str, Any]:
    """Process is up (no dependency checks)."""
    return live_payload()


@app.get("/ready", response_model=None)
def ready() -> dict[str, Any] | JSONResponse:
    """Classifier files + metadata loadable + storage writable."""
    payload = ready_payload(model_path=MODEL_PATH, metadata_path=METADATA_PATH)
    if not payload["ok"]:
        return JSONResponse(status_code=503, content=payload)
    return payload


@app.get("/version")
def version() -> dict[str, Any]:
    return version_payload()


@app.get("/health")
def health() -> dict[str, Any]:
    """Legacy health for Better Stack — prefer /live and /ready for new probes."""
    metadata = load_metadata()
    return {
        "ok": MODEL_PATH.exists() and METADATA_PATH.exists(),
        "modelType": metadata.get("model_type"),
        "encoderModelName": metadata.get("encoder_model_name"),
        "labels": metadata.get("labels"),
    }


@app.get("/sentry-debug")
def sentry_debug() -> None:
    """Intentionally raise — enabled only outside production / with SENTRY_ENABLE_DEV."""
    if not sentry_debug_enabled():
        raise HTTPException(status_code=404, detail="Not found.")
    raise RuntimeError("Sentry debug: intentional backend exception")


@app.post("/telemetry/event", status_code=204)
def telemetry_event(request: Request, body: TelemetryEventRequest) -> None:
    """Allowlisted UI product counters for Grafana (no PII)."""
    if not _telemetry_limiter.allow(_rate_limit_key(request)):
        _raise_rate_limited()
    event = body.event.strip()
    if not is_ui_event_allowed(event):
        raise HTTPException(status_code=422, detail="event no és vàlid.")
    record_ui_event(event)
    return None


def _normalize_prompt_fields(
    prompt_id: str | None,
    prompt_text: str | None,
) -> tuple[str | None, str | None]:
    normalized_id: str | None = None
    if prompt_id is not None:
        stripped_id = prompt_id.strip()
        if not stripped_id:
            raise HTTPException(status_code=422, detail="promptId no pot ser buit.")
        if len(stripped_id) > MAX_PROMPT_ID_CHARS:
            raise HTTPException(status_code=422, detail="promptId és massa llarg.")
        normalized_id = stripped_id

    normalized_text: str | None = None
    if prompt_text is not None:
        stripped_text = prompt_text.strip()
        if not stripped_text:
            raise HTTPException(status_code=422, detail="promptText no pot ser buit.")
        if len(stripped_text) > MAX_PROMPT_TEXT_CHARS:
            raise HTTPException(status_code=422, detail="promptText és massa llarg.")
        normalized_text = stripped_text

    return normalized_id, normalized_text


def _normalize_sentence_ids(value: str | None) -> str | None:
    if value is None:
        return None
    try:
        raw_ids = json.loads(value)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=422,
            detail="sentenceIds no és un JSON vàlid.",
        ) from exc
    if not isinstance(raw_ids, list):
        raise HTTPException(
            status_code=422,
            detail="sentenceIds ha de ser una llista.",
        )
    if not raw_ids:
        raise HTTPException(status_code=422, detail="sentenceIds no pot ser buida.")
    if len(raw_ids) > MAX_SENTENCE_IDS:
        raise HTTPException(
            status_code=422,
            detail=f"sentenceIds: com a màxim {MAX_SENTENCE_IDS} identificadors.",
        )

    normalized: list[str] = []
    for sentence_id in raw_ids:
        if not isinstance(sentence_id, str):
            raise HTTPException(
                status_code=422,
                detail="sentenceIds conté un identificador no vàlid.",
            )
        normalized_id = sentence_id.strip().lower()
        if not CV26_SENTENCE_ID_PATTERN.fullmatch(normalized_id):
            raise HTTPException(
                status_code=422,
                detail="sentenceIds conté un identificador no vàlid.",
            )
        if normalized_id in normalized:
            raise HTTPException(
                status_code=422,
                detail="sentenceIds no pot contenir duplicats.",
            )
        normalized.append(normalized_id)
    return json.dumps(normalized, separators=(",", ":"))


def _normalize_analysis_session_id(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    if not stripped:
        raise HTTPException(
            status_code=422,
            detail="analysisSessionId no pot ser buit.",
        )
    if len(stripped) > 64:
        raise HTTPException(
            status_code=422,
            detail="analysisSessionId és massa llarg.",
        )
    return stripped


def _normalize_comarca(value: str | None) -> str | None:
    """Validate a self-declared comarca slug against the generated allowlist.

    Falls back to a shape check while ``backend/comarques.py`` has not been
    generated yet (see ``storage.comarca_allowlist``).
    """
    if value is None:
        return None
    slug = value.strip().lower()
    if not slug:
        return None
    allowlist = storage.comarca_allowlist()
    if not COMARCA_SLUG_PATTERN.match(slug) or (
        allowlist is not None and slug not in allowlist
    ):
        raise HTTPException(status_code=422, detail="comarca no és una comarca vàlida.")
    return slug


def _normalize_comarques(
    *,
    comarca: str | None,
    comarques: list[str] | None,
    supplied: set[str],
) -> Any:
    """Normalize singular/plural comarca fields into a stored string or UNSET."""
    if "comarques" in supplied:
        raw = comarques or []
    elif "comarca" in supplied:
        raw = [comarca] if comarca else []
    else:
        return storage.UNSET

    if len(raw) > MAX_COMARQUES:
        raise HTTPException(
            status_code=422,
            detail=f"comarques: com a màxim {MAX_COMARQUES} comarques.",
        )

    normalized: list[str] = []
    seen: set[str] = set()
    for item in raw:
        slug = _normalize_comarca(item if isinstance(item, str) else None)
        if slug is None or slug in seen:
            continue
        seen.add(slug)
        normalized.append(slug)

    encoded = storage.encode_comarques(normalized)
    if encoded is not None and len(encoded) > MAX_COMARQUES_STORED_CHARS:
        raise HTTPException(status_code=422, detail="comarques massa llarg.")
    return encoded


@app.post("/analyze")
async def analyze(
    request: Request,
    audio: UploadFile = File(...),
    promptId: str | None = Form(default=None),
    promptText: str | None = Form(default=None),
    sentenceIds: str | None = Form(default=None),
    analysisSessionId: str | None = Form(default=None),
) -> dict[str, Any]:
    request_started = time.perf_counter()
    if not _analyze_limiter.allow(_rate_limit_key(request)):
        _raise_rate_limited()

    storage.purge_expired_pending()
    prompt_id, prompt_text = _normalize_prompt_fields(promptId, promptText)
    sentence_ids = _normalize_sentence_ids(sentenceIds)
    requested_session_id = _normalize_analysis_session_id(analysisSessionId)
    analysis_session_id = requested_session_id or storage.create_analysis_session()
    if requested_session_id and not storage.analysis_session_accepts_take(
        analysis_session_id
    ):
        raise HTTPException(
            status_code=409,
            detail="La sessió d'anàlisi ja no accepta més gravacions.",
        )
    try:
        take_index = storage.next_take_index(analysis_session_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=409,
            detail="La sessió d'anàlisi ja no accepta més gravacions.",
        ) from exc
    if take_index > 3:
        raise HTTPException(
            status_code=409,
            detail="Aquesta anàlisi ja ha assolit el màxim de tres gravacions.",
        )
    take_role = ("initial", "validation", "refine")[take_index - 1]
    set_prompt_id_tag(prompt_id)

    try:
        # Filename / MIME are validated but never logged or sent to vendors.
        suffix = validate_audio_upload(
            filename=audio.filename,
            content_type=audio.content_type,
            content_length_header=request.headers.get("content-length"),
            max_bytes=MAX_UPLOAD_BYTES,
        )
    except UploadValidationError as exc:
        record_analyze("failure")
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc

    # Read one byte past the cap so chunked uploads cannot grow an unbounded
    # in-memory payload before the size check below.
    payload = await audio.read(MAX_UPLOAD_BYTES + 1)
    if not payload:
        record_analyze("failure")
        raise HTTPException(status_code=400, detail="No s'ha enviat cap àudio.")
    if len(payload) > MAX_UPLOAD_BYTES:
        record_analyze("failure")
        raise HTTPException(status_code=413, detail="L'àudio enviat és massa gran.")

    recording_id: str | None = None
    audio_path: Path | None = None
    job = None
    try:
        recording_id, audio_path = storage.save_audio(payload, suffix)

        try:
            if _inference_pool is None:
                raise InferencePoolClosed("Inference pool has not started.")
            job = _inference_pool.submit(run_inference, audio_path)
            execution = await job.result()
            result, inference_seconds = execution.value
            record_inference_queue_wait(execution.queue_wait_seconds)
        except InferencePoolFull:
            if audio_path is not None:
                audio_path.unlink(missing_ok=True)
            record_analyze("rejected")
            record_inference_rejected()
            logger.info(
                "analyze rejected queue_full queue_depth=%d active_workers=%d "
                "queue_wait_avg_s=%.3f total_s=%.3f",
                _inference_pool.queue_depth if _inference_pool else 0,
                _inference_pool.active_workers if _inference_pool else 0,
                _inference_pool.average_queue_wait_seconds if _inference_pool else 0.0,
                time.perf_counter() - request_started,
            )
            _raise_saturated()
        except InferencePoolClosed:
            if audio_path is not None:
                audio_path.unlink(missing_ok=True)
            record_analyze("rejected")
            record_inference_rejected()
            _raise_saturated()
        except asyncio.CancelledError:
            if audio_path is not None and job is not None:
                job.add_done_callback(lambda _job: audio_path.unlink(missing_ok=True))
                if not job.started:
                    audio_path.unlink(missing_ok=True)
            record_analyze("cancelled")
            raise
        except HTTPException:
            if audio_path is not None:
                audio_path.unlink(missing_ok=True)
            record_analyze("failure")
            logger.info("analyze rejected (client/audio validation)")
            raise
        except Exception:
            if audio_path is not None:
                audio_path.unlink(missing_ok=True)
            record_analyze("failure")
            # Avoid traceback locals: audio paths contain the recording UUID.
            logger.error("analyze failed during inference")
            raise

        # Pending only: durable research storage requires POST /research-consent.
        storage.insert_submission(
            submission_id=recording_id,
            audio_path=audio_path,
            scores=result["scores"],
            top_label=result["topLabel"],
            evidence_band=result["evidenceBand"],
            prompt_id=prompt_id,
            prompt_text=prompt_text,
            sentence_ids=sentence_ids,
            analysis_session_id=analysis_session_id,
            take_index=take_index,
            take_role=take_role,
        )
        result["recordingId"] = recording_id
        result["analysisSessionId"] = analysis_session_id
        result["takeIndex"] = take_index
        record_analyze("success", inference_seconds)
        logger.info(
            "analyze ok top=%s band=%s queue_depth=%d active_workers=%d "
            "queue_wait_s=%.3f queue_wait_avg_s=%.3f inference_s=%.3f total_s=%.3f",
            result.get("topLabel"),
            result.get("evidenceBand"),
            _inference_pool.queue_depth if _inference_pool else 0,
            _inference_pool.active_workers if _inference_pool else 0,
            execution.queue_wait_seconds,
            _inference_pool.average_queue_wait_seconds if _inference_pool else 0.0,
            inference_seconds,
            time.perf_counter() - request_started,
        )
        return result
    except Exception:
        if audio_path is not None:
            audio_path.unlink(missing_ok=True)
        raise


@app.post("/research-consent")
def submit_research_consent(
    request: Request,
    body: ResearchConsentRequest,
) -> dict[str, Any]:
    if not _feedback_limiter.allow(_rate_limit_key(request)):
        _raise_rate_limited()

    analysis_session_id = _normalize_analysis_session_id(body.analysisSessionId)
    recording_id = body.recordingId.strip() if body.recordingId else None
    if not analysis_session_id and not recording_id:
        raise HTTPException(
            status_code=422,
            detail="analysisSessionId o recordingId és obligatori.",
        )

    if body.consent:
        if not body.ageConfirmed:
            raise HTTPException(
                status_code=422,
                detail="Cal confirmar que tens 18 anys o més per desar la gravació.",
            )
        policy_version = (body.policyVersion or DEFAULT_POLICY_VERSION).strip()
        if not policy_version or len(policy_version) > MAX_POLICY_VERSION_CHARS:
            raise HTTPException(status_code=422, detail="policyVersion no és vàlid.")
        confirmed = (
            storage.confirm_research_consent_for_session(
                analysis_session_id,
                policy_version=policy_version,
            )
            if analysis_session_id
            else storage.confirm_research_consent(
                recording_id or "",
                policy_version=policy_version,
            )
        )
        if not confirmed:
            raise HTTPException(
                status_code=404,
                detail=(
                    "No s'ha trobat una gravació pendent, o el termini per acceptar "
                    "ha caducat."
                ),
            )
        record_consent()
        logger.info("research consent confirmed")
        return {
            "analysisSessionId": analysis_session_id,
            "recordingId": recording_id,
            "researchConsent": True,
        }

    declined = (
        storage.decline_research_consent_for_session(analysis_session_id)
        if analysis_session_id
        else storage.decline_research_consent(recording_id or "")
    )
    if not declined:
        raise HTTPException(
            status_code=404,
            detail="No s'ha trobat aquesta sessió o gravació.",
        )
    record_consent()
    logger.info("research consent declined")
    return {
        "analysisSessionId": analysis_session_id,
        "recordingId": recording_id,
        "researchConsent": False,
    }


@app.post("/analysis-finalize")
def finalize_analysis(
    request: Request,
    body: AnalysisFinalizeRequest,
) -> dict[str, Any]:
    if not _feedback_limiter.allow(_rate_limit_key(request)):
        _raise_rate_limited()

    analysis_session_id = _normalize_analysis_session_id(body.analysisSessionId)
    if not analysis_session_id or not storage.finalize_analysis_session(
        analysis_session_id,
        final_result=body.finalResult,
        take_count=body.takeCount,
        terminal_state=body.terminalState,
    ):
        raise HTTPException(
            status_code=404,
            detail="No s'ha trobat una sessió d'anàlisi activa.",
        )
    return {
        "analysisSessionId": analysis_session_id,
        "finalized": True,
    }


@app.post("/feedback")
def submit_feedback(request: Request, body: FeedbackRequest) -> dict[str, str]:
    if not _feedback_limiter.allow(_rate_limit_key(request)):
        _raise_rate_limited()

    dialect = body.selfReportedDialect
    if dialect is not None and dialect not in storage.SELF_REPORTED_DIALECTS:
        raise HTTPException(
            status_code=422,
            detail=(
                "selfReportedDialect must be one of: "
                + ", ".join(storage.SELF_REPORTED_DIALECTS)
            ),
        )

    # The funnel posts one answer at a time, so only overwrite what was sent.
    supplied = body.model_fields_set
    comarca = _normalize_comarques(
        comarca=body.comarca,
        comarques=body.comarques,
        supplied=supplied,
    )

    def sent(field: str, value: Any) -> Any:
        return value if field in supplied else storage.UNSET

    feedback_id = storage.upsert_feedback(
        feedback_id=(body.feedbackId or "").strip() or None,
        recording_id=body.recordingId,
        analysis_session_id=_normalize_analysis_session_id(body.analysisSessionId),
        was_correct=sent("wasCorrect", body.wasCorrect),
        self_reported_dialect=sent("selfReportedDialect", dialect),
        comarca=comarca,
        notes=sent("notes", body.notes),
    )
    record_feedback()
    logger.info("feedback upserted")
    return {"feedbackId": feedback_id}
