#!/usr/bin/env python3
"""Extract frozen speech-encoder embeddings for prepared audio manifests.

The script expects a `prepared_manifest.csv` produced by
`prepare_selected_audio.py`. It loads each MP3, resamples to 16 kHz, runs a
frozen speech encoder, and stores pooled utterance embeddings.

Pooling:
- mean over time
- standard deviation over time
- concatenated `[mean, std]` vector for simple classical classifiers
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import librosa
import numpy as np
import pandas as pd
import torch
from tqdm import tqdm
from transformers import AutoFeatureExtractor, AutoModel


DEFAULT_MODEL = "BSC-LT/hubert-base-ca-2k"


@dataclass
class EmbeddingSummary:
    manifest: str
    out_dir: str
    model_name: str
    device: str
    requested_rows: int
    embedded_rows: int
    failed_rows: int
    embedding_dim: int | None
    failures: list[dict[str, str]]


def load_audio(path: str, sampling_rate: int) -> np.ndarray:
    audio, _ = librosa.load(path, sr=sampling_rate, mono=True)
    return audio.astype(np.float32)


def pool_hidden_state(hidden: torch.Tensor) -> np.ndarray:
    # hidden shape: [1, frames, hidden_dim]
    hidden = hidden.squeeze(0)
    mean = hidden.mean(dim=0)
    std = hidden.std(dim=0, unbiased=False)
    pooled = torch.cat([mean, std], dim=0)
    return pooled.detach().cpu().numpy().astype(np.float32)


def extract_one(
    audio_path: str,
    feature_extractor: Any,
    model: torch.nn.Module,
    device: torch.device,
) -> np.ndarray:
    sampling_rate = int(getattr(feature_extractor, "sampling_rate", 16_000) or 16_000)
    audio = load_audio(audio_path, sampling_rate=sampling_rate)
    inputs = feature_extractor(
        audio,
        sampling_rate=sampling_rate,
        return_tensors="pt",
        padding=True,
    )
    inputs = {key: value.to(device) for key, value in inputs.items()}
    with torch.inference_mode():
        outputs = model(**inputs)
    return pool_hidden_state(outputs.last_hidden_state)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--prepared-manifest", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, default=Path("embeddings/smoke-dev"))
    parser.add_argument("--model-name", default=DEFAULT_MODEL)
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--max-rows", type=int)
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument(
        "--force-exit",
        action="store_true",
        help="Force process exit after writing outputs if model libraries leave background threads alive.",
    )
    args = parser.parse_args()

    args.out_dir.mkdir(parents=True, exist_ok=True)
    vectors_dir = args.out_dir / "vectors"
    vectors_dir.mkdir(parents=True, exist_ok=True)

    df = pd.read_csv(args.prepared_manifest)
    df = df[df["audio_prepared"].astype(bool)].copy()
    if args.max_rows is not None:
        df = df.head(args.max_rows).copy()

    device = torch.device(args.device)
    feature_extractor = AutoFeatureExtractor.from_pretrained(args.model_name)
    model = AutoModel.from_pretrained(args.model_name)
    model.to(device)
    model.eval()

    index_rows = []
    failures: list[dict[str, str]] = []
    embedding_dim: int | None = None

    for i, row in tqdm(list(df.iterrows()), desc="extract-embeddings"):
        vector_path = vectors_dir / f"{Path(row['path']).stem}.npz"
        if vector_path.exists() and not args.overwrite:
            try:
                embedding = np.load(vector_path)["embedding"]
                embedding_dim = int(embedding.shape[0])
                index_rows.append(
                    {
                        **row.to_dict(),
                        "embedding_path": str(vector_path),
                        "embedding_dim": embedding_dim,
                    }
                )
                continue
            except Exception:
                pass
        try:
            embedding = extract_one(
                audio_path=str(row["audio_path"]),
                feature_extractor=feature_extractor,
                model=model,
                device=device,
            )
            embedding_dim = int(embedding.shape[0])
            np.savez_compressed(vector_path, embedding=embedding)
            index_rows.append(
                {
                    **row.to_dict(),
                    "embedding_path": str(vector_path),
                    "embedding_dim": embedding_dim,
                }
            )
        except Exception as exc:
            failures.append(
                {
                    "path": str(row.get("path", "")),
                    "audio_path": str(row.get("audio_path", "")),
                    "error": f"{type(exc).__name__}: {exc}",
                }
            )

    pd.DataFrame(index_rows).to_csv(args.out_dir / "embedding_index.csv", index=False)
    summary = EmbeddingSummary(
        manifest=str(args.prepared_manifest),
        out_dir=str(args.out_dir),
        model_name=args.model_name,
        device=str(device),
        requested_rows=int(len(df)),
        embedded_rows=len(index_rows),
        failed_rows=len(failures),
        embedding_dim=embedding_dim,
        failures=failures[:20],
    )
    (args.out_dir / "summary.json").write_text(
        json.dumps(asdict(summary), indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    print(json.dumps(asdict(summary), indent=2, ensure_ascii=False))
    sys.stdout.flush()
    sys.stderr.flush()
    if args.force_exit:
        os._exit(0)


if __name__ == "__main__":
    main()
