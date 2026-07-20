#!/usr/bin/env python3
"""Export research-consented oracle submissions to a training manifest.

Only rows with ``research_consent=1`` and ``deleted_at IS NULL`` are exported.
Supervised five-way labels use ``feedback.self_reported_dialect`` when it is one
of the macro dialects; ``mixed`` / ``unknown`` / missing are kept in the
manifest with an empty label for semi-supervised review but excluded from the
default supervised export unless ``--include-unlabeled`` is set.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sqlite3
from pathlib import Path

import pandas as pd


LABELS = ["balearic", "central", "northern", "northwestern", "valencian"]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--db",
        type=Path,
        default=Path("data/user_submissions/oracle.db"),
    )
    parser.add_argument(
        "--audio-root",
        type=Path,
        default=Path("data/user_submissions"),
    )
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--out-manifest", type=Path, required=True)
    parser.add_argument(
        "--include-unlabeled",
        action="store_true",
        help="Keep consented rows without a macro self-report (empty label).",
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not args.db.exists():
        raise SystemExit(f"Database not found: {args.db}")

    conn = sqlite3.connect(args.db)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        """
        SELECT
          s.id AS recording_id,
          s.created_at,
          s.consent_at,
          s.policy_version,
          s.audio_path,
          s.prompt_id,
          s.prompt_text,
          s.top_label,
          f.self_reported_dialect,
          f.was_correct
        FROM submissions s
        LEFT JOIN feedback f ON f.submission_id = s.id
        WHERE s.research_consent = 1
          AND s.deleted_at IS NULL
        ORDER BY s.consent_at ASC
        """
    ).fetchall()
    conn.close()

    records = []
    copied = 0
    missing_audio = 0
    if not args.dry_run:
        args.out_dir.mkdir(parents=True, exist_ok=True)

    for row in rows:
        dialect = (row["self_reported_dialect"] or "").strip().lower()
        label = dialect if dialect in LABELS else ""
        if not label and not args.include_unlabeled:
            continue

        src = Path(row["audio_path"] or "")
        if not src.is_absolute():
            src = args.audio_root / src
        filename = f"{row['recording_id']}{src.suffix or '.webm'}"
        dst = args.out_dir / filename
        audio_prepared = False
        if src.exists():
            if not args.dry_run:
                shutil.copy2(src, dst)
            audio_prepared = True
            copied += 1
        else:
            missing_audio += 1

        records.append(
            {
                "client_id": f"oracle:{row['recording_id']}",
                "path": filename,
                "label": label,
                "self_reported_dialect": dialect or None,
                "was_correct": row["was_correct"],
                "top_label": row["top_label"],
                "prompt_id": row["prompt_id"],
                "prompt_text": row["prompt_text"],
                "recording_id": row["recording_id"],
                "consent_at": row["consent_at"],
                "policy_version": row["policy_version"],
                "source_dataset": "oracle_research_consent",
                "source_file": "oracle.db",
                "audio_path": str(dst) if audio_prepared else "",
                "audio_prepared": audio_prepared,
            }
        )

    df = pd.DataFrame(records)
    args.out_manifest.parent.mkdir(parents=True, exist_ok=True)
    if not args.dry_run:
        df.to_csv(args.out_manifest, index=False)

    by_label = {label: int((df["label"] == label).sum()) for label in LABELS} if len(df) else {label: 0 for label in LABELS}
    summary = {
        "db": str(args.db),
        "out_dir": str(args.out_dir),
        "out_manifest": str(args.out_manifest),
        "dry_run": bool(args.dry_run),
        "rows": int(len(df)),
        "copied_audio": copied,
        "missing_audio": missing_audio,
        "rows_by_label": by_label,
        "unlabeled_skipped": int(len(rows) - len(df)) if not args.include_unlabeled else 0,
    }
    summary_path = args.out_manifest.with_suffix(".summary.json")
    if not args.dry_run:
        summary_path.write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
