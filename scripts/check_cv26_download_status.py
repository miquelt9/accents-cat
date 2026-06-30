#!/usr/bin/env python3
"""Monitor Common Voice CV26 Catalan archive download progress and detect stalls."""

from __future__ import annotations

import json
import subprocess
import sys
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

DATASET_SLUG = "common-voice-scripted-speech-26-0-catala-fe69b989"
ARCHIVE_NAME = f"{DATASET_SLUG}.tar.gz"
DEFAULT_DOWNLOAD_DIR = Path("data/raw")
STATE_FILE_NAME = ".cv26_download_monitor.json"
EXPECTED_ARCHIVE_BYTES = 79_210_000_000
DOWNLOAD_SCRIPT = "download_common_voice_cv26_ca.py"


@dataclass
class MonitorState:
    checked_at: float
    bytes_downloaded: int
    process_running: bool


@dataclass
class MonitorReport:
    status: str
    bytes_downloaded: int
    percent_complete: float
    process_running: bool
    bytes_since_last_check: int
    seconds_since_last_check: int
    growth_rate_mib_s: float
    message: str


def _format_bytes(num_bytes: int) -> str:
    units = ["B", "KB", "MB", "GB", "TB"]
    size = float(num_bytes)
    for unit in units:
        if size < 1024 or unit == units[-1]:
            return f"{size:.2f} {unit}"
        size /= 1024
    return f"{num_bytes} B"


def _is_download_process_running() -> bool:
    try:
        result = subprocess.run(
            ["pgrep", "-f", DOWNLOAD_SCRIPT],
            capture_output=True,
            text=True,
            check=False,
        )
    except FileNotFoundError:
        return False
    return bool(result.stdout.strip())


def _load_state(state_path: Path) -> MonitorState | None:
    if not state_path.exists():
        return None
    try:
        payload = json.loads(state_path.read_text(encoding="utf-8"))
        return MonitorState(
            checked_at=float(payload["checked_at"]),
            bytes_downloaded=int(payload["bytes_downloaded"]),
            process_running=bool(payload["process_running"]),
        )
    except (json.JSONDecodeError, KeyError, TypeError, ValueError):
        return None


def _save_state(state_path: Path, state: MonitorState) -> None:
    state_path.write_text(json.dumps(asdict(state), indent=2) + "\n", encoding="utf-8")


def check_download(
    download_dir: Path,
    *,
    stall_seconds: int = 600,
    min_growth_bytes: int = 1_048_576,
) -> MonitorReport:
    archive_path = download_dir / ARCHIVE_NAME
    part_path = download_dir / f"{ARCHIVE_NAME}.part"
    state_path = download_dir / STATE_FILE_NAME
    now = time.time()
    process_running = _is_download_process_running()

    if archive_path.exists() and not part_path.exists():
        size = archive_path.stat().st_size
        percent = 100.0 * size / EXPECTED_ARCHIVE_BYTES if EXPECTED_ARCHIVE_BYTES else 100.0
        return MonitorReport(
            status="complete",
            bytes_downloaded=size,
            percent_complete=min(percent, 100.0),
            process_running=process_running,
            bytes_since_last_check=0,
            seconds_since_last_check=0,
            growth_rate_mib_s=0.0,
            message=f"Archive complete: {archive_path} ({_format_bytes(size)})",
        )

    if not part_path.exists():
        return MonitorReport(
            status="not_started",
            bytes_downloaded=0,
            percent_complete=0.0,
            process_running=process_running,
            bytes_since_last_check=0,
            seconds_since_last_check=0,
            growth_rate_mib_s=0.0,
            message="No partial download found. Start with: python scripts/download_common_voice_cv26_ca.py",
        )

    current_bytes = part_path.stat().st_size
    percent = 100.0 * current_bytes / EXPECTED_ARCHIVE_BYTES if EXPECTED_ARCHIVE_BYTES else 0.0
    previous = _load_state(state_path)

    if previous is None:
        _save_state(
            state_path,
            MonitorState(checked_at=now, bytes_downloaded=current_bytes, process_running=process_running),
        )
        return MonitorReport(
            status="downloading",
            bytes_downloaded=current_bytes,
            percent_complete=percent,
            process_running=process_running,
            bytes_since_last_check=0,
            seconds_since_last_check=0,
            growth_rate_mib_s=0.0,
            message=(
                f"Baseline recorded at {_format_bytes(current_bytes)} "
                f"({percent:.1f}%). Will compare growth on the next check."
            ),
        )

    elapsed = max(int(now - previous.checked_at), 1)
    growth = current_bytes - previous.bytes_downloaded
    growth_rate = growth / elapsed / (1024 * 1024)

    if growth >= min_growth_bytes:
        status = "downloading"
        message = (
            f"Downloading: {_format_bytes(current_bytes)} ({percent:.1f}%), "
            f"+{_format_bytes(growth)} in {elapsed // 60}m {elapsed % 60}s "
            f"({growth_rate:.2f} MiB/s avg since last check)"
        )
    elif process_running and elapsed >= stall_seconds:
        status = "stuck"
        message = (
            f"Download appears stuck: only +{_format_bytes(max(growth, 0))} in "
            f"{elapsed // 60}m {elapsed % 60}s while process is still running. "
            "Consider stopping and rerunning: python scripts/download_common_voice_cv26_ca.py"
        )
    elif not process_running:
        status = "stopped"
        message = (
            f"Download stopped at {_format_bytes(current_bytes)} ({percent:.1f}%). "
            "Resume with: python scripts/download_common_voice_cv26_ca.py"
        )
    else:
        status = "downloading"
        message = (
            f"Downloading: {_format_bytes(current_bytes)} ({percent:.1f}%). "
            f"Only +{_format_bytes(max(growth, 0))} since last check; waiting for more growth."
        )

    _save_state(
        state_path,
        MonitorState(checked_at=now, bytes_downloaded=current_bytes, process_running=process_running),
    )
    return MonitorReport(
        status=status,
        bytes_downloaded=current_bytes,
        percent_complete=percent,
        process_running=process_running,
        bytes_since_last_check=growth,
        seconds_since_last_check=elapsed,
        growth_rate_mib_s=growth_rate,
        message=message,
    )


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--download-dir",
        type=Path,
        default=DEFAULT_DOWNLOAD_DIR,
        help="Directory containing the archive download (default: data/raw)",
    )
    parser.add_argument(
        "--stall-seconds",
        type=int,
        default=600,
        help="Treat as stuck if no meaningful growth for this many seconds (default: 600)",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print machine-readable JSON report",
    )
    args = parser.parse_args()

    project_root = Path(__file__).resolve().parents[1]
    download_dir = args.download_dir if args.download_dir.is_absolute() else project_root / args.download_dir
    report = check_download(download_dir, stall_seconds=args.stall_seconds)

    if args.json:
        print(json.dumps(asdict(report), indent=2))
    else:
        checked_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        print(f"[{checked_at}] status={report.status}")
        print(report.message)
        print(
            f"process_running={report.process_running} "
            f"bytes={report.bytes_downloaded} "
            f"percent={report.percent_complete:.2f}"
        )

    if report.status in {"stuck", "stopped"}:
        return 2
    if report.status == "complete":
        return 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
