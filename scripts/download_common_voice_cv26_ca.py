#!/usr/bin/env python3
"""Download Common Voice Scripted Speech 26.0 - Catalan from Mozilla Data Collective.

Dataset:
  - ID: cmqim2ln300tcnq070ylazhfe
  - Slug: common-voice-scripted-speech-26-0-catala-fe69b989
  - Archive: common-voice-scripted-speech-26-0-catala-fe69b989.tar.gz (~79 GB)

The datacollective SDK resumes interrupted downloads automatically. If the
transfer stops, rerun this script with the same download directory. Partial
.part and .checksum files are kept until the archive is complete.

Requires MDC_API_KEY in .env (see .env.example).
"""

from __future__ import annotations

import argparse
import os
import shutil
import sys
from pathlib import Path

DATASET_ID = "cmqim2ln300tcnq070ylazhfe"
DATASET_SLUG = "common-voice-scripted-speech-26-0-catala-fe69b989"
DEFAULT_DOWNLOAD_DIR = Path("data/raw")
ARCHIVE_NAME = f"{DATASET_SLUG}.tar.gz"
EXPECTED_ARCHIVE_BYTES = 79_210_000_000  # ~79.21 GB from the datasheet


def _load_env(project_root: Path) -> None:
    env_path = project_root / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def _format_bytes(num_bytes: int) -> str:
    units = ["B", "KB", "MB", "GB", "TB"]
    size = float(num_bytes)
    for unit in units:
        if size < 1024 or unit == units[-1]:
            return f"{size:.2f} {unit}"
        size /= 1024
    return f"{num_bytes} B"


def _print_resume_state(download_dir: Path) -> None:
    archive_path = download_dir / ARCHIVE_NAME
    part_path = download_dir / f"{ARCHIVE_NAME}.part"
    checksum_path = download_dir / f"{ARCHIVE_NAME}.checksum"

    if archive_path.exists():
        print(f"Found completed archive: {archive_path} ({_format_bytes(archive_path.stat().st_size)})")
        return

    if part_path.exists():
        part_size = part_path.stat().st_size
        pct = 100.0 * part_size / EXPECTED_ARCHIVE_BYTES if EXPECTED_ARCHIVE_BYTES else 0.0
        print(
            "Found partial download: "
            f"{part_path} ({_format_bytes(part_size)}, ~{pct:.1f}% of expected archive size)"
        )
        if checksum_path.exists():
            print("Resume metadata found (.checksum). Rerunning will continue from the last byte.")
        else:
            print("No .checksum file found. The SDK may restart the download from scratch.")
    else:
        print("No existing archive or partial download found. Starting fresh.")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--download-dir",
        type=Path,
        default=DEFAULT_DOWNLOAD_DIR,
        help="Directory for the tar.gz archive (default: data/raw)",
    )
    parser.add_argument(
        "--dataset-id",
        default=DATASET_ID,
        help="MDC dataset ID or slug",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Delete any existing archive and restart the download",
    )
    parser.add_argument(
        "--no-logging",
        action="store_true",
        help="Disable SDK file logging",
    )
    args = parser.parse_args()

    project_root = Path(__file__).resolve().parents[1]
    _load_env(project_root)

    api_key = os.environ.get("MDC_API_KEY", "").strip()
    if not api_key:
        print(
            "Missing MDC_API_KEY.\n"
            f"Paste your key into {project_root / '.env'} and rerun.\n"
            f"Template: {project_root / '.env.example'}",
            file=sys.stderr,
        )
        return 1

    download_dir = args.download_dir if args.download_dir.is_absolute() else project_root / args.download_dir
    download_dir.mkdir(parents=True, exist_ok=True)
    os.environ["MDC_DOWNLOAD_PATH"] = str(download_dir)

    free_bytes = shutil.disk_usage(download_dir).free
    print(f"Download directory: {download_dir}")
    print(f"Free disk space:    {_format_bytes(free_bytes)}")
    if free_bytes < EXPECTED_ARCHIVE_BYTES:
        print(
            "Warning: free space is below the published archive size (~79 GB). "
            "Leave extra room if you plan to extract the tar.gz later.",
            file=sys.stderr,
        )

    archive_path = download_dir / ARCHIVE_NAME
    if args.overwrite:
        for path in (
            archive_path,
            download_dir / f"{ARCHIVE_NAME}.part",
            download_dir / f"{ARCHIVE_NAME}.checksum",
        ):
            if path.exists():
                path.unlink()
        print("Removed existing archive/partial files.")

    _print_resume_state(download_dir)

    try:
        from datacollective import download_dataset
    except ImportError:
        print(
            "Package 'datacollective' is not installed. Run:\n"
            "  pip install datacollective",
            file=sys.stderr,
        )
        return 1

    print(f"Downloading dataset {args.dataset_id} ...")
    print("If this stops, rerun the same command to resume.")
    result_path = download_dataset(
        args.dataset_id,
        download_directory=str(download_dir),
        show_progress=True,
        overwrite_existing=args.overwrite,
        enable_logging=not args.no_logging,
    )
    print(f"Done: {result_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
