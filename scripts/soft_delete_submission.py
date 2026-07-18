#!/usr/bin/env python3
"""Soft-delete a consented user submission by UUID (operator tool).

Sets ``deleted_at`` in SQLite and unlinks (or zeros) the stored audio file.
Run from the repo root so ``backend`` imports resolve::

    python scripts/soft_delete_submission.py <recording-uuid>
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend import storage  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Soft-delete a user submission (deleted_at + remove audio).",
    )
    parser.add_argument("submission_id", help="Recording / submission UUID")
    args = parser.parse_args()

    if not storage.soft_delete_submission(args.submission_id):
        print(f"No submission found: {args.submission_id}", file=sys.stderr)
        return 1

    print(f"Soft-deleted: {args.submission_id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
