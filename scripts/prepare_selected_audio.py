#!/usr/bin/env python3
"""Prepare selected Common Voice audio clips from manifests.

Two input modes are supported:

1. Local official Common Voice archive:
   --local-clips-dir /path/to/cv-corpus-17.0-.../ca/clips

2. Hugging Face community mirror of Common Voice 17:
   downloads only the split tar archives it needs, then extracts selected clips.

This script copies/extracts only files listed in the manifest. It does not
resample or decode audio; that happens in the embedding extraction step.
"""

from __future__ import annotations

import argparse
import json
import shutil
import tarfile
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable

import pandas as pd
from huggingface_hub import HfApi, hf_hub_download
from tqdm import tqdm


MIRROR_REPO = "fsicoli/common_voice_17_0"


@dataclass
class PrepareSummary:
    manifest: str
    out_dir: str
    requested_rows: int
    requested_unique_files: int
    prepared_files: int
    missing_files: int
    source_splits: list[str]
    mode: str
    downloaded_archives: list[str]
    missing_examples: list[str]


def source_file_to_split(source_file: str) -> str | None:
    if "annotated_dev.tsv" in source_file:
        return "dev"
    if "annotated_test.tsv" in source_file:
        return "test"
    if "annotated_train.tsv" in source_file:
        return "train"
    if "validated" in source_file:
        return "validated"
    return None


def select_balanced_by_label(df: pd.DataFrame, max_files_per_label: int, seed: int) -> pd.DataFrame:
    """Select up to N files per label, preferring speaker diversity."""
    selected_parts = []
    for _, label_group in df.groupby("label", sort=True):
        label_group = label_group.sample(frac=1, random_state=seed).copy()
        # First pass: one clip per speaker.
        first_per_speaker = label_group.drop_duplicates(subset=["client_id"], keep="first")
        selected = first_per_speaker.head(max_files_per_label)
        if len(selected) < max_files_per_label:
            remaining = label_group[~label_group["path"].isin(selected["path"])]
            selected = pd.concat(
                [selected, remaining.head(max_files_per_label - len(selected))],
                ignore_index=True,
            )
        selected_parts.append(selected)
    return pd.concat(selected_parts, ignore_index=True) if selected_parts else df.iloc[0:0].copy()


def load_requested(
    manifest: Path,
    source_splits: set[str] | None,
    max_files: int | None,
    max_files_per_label: int | None,
    seed: int,
) -> pd.DataFrame:
    df = pd.read_csv(manifest)
    df["common_voice_split"] = df["source_file"].map(source_file_to_split)
    df = df[df["common_voice_split"].notna()].copy()
    if source_splits:
        df = df[df["common_voice_split"].isin(source_splits)].copy()
    df = df.drop_duplicates(subset=["path"]).copy()
    if max_files_per_label is not None:
        df = select_balanced_by_label(df, max_files_per_label=max_files_per_label, seed=seed)
    if max_files is not None:
        df = df.head(max_files).copy()
    return df


def copy_from_local(df: pd.DataFrame, local_clips_dir: Path, out_dir: Path) -> set[str]:
    prepared: set[str] = set()
    for row in tqdm(df.itertuples(index=False), total=len(df), desc="copy-local"):
        source = local_clips_dir / row.path
        target = out_dir / row.path
        if not source.exists():
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        prepared.add(row.path)
    return prepared


def mirror_archives_for_splits(splits: Iterable[str]) -> dict[str, list[str]]:
    available = HfApi().list_repo_files(MIRROR_REPO, repo_type="dataset")
    result: dict[str, list[str]] = {}
    for split in sorted(set(splits)):
        prefix = f"audio/ca/{split}/"
        archives = sorted(path for path in available if path.startswith(prefix) and path.endswith(".tar"))
        result[split] = archives
    return result


def extract_from_mirror(df: pd.DataFrame, out_dir: Path) -> tuple[set[str], list[str]]:
    requested_by_split = {
        split: set(group["path"].tolist())
        for split, group in df.groupby("common_voice_split", sort=True)
    }
    prepared: set[str] = set()
    downloaded_archives: list[str] = []
    archive_map = mirror_archives_for_splits(requested_by_split.keys())
    if "train_shard" in df.columns:
        planned_train_shards = sorted(
            shard
            for shard in df.loc[df["common_voice_split"] == "train", "train_shard"].dropna().unique().tolist()
            if isinstance(shard, str) and shard
        )
        if planned_train_shards:
            archive_map["train"] = planned_train_shards

    for split, requested in requested_by_split.items():
        remaining = set(requested) - prepared
        for archive_name in archive_map.get(split, []):
            if not remaining:
                break
            archive_path = Path(
                hf_hub_download(repo_id=MIRROR_REPO, repo_type="dataset", filename=archive_name)
            )
            downloaded_archives.append(archive_name)
            with tarfile.open(archive_path) as tar:
                for member in tqdm(tar, desc=f"scan {archive_name}", leave=False):
                    if not member.isfile():
                        continue
                    basename = Path(member.name).name
                    if basename not in remaining:
                        continue
                    extracted = tar.extractfile(member)
                    if extracted is None:
                        continue
                    target = out_dir / basename
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with target.open("wb") as fh:
                        shutil.copyfileobj(extracted, fh)
                    prepared.add(basename)
                    remaining.remove(basename)
                    if not remaining:
                        break
    return prepared, downloaded_archives


def write_prepared_manifest(df: pd.DataFrame, prepared: set[str], out_dir: Path) -> None:
    result = df.copy()
    result["audio_path"] = result["path"].map(lambda value: str(out_dir / value) if value in prepared else "")
    result["audio_prepared"] = result["path"].isin(prepared)
    result.to_csv(out_dir / "prepared_manifest.csv", index=False)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, default=Path("manifests/train.csv"))
    parser.add_argument("--out-dir", type=Path, default=Path("data/audio/train"))
    parser.add_argument("--local-clips-dir", type=Path)
    parser.add_argument(
        "--source-splits",
        nargs="*",
        choices=["dev", "test", "train", "validated"],
        help="Restrict preparation to selected Common Voice source splits.",
    )
    parser.add_argument("--max-files", type=int, help="Prepare only the first N unique files.")
    parser.add_argument(
        "--max-files-per-label",
        type=int,
        help="Prepare up to N unique files per dialect label, preferring one clip per speaker.",
    )
    parser.add_argument("--seed", type=int, default=13)
    args = parser.parse_args()

    args.out_dir.mkdir(parents=True, exist_ok=True)
    source_splits = set(args.source_splits) if args.source_splits else None
    requested = load_requested(
        args.manifest,
        source_splits=source_splits,
        max_files=args.max_files,
        max_files_per_label=args.max_files_per_label,
        seed=args.seed,
    )

    if args.local_clips_dir:
        prepared = copy_from_local(requested, args.local_clips_dir, args.out_dir)
        downloaded_archives: list[str] = []
        mode = "local"
    else:
        prepared, downloaded_archives = extract_from_mirror(requested, args.out_dir)
        mode = f"hf-mirror:{MIRROR_REPO}"

    write_prepared_manifest(requested, prepared, args.out_dir)
    requested_files = set(requested["path"].tolist())
    missing = sorted(requested_files - prepared)
    summary = PrepareSummary(
        manifest=str(args.manifest),
        out_dir=str(args.out_dir),
        requested_rows=int(len(requested)),
        requested_unique_files=len(requested_files),
        prepared_files=len(prepared),
        missing_files=len(missing),
        source_splits=sorted(requested["common_voice_split"].dropna().unique().tolist()),
        mode=mode,
        downloaded_archives=downloaded_archives,
        missing_examples=missing[:20],
    )
    (args.out_dir / "summary.json").write_text(
        json.dumps(asdict(summary), indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    print(json.dumps(asdict(summary), indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
