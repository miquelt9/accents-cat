#!/usr/bin/env python3
"""Build a small upload bundle for CV26 cloud notebook runs.

The full Common Voice 26 Catalan archive is too large for Colab/Kaggle uploads.
This script prepares only the clips (or pre-computed embeddings) needed for a
smoke or full_1440 run, then zips the minimal files for Drive/Kaggle upload.

Bundle types:
- audio: manifest + prepared MP3s (cloud still runs HuBERT extraction)
- embeddings: manifest + prepared_manifest + embedding index + vectors (smallest;
  cloud skips audio extraction and embedding extraction)
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import zipfile
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import pandas as pd


RUN_CONFIGS: dict[str, dict[str, Any]] = {
    "smoke": {
        "run_tag": "cv26-cloud-smoke",
        "max_speakers_per_label": 25,
        "max_clips_per_speaker": 2,
        "legacy_manifest": None,
        "legacy_audio_dir": None,
        "legacy_embeddings_dir": None,
    },
    "full_1440": {
        "run_tag": "cv26-train-1440-cloud",
        "max_speakers_per_label": 150,
        "max_clips_per_speaker": 3,
        "legacy_manifest": Path("manifests/cv26_train_2250.csv"),
        "legacy_audio_dir": Path("data/audio/cv26-train-1440"),
        "legacy_embeddings_dir": Path("embeddings/cv26-train-1440"),
    },
}


@dataclass
class BundleManifest:
    mode: str
    bundle_type: str
    run_tag: str
    rows: int
    manifest_path: str
    prepared_manifest_path: str
    audio_dir: str
    embeddings_dir: str
    embedding_index_path: str | None
    model_name: str
    created_from_archive: str | None


def repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def run_cmd(args: list[str], cwd: Path) -> None:
    print("$", " ".join(args))
    subprocess.run(args, cwd=cwd, check=True)


def count_prepared_rows(prepared_manifest: Path) -> int:
    if not prepared_manifest.exists():
        return 0
    df = pd.read_csv(prepared_manifest)
    if "audio_prepared" in df.columns:
        return int(df["audio_prepared"].astype(bool).sum())
    return int(len(df))


def copy_tree(src: Path, dst: Path) -> None:
    if not src.exists():
        raise FileNotFoundError(f"Missing source path: {src}")
    if src.is_file():
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        return
    for path in src.rglob("*"):
        if path.is_dir():
            continue
        target = dst / path.relative_to(src)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)


def rewrite_prepared_manifest_paths(
    prepared_manifest: Path,
    audio_dir: Path,
    path_root: Path,
) -> None:
    df = pd.read_csv(prepared_manifest)
    if "audio_path" in df.columns:
        df["audio_path"] = df["path"].map(
            lambda value: str((audio_dir / value).relative_to(path_root))
        )
    df.to_csv(prepared_manifest, index=False)


def rewrite_embedding_index_paths(
    embedding_index: Path,
    *,
    audio_dir: Path,
    embeddings_dir: Path,
    path_root: Path,
) -> None:
    if not embedding_index.exists():
        return
    df = pd.read_csv(embedding_index)
    vectors_dir = embeddings_dir / "vectors"
    if "path" in df.columns:
        df["audio_path"] = df["path"].map(
            lambda value: str((audio_dir / value).relative_to(path_root))
        )
        df["embedding_path"] = df["path"].map(
            lambda value: str((vectors_dir / f"{Path(value).stem}.npz").relative_to(path_root))
        )
    df.to_csv(embedding_index, index=False)


def stage_legacy_artifacts(
    *,
    root: Path,
    run_tag: str,
    legacy_manifest: Path | None,
    legacy_audio_dir: Path | None,
    legacy_embeddings_dir: Path | None,
    staging_root: Path,
) -> tuple[Path, Path, Path | None]:
    manifest_path = staging_root / "manifests" / f"{run_tag}.csv"
    audio_dir = staging_root / "data/audio" / run_tag
    embeddings_dir = staging_root / "embeddings" / run_tag

    if legacy_manifest is None or legacy_audio_dir is None:
        raise ValueError("Legacy artifact paths are required for --skip-prep reuse.")

    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(root / legacy_manifest, manifest_path)
    for suffix in (".summary.md", ".summary.json"):
        legacy_summary = root / legacy_manifest.with_suffix(suffix)
        if legacy_summary.exists():
            shutil.copy2(legacy_summary, manifest_path.with_suffix(suffix))

    copy_tree(root / legacy_audio_dir, audio_dir)
    prepared_manifest = audio_dir / "prepared_manifest.csv"
    rewrite_prepared_manifest_paths(prepared_manifest, audio_dir, staging_root)

    if legacy_embeddings_dir is not None and (root / legacy_embeddings_dir).exists():
        copy_tree(root / legacy_embeddings_dir, embeddings_dir)
        rewrite_embedding_index_paths(
            embeddings_dir / "embedding_index.csv",
            audio_dir=audio_dir,
            embeddings_dir=embeddings_dir,
            path_root=staging_root,
        )

    embedding_index = embeddings_dir / "embedding_index.csv"
    return manifest_path, prepared_manifest, embedding_index if embedding_index.exists() else None


def prepare_run(
    *,
    root: Path,
    mode: str,
    bundle_type: str,
    archive: Path,
    metadata_dir: Path,
    staging_root: Path,
    skip_prep: bool,
    model_name: str,
    device: str,
) -> BundleManifest:
    config = RUN_CONFIGS[mode]
    run_tag = str(config["run_tag"])
    manifest_path = staging_root / "manifests" / f"{run_tag}.csv"
    audio_dir = staging_root / "data/audio" / run_tag
    embeddings_dir = staging_root / "embeddings" / run_tag
    prepared_manifest = audio_dir / "prepared_manifest.csv"
    embedding_index = embeddings_dir / "embedding_index.csv"

    if skip_prep:
        legacy_manifest = config["legacy_manifest"]
        legacy_audio_dir = config["legacy_audio_dir"]
        if legacy_manifest and legacy_audio_dir and (root / legacy_audio_dir).exists():
            manifest_path, prepared_manifest, existing_index = stage_legacy_artifacts(
                root=root,
                run_tag=run_tag,
                legacy_manifest=Path(legacy_manifest),
                legacy_audio_dir=Path(legacy_audio_dir),
                legacy_embeddings_dir=Path(config["legacy_embeddings_dir"])
                if config["legacy_embeddings_dir"]
                else None,
                staging_root=staging_root,
            )
            if bundle_type == "embeddings" and existing_index is None:
                raise FileNotFoundError(
                    f"--skip-prep requested embeddings bundle, but no legacy embeddings exist for {mode}."
                )
            rows = count_prepared_rows(prepared_manifest)
            return BundleManifest(
                mode=mode,
                bundle_type=bundle_type,
                run_tag=run_tag,
                rows=rows,
                manifest_path=str(manifest_path.relative_to(staging_root)),
                prepared_manifest_path=str(prepared_manifest.relative_to(staging_root)),
                audio_dir=str(audio_dir.relative_to(staging_root)),
                embeddings_dir=str(embeddings_dir.relative_to(staging_root)),
                embedding_index_path=str(existing_index.relative_to(staging_root))
                if existing_index
                else None,
                model_name=model_name,
                created_from_archive=None,
            )
        if (
            manifest_path.exists()
            and prepared_manifest.exists()
            and count_prepared_rows(prepared_manifest) > 0
        ):
            if bundle_type == "embeddings" and not embedding_index.exists():
                raise FileNotFoundError(
                    f"Prepared audio exists at {prepared_manifest}, but embeddings are missing."
                )
            rows = count_prepared_rows(prepared_manifest)
            return BundleManifest(
                mode=mode,
                bundle_type=bundle_type,
                run_tag=run_tag,
                rows=rows,
                manifest_path=str(manifest_path.relative_to(staging_root)),
                prepared_manifest_path=str(prepared_manifest.relative_to(staging_root)),
                audio_dir=str(audio_dir.relative_to(staging_root)),
                embeddings_dir=str(embeddings_dir.relative_to(staging_root)),
                embedding_index_path=str(embedding_index.relative_to(staging_root))
                if embedding_index.exists()
                else None,
                model_name=model_name,
                created_from_archive=str(archive) if archive.exists() else None,
            )
        raise FileNotFoundError(
            f"--skip-prep set, but no reusable artifacts found for mode={mode!r}."
        )

    if not archive.exists():
        raise FileNotFoundError(
            f"Archive not found: {archive}. Place the CV26 Catalan tar.gz at data/raw/ "
            "or pass --archive explicitly."
        )
    if not (metadata_dir / "train.tsv").exists():
        raise FileNotFoundError(
            f"Missing {metadata_dir / 'train.tsv'}. Extract CV26 metadata locally first."
        )

    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    run_cmd(
        [
            sys.executable,
            "scripts/build_cv26_balanced_manifest.py",
            "--metadata-dir",
            str(metadata_dir),
            "--source-split",
            "train",
            "--out-manifest",
            str(manifest_path),
            "--max-speakers-per-label",
            str(config["max_speakers_per_label"]),
            "--max-clips-per-speaker",
            str(config["max_clips_per_speaker"]),
            "--seed",
            "13",
        ],
        cwd=root,
    )

    run_cmd(
        [
            sys.executable,
            "scripts/prepare_cv26_audio_from_archive.py",
            "--archive",
            str(archive),
            "--manifest",
            str(manifest_path),
            "--out-dir",
            str(audio_dir),
        ],
        cwd=root,
    )

    rows = count_prepared_rows(prepared_manifest)
    if rows == 0:
        raise RuntimeError(f"No audio prepared for {mode}; check archive and manifest.")

    rewrite_prepared_manifest_paths(prepared_manifest, audio_dir, staging_root)

    if bundle_type == "embeddings":
        run_cmd(
            [
                sys.executable,
                "scripts/extract_hubert_embeddings.py",
                "--prepared-manifest",
                str(prepared_manifest),
                "--out-dir",
                str(embeddings_dir),
                "--model-name",
                model_name,
                "--device",
                device,
                "--force-exit",
            ],
            cwd=root,
        )
        rewrite_embedding_index_paths(
            embedding_index,
            audio_dir=audio_dir,
            embeddings_dir=embeddings_dir,
            path_root=staging_root,
        )

    return BundleManifest(
        mode=mode,
        bundle_type=bundle_type,
        run_tag=run_tag,
        rows=rows,
        manifest_path=str(manifest_path.relative_to(staging_root)),
        prepared_manifest_path=str(prepared_manifest.relative_to(staging_root)),
        audio_dir=str(audio_dir.relative_to(staging_root)),
        embeddings_dir=str(embeddings_dir.relative_to(staging_root)),
        embedding_index_path=str(embedding_index.relative_to(staging_root))
        if embedding_index.exists()
        else None,
        model_name=model_name,
        created_from_archive=str(archive),
    )


def collect_bundle_paths(staging_root: Path, bundle: BundleManifest) -> list[Path]:
    paths: list[Path] = [
        staging_root / bundle.manifest_path,
        staging_root / bundle.prepared_manifest_path,
        staging_root / bundle.audio_dir / "summary.json",
    ]
    for suffix in (".summary.md", ".summary.json"):
        summary = staging_root / Path(bundle.manifest_path).with_suffix(suffix)
        if summary.exists():
            paths.append(summary)

    audio_dir = staging_root / bundle.audio_dir
    if bundle.bundle_type == "audio":
        paths.extend(sorted(audio_dir.glob("*.mp3")))
    elif bundle.bundle_type == "embeddings":
        embeddings_dir = staging_root / bundle.embeddings_dir
        index_path = staging_root / (bundle.embedding_index_path or "")
        if index_path.exists():
            paths.append(index_path)
        summary_path = embeddings_dir / "summary.json"
        if summary_path.exists():
            paths.append(summary_path)
        paths.extend(sorted((embeddings_dir / "vectors").glob("*.npz")))
    else:
        raise ValueError(f"Unknown bundle type: {bundle.bundle_type}")

    return [path for path in paths if path.exists()]


def write_zip(paths: list[Path], staging_root: Path, out_zip: Path, bundle: BundleManifest) -> int:
    out_zip.parent.mkdir(parents=True, exist_ok=True)
    manifest_path = staging_root / "bundle_manifest.json"
    manifest_path.write_text(json.dumps(asdict(bundle), indent=2, ensure_ascii=False), encoding="utf-8")

    with zipfile.ZipFile(out_zip, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.write(manifest_path, arcname="bundle_manifest.json")
        for path in paths:
            zf.write(path, arcname=str(path.relative_to(staging_root)))
    return out_zip.stat().st_size


def human_size(num_bytes: int) -> str:
    units = ["B", "KB", "MB", "GB"]
    size = float(num_bytes)
    for unit in units:
        if size < 1024 or unit == units[-1]:
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{num_bytes} B"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=sorted(RUN_CONFIGS), required=True)
    parser.add_argument("--bundle-type", choices=["audio", "embeddings"], required=True)
    parser.add_argument(
        "--archive",
        type=Path,
        default=Path("data/raw/common-voice-scripted-speech-26-0-catala-fe69b989.tar.gz"),
    )
    parser.add_argument("--metadata-dir", type=Path, default=Path("data/metadata/cv26-ca"))
    parser.add_argument(
        "--staging-root",
        type=Path,
        default=Path("data/cloud_bundles/staging"),
        help="Workspace where run artifacts are assembled before zipping.",
    )
    parser.add_argument(
        "--out-zip",
        type=Path,
        help="Output zip path. Defaults to data/cloud_bundles/<mode>-<bundle_type>.zip",
    )
    parser.add_argument("--model-name", default="BSC-LT/hubert-base-ca-2k")
    parser.add_argument("--device", default="cpu", help="Device for local embedding extraction.")
    parser.add_argument(
        "--skip-prep",
        action="store_true",
        help="Reuse existing staged or legacy artifacts instead of scanning the archive again.",
    )
    args = parser.parse_args()

    root = repo_root()
    archive = args.archive if args.archive.is_absolute() else root / args.archive
    metadata_dir = args.metadata_dir if args.metadata_dir.is_absolute() else root / args.metadata_dir
    staging_root = args.staging_root if args.staging_root.is_absolute() else root / args.staging_root
    out_zip = args.out_zip
    if out_zip is None:
        out_zip = root / "data/cloud_bundles" / f"{args.mode}-{args.bundle_type}.zip"
    elif not out_zip.is_absolute():
        out_zip = root / out_zip

    bundle = prepare_run(
        root=root,
        mode=args.mode,
        bundle_type=args.bundle_type,
        archive=archive,
        metadata_dir=metadata_dir,
        staging_root=staging_root,
        skip_prep=args.skip_prep,
        model_name=args.model_name,
        device=args.device,
    )
    paths = collect_bundle_paths(staging_root, bundle)
    zip_bytes = write_zip(paths, staging_root, out_zip, bundle)

    print(
        json.dumps(
            {
                "mode": bundle.mode,
                "bundle_type": bundle.bundle_type,
                "run_tag": bundle.run_tag,
                "rows": bundle.rows,
                "files": len(paths) + 1,
                "zip_path": str(out_zip),
                "zip_size": zip_bytes,
                "zip_size_human": human_size(zip_bytes),
            },
            indent=2,
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
