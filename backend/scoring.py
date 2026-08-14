from __future__ import annotations

from typing import Any, Sequence

import numpy as np


DIALECT_LABELS = {
    "balearic": "balear",
    "central": "central",
    "northern": "septentrional",
    "northwestern": "nord-occidental",
    "valencian": "valencià",
}


def evidence_band(top_two_gap: float, confidence: float) -> str:
    if top_two_gap < 0.08 or confidence < 0.32:
        return "limited"
    if top_two_gap > 0.18 and confidence > 0.48:
        return "strong"
    return "moderate"


def confidence_summary(band: str, ambiguous: bool) -> str:
    if ambiguous:
        return "Les dues zones principals són properes, així que el mapa mostra intencionadament un patró de similitud més ampli."
    if band == "strong":
        return "El senyal del model és relativament concentrat, però encara no és una estimació exacta de l'origen."
    if band == "moderate":
        return "El model detecta una zona principal, però hi ha una incertesa significativa al voltant."
    return "La gravació aporta evidència limitada, així que la incertesa és alta."


def build_result(probabilities: np.ndarray, labels: Sequence[str]) -> dict[str, Any]:
    scores = {
        label: round(float(probabilities[index]), 4)
        for index, label in enumerate(labels)
    }
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
        "interpretation": (
            f"Aquesta gravació sona més similar a la zona del català "
            f"{DIALECT_LABELS.get(top_label, top_label)} segons el model actual."
        ),
    }
