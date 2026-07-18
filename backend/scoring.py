from __future__ import annotations

from typing import Any, Sequence

import numpy as np


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


def build_result(probabilities: np.ndarray, labels: Sequence[str]) -> dict[str, Any]:
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
