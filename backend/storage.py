from __future__ import annotations

import json
import logging
import os
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from types import ModuleType
from typing import Any


logger = logging.getLogger(__name__)

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


class _Unset:
    """Marks a field the caller did not supply (``None`` means an explicit NULL)."""

    __slots__ = ()

    def __repr__(self) -> str:
        return "UNSET"


UNSET = _Unset()


@lru_cache(maxsize=1)
def _comarques_module() -> ModuleType | None:
    """Load the generated comarca allowlist, or None before it has been built."""
    try:
        from backend import comarques
    except ImportError:
        logger.warning(
            "backend/comarques.py is missing; comarca values are only shape-checked. "
            "Run scripts/build_comarca_map.py to generate it.",
        )
        return None
    return comarques


@lru_cache(maxsize=1)
def comarca_allowlist() -> frozenset[str] | None:
    """Canonical comarca slugs, or None when the generated module is absent."""
    module = _comarques_module()
    if module is None:
        return None
    slugs = getattr(module, "COMARCA_SLUGS", None) or getattr(
        module, "COMARCA_MACRO_DIALECTS", None
    )
    return frozenset(slugs) if slugs else None


def comarca_macro_dialect(slug: str) -> str | None:
    """Macro dialect for a comarca slug, or None if unknown or not generated yet."""
    module = _comarques_module()
    mapping = getattr(module, "COMARCA_MACRO_DIALECTS", None) if module else None
    if not mapping:
        return None
    macro = mapping.get(slug)
    return macro if macro in DIALECT_LABELS else None


def parse_comarques(stored: str | None) -> list[str]:
    """Decode a feedback.comarca value (bare slug or JSON array) to unique slugs."""
    if stored is None:
        return []
    raw = stored.strip()
    if not raw:
        return []
    if raw.startswith("["):
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return []
        if not isinstance(data, list):
            return []
        out: list[str] = []
        seen: set[str] = set()
        for item in data:
            if not isinstance(item, str):
                continue
            slug = item.strip().lower()
            if not slug or slug in seen:
                continue
            seen.add(slug)
            out.append(slug)
        return out
    return [raw.lower()]


def encode_comarques(slugs: list[str] | None) -> str | None:
    """Encode slugs for feedback.comarca: bare slug if one, else JSON array."""
    if not slugs:
        return None
    out: list[str] = []
    seen: set[str] = set()
    for item in slugs:
        slug = item.strip().lower()
        if not slug or slug in seen:
            continue
        seen.add(slug)
        out.append(slug)
    if not out:
        return None
    if len(out) == 1:
        return out[0]
    return json.dumps(out, ensure_ascii=False, separators=(",", ":"))


def macro_dialect_from_comarques(slugs: list[str]) -> str | None:
    """Single shared macro if all declared comarques agree; else None (mixed/unknown)."""
    macros: list[str] = []
    seen: set[str] = set()
    for slug in slugs:
        macro = comarca_macro_dialect(slug)
        if macro is None or macro in seen:
            continue
        seen.add(macro)
        macros.append(macro)
    if len(macros) == 1:
        return macros[0]
    return None


PENDING_CONSENT_TTL_SECONDS = max(
    60,
    int(os.environ.get("ORACLE_PENDING_CONSENT_TTL_SECONDS", "1800")),
)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def _utc_now_iso() -> str:
    return _utc_now().isoformat()


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


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
                prompt_id TEXT,
                prompt_text TEXT,
                deleted_at TEXT,
                research_consent INTEGER NOT NULL DEFAULT 0,
                consent_at TEXT,
                policy_version TEXT,
                pending_expires_at TEXT
            );

            CREATE TABLE IF NOT EXISTS feedback (
                id TEXT PRIMARY KEY,
                submission_id TEXT,
                created_at TEXT NOT NULL,
                was_correct INTEGER,
                self_reported_dialect TEXT,
                comarca TEXT,
                notes TEXT,
                FOREIGN KEY (submission_id) REFERENCES submissions(id)
            );
            """
        )
        _ensure_column(conn, "submissions", "prompt_id", "TEXT")
        _ensure_column(conn, "submissions", "prompt_text", "TEXT")
        _ensure_column(conn, "submissions", "research_consent", "INTEGER NOT NULL DEFAULT 0")
        _ensure_column(conn, "submissions", "consent_at", "TEXT")
        _ensure_column(conn, "submissions", "policy_version", "TEXT")
        _ensure_column(conn, "submissions", "pending_expires_at", "TEXT")
        _ensure_column(conn, "feedback", "comarca", "TEXT")
        # The columns stay for legacy databases, but nothing writes them any more.
        conn.execute(
            """
            UPDATE submissions SET ip = NULL, user_agent = NULL
            WHERE ip IS NOT NULL OR user_agent IS NOT NULL
            """
        )
        conn.commit()


def _ensure_column(conn: sqlite3.Connection, table: str, column: str, decl: str) -> None:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    existing = {row[1] for row in rows}
    if column not in existing:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {decl}")


def _connect() -> sqlite3.Connection:
    ensure_storage()
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _resolve_audio_path(audio_path_str: str) -> Path:
    path = Path(audio_path_str)
    if not path.is_absolute():
        path = PROJECT_ROOT / path
    return path


def _unlink_audio(audio_path_str: str | None) -> None:
    if not audio_path_str:
        return
    path = _resolve_audio_path(audio_path_str)
    if path.is_file():
        try:
            path.unlink()
        except OSError:
            try:
                path.write_bytes(b"")
            except OSError:
                pass


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
    audio_path: Path,
    scores: dict[str, Any],
    top_label: str,
    evidence_band: str,
    prompt_id: str | None = None,
    prompt_text: str | None = None,
) -> str:
    """Insert a pending (not yet research-consented) submission."""
    ensure_storage()
    try:
        relative_audio = str(audio_path.relative_to(PROJECT_ROOT))
    except ValueError:
        relative_audio = str(audio_path)

    expires_at = (_utc_now() + timedelta(seconds=PENDING_CONSENT_TTL_SECONDS)).isoformat()

    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO submissions (
                id, created_at, audio_path,
                scores_json, top_label, evidence_band,
                prompt_id, prompt_text, deleted_at,
                research_consent, consent_at, policy_version, pending_expires_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, NULL, NULL, ?)
            """,
            (
                submission_id,
                _utc_now_iso(),
                relative_audio,
                json.dumps(scores, ensure_ascii=False),
                top_label,
                evidence_band,
                prompt_id,
                prompt_text,
                expires_at,
            ),
        )
        conn.commit()
    return submission_id


def submission_exists(submission_id: str) -> bool:
    """True if a live (not soft-deleted) submission exists, pending or consented."""
    purge_expired_pending()
    with _connect() as conn:
        row = conn.execute(
            "SELECT 1 FROM submissions WHERE id = ? AND deleted_at IS NULL",
            (submission_id,),
        ).fetchone()
    return row is not None


def is_research_consented(submission_id: str) -> bool:
    purge_expired_pending()
    with _connect() as conn:
        row = conn.execute(
            """
            SELECT 1 FROM submissions
            WHERE id = ? AND deleted_at IS NULL AND research_consent = 1
            """,
            (submission_id,),
        ).fetchone()
    return row is not None


def confirm_research_consent(submission_id: str, *, policy_version: str) -> bool:
    """Promote a pending submission to research-consented storage.

    Idempotent when already consented (returns True). Returns False if missing,
    deleted, or the pending TTL has expired without consent.
    """
    purge_expired_pending()
    version = policy_version.strip()
    if not version:
        return False

    with _connect() as conn:
        row = conn.execute(
            """
            SELECT research_consent, pending_expires_at, deleted_at
            FROM submissions WHERE id = ?
            """,
            (submission_id,),
        ).fetchone()
        if row is None:
            return False
        research_consent, pending_expires_at, deleted_at = row
        if deleted_at is not None:
            return False
        # Already retained — treat as success so retries (e.g. React Strict Mode) do not 404.
        if int(research_consent or 0) == 1:
            return True
        expires = _parse_iso(pending_expires_at)
        if expires is not None and expires <= _utc_now():
            return False

        conn.execute(
            """
            UPDATE submissions
            SET research_consent = 1,
                consent_at = ?,
                policy_version = ?,
                pending_expires_at = NULL
            WHERE id = ? AND deleted_at IS NULL AND research_consent = 0
            """,
            (_utc_now_iso(), version, submission_id),
        )
        conn.commit()
        return conn.total_changes > 0


def decline_research_consent(submission_id: str) -> bool:
    """User declined research storage: purge pending audio + scrub submission PII.

    Linked feedback keeps calibration fields (``was_correct``,
    ``self_reported_dialect``, ``comarca``) but is unlinked from the tombstone
    (``submission_id`` cleared). Free-text ``notes`` are cleared.
    """
    return _soft_delete_submission(submission_id, scrub_feedback_calibration=False)


def purge_expired_pending() -> int:
    """Soft-delete pending submissions past ``pending_expires_at``. Returns count."""
    ensure_storage()
    now = _utc_now_iso()
    purged = 0
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT id FROM submissions
            WHERE deleted_at IS NULL
              AND research_consent = 0
              AND pending_expires_at IS NOT NULL
              AND pending_expires_at <= ?
            """,
            (now,),
        ).fetchall()
        ids = [row[0] for row in rows]

    for submission_id in ids:
        if _soft_delete_submission(submission_id, scrub_feedback_calibration=False):
            purged += 1
    return purged


RESEARCH_RETENTION_YEARS = max(
    1,
    int(os.environ.get("ORACLE_RESEARCH_RETENTION_YEARS", "3")),
)


def purge_expired_research_consent() -> int:
    """Full soft-delete research rows past the retention window (default 3 years).

    Uses ``consent_at`` when set, otherwise ``created_at``. Scrubs IP/UA/audio and
    feedback content (same as operator soft-delete). Returns count purged.
    """
    ensure_storage()
    cutoff = (_utc_now() - timedelta(days=365 * RESEARCH_RETENTION_YEARS)).isoformat()
    purged = 0
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT id FROM submissions
            WHERE deleted_at IS NULL
              AND research_consent = 1
              AND COALESCE(consent_at, created_at) <= ?
            """,
            (cutoff,),
        ).fetchall()
        ids = [row[0] for row in rows]

    for submission_id in ids:
        if soft_delete_submission(submission_id):
            purged += 1
    return purged


def soft_delete_submission(submission_id: str) -> bool:
    """Operator/Manage My Data deletion: full scrub including feedback content.

    Returns False if no row exists for ``submission_id``. Idempotent when already
    soft-deleted (still attempts audio cleanup).
    """
    return _soft_delete_submission(submission_id, scrub_feedback_calibration=True)


def _soft_delete_submission(
    submission_id: str,
    *,
    scrub_feedback_calibration: bool,
) -> bool:
    """Soft-delete a submission: scrub PII and remove audio.

    When ``scrub_feedback_calibration`` is False (decline / TTL purge), linked
    feedback keeps ``was_correct``, ``self_reported_dialect`` and ``comarca``,
    clears ``notes``, and sets ``submission_id`` to NULL. When True (operator
    delete), all feedback fields are cleared and ``submission_id`` is unlinked.
    Always clears the ``audio_path`` string to empty after unlinking the file.
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
                """
                UPDATE submissions
                SET deleted_at = ?,
                    ip = NULL,
                    user_agent = NULL,
                    prompt_text = NULL,
                    prompt_id = NULL,
                    scores_json = '{}',
                    top_label = 'deleted',
                    evidence_band = 'deleted',
                    consent_at = NULL,
                    policy_version = NULL,
                    research_consent = 0,
                    pending_expires_at = NULL,
                    audio_path = ''
                WHERE id = ?
                """,
                (_utc_now_iso(), submission_id),
            )
            if scrub_feedback_calibration:
                conn.execute(
                    """
                    UPDATE feedback
                    SET notes = NULL,
                        self_reported_dialect = NULL,
                        comarca = NULL,
                        was_correct = NULL,
                        submission_id = NULL
                    WHERE submission_id = ?
                    """,
                    (submission_id,),
                )
            else:
                conn.execute(
                    """
                    UPDATE feedback
                    SET notes = NULL,
                        submission_id = NULL
                    WHERE submission_id = ?
                    """,
                    (submission_id,),
                )
            conn.commit()
        else:
            # Idempotent re-entry: still clear path string if leftover
            conn.execute(
                "UPDATE submissions SET audio_path = '' WHERE id = ? AND audio_path IS NOT NULL AND audio_path != ''",
                (submission_id,),
            )
            conn.commit()

    _unlink_audio(audio_path_str)
    return True


def upsert_feedback(
    *,
    feedback_id: str | None = None,
    recording_id: str | None = None,
    was_correct: bool | None | _Unset = UNSET,
    self_reported_dialect: str | None | _Unset = UNSET,
    comarca: str | None | _Unset = UNSET,
    notes: str | None | _Unset = UNSET,
) -> str:
    """Insert a feedback row, or update the one identified by ``feedback_id``.

    The funnel answers arrive one at a time, so only the fields the caller
    supplied are written; fields left as ``UNSET`` keep their stored value while
    an explicit ``None`` clears it. An unknown ``feedback_id`` (purged row, or a
    client-invented id) inserts a fresh server-generated row instead of updating.
    Returns the id of the row that was written.
    """
    ensure_storage()
    submission_id: str | None = None
    if recording_id and submission_exists(recording_id):
        submission_id = recording_id

    values: dict[str, Any] = {}
    if not isinstance(was_correct, _Unset):
        values["was_correct"] = None if was_correct is None else int(bool(was_correct))
    if not isinstance(self_reported_dialect, _Unset):
        values["self_reported_dialect"] = self_reported_dialect
    if not isinstance(comarca, _Unset):
        values["comarca"] = comarca
    if not isinstance(notes, _Unset):
        values["notes"] = notes

    with _connect() as conn:
        existing = None
        if feedback_id:
            existing = conn.execute(
                "SELECT 1 FROM feedback WHERE id = ?",
                (feedback_id,),
            ).fetchone()

        if existing is None:
            new_id = str(uuid.uuid4())
            columns = ["id", "submission_id", "created_at", *values]
            placeholders = ", ".join("?" for _ in columns)
            conn.execute(
                f"INSERT INTO feedback ({', '.join(columns)}) VALUES ({placeholders})",
                (new_id, submission_id, _utc_now_iso(), *values.values()),
            )
            conn.commit()
            return new_id

        if submission_id is not None:
            values["submission_id"] = submission_id
        if values:
            assignments = ", ".join(f"{column} = ?" for column in values)
            conn.execute(
                f"UPDATE feedback SET {assignments} WHERE id = ?",
                (*values.values(), feedback_id),
            )
            conn.commit()
    return feedback_id
