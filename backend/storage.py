from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SUBMISSIONS_DIR = PROJECT_ROOT / "data" / "user_submissions"
AUDIO_DIR = SUBMISSIONS_DIR / "audio"
DB_PATH = SUBMISSIONS_DIR / "oracle.db"

DIALECT_LABELS = (
    "balearic",
    "central",
    "northern",
    "northwestern",
    "valencian",
)
SELF_REPORTED_DIALECTS = DIALECT_LABELS + ("mixed", "unknown")


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def ensure_storage() -> None:
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS submissions (
                id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                ip TEXT,
                user_agent TEXT,
                audio_path TEXT NOT NULL,
                scores_json TEXT NOT NULL,
                top_label TEXT NOT NULL,
                evidence_band TEXT NOT NULL,
                deleted_at TEXT
            );

            CREATE TABLE IF NOT EXISTS feedback (
                id TEXT PRIMARY KEY,
                submission_id TEXT,
                created_at TEXT NOT NULL,
                was_correct INTEGER,
                self_reported_dialect TEXT,
                notes TEXT,
                FOREIGN KEY (submission_id) REFERENCES submissions(id)
            );
            """
        )
        conn.commit()


def _connect() -> sqlite3.Connection:
    ensure_storage()
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def save_audio(payload: bytes, suffix: str) -> tuple[str, Path]:
    """Write audio bytes to disk; return (submission_id, absolute path)."""
    ensure_storage()
    submission_id = str(uuid.uuid4())
    safe_suffix = suffix if suffix.startswith(".") else f".{suffix}" if suffix else ".webm"
    path = AUDIO_DIR / f"{submission_id}{safe_suffix}"
    path.write_bytes(payload)
    return submission_id, path


def insert_submission(
    *,
    submission_id: str,
    ip: str | None,
    user_agent: str | None,
    audio_path: Path,
    scores: dict[str, Any],
    top_label: str,
    evidence_band: str,
) -> str:
    ensure_storage()
    try:
        relative_audio = str(audio_path.relative_to(PROJECT_ROOT))
    except ValueError:
        relative_audio = str(audio_path)

    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO submissions (
                id, created_at, ip, user_agent, audio_path,
                scores_json, top_label, evidence_band, deleted_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
            """,
            (
                submission_id,
                _utc_now_iso(),
                ip,
                user_agent,
                relative_audio,
                json.dumps(scores, ensure_ascii=False),
                top_label,
                evidence_band,
            ),
        )
        conn.commit()
    return submission_id


def submission_exists(submission_id: str) -> bool:
    with _connect() as conn:
        row = conn.execute(
            "SELECT 1 FROM submissions WHERE id = ? AND deleted_at IS NULL",
            (submission_id,),
        ).fetchone()
    return row is not None


def soft_delete_submission(submission_id: str) -> bool:
    """Soft-delete a submission: set deleted_at and unlink (or zero) its audio.

    Returns False if no row exists for ``submission_id``. Idempotent when already
    soft-deleted (still attempts audio cleanup).
    """
    with _connect() as conn:
        row = conn.execute(
            "SELECT audio_path, deleted_at FROM submissions WHERE id = ?",
            (submission_id,),
        ).fetchone()
        if row is None:
            return False
        audio_path_str, deleted_at = row
        if deleted_at is None:
            conn.execute(
                "UPDATE submissions SET deleted_at = ? WHERE id = ?",
                (_utc_now_iso(), submission_id),
            )
            conn.commit()

    path = Path(audio_path_str)
    if not path.is_absolute():
        path = PROJECT_ROOT / path
    if path.is_file():
        try:
            path.unlink()
        except OSError:
            try:
                path.write_bytes(b"")
            except OSError:
                pass
    return True


def insert_feedback(
    *,
    recording_id: str | None,
    was_correct: bool | None,
    self_reported_dialect: str | None,
    notes: str | None,
) -> str:
    ensure_storage()
    feedback_id = str(uuid.uuid4())
    submission_id: str | None = None
    if recording_id and submission_exists(recording_id):
        submission_id = recording_id

    was_correct_int: int | None
    if was_correct is None:
        was_correct_int = None
    else:
        was_correct_int = 1 if was_correct else 0

    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO feedback (
                id, submission_id, created_at, was_correct,
                self_reported_dialect, notes
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                feedback_id,
                submission_id,
                _utc_now_iso(),
                was_correct_int,
                self_reported_dialect,
                notes,
            ),
        )
        conn.commit()
    return feedback_id
