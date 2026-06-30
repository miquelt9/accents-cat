#!/usr/bin/env python3
"""Train and save the current embedding classifier artifact."""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import LinearSVC


LABELS = ["balearic", "central", "northern", "northwestern", "valencian"]
DEFAULT_ENCODER = "BSC-LT/hubert-base-ca-2k"


@dataclass
class ModelMetadata:
    created_at: str
    model_type: str
    encoder_model_name: str
    pooling: str
    labels: list[str]
    train_embedding_index: str
    train_rows: int
    train_speakers: int
    train_rows_by_label: dict[str, int]
    train_speakers_by_label: dict[str, int]
    embedding_dim: int
    notes: str


def load_embeddings(index_path: Path) -> tuple[np.ndarray, np.ndarray, pd.DataFrame]:
    df = pd.read_csv(index_path)
    vectors = [np.load(path)["embedding"] for path in df["embedding_path"]]
    return np.vstack(vectors), df["label"].to_numpy(), df


def build_model() -> Any:
    return make_pipeline(
        StandardScaler(),
        CalibratedClassifierCV(
            LinearSVC(class_weight="balanced", random_state=13),
            cv=3,
        ),
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--train-index", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, default=Path("models/cv26-hubert-svm-calibrated"))
    parser.add_argument("--encoder-model-name", default=DEFAULT_ENCODER)
    args = parser.parse_args()

    args.out_dir.mkdir(parents=True, exist_ok=True)
    x, y, df = load_embeddings(args.train_index)
    model = build_model()
    model.fit(x, y)

    model_path = args.out_dir / "model.joblib"
    joblib.dump(model, model_path)

    metadata = ModelMetadata(
        created_at=datetime.now(timezone.utc).isoformat(),
        model_type="standard_scaler_plus_calibrated_linear_svm",
        encoder_model_name=args.encoder_model_name,
        pooling="mean_plus_std_last_hidden_state",
        labels=LABELS,
        train_embedding_index=str(args.train_index),
        train_rows=int(len(df)),
        train_speakers=int(df["client_id"].nunique()),
        train_rows_by_label={label: int((df["label"] == label).sum()) for label in LABELS},
        train_speakers_by_label={
            label: int(df.loc[df["label"] == label, "client_id"].nunique()) for label in LABELS
        },
        embedding_dim=int(x.shape[1]),
        notes=(
            "Current CPU baseline candidate. Input must be a pooled HuBERT embedding with "
            "the same mean+std pooling used by scripts/extract_hubert_embeddings.py."
        ),
    )
    (args.out_dir / "metadata.json").write_text(
        json.dumps(asdict(metadata), indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    print(json.dumps({"model_path": str(model_path), "metadata": asdict(metadata)}, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
