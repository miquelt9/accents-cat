#!/usr/bin/env python3
"""Soft-delete a user analysis session or legacy submission by UUID (operator tool).

Sets ``deleted_at``, scrubs IP / User-Agent / prompt text, clears linked
feedback fields, and unlinks (or zeros) the stored audio file.
Run from the repo root so ``backend`` imports resolve::

    python scripts/soft_delete_submission.py <session-or-recording-uuid>
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
        description="Soft-delete an analysis session or legacy submission.",
    )
    parser.add_argument("identifier", help="Analysis session or recording UUID")
    args = parser.parse_args()

    deleted_kind = "analysis session"
    if not storage.soft_delete_analysis_session(args.identifier):
        deleted_kind = "legacy submission"
        if not storage.soft_delete_submission(args.identifier):
            print(f"No analysis session or submission found: {args.identifier}", file=sys.stderr)
            return 1

    print(f"Soft-deleted {deleted_kind}: {args.identifier}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
