#!/usr/bin/env python3
"""Extract selected CV26 Catalan MP3s from the local archive.

This script only writes clips listed in a manifest. It scans the `.tar.gz`
archive sequentially and stops once all requested paths are prepared.
"""

from __future__ import annotations

import argparse
import json
import shutil
import tarfile
from dataclasses import asdict, dataclass
from pathlib import Path

import pandas as pd
from tqdm import tqdm


@dataclass
class Cv26PrepareSummary:
    archive: str
    manifest: str
    out_dir: str
    requested_rows: int
    requested_unique_files: int
    prepared_files: int
    missing_files: int
    scanned_members: int
    missing_examples: list[str]


def archive_key(row: pd.Series) -> str:
    if "archive_member" in row and isinstance(row["archive_member"], str) and row["archive_member"]:
        return row["archive_member"]
    return f"cv-corpus-26.0-2026-06-12/ca/clips/{row['path']}"


def write_prepared_manifest(df: pd.DataFrame, prepared: set[str], out_dir: Path) -> None:
    result = df.copy()
    result["audio_path"] = result["path"].map(lambda value: str(out_dir / value) if value in prepared else "")
    result["audio_prepared"] = result["path"].isin(prepared)
    result.to_csv(out_dir / "prepared_manifest.csv", index=False)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--archive",
        type=Path,
        default=Path("data/raw/common-voice-scripted-speech-26-0-catala-fe69b989.tar.gz"),
    )
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    args = parser.parse_args()

    args.out_dir.mkdir(parents=True, exist_ok=True)
    df = pd.read_csv(args.manifest)
    df = df.drop_duplicates(subset=["path"]).copy()
    requested_by_member = {archive_key(row): row["path"] for _, row in df.iterrows()}
    remaining = set(requested_by_member)
    prepared: set[str] = set()
    scanned_members = 0

    with tarfile.open(args.archive, "r:gz") as tar:
        for member in tqdm(tar, desc="scan-cv26-archive"):
            scanned_members += 1
            if not remaining:
                break
            if not member.isfile() or member.name not in remaining:
                continue
            source = tar.extractfile(member)
            if source is None:
                continue
            filename = requested_by_member[member.name]
            target = args.out_dir / filename
            target.parent.mkdir(parents=True, exist_ok=True)
            with target.open("wb") as fh:
                shutil.copyfileobj(source, fh)
            prepared.add(filename)
            remaining.remove(member.name)

    write_prepared_manifest(df, prepared, args.out_dir)
    missing = sorted(requested_by_member[member] for member in remaining)
    summary = Cv26PrepareSummary(
        archive=str(args.archive),
        manifest=str(args.manifest),
        out_dir=str(args.out_dir),
        requested_rows=int(len(df)),
        requested_unique_files=len(requested_by_member),
        prepared_files=len(prepared),
        missing_files=len(missing),
        scanned_members=scanned_members,
        missing_examples=missing[:20],
    )
    (args.out_dir / "summary.json").write_text(
        json.dumps(asdict(summary), indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    print(json.dumps(asdict(summary), indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
