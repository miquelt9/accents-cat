#!/usr/bin/env python3
"""Evaluate a saved classifier artifact on embedding indexes."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score, log_loss, top_k_accuracy_score


LABELS = ["balearic", "central", "northern", "northwestern", "valencian"]


def load_embeddings(index_path: Path, source_file: str | None = None) -> tuple[np.ndarray, np.ndarray, pd.DataFrame]:
    df = pd.read_csv(index_path)
    if source_file is not None:
        df = df[df["source_file"] == source_file].copy()
    vectors = [np.load(path)["embedding"] for path in df["embedding_path"]]
    return np.vstack(vectors), df["label"].to_numpy(), df


def probabilities(model: Any, x: np.ndarray) -> np.ndarray:
    if not hasattr(model, "predict_proba"):
        raise ValueError("Saved model does not expose predict_proba")
    probs = model.predict_proba(x)
    row_sums = probs.sum(axis=1, keepdims=True)
    return probs / row_sums


def multiclass_brier_score(y_true: np.ndarray, probs: np.ndarray) -> float:
    label_to_index = {label: index for index, label in enumerate(LABELS)}
    one_hot = np.zeros_like(probs)
    for row, label in enumerate(y_true):
        one_hot[row, label_to_index[label]] = 1.0
    return float(np.mean(np.sum((probs - one_hot) ** 2, axis=1)))


def expected_calibration_error(y_true: np.ndarray, y_pred: np.ndarray, probs: np.ndarray, bins: int = 10) -> float:
    confidence = probs.max(axis=1)
    correct = y_true == y_pred
    ece = 0.0
    for lower in np.linspace(0.0, 1.0, bins, endpoint=False):
        upper = lower + 1.0 / bins
        mask = (confidence >= lower) & (confidence <= upper if upper >= 1.0 else confidence < upper)
        if not np.any(mask):
            continue
        ece += float(np.mean(mask)) * abs(float(np.mean(correct[mask])) - float(np.mean(confidence[mask])))
    return ece


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--eval-index", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--eval-source-file")
    args = parser.parse_args()

    args.out_dir.mkdir(parents=True, exist_ok=True)
    model = joblib.load(args.model)
    x, y, df = load_embeddings(args.eval_index, args.eval_source_file)
    y_pred = model.predict(x)
    probs = probabilities(model, x)
    payload = {
        "model": str(args.model),
        "eval_index": str(args.eval_index),
        "eval_source_file": args.eval_source_file,
        "eval_rows": int(len(df)),
        "eval_speakers": int(df["client_id"].nunique()),
        "labels": LABELS,
        "accuracy": round(float(accuracy_score(y, y_pred)), 4),
        "macro_f1": round(float(f1_score(y, y_pred, average="macro", labels=LABELS)), 4),
        "top2_accuracy": round(float(top_k_accuracy_score(y, probs, k=2, labels=LABELS)), 4),
        "log_loss": round(float(log_loss(y, probs, labels=LABELS)), 4),
        "brier_score": round(multiclass_brier_score(y, probs), 4),
        "expected_calibration_error": round(expected_calibration_error(y, y_pred, probs), 4),
        "confusion_matrix": confusion_matrix(y, y_pred, labels=LABELS).tolist(),
        "classification_report": classification_report(y, y_pred, labels=LABELS, output_dict=True, zero_division=0),
    }
    (args.out_dir / "artifact_eval.json").write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    lines = [
        "# Model Artifact Evaluation",
        "",
        f"- Model: `{payload['model']}`",
        f"- Eval rows: `{payload['eval_rows']}`",
        f"- Eval source file: `{payload['eval_source_file']}`",
        "",
        "| Accuracy | Macro F1 | Top-2 Accuracy | Log Loss | Brier | ECE |",
        "| ---: | ---: | ---: | ---: | ---: | ---: |",
        (
            f"| {payload['accuracy']:.4f} | {payload['macro_f1']:.4f} | {payload['top2_accuracy']:.4f} | "
            f"{payload['log_loss']:.4f} | {payload['brier_score']:.4f} | {payload['expected_calibration_error']:.4f} |"
        ),
        "",
        f"- Confusion matrix: `{payload['confusion_matrix']}`",
    ]
    (args.out_dir / "artifact_eval.md").write_text("\n".join(lines), encoding="utf-8")
    print(json.dumps(payload, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
