#!/usr/bin/env python3
"""Build speaker-balanced manifests for Catalan accent classification.

This script downloads only TSV metadata from AINA Hugging Face dataset repos.
It does not download audio. The output manifests can later drive a controlled
audio download and embedding extraction step.

Design choices:
- split by `client_id`, never by clip;
- reserve benchmark speakers so train/validation/calibration cannot leak into
  the held-out benchmark splits;
- cap clips per speaker to reduce speaker memorization;
- balance by number of speakers per dialect, not by raw clip count.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import pandas as pd
from huggingface_hub import hf_hub_download


LABELS = ["balearic", "central", "northern", "northwestern", "valencian"]

ANNOTATED_DATASET = "projecte-aina/annotated_catalan_common_voice_v17"
ANNOTATED_FILES = [
    "corpus/files/annotated_train.tsv",
    "corpus/files/annotated_dev.tsv",
    "corpus/files/annotated_test.tsv",
]

BENCHMARK_DATASET = "projecte-aina/commonvoice_benchmark_catalan_accents"
BENCHMARK_FILES = [
    "corpus/files/balearic_female.tsv",
    "corpus/files/balearic_male.tsv",
    "corpus/files/central_female.tsv",
    "corpus/files/central_male.tsv",
    "corpus/files/northern_female.tsv",
    "corpus/files/northern_male.tsv",
    "corpus/files/northwestern_female.tsv",
    "corpus/files/northwestern_male.tsv",
    "corpus/files/valencian_female.tsv",
    "corpus/files/valencian_male.tsv",
]

KEEP_COLUMNS = [
    "client_id",
    "path",
    "sentence",
    "age",
    "gender",
    "accent",
    "variant",
    "locale",
    "assigned_accent",
    "annotated_accent",
    "annotated_accent_agreement",
    "propagated_accents_normalized",
    "assigned_gender",
]


@dataclass
class SplitSummary:
    rows: int
    speakers: int
    rows_by_label: dict[str, int]
    speakers_by_label: dict[str, int]


@dataclass
class ManifestSummary:
    seed: int
    max_speakers_per_accent: int
    max_clips_per_speaker: int
    selected_speakers_per_accent: int
    benchmark_reserved_speakers: int
    ambiguous_speakers_dropped: int
    source_rows_after_filtering: int
    available_speakers_by_label: dict[str, int]
    splits: dict[str, SplitSummary]
    leakage_checks: dict[str, Any]


def normalize_label(value: Any) -> str | None:
    if value is None or pd.isna(value):
        return None
    text = str(value).strip().lower().replace("_", "-")
    aliases = {
        "balear": "balearic",
        "balearic": "balearic",
        "central": "central",
        "northern": "northern",
        "septentrional": "northern",
        "northwestern": "northwestern",
        "nord-occidental": "northwestern",
        "occidental": "northwestern",
        "valencia": "valencian",
        "valencian": "valencian",
        "valencià": "valencian",
    }
    return aliases.get(text)


def download_tsv(dataset: str, filename: str) -> Path:
    return Path(hf_hub_download(repo_id=dataset, repo_type="dataset", filename=filename))


def read_tsv(dataset: str, filename: str) -> pd.DataFrame:
    path = download_tsv(dataset, filename)
    df = pd.read_csv(path, sep="\t", low_memory=False)
    df["source_dataset"] = dataset
    df["source_file"] = filename
    return df


def load_annotated_metadata() -> pd.DataFrame:
    frames = [read_tsv(ANNOTATED_DATASET, filename) for filename in ANNOTATED_FILES]
    df = pd.concat(frames, ignore_index=True)
    df["label"] = df["assigned_accent"].map(normalize_label)
    df = df[df["label"].isin(LABELS)].copy()
    available_columns = [column for column in KEEP_COLUMNS if column in df.columns]
    return df[available_columns + ["source_dataset", "source_file", "label"]].copy()


def load_benchmark_metadata() -> pd.DataFrame:
    frames = [read_tsv(BENCHMARK_DATASET, filename) for filename in BENCHMARK_FILES]
    df = pd.concat(frames, ignore_index=True)
    df["label"] = df["assigned_accent"].map(normalize_label)
    df = df[df["label"].isin(LABELS)].copy()
    available_columns = [column for column in KEEP_COLUMNS if column in df.columns]
    return df[available_columns + ["source_dataset", "source_file", "label"]].copy()


def drop_ambiguous_speakers(df: pd.DataFrame) -> tuple[pd.DataFrame, int]:
    speaker_label_counts = df.groupby("client_id")["label"].nunique()
    ambiguous = set(speaker_label_counts[speaker_label_counts > 1].index)
    if not ambiguous:
        return df, 0
    return df[~df["client_id"].isin(ambiguous)].copy(), len(ambiguous)


def choose_balanced_speakers(
    df: pd.DataFrame,
    max_speakers_per_accent: int,
    seed: int,
) -> tuple[dict[str, list[str]], int, dict[str, int]]:
    speakers_by_label = {
        label: sorted(df.loc[df["label"] == label, "client_id"].dropna().unique().tolist())
        for label in LABELS
    }
    available = {label: len(speakers) for label, speakers in speakers_by_label.items()}
    target = min(max_speakers_per_accent, min(available.values()))
    selected: dict[str, list[str]] = {}
    for label, speakers in speakers_by_label.items():
        sampled = pd.Series(speakers).sample(n=target, random_state=seed).tolist()
        selected[label] = sampled
    return selected, target, available


def assign_speaker_splits(
    selected_speakers: dict[str, list[str]],
    train_fraction: float,
    validation_fraction: float,
) -> dict[str, str]:
    assignments: dict[str, str] = {}
    for speakers in selected_speakers.values():
        n_total = len(speakers)
        n_train = int(round(n_total * train_fraction))
        n_validation = int(round(n_total * validation_fraction))
        # Keep at least one speaker in each non-train split when possible.
        if n_total >= 10:
            n_validation = max(1, n_validation)
            n_calibration = max(1, n_total - n_train - n_validation)
            while n_train + n_validation + n_calibration > n_total:
                n_train -= 1
        else:
            n_calibration = n_total - n_train - n_validation

        for speaker in speakers[:n_train]:
            assignments[speaker] = "train"
        for speaker in speakers[n_train : n_train + n_validation]:
            assignments[speaker] = "validation"
        for speaker in speakers[n_train + n_validation :]:
            assignments[speaker] = "calibration"
    return assignments


def cap_clips_per_speaker(df: pd.DataFrame, max_clips: int, seed: int) -> pd.DataFrame:
    parts = []
    for _, group in df.groupby("client_id", sort=False):
        if len(group) > max_clips:
            group = group.sample(n=max_clips, random_state=seed)
        parts.append(group)
    return pd.concat(parts, ignore_index=True) if parts else df.iloc[0:0].copy()


def summarize_split(df: pd.DataFrame) -> SplitSummary:
    return SplitSummary(
        rows=int(len(df)),
        speakers=int(df["client_id"].nunique()) if len(df) else 0,
        rows_by_label={label: int((df["label"] == label).sum()) for label in LABELS},
        speakers_by_label={
            label: int(df.loc[df["label"] == label, "client_id"].nunique()) for label in LABELS
        },
    )


def write_markdown(summary: ManifestSummary, path: Path) -> None:
    lines = [
        "# Balanced Manifest Summary",
        "",
        f"- Seed: `{summary.seed}`",
        f"- Max speakers per accent requested: `{summary.max_speakers_per_accent}`",
        f"- Selected speakers per accent: `{summary.selected_speakers_per_accent}`",
        f"- Max clips per speaker: `{summary.max_clips_per_speaker}`",
        f"- Benchmark reserved speakers: `{summary.benchmark_reserved_speakers}`",
        f"- Ambiguous speakers dropped: `{summary.ambiguous_speakers_dropped}`",
        f"- Source rows after filtering: `{summary.source_rows_after_filtering}`",
        f"- Available speakers by label: `{summary.available_speakers_by_label}`",
        "",
        "## Splits",
        "",
    ]
    for split_name, split_summary in summary.splits.items():
        lines.extend(
            [
                f"### `{split_name}`",
                "",
                f"- Rows: `{split_summary.rows}`",
                f"- Speakers: `{split_summary.speakers}`",
                f"- Rows by label: `{split_summary.rows_by_label}`",
                f"- Speakers by label: `{split_summary.speakers_by_label}`",
                "",
            ]
        )

    lines.extend(
        [
            "## Leakage Checks",
            "",
            f"- Speaker overlap between train/validation/calibration: `{summary.leakage_checks['internal_speaker_overlap']}`",
            f"- Speaker overlap with benchmark: `{summary.leakage_checks['benchmark_speaker_overlap']}`",
            "",
        ]
    )
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out-dir", type=Path, default=Path("manifests"))
    parser.add_argument("--seed", type=int, default=13)
    parser.add_argument("--max-speakers-per-accent", type=int, default=100)
    parser.add_argument("--max-clips-per-speaker", type=int, default=10)
    parser.add_argument("--train-fraction", type=float, default=0.70)
    parser.add_argument("--validation-fraction", type=float, default=0.15)
    args = parser.parse_args()

    args.out_dir.mkdir(parents=True, exist_ok=True)

    source = load_annotated_metadata()
    benchmark = load_benchmark_metadata()
    benchmark_speakers = set(benchmark["client_id"].dropna().unique())

    source = source[~source["client_id"].isin(benchmark_speakers)].copy()
    source, ambiguous_dropped = drop_ambiguous_speakers(source)

    selected_speakers, selected_count, available = choose_balanced_speakers(
        source,
        max_speakers_per_accent=args.max_speakers_per_accent,
        seed=args.seed,
    )
    selected_speaker_set = {speaker for speakers in selected_speakers.values() for speaker in speakers}
    assignments = assign_speaker_splits(
        selected_speakers,
        train_fraction=args.train_fraction,
        validation_fraction=args.validation_fraction,
    )

    manifest = source[source["client_id"].isin(selected_speaker_set)].copy()
    manifest["split"] = manifest["client_id"].map(assignments)
    manifest = cap_clips_per_speaker(manifest, args.max_clips_per_speaker, args.seed)
    manifest = manifest.sort_values(["split", "label", "client_id", "path"]).reset_index(drop=True)

    split_frames = {
        split: manifest[manifest["split"] == split].copy()
        for split in ["train", "validation", "calibration"]
    }
    for split, frame in split_frames.items():
        frame.to_csv(args.out_dir / f"{split}.csv", index=False)

    benchmark_manifest = benchmark.sort_values(["label", "source_file", "client_id", "path"]).reset_index(drop=True)
    benchmark_manifest.to_csv(args.out_dir / "benchmark.csv", index=False)
    manifest.to_csv(args.out_dir / "all_internal.csv", index=False)

    split_speakers = {
        split: set(frame["client_id"].dropna().unique()) for split, frame in split_frames.items()
    }
    internal_overlap = {
        "train_validation": len(split_speakers["train"] & split_speakers["validation"]),
        "train_calibration": len(split_speakers["train"] & split_speakers["calibration"]),
        "validation_calibration": len(split_speakers["validation"] & split_speakers["calibration"]),
    }
    internal_speakers = set(manifest["client_id"].dropna().unique())
    benchmark_overlap = len(internal_speakers & benchmark_speakers)

    summary = ManifestSummary(
        seed=args.seed,
        max_speakers_per_accent=args.max_speakers_per_accent,
        max_clips_per_speaker=args.max_clips_per_speaker,
        selected_speakers_per_accent=selected_count,
        benchmark_reserved_speakers=len(benchmark_speakers),
        ambiguous_speakers_dropped=ambiguous_dropped,
        source_rows_after_filtering=int(len(source)),
        available_speakers_by_label=available,
        splits={split: summarize_split(frame) for split, frame in split_frames.items()},
        leakage_checks={
            "internal_speaker_overlap": internal_overlap,
            "benchmark_speaker_overlap": benchmark_overlap,
        },
    )
    (args.out_dir / "summary.json").write_text(
        json.dumps(asdict(summary), indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    write_markdown(summary, args.out_dir / "summary.md")
    print(f"Wrote manifests to {args.out_dir}")
    print(f"Selected {selected_count} speakers per accent")


if __name__ == "__main__":
    main()
