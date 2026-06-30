#!/usr/bin/env python3
"""Audit AINA Common Voice accent metadata directly from TSV files.

This avoids the legacy Hugging Face dataset scripts and downloads only metadata
TSVs from the dataset repos, not audio archives.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any

import pandas as pd
from huggingface_hub import hf_hub_download


TARGET_LABELS = {"balearic", "central", "northern", "northwestern", "valencian"}

TSV_FILES = [
    {
        "dataset": "projecte-aina/annotated_catalan_common_voice_v17",
        "role": "primary_supervised",
        "files": [
            "corpus/files/annotated_train.tsv",
            "corpus/files/annotated_dev.tsv",
            "corpus/files/annotated_test.tsv",
            "corpus/files/annotated_validated.tsv",
        ],
    },
    {
        "dataset": "projecte-aina/commonvoice_benchmark_catalan_accents",
        "role": "held_out_benchmark",
        "files": [
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
            "corpus/files/train.tsv",
        ],
    },
]


def normalize_label(value: Any) -> str | None:
    if value is None or pd.isna(value):
        return None
    text = str(value).strip().lower().replace("_", "-")
    if not text:
        return None
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


def best_label_column(columns: list[str]) -> str | None:
    for column in [
        "assigned_accent",
        "annotated_accent",
        "propagated_accents_normalized",
        "accent",
        "accents",
        "variant",
    ]:
        if column in columns:
            return column
    return None


def audit_file(dataset: str, filename: str, max_rows: int | None) -> dict[str, Any]:
    path = hf_hub_download(repo_id=dataset, repo_type="dataset", filename=filename)
    df = pd.read_csv(path, sep="\t", nrows=max_rows, low_memory=False)
    columns = list(df.columns)
    label_column = best_label_column(columns)
    speaker_column = "client_id" if "client_id" in columns else None

    normalized = []
    if label_column:
        normalized = [normalize_label(value) for value in df[label_column]]

    label_counts = Counter(label for label in normalized if label)
    raw_counts = Counter(str(value).strip().lower() for value in df[label_column].dropna()) if label_column else Counter()

    speaker_counts = {}
    if speaker_column and label_column:
        temp = df[[speaker_column]].copy()
        temp["normalized_label"] = normalized
        temp = temp.dropna(subset=["normalized_label", speaker_column])
        speaker_counts = {
            label: int(temp.loc[temp["normalized_label"] == label, speaker_column].nunique())
            for label in sorted(TARGET_LABELS)
        }

    label_source_counts = {}
    if "annotated_accent" in df.columns:
        label_source_counts["expert_annotated_non_empty"] = int(df["annotated_accent"].fillna("").astype(str).str.strip().ne("").sum())
    if "assigned_accent" in df.columns:
        label_source_counts["assigned_accent_non_empty"] = int(df["assigned_accent"].fillna("").astype(str).str.strip().ne("").sum())
    if "propagated_accents_normalized" in df.columns:
        label_source_counts["propagated_non_empty"] = int(
            df["propagated_accents_normalized"].fillna("").astype(str).str.strip().ne("").sum()
        )

    return {
        "dataset": dataset,
        "file": filename,
        "scanned_rows": int(len(df)),
        "columns": columns,
        "label_column": label_column,
        "speaker_column": speaker_column,
        "normalized_label_counts": dict(label_counts),
        "raw_label_counts_top20": dict(raw_counts.most_common(20)),
        "speaker_counts_by_label": speaker_counts,
        "label_source_counts": label_source_counts,
    }


def write_markdown(results: list[dict[str, Any]], path: Path) -> None:
    lines = [
        "# AINA TSV Metadata Audit",
        "",
        "This report downloads TSV metadata only. It does not download audio.",
        "",
    ]
    for result in results:
        lines.extend(
            [
                f"## {result['dataset']} / `{result['file']}`",
                "",
                f"- Scanned rows: {result['scanned_rows']}",
                f"- Label column: `{result['label_column']}`",
                f"- Speaker column: `{result['speaker_column']}`",
                f"- Normalized label counts: `{result['normalized_label_counts']}`",
                f"- Speaker counts by label: `{result['speaker_counts_by_label']}`",
                f"- Label source counts: `{result['label_source_counts']}`",
                "",
            ]
        )
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-rows", type=int, default=None)
    parser.add_argument("--out-dir", type=Path, default=Path("reports"))
    args = parser.parse_args()

    args.out_dir.mkdir(parents=True, exist_ok=True)
    results = []
    for group in TSV_FILES:
        for filename in group["files"]:
            results.append(audit_file(group["dataset"], filename, args.max_rows))

    json_path = args.out_dir / "aina_tsv_metadata_audit.json"
    md_path = args.out_dir / "aina_tsv_metadata_audit.md"
    json_path.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
    write_markdown(results, md_path)
    print(f"Wrote {json_path}")
    print(f"Wrote {md_path}")


if __name__ == "__main__":
    main()
