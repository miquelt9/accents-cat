from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from backend import storage


@pytest.fixture()
def isolated_storage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    submissions_dir = tmp_path / "user_submissions"
    audio_dir = submissions_dir / "audio"
    db_path = submissions_dir / "oracle.db"
    monkeypatch.setattr(storage, "SUBMISSIONS_DIR", submissions_dir)
    monkeypatch.setattr(storage, "AUDIO_DIR", audio_dir)
    monkeypatch.setattr(storage, "DB_PATH", db_path)
    monkeypatch.setattr(storage, "PROJECT_ROOT", tmp_path)
    return tmp_path


def test_save_audio_and_submission_round_trip(isolated_storage: Path) -> None:
    payload = b"fake-webm-bytes"
    submission_id, audio_path = storage.save_audio(payload, ".webm")

    assert audio_path.exists()
    assert audio_path.read_bytes() == payload
    assert audio_path.parent == storage.AUDIO_DIR

    scores = {
        "balearic": 0.1,
        "central": 0.5,
        "northern": 0.1,
        "northwestern": 0.1,
        "valencian": 0.2,
    }
    storage.insert_submission(
        submission_id=submission_id,
        ip="127.0.0.1",
        user_agent="pytest",
        audio_path=audio_path,
        scores=scores,
        top_label="central",
        evidence_band="moderate",
        prompt_id="pluja-vinya",
        prompt_text="La pluja fina cau sobre la vinya vella.",
    )

    assert storage.submission_exists(submission_id) is True

    with sqlite3.connect(storage.DB_PATH) as conn:
        row = conn.execute(
            "SELECT top_label, evidence_band, audio_path, prompt_id, prompt_text "
            "FROM submissions WHERE id = ?",
            (submission_id,),
        ).fetchone()
    assert row is not None
    assert row[0] == "central"
    assert row[1] == "moderate"
    assert Path(row[2]).name == audio_path.name
    assert row[3] == "pluja-vinya"
    assert row[4] == "La pluja fina cau sobre la vinya vella."


def test_insert_feedback_links_when_submission_exists(isolated_storage: Path) -> None:
    submission_id, audio_path = storage.save_audio(b"x", ".webm")
    storage.insert_submission(
        submission_id=submission_id,
        ip=None,
        user_agent=None,
        audio_path=audio_path,
        scores={"central": 1.0},
        top_label="central",
        evidence_band="strong",
    )

    feedback_id = storage.insert_feedback(
        recording_id=submission_id,
        was_correct=True,
        self_reported_dialect="central",
        notes="ok",
    )
    assert feedback_id

    with sqlite3.connect(storage.DB_PATH) as conn:
        row = conn.execute(
            "SELECT submission_id, was_correct, self_reported_dialect FROM feedback WHERE id = ?",
            (feedback_id,),
        ).fetchone()
    assert row == (submission_id, 1, "central")


def test_soft_delete_submission_sets_deleted_at_and_removes_audio(
    isolated_storage: Path,
) -> None:
    submission_id, audio_path = storage.save_audio(b"to-delete", ".webm")
    storage.insert_submission(
        submission_id=submission_id,
        ip="127.0.0.1",
        user_agent="pytest",
        audio_path=audio_path,
        scores={"central": 1.0},
        top_label="central",
        evidence_band="moderate",
    )
    assert audio_path.exists()
    assert storage.submission_exists(submission_id) is True

    assert storage.soft_delete_submission(submission_id) is True
    assert storage.submission_exists(submission_id) is False
    assert not audio_path.exists()

    with sqlite3.connect(storage.DB_PATH) as conn:
        deleted_at = conn.execute(
            "SELECT deleted_at FROM submissions WHERE id = ?",
            (submission_id,),
        ).fetchone()[0]
    assert deleted_at is not None

    # Idempotent: already soft-deleted still succeeds
    assert storage.soft_delete_submission(submission_id) is True
    assert storage.soft_delete_submission("missing-id") is False


def test_feedback_skips_missing_or_soft_deleted(isolated_storage: Path) -> None:
    missing_feedback = storage.insert_feedback(
        recording_id="does-not-exist",
        was_correct=False,
        self_reported_dialect="unknown",
        notes=None,
    )
    with sqlite3.connect(storage.DB_PATH) as conn:
        row = conn.execute(
            "SELECT submission_id FROM feedback WHERE id = ?",
            (missing_feedback,),
        ).fetchone()
    assert row == (None,)

    submission_id, audio_path = storage.save_audio(b"y", ".ogg")
    storage.insert_submission(
        submission_id=submission_id,
        ip=None,
        user_agent=None,
        audio_path=audio_path,
        scores={"valencian": 1.0},
        top_label="valencian",
        evidence_band="limited",
    )
    assert storage.soft_delete_submission(submission_id) is True

    assert storage.submission_exists(submission_id) is False
    soft_deleted_feedback = storage.insert_feedback(
        recording_id=submission_id,
        was_correct=None,
        self_reported_dialect="mixed",
        notes=None,
    )
    with sqlite3.connect(storage.DB_PATH) as conn:
        row = conn.execute(
            "SELECT submission_id FROM feedback WHERE id = ?",
            (soft_deleted_feedback,),
        ).fetchone()
    assert row == (None,)


def test_ensure_storage_adds_prompt_columns_to_legacy_db(isolated_storage: Path) -> None:
    storage.AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(storage.DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE submissions (
                id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                ip TEXT,
                user_agent TEXT,
                audio_path TEXT NOT NULL,
                scores_json TEXT NOT NULL,
                top_label TEXT NOT NULL,
                evidence_band TEXT NOT NULL,
                deleted_at TEXT
            )
            """
        )
        conn.commit()

    storage.ensure_storage()

    with sqlite3.connect(storage.DB_PATH) as conn:
        columns = {row[1] for row in conn.execute("PRAGMA table_info(submissions)").fetchall()}
    assert "prompt_id" in columns
    assert "prompt_text" in columns


def test_self_reported_dialect_membership() -> None:
    assert "central" in storage.SELF_REPORTED_DIALECTS
    assert "mixed" in storage.SELF_REPORTED_DIALECTS
    assert "unknown" in storage.SELF_REPORTED_DIALECTS
    assert "tortosi" not in storage.SELF_REPORTED_DIALECTS
    assert storage.DIALECT_LABELS == (
        "balearic",
        "central",
        "northern",
        "northwestern",
        "valencian",
    )
