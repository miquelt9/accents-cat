from __future__ import annotations

import json
import tempfile
from functools import lru_cache
from pathlib import Path
from typing import Any

import joblib
import librosa
import numpy as np
import torch
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from transformers import AutoFeatureExtractor, AutoModel


PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = PROJECT_ROOT / "models/cv26-hubert-svm-calibrated"
MODEL_PATH = MODEL_DIR / "model.joblib"
METADATA_PATH = MODEL_DIR / "metadata.json"
MIN_AUDIO_SECONDS = 1.5
MAX_UPLOAD_BYTES = 20 * 1024 * 1024

app = FastAPI(title="Catalan Accent Oracle API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
        raise HTTPException(
            status_code=422,
            detail=f"Recording is too short. Please provide at least {MIN_AUDIO_SECONDS:.1f} seconds.",
        )
    if not np.isfinite(audio).all() or float(np.max(np.abs(audio))) < 0.005:
        raise HTTPException(status_code=422, detail="Recording is silent or too quiet to analyze.")
    inputs = feature_extractor(audio, sampling_rate=sampling_rate, return_tensors="pt", padding=True)
    inputs = {key: value.to(device) for key, value in inputs.items()}
    with torch.inference_mode():
        outputs = model(**inputs)
    return pool_hidden_state(outputs.last_hidden_state)


def evidence_band(top_two_gap: float, confidence: float) -> str:
    if top_two_gap < 0.08 or confidence < 0.32:
        return "limited"
    if top_two_gap > 0.18 and confidence > 0.48:
        return "strong"
    return "moderate"


def confidence_summary(band: str, ambiguous: bool) -> str:
    if ambiguous:
        return "Top two areas are close, so the map intentionally shows a broader similarity pattern."
    if band == "strong":
        return "The model signal is relatively concentrated, but still not an exact origin estimate."
    if band == "moderate":
        return "The model has a leading area with meaningful uncertainty around it."
    return "The recording offers limited evidence, so uncertainty is high."


def build_result(probabilities: np.ndarray) -> dict[str, Any]:
    metadata = load_metadata()
    labels = metadata["labels"]
    scores = {label: round(float(probabilities[index]), 4) for index, label in enumerate(labels)}
    ranked = sorted(labels, key=lambda label: scores[label], reverse=True)
    top_label = ranked[0]
    runner_up = ranked[1]
    gap = round(scores[top_label] - scores[runner_up], 4)
    ambiguous = gap < 0.08
    band = evidence_band(gap, scores[top_label])
    return {
        "scores": scores,
        "topLabel": top_label,
        "runnerUpLabel": runner_up,
        "topTwoGap": gap,
        "isAmbiguousTopTwo": ambiguous,
        "evidenceBand": band,
        "confidenceSummary": confidence_summary(band, ambiguous),
        "interpretation": f"This recording sounds most similar to {top_label.title()} Catalan areas in the current model.",
    }


@app.get("/health")
def health() -> dict[str, Any]:
    metadata = load_metadata()
    return {
        "ok": MODEL_PATH.exists() and METADATA_PATH.exists(),
        "modelType": metadata.get("model_type"),
        "encoderModelName": metadata.get("encoder_model_name"),
        "labels": metadata.get("labels"),
    }


@app.post("/analyze")
async def analyze(audio: UploadFile = File(...)) -> dict[str, Any]:
    payload = await audio.read()
    if not payload:
        raise HTTPException(status_code=400, detail="No audio uploaded.")
    if len(payload) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Audio upload is too large.")

    suffix = Path(audio.filename or "recording.webm").suffix or ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=True) as temp:
        temp.write(payload)
        temp.flush()
        embedding = extract_embedding(Path(temp.name)).reshape(1, -1)
    classifier = load_classifier()
    probabilities = classifier.predict_proba(embedding)[0]
    probabilities = probabilities / probabilities.sum()
    return build_result(probabilities)
