#!/usr/bin/env python3
"""Compare first-take, repeated-take, and adaptive validation policies.

The input is JSONL with one speaker-grouped record per line::

    {
      "speaker_id": "speaker-1",
      "label": "central",
      "takes": [
        {"balearic": 0.1, "central": 0.5, "northern": 0.1,
         "northwestern": 0.1, "valencian": 0.2},
        {"balearic": 0.1, "central": 0.4, "northern": 0.2,
         "northwestern": 0.1, "valencian": 0.2}
      ]
    }

Each speaker must be represented by one line so repeated takes cannot leak
between train and evaluation partitions. The script evaluates policies using
the same thresholds and geography guard as the web validation flow.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import numpy as np

LABELS = ("balearic", "central", "northern", "northwestern", "valencian")
SKIP_MIN_TOP_SCORE = 0.5
SKIP_MIN_GAP = 0.15
INCOHERENT_MIN_RUNNER_UP = 0.2
ADJACENT_PAIRS = {
    frozenset(pair)
    for pair in (
        ("central", "northern"),
        ("central", "northwestern"),
        ("central", "valencian"),
        ("northern", "northwestern"),
        ("northwestern", "valencian"),
    )
}


def are_coherent(first: str, second: str) -> bool:
    return first == second or frozenset((first, second)) in ADJACENT_PAIRS


def ranked(scores: dict[str, float]) -> tuple[str, str, float]:
    labels = sorted(LABELS, key=lambda label: scores[label], reverse=True)
    return labels[0], labels[1], scores[labels[0]] - scores[labels[1]]


def evidence_band(scores: dict[str, float]) -> str:
    top, runner_up, gap = ranked(scores)
    del runner_up
    if gap < 0.08 or scores[top] < 0.32:
        return "limited"
    if gap > 0.18 and scores[top] > 0.48:
        return "strong"
    return "moderate"


def needs_validation(scores: dict[str, float]) -> bool:
    top, runner_up, gap = ranked(scores)
    if not (scores[top] >= SKIP_MIN_TOP_SCORE and gap >= SKIP_MIN_GAP):
        return True
    return not are_coherent(top, runner_up) and scores[runner_up] >= INCOHERENT_MIN_RUNNER_UP


def normalize(scores: dict[str, float]) -> dict[str, float]:
    total = sum(scores.values())
    if total <= 0:
        raise ValueError("Scores must have a positive sum.")
    return {label: scores[label] / total for label in LABELS}


def merge(first: dict[str, float], second: dict[str, float]) -> dict[str, float]:
    first = normalize(first)
    second = normalize(second)
    first_top, _, _ = ranked(first)
    second_top, _, _ = ranked(second)
    if first_top == second_top:
        first_band = evidence_band(first)
        second_band = evidence_band(second)
        rank = {"limited": 0, "moderate": 1, "strong": 2}
        first_gap = ranked(first)[2]
        second_gap = ranked(second)[2]
        if rank[second_band] > rank[first_band] or (
            second_band == first_band and second_gap > first_gap
        ):
            return second
        return first
    return normalize({label: first[label] + second[label] for label in LABELS})


def adaptive_result(takes: list[dict[str, float]]) -> tuple[dict[str, float], int]:
    result = normalize(takes[0])
    used = 1
    if len(takes) > 1 and needs_validation(result):
        result = merge(result, takes[1])
        used = 2
    if len(takes) > 2 and needs_validation(result):
        result = merge(result, takes[2])
        used = 3
    return result, used


def average_result(takes: list[dict[str, float]], count: int) -> dict[str, float]:
    selected = [normalize(take) for take in takes[:count]]
    return normalize(
        {label: sum(take[label] for take in selected) for label in LABELS}
    )


def load_records(path: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    seen_speakers: set[str] = set()
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            record = json.loads(line)
        except json.JSONDecodeError as exc:
            raise ValueError(f"{path}:{line_number}: invalid JSON") from exc
        if not isinstance(record, dict):
            raise ValueError(f"{path}:{line_number}: expected a JSON object")
        speaker_id = record.get("speaker_id")
        normalized_speaker_id = speaker_id.strip() if isinstance(speaker_id, str) else ""
        label = record.get("label")
        takes = record.get("takes")
        if (
            not normalized_speaker_id
            or normalized_speaker_id in seen_speakers
            or label not in LABELS
            or not isinstance(takes, list)
            or not takes
        ):
            raise ValueError(
                f"{path}:{line_number}: expected one unique speaker_id, label, "
                "and non-empty takes"
            )
        seen_speakers.add(normalized_speaker_id)
        parsed_takes: list[dict[str, float]] = []
        for take in takes[:3]:
            if not isinstance(take, dict) or set(take) != set(LABELS):
                raise ValueError(f"{path}:{line_number}: every take needs all five labels")
            parsed_takes.append({key: float(take[key]) for key in LABELS})
        records.append(
            {"speaker_id": normalized_speaker_id, "label": label, "takes": parsed_takes}
        )
    if not records:
        raise ValueError("Input contains no speaker records.")
    return records


def multiclass_brier(labels: list[str], probabilities: list[dict[str, float]]) -> float:
    index = {label: position for position, label in enumerate(LABELS)}
    values = []
    for label, scores in zip(labels, probabilities):
        one_hot = np.zeros(len(LABELS))
        one_hot[index[label]] = 1.0
        values.append(np.sum((np.array([scores[item] for item in LABELS]) - one_hot) ** 2))
    return float(np.mean(values))


def expected_calibration_error(labels: list[str], probabilities: list[dict[str, float]]) -> float:
    correct = []
    confidence = []
    for label, scores in zip(labels, probabilities):
        top, _, _ = ranked(scores)
        correct.append(top == label)
        confidence.append(scores[top])
    correct_array = np.array(correct, dtype=float)
    confidence_array = np.array(confidence)
    error = 0.0
    for lower in np.linspace(0.0, 1.0, 10, endpoint=False):
        upper = lower + 0.1
        mask = (confidence_array >= lower) & (
            confidence_array <= upper if upper >= 1.0 else confidence_array < upper
        )
        if mask.any():
            error += float(mask.mean()) * abs(
                float(correct_array[mask].mean()) - float(confidence_array[mask].mean())
            )
    return error


def evaluate(
    labels: list[str],
    probabilities: list[dict[str, float]],
    take_counts: list[int],
) -> dict[str, float]:
    predictions = [ranked(scores)[0] for scores in probabilities]
    accuracy = np.mean(np.array(predictions) == np.array(labels))
    recalls: list[float] = []
    f1_values: list[float] = []
    for label in LABELS:
        true_positive = sum(
            prediction == label and target == label
            for prediction, target in zip(predictions, labels)
        )
        actual = sum(target == label for target in labels)
        predicted = sum(prediction == label for prediction in predictions)
        recall = true_positive / actual if actual else 0.0
        precision = true_positive / predicted if predicted else 0.0
        recalls.append(recall)
        f1_values.append(
            2 * precision * recall / (precision + recall)
            if precision + recall
            else 0.0
        )
    log_loss_value = -float(
        np.mean(
            [
                np.log(max(scores[label], 1e-15))
                for label, scores in zip(labels, probabilities)
            ]
        )
    )
    return {
        "accuracy": round(float(accuracy), 4),
        "balanced_accuracy": round(float(np.mean(recalls)), 4),
        "macro_f1": round(float(np.mean(f1_values)), 4),
        "log_loss": round(log_loss_value, 4),
        "brier_score": round(multiclass_brier(labels, probabilities), 4),
        "expected_calibration_error": round(expected_calibration_error(labels, probabilities), 4),
        "average_takes": round(float(np.mean(take_counts)), 4),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True, help="Speaker-grouped JSONL input")
    parser.add_argument("--output", type=Path, required=True, help="JSON output path")
    args = parser.parse_args()

    records = load_records(args.input)
    labels = [record["label"] for record in records]
    first = [normalize(record["takes"][0]) for record in records]
    two_take = [average_result(record["takes"], 2) for record in records]
    three_take = [average_result(record["takes"], 3) for record in records]
    adaptive_pairs = [adaptive_result(record["takes"]) for record in records]
    adaptive = [pair[0] for pair in adaptive_pairs]
    adaptive_counts = [pair[1] for pair in adaptive_pairs]

    policies = {
        "first_take": evaluate(labels, first, [1] * len(records)),
        "average_two_takes": evaluate(labels, two_take, [min(2, len(record["takes"])) for record in records]),
        "average_three_takes": evaluate(
            labels,
            three_take,
            [min(3, len(record["takes"])) for record in records],
        ),
        "adaptive_current_policy": evaluate(labels, adaptive, adaptive_counts),
    }
    payload = {
        "records": len(records),
        "labels": LABELS,
        "policies": policies,
        "note": "Each JSONL record must contain all repeated takes for one speaker.",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(payload, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
