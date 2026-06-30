#!/usr/bin/env python3
"""Plan a larger balanced subset while minimizing Common Voice train shards.

The mirror stores Catalan train audio in many tar shards. This script builds a
filename -> shard index for the mirror and greedily selects shards that cover
many manifest clips, then writes a balanced manifest subset restricted to those
shards.
"""

from __future__ import annotations

import argparse
import json
import tarfile
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass
from pathlib import Path

import pandas as pd
from huggingface_hub import HfApi, hf_hub_download
from tqdm import tqdm


MIRROR_REPO = "fsicoli/common_voice_17_0"
LABELS = ["balearic", "central", "northern", "northwestern", "valencian"]


@dataclass
class ShardPlanSummary:
    manifest: str
    out_manifest: str
    target_per_label: int
    max_shards: int
    selected_shards: list[str]
    rows: int
    speakers: int
    rows_by_label: dict[str, int]
    speakers_by_label: dict[str, int]
    shard_counts: dict[str, int]


def cv_split(source_file: str) -> str:
    if "annotated_train.tsv" in source_file:
        return "train"
    if "annotated_dev.tsv" in source_file:
        return "dev"
    if "annotated_test.tsv" in source_file:
        return "test"
    return "other"


def train_archives() -> list[str]:
    files = HfApi().list_repo_files(MIRROR_REPO, repo_type="dataset")
    archives = [path for path in files if path.startswith("audio/ca/train/") and path.endswith(".tar")]
    return sorted(archives, key=lambda value: int(Path(value).stem.split("_")[-1]))


def build_or_load_index(index_path: Path, max_shards: int | None = None) -> dict[str, str]:
    if index_path.exists():
        return json.loads(index_path.read_text(encoding="utf-8"))

    index_path.parent.mkdir(parents=True, exist_ok=True)
    index: dict[str, str] = {}
    archives = train_archives()
    if max_shards is not None:
        archives = archives[:max_shards]

    for archive in archives:
        archive_path = Path(hf_hub_download(repo_id=MIRROR_REPO, repo_type="dataset", filename=archive))
        with tarfile.open(archive_path) as tar:
            for member in tqdm(tar, desc=f"index {archive}", leave=False):
                if member.isfile():
                    index[Path(member.name).name] = archive
    index_path.write_text(json.dumps(index, indent=2), encoding="utf-8")
    return index


def select_shards(df: pd.DataFrame, max_shards: int) -> list[str]:
    wanted_by_shard: dict[str, set[str]] = defaultdict(set)
    for row in df.itertuples(index=False):
        if isinstance(row.train_shard, str) and row.train_shard:
            wanted_by_shard[row.train_shard].add(row.path)
    counts = Counter({shard: len(paths) for shard, paths in wanted_by_shard.items()})
    return [shard for shard, _ in counts.most_common(max_shards)]


def select_balanced(df: pd.DataFrame, target_per_label: int, seed: int) -> pd.DataFrame:
    parts = []
    for label, group in df.groupby("label", sort=True):
        # Prefer one clip per speaker before taking second clips.
        group = group.sample(frac=1, random_state=seed).copy()
        one_per_speaker = group.drop_duplicates(subset=["client_id"], keep="first")
        selected = one_per_speaker.head(target_per_label)
        if len(selected) < target_per_label:
            remaining = group[~group["path"].isin(selected["path"])]
            selected = pd.concat(
                [selected, remaining.head(target_per_label - len(selected))],
                ignore_index=True,
            )
        parts.append(selected)
    return pd.concat(parts, ignore_index=True) if parts else df.iloc[0:0].copy()


def write_markdown(summary: ShardPlanSummary, path: Path) -> None:
    lines = [
        "# Train Shard Plan",
        "",
        f"- Source manifest: `{summary.manifest}`",
        f"- Output manifest: `{summary.out_manifest}`",
        f"- Target rows per label: `{summary.target_per_label}`",
        f"- Max shards: `{summary.max_shards}`",
        f"- Selected shards: `{summary.selected_shards}`",
        f"- Rows: `{summary.rows}`",
        f"- Speakers: `{summary.speakers}`",
        f"- Rows by label: `{summary.rows_by_label}`",
        f"- Speakers by label: `{summary.speakers_by_label}`",
        f"- Rows by shard: `{summary.shard_counts}`",
        "",
    ]
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, default=Path("manifests/all_internal.csv"))
    parser.add_argument("--out-manifest", type=Path, default=Path("manifests/train_shard_planned.csv"))
    parser.add_argument("--index-path", type=Path, default=Path("reports/train_shard_index.json"))
    parser.add_argument("--target-per-label", type=int, default=60)
    parser.add_argument("--max-shards", type=int, default=4)
    parser.add_argument("--seed", type=int, default=13)
    parser.add_argument(
        "--index-max-shards",
        type=int,
        help="Index only first N train shards for faster experiments.",
    )
    args = parser.parse_args()

    df = pd.read_csv(args.manifest)
    df["cv_split"] = df["source_file"].map(cv_split)
    train_df = df[df["cv_split"] == "train"].drop_duplicates(subset=["path"]).copy()

    shard_index = build_or_load_index(args.index_path, max_shards=args.index_max_shards)
    train_df["train_shard"] = train_df["path"].map(shard_index)
    train_df = train_df[train_df["train_shard"].notna()].copy()

    selected_shards = select_shards(train_df, args.max_shards)
    shard_df = train_df[train_df["train_shard"].isin(selected_shards)].copy()
    selected = select_balanced(shard_df, target_per_label=args.target_per_label, seed=args.seed)
    selected = selected.sort_values(["label", "client_id", "path"]).reset_index(drop=True)
    args.out_manifest.parent.mkdir(parents=True, exist_ok=True)
    selected.to_csv(args.out_manifest, index=False)

    summary = ShardPlanSummary(
        manifest=str(args.manifest),
        out_manifest=str(args.out_manifest),
        target_per_label=args.target_per_label,
        max_shards=args.max_shards,
        selected_shards=selected_shards,
        rows=int(len(selected)),
        speakers=int(selected["client_id"].nunique()),
        rows_by_label={label: int((selected["label"] == label).sum()) for label in LABELS},
        speakers_by_label={
            label: int(selected.loc[selected["label"] == label, "client_id"].nunique())
            for label in LABELS
        },
        shard_counts=selected["train_shard"].value_counts().to_dict(),
    )
    summary_path = args.out_manifest.with_suffix(".summary.md")
    json_path = args.out_manifest.with_suffix(".summary.json")
    json_path.write_text(json.dumps(asdict(summary), indent=2, ensure_ascii=False), encoding="utf-8")
    write_markdown(summary, summary_path)
    print(json.dumps(asdict(summary), indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
