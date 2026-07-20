#!/usr/bin/env python3
"""Prepare residual CV26 clips for multiple experiment dirs in one archive scan."""

from __future__ import annotations

import argparse
import json
import shutil
import tarfile
from pathlib import Path

import pandas as pd
from tqdm import tqdm


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--archive",
        type=Path,
        default=Path("data/raw/common-voice-scripted-speech-26-0-catala-fe69b989.tar.gz"),
    )
    parser.add_argument(
        "--residual-manifest",
        type=Path,
        action="append",
        required=True,
        help="residual_manifest.csv produced by seed_prepared_from_existing.py",
    )
    parser.add_argument(
        "--out-audio-dir",
        type=Path,
        action="append",
        required=True,
        help="Matching audio out dir for each residual manifest (same order).",
    )
    parser.add_argument(
        "--full-manifest",
        type=Path,
        action="append",
        required=True,
        help="Full experiment manifest used to rewrite prepared_manifest.csv.",
    )
    args = parser.parse_args()

    if not (len(args.residual_manifest) == len(args.out_audio_dir) == len(args.full_manifest)):
        raise SystemExit("residual/out/full lists must have the same length")

    # member -> list of (out_dir, filename)
    targets: dict[str, list[tuple[Path, str]]] = {}
    for residual_path, out_dir in zip(args.residual_manifest, args.out_audio_dir):
        df = pd.read_csv(residual_path)
        for _, row in df.iterrows():
            member = str(row.get("archive_member") or f"cv-corpus-26.0-2026-06-12/ca/clips/{row['path']}")
            targets.setdefault(member, []).append((out_dir, str(row["path"])))

    remaining = set(targets)
    prepared_counts = {str(path): 0 for path in args.out_audio_dir}
    scanned = 0

    with tarfile.open(args.archive, "r:gz") as tar:
        for member in tqdm(tar, desc="scan-cv26-archive-residuals"):
            scanned += 1
            if not remaining:
                break
            if not member.isfile() or member.name not in remaining:
                continue
            source = tar.extractfile(member)
            if source is None:
                continue
            payload = source.read()
            for out_dir, filename in targets[member.name]:
                target = out_dir / filename
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(payload)
                prepared_counts[str(out_dir)] += 1
            remaining.remove(member.name)

    summaries = []
    for residual_path, out_dir, full_manifest in zip(
        args.residual_manifest, args.out_audio_dir, args.full_manifest
    ):
        full = pd.read_csv(full_manifest)
        on_disk = {path.name for path in out_dir.glob("*.mp3")}
        prepared = full.copy()
        prepared["audio_path"] = prepared["path"].map(
            lambda value: str(out_dir / value) if value in on_disk else ""
        )
        prepared["audio_prepared"] = prepared["path"].isin(on_disk)
        prepared.to_csv(out_dir / "prepared_manifest.csv", index=False)
        summary = {
            "out_dir": str(out_dir),
            "residual_manifest": str(residual_path),
            "full_manifest": str(full_manifest),
            "prepared_from_scan": prepared_counts[str(out_dir)],
            "audio_on_disk": int(prepared["audio_prepared"].sum()),
            "missing": int((~prepared["audio_prepared"]).sum()),
            "scanned_members": scanned,
        }
        (out_dir / "prepare_residual_summary.json").write_text(
            json.dumps(summary, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        summaries.append(summary)

    print(json.dumps({"scanned_members": scanned, "remaining": len(remaining), "jobs": summaries}, indent=2))


if __name__ == "__main__":
    main()
