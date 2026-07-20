#!/usr/bin/env python3
"""Seed prepared audio + embeddings from an existing CV26 subset.

Copies/hardlinks known MP3s and HuBERT vectors so prepare/extract only need to
handle the residual clips for a larger or remapped manifest.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
from pathlib import Path

import pandas as pd


def link_or_copy(src: Path, dst: Path) -> str:
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists():
        return "exists"
    try:
        os.link(src, dst)
        return "hardlink"
    except OSError:
        shutil.copy2(src, dst)
        return "copy"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--out-audio-dir", type=Path, required=True)
    parser.add_argument("--out-embedding-dir", type=Path, required=True)
    parser.add_argument(
        "--source-audio-dir",
        type=Path,
        action="append",
        required=True,
        help="Existing prepared audio directory (may be passed multiple times).",
    )
    parser.add_argument(
        "--source-embedding-dir",
        type=Path,
        action="append",
        required=True,
        help="Existing embedding directory with vectors/ (may be passed multiple times).",
    )
    args = parser.parse_args()

    args.out_audio_dir.mkdir(parents=True, exist_ok=True)
    vectors_dir = args.out_embedding_dir / "vectors"
    vectors_dir.mkdir(parents=True, exist_ok=True)

    df = pd.read_csv(args.manifest)
    audio_seeded = 0
    embedding_seeded = 0
    missing_audio: list[str] = []

    source_audio_files: dict[str, Path] = {}
    for audio_dir in args.source_audio_dir:
        for path in audio_dir.glob("*.mp3"):
            source_audio_files.setdefault(path.name, path)

    source_vectors: dict[str, Path] = {}
    for emb_dir in args.source_embedding_dir:
        for path in (emb_dir / "vectors").glob("*.npz"):
            source_vectors.setdefault(path.name, path)

    for _, row in df.iterrows():
        filename = str(row["path"])
        stem = Path(filename).stem
        src_audio = source_audio_files.get(filename)
        if src_audio is not None:
            link_or_copy(src_audio, args.out_audio_dir / filename)
            audio_seeded += 1
        else:
            missing_audio.append(filename)

        src_vec = source_vectors.get(f"{stem}.npz")
        if src_vec is not None:
            link_or_copy(src_vec, vectors_dir / f"{stem}.npz")
            embedding_seeded += 1

    prepared = df.copy()
    prepared_names = set(source_audio_files) - set(missing_audio)
    # Recompute from disk after seeding.
    on_disk = {path.name for path in args.out_audio_dir.glob("*.mp3")}
    prepared["audio_path"] = prepared["path"].map(
        lambda value: str(args.out_audio_dir / value) if value in on_disk else ""
    )
    prepared["audio_prepared"] = prepared["path"].isin(on_disk)
    prepared.to_csv(args.out_audio_dir / "prepared_manifest.csv", index=False)

    residual = prepared[~prepared["audio_prepared"]].copy()
    residual_path = args.out_audio_dir / "residual_manifest.csv"
    residual.drop(columns=["audio_path", "audio_prepared"], errors="ignore").to_csv(
        residual_path, index=False
    )

    summary = {
        "manifest": str(args.manifest),
        "rows": int(len(df)),
        "audio_seeded": audio_seeded,
        "embedding_seeded": embedding_seeded,
        "audio_on_disk": int(prepared["audio_prepared"].sum()),
        "residual_rows": int(len(residual)),
        "residual_manifest": str(residual_path),
        "prepared_manifest": str(args.out_audio_dir / "prepared_manifest.csv"),
    }
    (args.out_audio_dir / "seed_summary.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
