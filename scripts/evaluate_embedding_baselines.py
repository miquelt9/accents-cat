#!/usr/bin/env python3
"""Train embedding baselines on one split and evaluate on held-out embeddings."""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.dummy import DummyClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    log_loss,
    top_k_accuracy_score,
)
from sklearn.neighbors import NearestCentroid
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import LinearSVC


LABELS = ["balearic", "central", "northern", "northwestern", "valencian"]


@dataclass
class EvalResult:
    model: str
    accuracy: float
    macro_f1: float
    top2_accuracy: float | None
    log_loss: float | None
    brier_score: float | None
    expected_calibration_error: float | None
    confusion_matrix: list[list[int]]
    classification_report: dict[str, Any]


def load_embeddings(index_path: Path, source_file: str | None = None) -> tuple[np.ndarray, np.ndarray, pd.DataFrame]:
    df = pd.read_csv(index_path)
    if source_file is not None:
        df = df[df["source_file"] == source_file].copy()
    vectors = [np.load(path)["embedding"] for path in df["embedding_path"]]
    return np.vstack(vectors), df["label"].to_numpy(), df


def probabilities_or_scores(model: Any, x: np.ndarray) -> np.ndarray | None:
    if hasattr(model, "predict_proba"):
        return model.predict_proba(x)
    if hasattr(model, "decision_function"):
        scores = model.decision_function(x)
        if scores.ndim == 1:
            scores = np.column_stack([-scores, scores])
        return scores
    return None


def normalize_scores(scores: np.ndarray) -> np.ndarray:
    row_sums = scores.sum(axis=1, keepdims=True)
    if np.all(scores >= 0) and np.all(row_sums > 0):
        return scores / row_sums
    shifted = scores - scores.max(axis=1, keepdims=True)
    exp_scores = np.exp(shifted)
    return exp_scores / exp_scores.sum(axis=1, keepdims=True)


def multiclass_brier_score(y_true: np.ndarray, probabilities: np.ndarray) -> float:
    label_to_index = {label: index for index, label in enumerate(LABELS)}
    one_hot = np.zeros_like(probabilities)
    for row, label in enumerate(y_true):
        one_hot[row, label_to_index[label]] = 1.0
    return float(np.mean(np.sum((probabilities - one_hot) ** 2, axis=1)))


def expected_calibration_error(y_true: np.ndarray, y_pred: np.ndarray, probabilities: np.ndarray, bins: int = 10) -> float:
    confidence = probabilities.max(axis=1)
    correct = y_true == y_pred
    ece = 0.0
    for lower in np.linspace(0.0, 1.0, bins, endpoint=False):
        upper = lower + 1.0 / bins
        if upper >= 1.0:
            mask = (confidence >= lower) & (confidence <= upper)
        else:
            mask = (confidence >= lower) & (confidence < upper)
        if not np.any(mask):
            continue
        bin_accuracy = float(np.mean(correct[mask]))
        bin_confidence = float(np.mean(confidence[mask]))
        ece += float(np.mean(mask)) * abs(bin_accuracy - bin_confidence)
    return ece


def calibration_metrics(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    scores: np.ndarray | None,
) -> tuple[float | None, float | None, float | None]:
    if scores is None:
        return None, None, None
    probabilities = normalize_scores(scores)
    try:
        loss = float(log_loss(y_true, probabilities, labels=LABELS))
    except Exception:
        loss = None
    return (
        round(loss, 4) if loss is not None else None,
        round(multiclass_brier_score(y_true, probabilities), 4),
        round(expected_calibration_error(y_true, y_pred, probabilities), 4),
    )


def evaluate(model_name: str, y_true: np.ndarray, y_pred: np.ndarray, scores: np.ndarray | None) -> EvalResult:
    top2 = None
    if scores is not None:
        try:
            top2 = float(top_k_accuracy_score(y_true, scores, k=2, labels=LABELS))
        except Exception:
            top2 = None
    loss, brier, ece = calibration_metrics(y_true, y_pred, scores)
    return EvalResult(
        model=model_name,
        accuracy=round(float(accuracy_score(y_true, y_pred)), 4),
        macro_f1=round(float(f1_score(y_true, y_pred, average="macro", labels=LABELS)), 4),
        top2_accuracy=round(top2, 4) if top2 is not None else None,
        log_loss=loss,
        brier_score=brier,
        expected_calibration_error=ece,
        confusion_matrix=confusion_matrix(y_true, y_pred, labels=LABELS).tolist(),
        classification_report=classification_report(
            y_true,
            y_pred,
            labels=LABELS,
            output_dict=True,
            zero_division=0,
        ),
    )


def models() -> list[tuple[str, Any]]:
    return [
        ("majority_dummy", DummyClassifier(strategy="most_frequent")),
        (
            "logistic_regression",
            make_pipeline(
                StandardScaler(),
                LogisticRegression(max_iter=5000, class_weight="balanced", random_state=13),
            ),
        ),
        (
            "linear_svm_calibrated",
            make_pipeline(
                StandardScaler(),
                CalibratedClassifierCV(LinearSVC(class_weight="balanced", random_state=13), cv=3),
            ),
        ),
        ("nearest_centroid", make_pipeline(StandardScaler(), NearestCentroid())),
    ]


def write_markdown(payload: dict[str, Any], path: Path) -> None:
    lines = [
        "# Held-Out Embedding Evaluation",
        "",
        f"- Train rows: `{payload['train_rows']}`",
        f"- Eval rows: `{payload['eval_rows']}`",
        f"- Eval source filter: `{payload['eval_source_file']}`",
        "",
        "| Model | Accuracy | Macro F1 | Top-2 Accuracy | Log Loss | Brier | ECE |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for result in payload["results"]:
        top2 = "" if result["top2_accuracy"] is None else f"{result['top2_accuracy']:.4f}"
        loss = "" if result["log_loss"] is None else f"{result['log_loss']:.4f}"
        brier = "" if result["brier_score"] is None else f"{result['brier_score']:.4f}"
        ece = "" if result["expected_calibration_error"] is None else f"{result['expected_calibration_error']:.4f}"
        lines.append(
            f"| {result['model']} | {result['accuracy']:.4f} | {result['macro_f1']:.4f} | {top2} | {loss} | {brier} | {ece} |"
        )
    lines.append("")
    lines.append("Labels order for confusion matrices: `" + ", ".join(LABELS) + "`")
    lines.append("")
    for result in payload["results"]:
        lines.append(f"## {result['model']}")
        lines.append("")
        lines.append(f"- Confusion matrix: `{result['confusion_matrix']}`")
        lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--train-index", type=Path, required=True)
    parser.add_argument("--eval-index", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--eval-source-file", help="Optional `source_file` value to filter from eval index.")
    args = parser.parse_args()

    args.out_dir.mkdir(parents=True, exist_ok=True)
    x_train, y_train, train_df = load_embeddings(args.train_index)
    x_eval, y_eval, eval_df = load_embeddings(args.eval_index, source_file=args.eval_source_file)

    results = []
    for name, estimator in models():
        estimator.fit(x_train, y_train)
        y_pred = estimator.predict(x_eval)
        scores = probabilities_or_scores(estimator, x_eval)
        results.append(evaluate(name, y_eval, y_pred, scores))

    payload = {
        "train_index": str(args.train_index),
        "eval_index": str(args.eval_index),
        "eval_source_file": args.eval_source_file,
        "train_rows": int(len(train_df)),
        "eval_rows": int(len(eval_df)),
        "train_speakers": int(train_df["client_id"].nunique()),
        "eval_speakers": int(eval_df["client_id"].nunique()),
        "eval_rows_by_label": {label: int((eval_df["label"] == label).sum()) for label in LABELS},
        "eval_speakers_by_label": {
            label: int(eval_df.loc[eval_df["label"] == label, "client_id"].nunique()) for label in LABELS
        },
        "labels": LABELS,
        "results": [asdict(result) for result in results],
    }
    (args.out_dir / "results.json").write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    write_markdown(payload, args.out_dir / "results.md")
    print(json.dumps(payload, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
