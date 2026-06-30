#!/usr/bin/env python3
"""Train simple baselines on frozen speech-encoder embeddings.

This is intended for early research feedback, especially on small balanced
subsets. It uses speaker-grouped cross-validation to avoid putting clips from
the same speaker in both train and test folds.
"""

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
    top_k_accuracy_score,
)
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.neighbors import NearestCentroid
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import LinearSVC


LABELS = ["balearic", "central", "northern", "northwestern", "valencian"]


@dataclass
class ModelResult:
    model: str
    accuracy: float
    macro_f1: float
    top2_accuracy: float | None
    confusion_matrix: list[list[int]]
    classification_report: dict[str, Any]


def load_embeddings(index_path: Path) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    df = pd.read_csv(index_path)
    vectors = []
    for path in df["embedding_path"]:
        vectors.append(np.load(path)["embedding"])
    x = np.vstack(vectors)
    y = df["label"].to_numpy()
    groups = df["client_id"].to_numpy()
    return x, y, groups


def probabilities_or_scores(model: Any, x: np.ndarray) -> np.ndarray | None:
    if hasattr(model, "predict_proba"):
        return model.predict_proba(x)
    if hasattr(model, "decision_function"):
        scores = model.decision_function(x)
        if scores.ndim == 1:
            scores = np.column_stack([-scores, scores])
        return scores
    return None


def evaluate_predictions(
    model_name: str,
    y_true: np.ndarray,
    y_pred: np.ndarray,
    scores: np.ndarray | None,
) -> ModelResult:
    if scores is not None and len(set(y_true)) > 2:
        try:
            top2 = float(top_k_accuracy_score(y_true, scores, k=2, labels=LABELS))
        except Exception:
            top2 = None
    else:
        top2 = None
    return ModelResult(
        model=model_name,
        accuracy=round(float(accuracy_score(y_true, y_pred)), 4),
        macro_f1=round(float(f1_score(y_true, y_pred, average="macro", labels=LABELS)), 4),
        top2_accuracy=round(top2, 4) if top2 is not None else None,
        confusion_matrix=confusion_matrix(y_true, y_pred, labels=LABELS).tolist(),
        classification_report=classification_report(
            y_true,
            y_pred,
            labels=LABELS,
            output_dict=True,
            zero_division=0,
        ),
    )


def cross_val_model(name: str, estimator: Any, x: np.ndarray, y: np.ndarray, groups: np.ndarray, folds: int) -> ModelResult:
    splitter = StratifiedGroupKFold(n_splits=folds, shuffle=True, random_state=13)
    y_true_all = []
    y_pred_all = []
    score_all = []
    score_supported = True

    for train_idx, test_idx in splitter.split(x, y, groups):
        model = estimator
        model.fit(x[train_idx], y[train_idx])
        y_pred = model.predict(x[test_idx])
        y_true_all.extend(y[test_idx])
        y_pred_all.extend(y_pred)
        scores = probabilities_or_scores(model, x[test_idx])
        if scores is None:
            score_supported = False
        elif score_supported:
            score_all.append(scores)

    scores_concat = np.vstack(score_all) if score_supported and score_all else None
    return evaluate_predictions(
        name,
        np.array(y_true_all),
        np.array(y_pred_all),
        scores_concat,
    )


def write_markdown(results: list[ModelResult], path: Path) -> None:
    lines = [
        "# Embedding Baseline Results",
        "",
        "Speaker-grouped cross-validation on frozen speech-encoder embeddings.",
        "",
        "| Model | Accuracy | Macro F1 | Top-2 Accuracy |",
        "| --- | ---: | ---: | ---: |",
    ]
    for result in results:
        lines.append(
            f"| {result.model} | {result.accuracy:.4f} | {result.macro_f1:.4f} | {'' if result.top2_accuracy is None else f'{result.top2_accuracy:.4f}'} |"
        )
    lines.append("")
    lines.append("Labels order for confusion matrices: `" + ", ".join(LABELS) + "`")
    lines.append("")
    for result in results:
        lines.append(f"## {result.model}")
        lines.append("")
        lines.append(f"- Confusion matrix: `{result.confusion_matrix}`")
        lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--embedding-index", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, default=Path("reports/baselines"))
    parser.add_argument("--folds", type=int, default=5)
    args = parser.parse_args()

    args.out_dir.mkdir(parents=True, exist_ok=True)
    x, y, groups = load_embeddings(args.embedding_index)
    min_class = min(pd.Series(y).value_counts().to_dict().values())
    folds = min(args.folds, min_class, len(set(groups)))
    if folds < 2:
        raise ValueError("Need at least two folds/classes for cross-validation")

    models = [
        (
            "majority_dummy",
            DummyClassifier(strategy="most_frequent"),
        ),
        (
            "logistic_regression",
            make_pipeline(
                StandardScaler(),
                LogisticRegression(
                    max_iter=5000,
                    class_weight="balanced",
                    random_state=13,
                ),
            ),
        ),
        (
            "linear_svm_calibrated",
            make_pipeline(
                StandardScaler(),
                CalibratedClassifierCV(
                    LinearSVC(class_weight="balanced", random_state=13),
                    cv=3,
                ),
            ),
        ),
        (
            "nearest_centroid",
            make_pipeline(StandardScaler(), NearestCentroid()),
        ),
    ]

    results = [cross_val_model(name, model, x, y, groups, folds=folds) for name, model in models]
    payload = {
        "embedding_index": str(args.embedding_index),
        "rows": int(len(y)),
        "speakers": int(len(set(groups))),
        "folds": int(folds),
        "labels": LABELS,
        "results": [asdict(result) for result in results],
    }
    (args.out_dir / "results.json").write_text(
        json.dumps(payload, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    write_markdown(results, args.out_dir / "results.md")
    print(json.dumps(payload, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
