from __future__ import annotations

import asyncio
import json
import os
import tempfile
from functools import lru_cache
from pathlib import Path
from typing import Any

import joblib
import librosa
import numpy as np
import torch
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from transformers import AutoFeatureExtractor, AutoModel

from backend import storage
from backend.limits import SlidingWindowRateLimiter
from backend.scoring import (
    build_result as _build_result,
    confidence_summary as _confidence_summary,
    evidence_band as _evidence_band,
)


PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = PROJECT_ROOT / "models/cv26-hubert-svm-calibrated"
MODEL_PATH = MODEL_DIR / "model.joblib"
METADATA_PATH = MODEL_DIR / "metadata.json"
MIN_AUDIO_SECONDS = 1.5
MAX_AUDIO_SECONDS = float(os.environ.get("ORACLE_MAX_AUDIO_SECONDS", "25"))
MAX_UPLOAD_BYTES = 20 * 1024 * 1024
MAX_NOTES_CHARS = 2000

# Viral-load guards (stdlib; in-process only — not multi-worker safe)
ENCODE_CONCURRENCY = max(1, int(os.environ.get("ORACLE_ENCODE_CONCURRENCY", "1")))
ANALYZE_RATE_LIMIT = max(1, int(os.environ.get("ORACLE_ANALYZE_RATE_LIMIT", "10")))
ANALYZE_RATE_WINDOW_SECONDS = float(os.environ.get("ORACLE_ANALYZE_RATE_WINDOW", "60"))
FEEDBACK_RATE_LIMIT = max(1, int(os.environ.get("ORACLE_FEEDBACK_RATE_LIMIT", "30")))
FEEDBACK_RATE_WINDOW_SECONDS = float(os.environ.get("ORACLE_FEEDBACK_RATE_WINDOW", "60"))
ENCODE_RETRY_AFTER_SECONDS = int(os.environ.get("ORACLE_ENCODE_RETRY_AFTER", "5"))

app = FastAPI(title="Catalan Accent Oracle API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class FeedbackRequest(BaseModel):
    recordingId: str | None = None
    wasCorrect: bool | None = None
    selfReportedDialect: str | None = None
    notes: str | None = Field(default=None, max_length=MAX_NOTES_CHARS)


_analyze_limiter = SlidingWindowRateLimiter(ANALYZE_RATE_LIMIT, ANALYZE_RATE_WINDOW_SECONDS)
_feedback_limiter = SlidingWindowRateLimiter(FEEDBACK_RATE_LIMIT, FEEDBACK_RATE_WINDOW_SECONDS)

_encode_inflight = 0
_encode_lock = asyncio.Lock()


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
    return joblib.load(MODEL_PATH)


@lru_cache(maxsize=1)
def load_encoder() -> tuple[Any, torch.nn.Module, torch.device]:
    metadata = load_metadata()
    device = torch.device("cpu")
    feature_extractor = AutoFeatureExtractor.from_pretrained(metadata["encoder_model_name"])
    model = AutoModel.from_pretrained(metadata["encoder_model_name"])
    model.to(device)
    model.eval()
    return feature_extractor, model, device


def load_audio(path: Path, sampling_rate: int) -> np.ndarray:
    audio, _ = librosa.load(path, sr=sampling_rate, mono=True)
    return audio.astype(np.float32)


def pool_hidden_state(hidden: torch.Tensor) -> np.ndarray:
    hidden = hidden.squeeze(0)
    mean = hidden.mean(dim=0)
    std = hidden.std(dim=0, unbiased=False)
    pooled = torch.cat([mean, std], dim=0)
    return pooled.detach().cpu().numpy().astype(np.float32)


def extract_embedding(path: Path) -> np.ndarray:
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
        max_secs = f"{MAX_AUDIO_SECONDS:.0f}"
        raise HTTPException(
            status_code=422,
            detail=f"La gravació és massa llarga. El màxim és de {max_secs} segons.",
        )
    if not np.isfinite(audio).all() or float(np.max(np.abs(audio))) < 0.005:
        raise HTTPException(
            status_code=422,
            detail="La gravació és silenciosa o massa fluixa per analitzar-la.",
        )
    inputs = feature_extractor(audio, sampling_rate=sampling_rate, return_tensors="pt", padding=True)
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


def client_ip(request: Request) -> str | None:
    if request.client is None:
        return None
    return request.client.host


def client_user_agent(request: Request) -> str | None:
    return request.headers.get("user-agent")


@app.get("/health")
def health() -> dict[str, Any]:
    metadata = load_metadata()
    return {
        "ok": MODEL_PATH.exists() and METADATA_PATH.exists(),
        "modelType": metadata.get("model_type"),
        "encoderModelName": metadata.get("encoder_model_name"),
        "labels": metadata.get("labels"),
    }


@app.get("/client-info")
def get_client_info(request: Request) -> dict[str, str | None]:
    return {
        "ip": client_ip(request),
        "userAgent": client_user_agent(request),
    }


@app.post("/analyze")
async def analyze(
    request: Request,
    audio: UploadFile = File(...),
    persist: str | None = Form(default=None),
) -> dict[str, Any]:
    if not _analyze_limiter.allow(_rate_limit_key(request)):
        _raise_rate_limited()

    payload = await audio.read()
    if not payload:
        raise HTTPException(status_code=400, detail="No s'ha enviat cap àudio.")
    if len(payload) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="L'àudio enviat és massa gran.")

    should_persist = persist == "1"
    suffix = Path(audio.filename or "recording.webm").suffix or ".webm"

    global _encode_inflight
    acquired = False
    async with _encode_lock:
        if _encode_inflight >= ENCODE_CONCURRENCY:
            _raise_saturated()
        _encode_inflight += 1
        acquired = True

    recording_id: str | None = None
    audio_path: Path | None = None
    try:
        if should_persist:
            recording_id, audio_path = storage.save_audio(payload, suffix)
        else:
            tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
            try:
                tmp.write(payload)
            finally:
                tmp.close()
            audio_path = Path(tmp.name)

        try:
            embedding = (await asyncio.to_thread(extract_embedding, audio_path)).reshape(1, -1)
            classifier = load_classifier()
            probabilities = classifier.predict_proba(embedding)[0]
            probabilities = probabilities / probabilities.sum()
            result = build_result(probabilities)
        except HTTPException:
            if should_persist and audio_path is not None:
                audio_path.unlink(missing_ok=True)
            raise
        except Exception:
            if should_persist and audio_path is not None:
                audio_path.unlink(missing_ok=True)
            raise

        if should_persist and recording_id is not None and audio_path is not None:
            storage.insert_submission(
                submission_id=recording_id,
                ip=client_ip(request),
                user_agent=client_user_agent(request),
                audio_path=audio_path,
                scores=result["scores"],
                top_label=result["topLabel"],
                evidence_band=result["evidenceBand"],
            )
            result["recordingId"] = recording_id
        return result
    finally:
        if acquired:
            async with _encode_lock:
                _encode_inflight -= 1
        if not should_persist and audio_path is not None:
            audio_path.unlink(missing_ok=True)


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

    feedback_id = storage.insert_feedback(
        recording_id=body.recordingId,
        was_correct=body.wasCorrect,
        self_reported_dialect=dialect,
        notes=body.notes,
    )
    return {"feedbackId": feedback_id}
