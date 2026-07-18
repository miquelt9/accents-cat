#!/usr/bin/env python3
"""Purge research-consented submissions past the retention window.

Default window: 3 years from ``consent_at`` (or ``created_at``), via
``ORACLE_RESEARCH_RETENTION_YEARS``. Full soft-delete: removes audio, scrubs
IP/UA/scores, and clears linked feedback (same as operator delete).

Run from the repo root::

    python scripts/purge_expired_research.py
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
        description=(
            "Soft-delete research_consent=1 rows older than "
            f"{storage.RESEARCH_RETENTION_YEARS} year(s)."
        ),
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print how many rows would be purged without deleting.",
    )
    args = parser.parse_args()

    if args.dry_run:
        from datetime import timedelta

        cutoff = (
            storage._utc_now() - timedelta(days=365 * storage.RESEARCH_RETENTION_YEARS)
        ).isoformat()
        storage.ensure_storage()
        with storage._connect() as conn:
            count = conn.execute(
                """
                SELECT COUNT(*) FROM submissions
                WHERE deleted_at IS NULL
                  AND research_consent = 1
                  AND COALESCE(consent_at, created_at) <= ?
                """,
                (cutoff,),
            ).fetchone()[0]
        print(f"Would purge {count} research submission(s) (cutoff {cutoff}).")
        return 0

    purged = storage.purge_expired_research_consent()
    print(f"Purged {purged} research submission(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
