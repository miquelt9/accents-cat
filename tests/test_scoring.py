from __future__ import annotations

import numpy as np
import pytest

from backend.scoring import build_result, confidence_summary, evidence_band

LABELS = ("balearic", "central", "northern", "northwestern", "valencian")


@pytest.mark.parametrize(
    "gap,confidence,expected",
    [
        (0.079, 0.50, "limited"),
        (0.08, 0.31, "limited"),
        (0.08, 0.32, "moderate"),
        (0.10, 0.40, "moderate"),
        (0.181, 0.49, "strong"),
        (0.181, 0.48, "moderate"),
        (0.18, 0.49, "moderate"),
    ],
)
def test_evidence_band_boundaries(gap: float, confidence: float, expected: str) -> None:
    assert evidence_band(gap, confidence) == expected


def test_confidence_summary_variants() -> None:
    assert "broader similarity" in confidence_summary("limited", True)
    assert "concentrated" in confidence_summary("strong", False)
    assert "uncertainty" in confidence_summary("moderate", False)
    assert "limited evidence" in confidence_summary("limited", False)


def test_build_result_ranking_and_ambiguity() -> None:
    # central leads; balearic close → ambiguous / limited
    probs = np.array([0.22, 0.28, 0.18, 0.16, 0.16], dtype=np.float64)
    result = build_result(probs, LABELS)
    assert result["topLabel"] == "central"
    assert result["runnerUpLabel"] == "balearic"
    assert result["topTwoGap"] == pytest.approx(0.06, abs=1e-4)
    assert result["isAmbiguousTopTwo"] is True
    assert result["evidenceBand"] == "limited"
    assert set(result["scores"]) == set(LABELS)
    assert result["scores"]["central"] == pytest.approx(0.28, abs=1e-4)


def test_build_result_strong_non_ambiguous() -> None:
    probs = np.array([0.05, 0.10, 0.05, 0.10, 0.70], dtype=np.float64)
    result = build_result(probs, LABELS)
    assert result["topLabel"] == "valencian"
    assert result["runnerUpLabel"] in {"central", "northwestern"}
    assert result["topTwoGap"] == pytest.approx(0.60, abs=1e-4)
    assert result["isAmbiguousTopTwo"] is False
    assert result["evidenceBand"] == "strong"
    assert "Valencian" in result["interpretation"]
