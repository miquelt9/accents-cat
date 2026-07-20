#!/usr/bin/env python3
"""Sweep classifier heads on frozen speech-encoder embeddings.

Runs speaker-grouped CV over LinearSVC C values, calibration methods, and a
few alternate heads. Optionally fits the best LinearSVC config on the full
train index and evaluates on held-out embedding indexes.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.calibration import CalibratedClassifierCV
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    log_loss,
    top_k_accuracy_score,
)
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import LinearSVC, SVC


LABELS = ["balearic", "central", "northern", "northwestern", "valencian"]


@dataclass
class SweepResult:
    name: str
    kind: str
    accuracy: float
    macro_f1: float
    top2_accuracy: float | None
    per_class_f1: dict[str, float]
    confusion_matrix: list[list[int]]
    params: dict[str, Any]


def load_embeddings(index_path: Path) -> tuple[np.ndarray, np.ndarray, np.ndarray, pd.DataFrame]:
    df = pd.read_csv(index_path)
    vectors = [np.load(path)["embedding"] for path in df["embedding_path"]]
    return np.vstack(vectors), df["label"].to_numpy(), df["client_id"].to_numpy(), df


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


def evaluate_fold_predictions(
    name: str,
    kind: str,
    params: dict[str, Any],
    y_true: np.ndarray,
    y_pred: np.ndarray,
    scores: np.ndarray | None,
) -> SweepResult:
    report = classification_report(
        y_true,
        y_pred,
        labels=LABELS,
        output_dict=True,
        zero_division=0,
    )
    top2 = None
    if scores is not None:
        try:
            top2 = round(float(top_k_accuracy_score(y_true, scores, k=2, labels=LABELS)), 4)
        except Exception:
            top2 = None
    return SweepResult(
        name=name,
        kind=kind,
        accuracy=round(float(accuracy_score(y_true, y_pred)), 4),
        macro_f1=round(float(f1_score(y_true, y_pred, average="macro", labels=LABELS)), 4),
        top2_accuracy=top2,
        per_class_f1={label: round(float(report[label]["f1-score"]), 4) for label in LABELS},
        confusion_matrix=confusion_matrix(y_true, y_pred, labels=LABELS).tolist(),
        params=params,
    )


def cross_val(name: str, kind: str, params: dict[str, Any], estimator: Any, x: np.ndarray, y: np.ndarray, groups: np.ndarray, folds: int) -> SweepResult:
    splitter = StratifiedGroupKFold(n_splits=folds, shuffle=True, random_state=13)
    y_true_all: list[Any] = []
    y_pred_all: list[Any] = []
    score_all: list[np.ndarray] = []
    score_supported = True

    for train_idx, test_idx in splitter.split(x, y, groups):
        model = clone(estimator)
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
    return evaluate_fold_predictions(
        name,
        kind,
        params,
        np.array(y_true_all),
        np.array(y_pred_all),
        scores_concat,
    )


def build_candidates(include_alternates: bool) -> list[tuple[str, str, dict[str, Any], Any]]:
    candidates: list[tuple[str, str, dict[str, Any], Any]] = []
    for c_value in (0.1, 0.3, 1.0, 3.0, 10.0):
        for method in ("sigmoid", "isotonic"):
            name = f"linear_svm_c{c_value}_{method}"
            params = {"C": c_value, "calibration": method, "cv": 3}
            estimator = make_pipeline(
                StandardScaler(),
                CalibratedClassifierCV(
                    LinearSVC(C=c_value, class_weight="balanced", random_state=13, max_iter=10_000),
                    method=method,
                    cv=3,
                ),
            )
            candidates.append((name, "linear_svm_calibrated", params, estimator))

    candidates.append(
        (
            "logistic_regression",
            "logistic_regression",
            {"max_iter": 5000, "class_weight": "balanced"},
            make_pipeline(
                StandardScaler(),
                LogisticRegression(max_iter=5000, class_weight="balanced", random_state=13),
            ),
        )
    )

    if include_alternates:
        candidates.append(
            (
                "rbf_svm_calibrated",
                "rbf_svm_calibrated",
                {"C": 1.0, "kernel": "rbf", "calibration": "sigmoid"},
                make_pipeline(
                    StandardScaler(),
                    CalibratedClassifierCV(
                        SVC(C=1.0, kernel="rbf", class_weight="balanced", random_state=13),
                        method="sigmoid",
                        cv=3,
                    ),
                ),
            )
        )
        candidates.append(
            (
                "mlp_small",
                "mlp",
                {"hidden_layer_sizes": (128,), "max_iter": 400},
                make_pipeline(
                    StandardScaler(),
                    MLPClassifier(
                        hidden_layer_sizes=(128,),
                        max_iter=400,
                        random_state=13,
                        early_stopping=True,
                    ),
                ),
            )
        )
    return candidates


def build_linear_svm(c_value: float, method: str) -> Any:
    return make_pipeline(
        StandardScaler(),
        CalibratedClassifierCV(
            LinearSVC(C=c_value, class_weight="balanced", random_state=13, max_iter=10_000),
            method=method,
            cv=3,
        ),
    )


def evaluate_saved_model(model: Any, eval_index: Path) -> dict[str, Any]:
    x, y, _, df = load_embeddings(eval_index)
    y_pred = model.predict(x)
    probs = normalize_scores(probabilities_or_scores(model, x))
    report = classification_report(y, y_pred, labels=LABELS, output_dict=True, zero_division=0)
    return {
        "eval_index": str(eval_index),
        "eval_rows": int(len(df)),
        "eval_speakers": int(df["client_id"].nunique()),
        "accuracy": round(float(accuracy_score(y, y_pred)), 4),
        "macro_f1": round(float(f1_score(y, y_pred, average="macro", labels=LABELS)), 4),
        "top2_accuracy": round(float(top_k_accuracy_score(y, probs, k=2, labels=LABELS)), 4),
        "log_loss": round(float(log_loss(y, probs, labels=LABELS)), 4),
        "per_class_f1": {label: round(float(report[label]["f1-score"]), 4) for label in LABELS},
        "confusion_matrix": confusion_matrix(y, y_pred, labels=LABELS).tolist(),
        "classification_report": report,
    }


def write_markdown(payload: dict[str, Any], path: Path) -> None:
    lines = [
        "# Embedding Classifier Sweep",
        "",
        f"- Train index: `{payload['train_index']}`",
        f"- Rows / speakers: `{payload['rows']}` / `{payload['speakers']}`",
        f"- Folds: `{payload['folds']}`",
        "",
        "| Model | Acc | Macro F1 | Top-2 | Northern F1 | Central F1 | Northwestern F1 |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for result in payload["cv_results"]:
        pc = result["per_class_f1"]
        top2 = "" if result["top2_accuracy"] is None else f"{result['top2_accuracy']:.4f}"
        lines.append(
            f"| {result['name']} | {result['accuracy']:.4f} | {result['macro_f1']:.4f} | {top2} | "
            f"{pc['northern']:.4f} | {pc['central']:.4f} | {pc['northwestern']:.4f} |"
        )
    lines.extend(
        [
            "",
            f"## Best CV model",
            "",
            f"- Name: `{payload['best_cv']['name']}`",
            f"- Macro F1: `{payload['best_cv']['macro_f1']:.4f}`",
            f"- Params: `{payload['best_cv']['params']}`",
            "",
        ]
    )
    if payload.get("heldout"):
        lines.append("## Held-out / external evaluations")
        lines.append("")
        lines.append("| Eval | Acc | Macro F1 | Top-2 | Northern F1 |")
        lines.append("| --- | ---: | ---: | ---: | ---: |")
        for name, result in payload["heldout"].items():
            lines.append(
                f"| {name} | {result['accuracy']:.4f} | {result['macro_f1']:.4f} | "
                f"{result['top2_accuracy']:.4f} | {result['per_class_f1']['northern']:.4f} |"
            )
        lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--train-index", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--folds", type=int, default=5)
    parser.add_argument("--include-alternates", action="store_true")
    parser.add_argument(
        "--eval-index",
        type=Path,
        action="append",
        default=None,
        help="Held-out embedding index. May be passed multiple times; use --eval-name in parallel order.",
    )
    parser.add_argument(
        "--eval-name",
        action="append",
        default=None,
        help="Display name for each --eval-index (same order).",
    )
    parser.add_argument("--save-best-model-dir", type=Path)
    parser.add_argument("--baseline-macro-f1", type=float, default=0.5063)
    args = parser.parse_args()

    args.out_dir.mkdir(parents=True, exist_ok=True)
    x, y, groups, df = load_embeddings(args.train_index)
    min_class = min(pd.Series(y).value_counts().to_dict().values())
    folds = min(args.folds, min_class, len(set(groups)))
    if folds < 2:
        raise ValueError("Need at least two folds/classes for cross-validation")

    results = [
        cross_val(name, kind, params, estimator, x, y, groups, folds)
        for name, kind, params, estimator in build_candidates(args.include_alternates)
    ]
    results_sorted = sorted(results, key=lambda item: (item.macro_f1, item.per_class_f1["northern"]), reverse=True)
    best = results_sorted[0]

    # Prefer best linear SVM for artifact compatibility with predict_proba + production path.
    linear_results = [item for item in results_sorted if item.kind == "linear_svm_calibrated"]
    best_linear = linear_results[0] if linear_results else best

    heldout: dict[str, Any] = {}
    saved_model_path = None
    if args.eval_index:
        names = args.eval_name or [path.name for path in args.eval_index]
        if len(names) != len(args.eval_index):
            raise ValueError("--eval-name count must match --eval-index count")
        c_value = float(best_linear.params["C"])
        method = str(best_linear.params["calibration"])
        model = build_linear_svm(c_value, method)
        model.fit(x, y)
        if args.save_best_model_dir:
            args.save_best_model_dir.mkdir(parents=True, exist_ok=True)
            saved_model_path = args.save_best_model_dir / "model.joblib"
            joblib.dump(model, saved_model_path)
            metadata = {
                "model_type": "standard_scaler_plus_calibrated_linear_svm",
                "encoder_model_name": "BSC-LT/hubert-base-ca-2k",
                "pooling": "mean_plus_std_last_hidden_state",
                "labels": LABELS,
                "train_embedding_index": str(args.train_index),
                "train_rows": int(len(df)),
                "C": c_value,
                "calibration_method": method,
                "selected_from_sweep": best_linear.name,
                "cv_macro_f1": best_linear.macro_f1,
            }
            (args.save_best_model_dir / "metadata.json").write_text(
                json.dumps(metadata, indent=2, ensure_ascii=False),
                encoding="utf-8",
            )
        for name, eval_index in zip(names, args.eval_index):
            heldout[name] = evaluate_saved_model(model, eval_index)

    payload = {
        "train_index": str(args.train_index),
        "rows": int(len(y)),
        "speakers": int(len(set(groups))),
        "folds": int(folds),
        "baseline_macro_f1": args.baseline_macro_f1,
        "labels": LABELS,
        "cv_results": [asdict(result) for result in results_sorted],
        "best_cv": asdict(best),
        "best_linear_svm": asdict(best_linear),
        "delta_macro_f1_vs_baseline_cv": round(best_linear.macro_f1 - args.baseline_macro_f1, 4),
        "heldout": heldout,
        "saved_model": str(saved_model_path) if saved_model_path else None,
    }
    (args.out_dir / "sweep_results.json").write_text(
        json.dumps(payload, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    write_markdown(payload, args.out_dir / "sweep_results.md")
    print(json.dumps(payload, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
