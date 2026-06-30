#!/usr/bin/env python3
"""Build speaker-balanced Common Voice 26 Catalan manifests.

This reads extracted CV26 TSV metadata only. It does not touch audio. The
default policy is intentionally conservative for the next scale-up experiment:

- use `train.tsv` for training;
- map `variant` first, with a controlled `accents` fallback;
- exclude `Tortosi` labels for now;
- balance by speaker, then cap clips per speaker.
"""

from __future__ import annotations

import argparse
import csv
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import pandas as pd


LABELS = ["balearic", "central", "northern", "northwestern", "valencian"]
KEEP_COLUMNS = [
    "client_id",
    "path",
    "sentence_id",
    "sentence",
    "sentence_domain",
    "up_votes",
    "down_votes",
    "age",
    "gender",
    "accents",
    "variant",
    "locale",
    "segment",
]


@dataclass
class Cv26ManifestSummary:
    source_tsv: str
    out_manifest: str
    seed: int
    max_speakers_per_label: int
    max_clips_per_speaker: int
    selected_speakers_per_label: int
    rows: int
    speakers: int
    rows_by_label: dict[str, int]
    speakers_by_label: dict[str, int]
    available_speakers_by_label: dict[str, int]
    excluded_reserved_speakers: int
    reserved_speaker_manifests: list[str]
    excluded_ambiguous_speakers: int
    label_policy: str


def normalize_text(value: Any) -> str:
    return " ".join(str(value or "").strip().lower().replace("_", " ").replace("-", " ").split())


def expanded_label(value: Any) -> str | None:
    text = normalize_text(value)
    if not text:
        return None
    if text in {"balear", "balearic"} or text in {"mallorqui", "mallorquí", "menorqui", "menorquí", "eivissenc"}:
        return "balearic"
    if text in {"central", "barceloni", "barceloní", "gironi", "gironí", "camp de tarragona", "catala central", "català central"}:
        return "central"
    if text in {"septentrional", "northern", "nord oriental"}:
        return "northern"
    if text in {"nord occidental", "northwestern", "occidental", "lleidata", "lleidatà"}:
        return "northwestern"
    if text == "tortosi" or text == "tortosí" or "tortosi" in text or "tortosí" in text:
        return None
    if (
        text in {"valencia", "valencià", "valencian", "alacanti", "alacantí"}
        or text.startswith("valencia ")
        or text.startswith("valencià ")
        or "la vall d'albaida" in text
    ):
        return "valencian"
    return None


def choose_label(row: pd.Series) -> str | None:
    return expanded_label(row.get("variant")) or expanded_label(row.get("accents"))


def read_cv26_tsv(path: Path) -> pd.DataFrame:
    df = pd.read_csv(
        path,
        sep="\t",
        dtype=str,
        keep_default_na=False,
        quoting=csv.QUOTE_NONE,
        on_bad_lines="skip",
        low_memory=False,
    )
    available = [column for column in KEEP_COLUMNS if column in df.columns]
    df = df[available].copy()
    df["label"] = df.apply(choose_label, axis=1)
    df = df[df["label"].isin(LABELS)].copy()
    df["source_dataset"] = "common_voice_26_ca"
    df["source_file"] = path.name
    df["archive_member"] = "cv-corpus-26.0-2026-06-12/ca/clips/" + df["path"].astype(str)
    return df


def reserved_speakers(paths: list[Path]) -> set[str]:
    speakers: set[str] = set()
    for path in paths:
        if not path.exists():
            continue
        df = pd.read_csv(path, usecols=["client_id"])
        speakers.update(df["client_id"].dropna().astype(str).unique().tolist())
    return speakers


def drop_ambiguous_speakers(df: pd.DataFrame) -> tuple[pd.DataFrame, int]:
    label_counts = df.groupby("client_id")["label"].nunique()
    ambiguous = set(label_counts[label_counts > 1].index)
    if not ambiguous:
        return df, 0
    return df[~df["client_id"].isin(ambiguous)].copy(), len(ambiguous)


def select_speakers(df: pd.DataFrame, max_speakers: int, seed: int) -> tuple[dict[str, list[str]], int, dict[str, int]]:
    speakers_by_label = {
        label: sorted(df.loc[df["label"] == label, "client_id"].dropna().unique().tolist())
        for label in LABELS
    }
    available = {label: len(speakers) for label, speakers in speakers_by_label.items()}
    target = min(max_speakers, min(available.values()))
    selected = {}
    for label, speakers in speakers_by_label.items():
        selected[label] = pd.Series(speakers).sample(n=target, random_state=seed).tolist()
    return selected, target, available


def cap_clips_per_speaker(df: pd.DataFrame, max_clips: int, seed: int) -> pd.DataFrame:
    parts = []
    for _, group in df.groupby("client_id", sort=False):
        if len(group) > max_clips:
            group = group.sample(n=max_clips, random_state=seed)
        parts.append(group)
    return pd.concat(parts, ignore_index=True) if parts else df.iloc[0:0].copy()


def summarize(df: pd.DataFrame, label: str) -> dict[str, int]:
    return {name: int((df[label] == name).sum()) for name in LABELS}


def summarize_speakers(df: pd.DataFrame) -> dict[str, int]:
    return {label: int(df.loc[df["label"] == label, "client_id"].nunique()) for label in LABELS}


def write_markdown(summary: Cv26ManifestSummary, path: Path) -> None:
    lines = [
        "# CV26 Balanced Manifest Summary",
        "",
        f"- Source TSV: `{summary.source_tsv}`",
        f"- Output manifest: `{summary.out_manifest}`",
        f"- Seed: `{summary.seed}`",
        f"- Label policy: {summary.label_policy}",
        f"- Max speakers per label requested: `{summary.max_speakers_per_label}`",
        f"- Selected speakers per label: `{summary.selected_speakers_per_label}`",
        f"- Max clips per speaker: `{summary.max_clips_per_speaker}`",
        f"- Reserved speaker manifests: `{summary.reserved_speaker_manifests}`",
        f"- Reserved speakers excluded: `{summary.excluded_reserved_speakers}`",
        f"- Ambiguous speakers excluded: `{summary.excluded_ambiguous_speakers}`",
        "",
        "| Label | Rows | Speakers | Available Speakers |",
        "| --- | ---: | ---: | ---: |",
    ]
    for label in LABELS:
        lines.append(
            f"| `{label}` | {summary.rows_by_label[label]} | {summary.speakers_by_label[label]} | {summary.available_speakers_by_label[label]} |"
        )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--metadata-dir", type=Path, default=Path("data/metadata/cv26-ca"))
    parser.add_argument("--source-split", choices=["train", "dev", "test"], default="train")
    parser.add_argument("--out-manifest", type=Path, default=Path("manifests/cv26_train_2250.csv"))
    parser.add_argument("--max-speakers-per-label", type=int, default=150)
    parser.add_argument("--max-clips-per-speaker", type=int, default=3)
    parser.add_argument("--seed", type=int, default=13)
    parser.add_argument(
        "--reserved-speakers-manifest",
        type=Path,
        action="append",
        default=None,
        help="Manifest whose speakers should be excluded. May be passed more than once.",
    )
    args = parser.parse_args()

    source_tsv = args.metadata_dir / f"{args.source_split}.tsv"
    df = read_cv26_tsv(source_tsv)
    reserved_manifest_paths = args.reserved_speakers_manifest or [Path("manifests/benchmark.csv")]
    reserved = reserved_speakers(reserved_manifest_paths)
    before_reserved = set(df["client_id"].dropna().unique().tolist())
    if reserved:
        df = df[~df["client_id"].isin(reserved)].copy()
    excluded_reserved = len(before_reserved & reserved)
    df, ambiguous_count = drop_ambiguous_speakers(df)
    selected, selected_count, available = select_speakers(df, args.max_speakers_per_label, args.seed)

    selected_frames = []
    for label, speakers in selected.items():
        label_df = df[(df["label"] == label) & (df["client_id"].isin(speakers))].copy()
        selected_frames.append(label_df)
    manifest = pd.concat(selected_frames, ignore_index=True)
    manifest = cap_clips_per_speaker(manifest, args.max_clips_per_speaker, args.seed)
    manifest = manifest.sample(frac=1, random_state=args.seed).reset_index(drop=True)

    args.out_manifest.parent.mkdir(parents=True, exist_ok=True)
    manifest.to_csv(args.out_manifest, index=False)

    summary = Cv26ManifestSummary(
        source_tsv=str(source_tsv),
        out_manifest=str(args.out_manifest),
        seed=args.seed,
        max_speakers_per_label=args.max_speakers_per_label,
        max_clips_per_speaker=args.max_clips_per_speaker,
        selected_speakers_per_label=selected_count,
        rows=int(len(manifest)),
        speakers=int(manifest["client_id"].nunique()),
        rows_by_label=summarize(manifest, "label"),
        speakers_by_label=summarize_speakers(manifest),
        available_speakers_by_label=available,
        excluded_reserved_speakers=excluded_reserved,
        reserved_speaker_manifests=[str(path) for path in reserved_manifest_paths],
        excluded_ambiguous_speakers=ambiguous_count,
        label_policy="expanded labels, variant first, controlled accents fallback, Tortosi excluded",
    )
    summary_path = args.out_manifest.with_suffix(".summary.md")
    json_path = args.out_manifest.with_suffix(".summary.json")
    write_markdown(summary, summary_path)
    json_path.write_text(json.dumps(asdict(summary), indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(asdict(summary), indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
