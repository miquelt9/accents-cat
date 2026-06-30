#!/usr/bin/env python3
"""Audit Catalan speech datasets before downloading large audio archives.

The goal is to answer research-planning questions:
- Which columns and splits are available?
- Which datasets expose dialect/accent labels?
- How many labeled clips and speakers exist per macro dialect?
- Are labels expert annotated, propagated, or only self-declared?

The script prefers streaming and samples a bounded number of rows per split by
default. Increase --max-rows-per-split for a deeper local audit.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Iterable

from datasets import Audio, get_dataset_config_names, get_dataset_split_names, load_dataset
from tqdm import tqdm


TARGET_ACCENTS = {
    "balearic",
    "balear",
    "central",
    "northern",
    "northwestern",
    "nord-occidental",
    "occidental",
    "valencian",
    "valencia",
    "valencià",
    "valenciano",
}

ACCENT_NORMALIZATION = {
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
    "valenciano": "valencian",
}

DATASETS = [
    {
        "id": "projecte-aina/annotated_catalan_common_voice_v17",
        "role": "primary supervised candidate",
        "trust_remote_code": True,
        "configs": ["default"],
        "splits": ["train", "validation", "test", "validated"],
        "accent_columns": [
            "assigned_accent",
            "annotated_accent",
            "propagated_accents_normalized",
            "accent",
            "accents",
            "variant",
        ],
        "speaker_columns": ["client_id", "speaker_id"],
    },
    {
        "id": "projecte-aina/commonvoice_benchmark_catalan_accents",
        "role": "held-out benchmark candidate",
        "trust_remote_code": True,
        "configs": ["default"],
        "splits": [
            "balearic_fem",
            "balearic_male",
            "central_female",
            "central_male",
            "northern_female",
            "northern_male",
            "northwestern_female",
            "northwestern_male",
            "valencian_female",
            "valencian_male",
        ],
        "accent_columns": [
            "assigned_accent",
            "annotated_accent",
            "propagated_accents_normalized",
            "accent",
            "accents",
            "variant",
        ],
        "speaker_columns": ["client_id", "speaker_id"],
    },
    {
        "id": "projecte-aina/LaFrescat",
        "role": "tiny clean sanity check",
        "configs": ["default"],
        "splits": ["train"],
        "accent_columns": ["accent"],
        "speaker_columns": ["speaker_id", "client_id"],
    },
    {
        "id": "BSC-LT/distilled-catalan-youtube-speech",
        "role": "pretraining/domain data only",
        "trust_remote_code": True,
        "configs": ["default"],
        "splits": ["perfect_matches", "word_count_matches", "validation", "test"],
        "accent_columns": ["accent", "accents", "variant"],
        "speaker_columns": ["client_id", "speaker_id", "source_id"],
    },
    {
        "id": "softcatala/catalan-youtube-speech",
        "role": "pretraining/domain data only",
        "configs": ["default"],
        "splits": ["train"],
        "accent_columns": ["accent", "accents", "variant"],
        "speaker_columns": ["client_id", "speaker_id", "source_id"],
    },
    {
        "id": "projecte-aina/corts_valencianes_asr_a",
        "role": "pretraining/asr only",
        "configs": ["default"],
        "splits": ["clean_train_short", "clean_dev_short", "clean_test_short"],
        "accent_columns": ["accent", "accents", "variant"],
        "speaker_columns": ["client_id", "speaker_id", "identifier"],
        "trust_remote_code": True,
    },
]


@dataclass
class SplitAudit:
    split: str
    scanned_rows: int
    columns: list[str]
    accent_column_used: str | None
    speaker_column_used: str | None
    label_counts: dict[str, int]
    normalized_label_counts: dict[str, int]
    labeled_speaker_counts: dict[str, int]
    distinct_speakers_seen: int | None
    example_rows: list[dict[str, Any]]
    warnings: list[str]


@dataclass
class DatasetAudit:
    dataset_id: str
    role: str
    configs: list[str]
    audited_config: str | None
    splits: list[SplitAudit]
    errors: list[str]


def normalize_label(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip().lower()
    if not text:
        return None
    text = text.replace("_", "-")
    # Common Voice variants often include ca- prefixes.
    if text.startswith("ca-"):
        text = text[3:]
    return ACCENT_NORMALIZATION.get(text, text if text in TARGET_ACCENTS else None)


def safe_json_value(value: Any) -> Any:
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, dict):
        # Avoid serializing decoded audio arrays.
        if {"path", "array", "sampling_rate"} & set(value.keys()):
            return {
                "path": value.get("path"),
                "sampling_rate": value.get("sampling_rate"),
                "array": "<omitted>",
            }
        return {str(k): safe_json_value(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [safe_json_value(v) for v in value[:10]]
    return str(value)


def first_existing(candidates: Iterable[str], columns: Iterable[str]) -> str | None:
    column_set = set(columns)
    return next((name for name in candidates if name in column_set), None)


def dataset_configs(dataset_id: str, trust_remote_code: bool) -> list[str]:
    try:
        return get_dataset_config_names(dataset_id, trust_remote_code=trust_remote_code)
    except Exception:
        return ["default"]


def dataset_splits(dataset_id: str, config: str | None, trust_remote_code: bool) -> list[str]:
    try:
        kwargs = {"trust_remote_code": trust_remote_code}
        if config and config != "default":
            return get_dataset_split_names(dataset_id, config, **kwargs)
        return get_dataset_split_names(dataset_id, **kwargs)
    except Exception:
        return ["train"]


def load_stream(dataset_id: str, config: str | None, split: str, trust_remote_code: bool):
    kwargs = {
        "split": split,
        "streaming": True,
        "trust_remote_code": trust_remote_code,
    }
    if config and config != "default":
        ds = load_dataset(dataset_id, config, **kwargs)
    else:
        ds = load_dataset(dataset_id, **kwargs)
    try:
        if getattr(ds, "features", None) and "audio" in ds.features:
            ds = ds.cast_column("audio", Audio(decode=False))
    except Exception:
        # Metadata audit should continue even if a dataset does not expose
        # castable features in streaming mode.
        pass
    return ds


def audit_split(
    dataset_meta: dict[str, Any],
    config: str | None,
    split: str,
    max_rows: int,
) -> SplitAudit:
    dataset_id = dataset_meta["id"]
    trust_remote_code = bool(dataset_meta.get("trust_remote_code", False))
    ds = load_stream(dataset_id, config, split, trust_remote_code)

    rows = iter(ds)
    first_row = next(rows, None)
    if first_row is None:
        return SplitAudit(
            split=split,
            scanned_rows=0,
            columns=[],
            accent_column_used=None,
            speaker_column_used=None,
            label_counts={},
            normalized_label_counts={},
            labeled_speaker_counts={},
            distinct_speakers_seen=None,
            example_rows=[],
            warnings=["split yielded no rows"],
        )

    columns = list(first_row.keys())
    accent_column = first_existing(dataset_meta["accent_columns"], columns)
    speaker_column = first_existing(dataset_meta["speaker_columns"], columns)
    warnings = []
    if accent_column is None:
        warnings.append("no accent/dialect label column found")
    if speaker_column is None:
        warnings.append("no speaker id column found")

    label_counts: Counter[str] = Counter()
    normalized_label_counts: Counter[str] = Counter()
    speakers_by_label: dict[str, set[str]] = defaultdict(set)
    all_speakers: set[str] = set()
    example_rows = []

    def consume(row: dict[str, Any]) -> None:
        if len(example_rows) < 3:
            example_rows.append({k: safe_json_value(v) for k, v in row.items() if k != "audio"})

        raw_label = row.get(accent_column) if accent_column else None
        normalized = normalize_label(raw_label)
        if raw_label is not None and str(raw_label).strip():
            label_counts[str(raw_label).strip().lower()] += 1
        if normalized:
            normalized_label_counts[normalized] += 1

        speaker = row.get(speaker_column) if speaker_column else None
        if speaker is not None and str(speaker).strip():
            speaker_id = str(speaker)
            all_speakers.add(speaker_id)
            if normalized:
                speakers_by_label[normalized].add(speaker_id)

    consume(first_row)
    scanned = 1
    for row in tqdm(rows, total=max_rows - 1, desc=f"{dataset_id}:{split}", leave=False):
        if scanned >= max_rows:
            break
        consume(row)
        scanned += 1

    return SplitAudit(
        split=split,
        scanned_rows=scanned,
        columns=columns,
        accent_column_used=accent_column,
        speaker_column_used=speaker_column,
        label_counts=dict(label_counts.most_common()),
        normalized_label_counts=dict(normalized_label_counts.most_common()),
        labeled_speaker_counts={k: len(v) for k, v in sorted(speakers_by_label.items())},
        distinct_speakers_seen=len(all_speakers) if speaker_column else None,
        example_rows=example_rows,
        warnings=warnings,
    )


def audit_dataset(dataset_meta: dict[str, Any], max_rows: int) -> DatasetAudit:
    dataset_id = dataset_meta["id"]
    errors: list[str] = []
    trust_remote_code = bool(dataset_meta.get("trust_remote_code", False))
    configs = dataset_meta.get("configs") or dataset_configs(dataset_id, trust_remote_code)
    config = configs[0] if configs else None

    split_audits: list[SplitAudit] = []
    try:
        splits = dataset_meta.get("splits") or dataset_splits(dataset_id, config, trust_remote_code)
    except Exception as exc:
        errors.append(f"could not list splits: {exc}")
        splits = []

    for split in splits:
        try:
            split_audits.append(audit_split(dataset_meta, config, split, max_rows))
        except Exception as exc:
            errors.append(f"{split}: {type(exc).__name__}: {exc}")

    return DatasetAudit(
        dataset_id=dataset_id,
        role=dataset_meta["role"],
        configs=configs,
        audited_config=config,
        splits=split_audits,
        errors=errors,
    )


def write_markdown_report(audits: list[DatasetAudit], path: Path) -> None:
    lines = [
        "# Catalan Speech Dataset Audit",
        "",
        "This report is generated from bounded streaming samples. Counts are exact only up to the scanned row limit.",
        "",
    ]
    for audit in audits:
        lines.extend(
            [
                f"## {audit.dataset_id}",
                "",
                f"- Planned role: {audit.role}",
                f"- Audited config: `{audit.audited_config}`",
                f"- Available configs: {', '.join(audit.configs) if audit.configs else 'unknown'}",
            ]
        )
        if audit.errors:
            lines.append(f"- Errors: {'; '.join(audit.errors)}")
        lines.append("")
        for split in audit.splits:
            lines.extend(
                [
                    f"### Split `{split.split}`",
                    "",
                    f"- Scanned rows: {split.scanned_rows}",
                    f"- Accent column used: `{split.accent_column_used}`",
                    f"- Speaker column used: `{split.speaker_column_used}`",
                    f"- Distinct speakers seen: {split.distinct_speakers_seen}",
                    f"- Warnings: {', '.join(split.warnings) if split.warnings else 'none'}",
                    f"- Normalized label counts: `{split.normalized_label_counts}`",
                    f"- Labeled speaker counts: `{split.labeled_speaker_counts}`",
                    "",
                ]
            )
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-rows-per-split", type=int, default=20_000)
    parser.add_argument("--out-dir", type=Path, default=Path("reports"))
    parser.add_argument(
        "--labeled-only",
        action="store_true",
        help="Audit only datasets with dialect/accent labels useful for supervised v1 work.",
    )
    args = parser.parse_args()

    args.out_dir.mkdir(parents=True, exist_ok=True)
    dataset_metas = DATASETS
    if args.labeled_only:
        dataset_metas = [
            meta
            for meta in DATASETS
            if meta["id"]
            in {
                "projecte-aina/annotated_catalan_common_voice_v17",
                "projecte-aina/commonvoice_benchmark_catalan_accents",
                "projecte-aina/LaFrescat",
            }
        ]
    audits = [audit_dataset(meta, args.max_rows_per_split) for meta in dataset_metas]

    json_path = args.out_dir / "dataset_audit.json"
    md_path = args.out_dir / "dataset_audit.md"
    json_path.write_text(
        json.dumps([asdict(audit) for audit in audits], indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    write_markdown_report(audits, md_path)
    print(f"Wrote {json_path}")
    print(f"Wrote {md_path}")


if __name__ == "__main__":
    main()
