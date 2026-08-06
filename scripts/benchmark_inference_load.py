#!/usr/bin/env python3
"""Benchmark `/analyze` latency, throughput, and CPU at several concurrency levels.

Start uvicorn separately with a selected ``ORACLE_WORKERS`` value, then run:

    python scripts/benchmark_inference_load.py \
        --base-url http://127.0.0.1:8000 --audio sample.wav

The default sweep is 1, 2, 4, 8, and 16 concurrent requests. Repeat the
benchmark with different worker counts and VPS sizes. CPU figures use Linux
``/proc`` counters and are omitted when those counters are unavailable.
"""

from __future__ import annotations

import argparse
import mimetypes
import os
import time
import urllib.error
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class CpuSnapshot:
    total: int
    idle: int
    process_ticks: int | None = None


@dataclass(frozen=True)
class RequestResult:
    duration_seconds: float
    status: int | None


def read_cpu_snapshot(pid: int | None = None) -> CpuSnapshot | None:
    try:
        with open("/proc/stat", encoding="utf-8") as handle:
            cpu_line = next(line for line in handle if line.startswith("cpu "))
        values = [int(value) for value in cpu_line.split()[1:]]
        total = sum(values)
        idle = values[3] + (values[4] if len(values) > 4 else 0)
        process_ticks: int | None = None
        if pid is not None:
            with open(f"/proc/{pid}/stat", encoding="utf-8") as handle:
                after_command = handle.read().rsplit(")", 1)[1].split()
            process_ticks = int(after_command[11]) + int(after_command[12])
        return CpuSnapshot(total, idle, process_ticks)
    except (OSError, StopIteration, ValueError, IndexError):
        return None


def cpu_percent(
    before: CpuSnapshot | None,
    after: CpuSnapshot | None,
    elapsed_seconds: float,
    pid: int | None,
) -> tuple[float | None, float | None]:
    if before is None or after is None or after.total <= before.total:
        return None, None
    system = 100.0 * (
        1.0 - (after.idle - before.idle) / (after.total - before.total)
    )
    process = None
    if (
        pid is not None
        and before.process_ticks is not None
        and after.process_ticks is not None
        and elapsed_seconds > 0
    ):
        clock_ticks = os.sysconf(os.sysconf_names["SC_CLK_TCK"])
        process = (
            100.0
            * (after.process_ticks - before.process_ticks)
            / clock_ticks
            / elapsed_seconds
        )
    return system, process


def multipart_body(audio: bytes, filename: str, content_type: str) -> tuple[bytes, str]:
    boundary = f"----accent-oracle-{uuid.uuid4().hex}"
    lines = [
        f"--{boundary}\r\n".encode(),
        b'Content-Disposition: form-data; name="promptId"\r\n\r\n',
        b"benchmark\r\n",
        f"--{boundary}\r\n".encode(),
        b'Content-Disposition: form-data; name="promptText"\r\n\r\n',
        b"Mostra de benchmark\r\n",
        f"--{boundary}\r\n".encode(),
        (
            f'Content-Disposition: form-data; name="audio"; filename="{filename}"\r\n'
            f"Content-Type: {content_type}\r\n\r\n"
        ).encode(),
        audio,
        b"\r\n",
        f"--{boundary}--\r\n".encode(),
    ]
    return b"".join(lines), f"multipart/form-data; boundary={boundary}"


def request_once(
    *,
    url: str,
    body: bytes,
    content_type: str,
    timeout_seconds: float,
) -> RequestResult:
    started = time.perf_counter()
    request = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": content_type,
            "Accept": "application/json",
            "User-Agent": "accent-oracle-benchmark",
        },
    )
    status: int | None = None
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            status = response.status
            response.read()
    except urllib.error.HTTPError as exc:
        status = exc.code
        exc.read()
    except (OSError, urllib.error.URLError):
        pass
    return RequestResult(time.perf_counter() - started, status)


def percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    position = (len(ordered) - 1) * fraction
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    weight = position - lower
    return ordered[lower] + (ordered[upper] - ordered[lower]) * weight


def run_level(
    *,
    url: str,
    body: bytes,
    content_type: str,
    concurrency: int,
    request_count: int,
    timeout_seconds: float,
    pid: int | None,
) -> None:
    before = read_cpu_snapshot(pid)
    started = time.perf_counter()
    with ThreadPoolExecutor(max_workers=concurrency) as executor:
        futures = [
            executor.submit(
                request_once,
                url=url,
                body=body,
                content_type=content_type,
                timeout_seconds=timeout_seconds,
            )
            for _ in range(request_count)
        ]
        results = [future.result() for future in futures]
    elapsed = time.perf_counter() - started
    after = read_cpu_snapshot(pid)

    latencies = [result.duration_seconds for result in results]
    statuses: dict[str, int] = {}
    for result in results:
        key = str(result.status) if result.status is not None else "error"
        statuses[key] = statuses.get(key, 0) + 1
    system_cpu, process_cpu = cpu_percent(before, after, elapsed, pid)
    status_text = ", ".join(
        f"{status}={count}" for status, count in sorted(statuses.items())
    )
    system_text = f"{system_cpu:.1f}%" if system_cpu is not None else "n/a"
    process_text = f"{process_cpu:.1f}%" if process_cpu is not None else "n/a"
    print(
        f"{concurrency:>11} {request_count:>8} "
        f"{percentile(latencies, 0.50):>9.3f} "
        f"{percentile(latencies, 0.95):>9.3f} "
        f"{request_count / elapsed:>10.2f} {system_text:>10} "
        f"{process_text:>11}  {status_text}"
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--audio", required=True, type=Path)
    parser.add_argument(
        "--concurrency",
        default="1,2,4,8,16",
        help="Comma-separated concurrency levels (default: 1,2,4,8,16)",
    )
    parser.add_argument(
        "--requests",
        type=int,
        default=16,
        help="Requests per concurrency level (default: 16)",
    )
    parser.add_argument("--timeout", type=float, default=180.0)
    parser.add_argument(
        "--pid",
        type=int,
        help="Optional uvicorn PID for per-process CPU utilization",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.requests < 1:
        raise SystemExit("--requests must be at least 1")
    levels = [int(value.strip()) for value in args.concurrency.split(",") if value.strip()]
    if not levels or any(level < 1 for level in levels):
        raise SystemExit("--concurrency must contain positive integers")
    audio = args.audio.read_bytes()
    content_type = mimetypes.guess_type(args.audio.name)[0] or "application/octet-stream"
    body, multipart_content_type = multipart_body(
        audio,
        args.audio.name,
        content_type,
    )
    print(
        "concurrency requests     p50_s     p95_s throughput/s system_cpu "
        "process_cpu  statuses"
    )
    for level in levels:
        run_level(
            url=f"{args.base_url.rstrip('/')}/analyze",
            body=body,
            content_type=multipart_content_type,
            concurrency=level,
            request_count=args.requests,
            timeout_seconds=args.timeout,
            pid=args.pid,
        )


if __name__ == "__main__":
    main()
