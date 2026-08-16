from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone
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


def _insert_sample() -> tuple[str, Path]:
    payload = b"fake-webm-bytes"
    sid, audio_path = storage.save_audio(payload, ".webm")
    scores = {
        "balearic": 0.1,
        "central": 0.5,
        "northern": 0.1,
        "northwestern": 0.1,
        "valencian": 0.2,
    }
    storage.insert_submission(
        submission_id=sid,
        audio_path=audio_path,
        scores=scores,
        top_label="central",
        evidence_band="moderate",
        prompt_id="pluja-vinya",
        prompt_text="La pluja fina cau sobre la vinya vella.",
        sentence_ids='["0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"]',
    )
    return sid, audio_path


def test_save_audio_and_submission_round_trip(isolated_storage: Path) -> None:
    submission_id, audio_path = _insert_sample()

    assert audio_path.exists()
    assert storage.submission_exists(submission_id) is True
    assert storage.is_research_consented(submission_id) is False

    with sqlite3.connect(storage.DB_PATH) as conn:
        row = conn.execute(
            "SELECT top_label, evidence_band, audio_path, prompt_id, prompt_text, sentence_ids, "
            "research_consent, pending_expires_at "
            "FROM submissions WHERE id = ?",
            (submission_id,),
        ).fetchone()
    assert row is not None
    assert row[0] == "central"
    assert row[1] == "moderate"
    assert Path(row[2]).name == audio_path.name
    assert row[3] == "pluja-vinya"
    assert row[4] == "La pluja fina cau sobre la vinya vella."
    assert (
        row[5] == '["0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"]'
    )
    assert row[6] == 0
    assert row[7] is not None


def test_confirm_research_consent(isolated_storage: Path) -> None:
    submission_id, audio_path = _insert_sample()

    assert storage.confirm_research_consent(submission_id, policy_version="") is False
    assert (
        storage.confirm_research_consent(
            submission_id,
            policy_version="5 d'agost de 2026",
        )
        is True
    )
    assert storage.is_research_consented(submission_id) is True
    assert audio_path.exists()

    with sqlite3.connect(storage.DB_PATH) as conn:
        row = conn.execute(
            "SELECT research_consent, consent_at, policy_version, pending_expires_at "
            "FROM submissions WHERE id = ?",
            (submission_id,),
        ).fetchone()
    assert row == (1, row[1], "5 d'agost de 2026", None)
    assert row[1] is not None

    # Already consented — idempotent success (retries / Strict Mode remounts)
    assert (
        storage.confirm_research_consent(
            submission_id,
            policy_version="5 d'agost de 2026",
        )
        is True
    )


def test_decline_research_consent_removes_audio(isolated_storage: Path) -> None:
    submission_id, audio_path = _insert_sample()
    feedback_id = storage.upsert_feedback(
        recording_id=submission_id,
        was_correct=False,
        self_reported_dialect="valencian",
        comarca="safor",
        notes="free-text note",
    )

    assert storage.decline_research_consent(submission_id) is True
    assert storage.submission_exists(submission_id) is False
    assert not audio_path.exists()

    with sqlite3.connect(storage.DB_PATH) as conn:
        feedback = conn.execute(
            "SELECT submission_id, notes, self_reported_dialect, comarca, was_correct "
            "FROM feedback WHERE id = ?",
            (feedback_id,),
        ).fetchone()
    assert feedback == (None, None, "valencian", "safor", 0)

    with sqlite3.connect(storage.DB_PATH) as conn:
        path_row = conn.execute(
            "SELECT audio_path FROM submissions WHERE id = ?",
            (submission_id,),
        ).fetchone()
    assert path_row == ("",)


def test_encode_parse_comarques_round_trip(isolated_storage: Path) -> None:
    assert storage.parse_comarques(None) == []
    assert storage.parse_comarques("selva") == ["selva"]
    assert storage.encode_comarques(["selva"]) == "selva"
    assert storage.encode_comarques(["selva", "bages"]) == '["selva","bages"]'
    assert storage.parse_comarques('["selva","bages"]') == ["selva", "bages"]
    assert storage.parse_comarques('["selva","selva","bages"]') == ["selva", "bages"]


def test_upsert_feedback_links_when_submission_exists(isolated_storage: Path) -> None:
    submission_id, audio_path = storage.save_audio(b"x", ".webm")
    storage.insert_submission(
        submission_id=submission_id,
        audio_path=audio_path,
        scores={"central": 1.0},
        top_label="central",
        evidence_band="strong",
    )

    feedback_id = storage.upsert_feedback(
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


def test_upsert_feedback_updates_in_place_without_duplicating(
    isolated_storage: Path,
) -> None:
    submission_id, _ = _insert_sample()

    feedback_id = storage.upsert_feedback(
        recording_id=submission_id,
        was_correct=False,
    )
    # Second funnel step: comarca only, must not blank the earlier thumb.
    same_id = storage.upsert_feedback(
        feedback_id=feedback_id,
        recording_id=submission_id,
        comarca="baix-camp",
        self_reported_dialect="central",
    )
    assert same_id == feedback_id

    with sqlite3.connect(storage.DB_PATH) as conn:
        count = conn.execute("SELECT COUNT(*) FROM feedback").fetchone()[0]
        row = conn.execute(
            "SELECT submission_id, was_correct, self_reported_dialect, comarca "
            "FROM feedback WHERE id = ?",
            (feedback_id,),
        ).fetchone()
    assert count == 1
    assert row == (submission_id, 0, "central", "baix-camp")


def test_upsert_feedback_distinguishes_unset_from_explicit_null(
    isolated_storage: Path,
) -> None:
    feedback_id = storage.upsert_feedback(was_correct=True, comarca="osona")

    storage.upsert_feedback(feedback_id=feedback_id, comarca="selva")
    storage.upsert_feedback(feedback_id=feedback_id, was_correct=None)

    with sqlite3.connect(storage.DB_PATH) as conn:
        row = conn.execute(
            "SELECT was_correct, comarca FROM feedback WHERE id = ?",
            (feedback_id,),
        ).fetchone()
    assert row == (None, "selva")


def test_upsert_feedback_ignores_unknown_id(isolated_storage: Path) -> None:
    feedback_id = storage.upsert_feedback(
        feedback_id="not-a-stored-id",
        was_correct=True,
    )
    assert feedback_id != "not-a-stored-id"

    with sqlite3.connect(storage.DB_PATH) as conn:
        rows = conn.execute("SELECT id FROM feedback").fetchall()
    assert rows == [(feedback_id,)]


def test_soft_delete_submission_scrubs_pii_and_removes_audio(
    isolated_storage: Path,
) -> None:
    submission_id, audio_path = _insert_sample()
    storage.upsert_feedback(
        recording_id=submission_id,
        was_correct=True,
        self_reported_dialect="central",
        comarca="osona",
        notes="secret note",
    )
    assert audio_path.exists()
    assert storage.submission_exists(submission_id) is True

    assert storage.soft_delete_submission(submission_id) is True
    assert storage.submission_exists(submission_id) is False
    assert not audio_path.exists()

    with sqlite3.connect(storage.DB_PATH) as conn:
        row = conn.execute(
            "SELECT deleted_at, ip, user_agent, prompt_text, prompt_id, sentence_ids, "
            "scores_json, top_label, "
            "research_consent, policy_version "
            "FROM submissions WHERE id = ?",
            (submission_id,),
        ).fetchone()
        feedback = conn.execute(
            "SELECT submission_id, notes, self_reported_dialect, comarca, was_correct "
            "FROM feedback",
        ).fetchone()
    assert row is not None
    assert row[0] is not None
    # ip / user_agent are never written any more; they stay NULL end to end.
    assert row[1] is None
    assert row[2] is None
    assert row[3] is None
    assert row[4] is None
    assert row[5] is None
    assert row[6] == "{}"
    assert row[7] == "deleted"
    assert row[8] == 0
    assert row[9] is None
    assert feedback == (None, None, None, None, None)

    # Idempotent: already soft-deleted still succeeds
    assert storage.soft_delete_submission(submission_id) is True
    assert storage.soft_delete_submission("missing-id") is False


def test_feedback_skips_missing_or_soft_deleted(isolated_storage: Path) -> None:
    missing_feedback = storage.upsert_feedback(
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
        audio_path=audio_path,
        scores={"valencian": 1.0},
        top_label="valencian",
        evidence_band="limited",
    )
    assert storage.soft_delete_submission(submission_id) is True

    assert storage.submission_exists(submission_id) is False
    soft_deleted_feedback = storage.upsert_feedback(
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


def test_purge_expired_pending(isolated_storage: Path) -> None:
    submission_id, audio_path = _insert_sample()
    feedback_id = storage.upsert_feedback(
        recording_id=submission_id,
        was_correct=True,
        self_reported_dialect="central",
        notes="ttl note",
    )
    past = (
        (datetime.now(timezone.utc) - timedelta(hours=1))
        .replace(microsecond=0)
        .isoformat()
    )
    with sqlite3.connect(storage.DB_PATH) as conn:
        conn.execute(
            "UPDATE submissions SET pending_expires_at = ? WHERE id = ?",
            (past, submission_id),
        )
        conn.commit()

    assert storage.purge_expired_pending() == 1
    assert storage.submission_exists(submission_id) is False
    assert not audio_path.exists()
    assert storage.confirm_research_consent(submission_id, policy_version="v") is False

    with sqlite3.connect(storage.DB_PATH) as conn:
        feedback = conn.execute(
            "SELECT submission_id, notes, self_reported_dialect, was_correct "
            "FROM feedback WHERE id = ?",
            (feedback_id,),
        ).fetchone()
    assert feedback == (None, None, "central", 1)


def test_purge_expired_research_consent(isolated_storage: Path) -> None:
    submission_id, audio_path = _insert_sample()
    assert storage.confirm_research_consent(submission_id, policy_version="v1") is True
    storage.upsert_feedback(
        recording_id=submission_id,
        was_correct=True,
        self_reported_dialect="northern",
        notes="keep-me-not",
    )

    old = (
        (datetime.now(timezone.utc) - timedelta(days=365 * 4))
        .replace(microsecond=0)
        .isoformat()
    )
    with sqlite3.connect(storage.DB_PATH) as conn:
        conn.execute(
            "UPDATE submissions SET consent_at = ? WHERE id = ?",
            (old, submission_id),
        )
        conn.commit()

    assert storage.purge_expired_research_consent() == 1
    assert storage.submission_exists(submission_id) is False
    assert not audio_path.exists()

    with sqlite3.connect(storage.DB_PATH) as conn:
        row = conn.execute(
            "SELECT ip, user_agent, audio_path, research_consent FROM submissions WHERE id = ?",
            (submission_id,),
        ).fetchone()
        feedback = conn.execute(
            "SELECT submission_id, was_correct, self_reported_dialect, notes FROM feedback",
        ).fetchone()
    # ip / user_agent are never written any more; they stay NULL end to end.
    assert row == (None, None, "", 0)
    assert feedback == (None, None, None, None)


def test_ensure_storage_adds_prompt_and_consent_columns_to_legacy_db(
    isolated_storage: Path,
) -> None:
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
        conn.execute(
            """
            CREATE TABLE feedback (
                id TEXT PRIMARY KEY,
                submission_id TEXT,
                created_at TEXT NOT NULL,
                was_correct INTEGER,
                self_reported_dialect TEXT,
                notes TEXT
            )
            """
        )
        conn.commit()

    storage.ensure_storage()

    with sqlite3.connect(storage.DB_PATH) as conn:
        columns = {
            row[1] for row in conn.execute("PRAGMA table_info(submissions)").fetchall()
        }
        feedback_columns = {
            row[1] for row in conn.execute("PRAGMA table_info(feedback)").fetchall()
        }
        session_tables = {
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            ).fetchall()
        }
    assert "prompt_id" in columns
    assert "prompt_text" in columns
    assert "sentence_ids" in columns
    assert "research_consent" in columns
    assert "consent_at" in columns
    assert "policy_version" in columns
    assert "pending_expires_at" in columns
    assert "analysis_session_id" in columns
    assert "take_index" in columns
    assert "take_role" in columns
    assert "comarca" in feedback_columns
    assert "analysis_session_id" in feedback_columns
    assert "analysis_sessions" in session_tables


def test_ensure_storage_scrubs_legacy_ip_and_user_agent(isolated_storage: Path) -> None:
    submission_id, _ = _insert_sample()
    with sqlite3.connect(storage.DB_PATH) as conn:
        conn.execute(
            "UPDATE submissions SET ip = ?, user_agent = ? WHERE id = ?",
            ("203.0.113.7", "legacy-agent", submission_id),
        )
        conn.commit()

    storage.ensure_storage()

    with sqlite3.connect(storage.DB_PATH) as conn:
        row = conn.execute(
            "SELECT ip, user_agent FROM submissions WHERE id = ?",
            (submission_id,),
        ).fetchone()
    assert row == (None, None)


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


def _insert_session_take(
    session_id: str,
    take_index: int,
    take_role: str,
) -> tuple[str, Path]:
    submission_id, audio_path = storage.save_audio(
        f"take-{take_index}".encode(), ".webm"
    )
    storage.insert_submission(
        submission_id=submission_id,
        audio_path=audio_path,
        scores={
            "balearic": 0.1,
            "central": 0.5,
            "northern": 0.1,
            "northwestern": 0.1,
            "valencian": 0.2,
        },
        top_label="central",
        evidence_band="moderate",
        prompt_id=f"prompt-{take_index}",
        prompt_text=f"Prompt {take_index}",
        sentence_ids='["0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"]',
        analysis_session_id=session_id,
        take_index=take_index,
        take_role=take_role,
    )
    return submission_id, audio_path


def test_analysis_session_consent_retains_all_takes_and_feedback(
    isolated_storage: Path,
) -> None:
    session_id = storage.create_analysis_session()
    first_id, first_audio = _insert_session_take(session_id, 1, "initial")
    second_id, second_audio = _insert_session_take(session_id, 2, "validation")
    assert storage.finalize_analysis_session(
        session_id,
        final_result={"topLabel": "central", "scores": {"central": 0.6}},
        take_count=2,
        terminal_state="results",
    )

    feedback_id = storage.upsert_feedback(
        analysis_session_id=session_id,
        was_correct=True,
    )
    same_feedback_id = storage.upsert_feedback(
        analysis_session_id=session_id,
        feedback_id=feedback_id,
        comarca="osona",
        self_reported_dialect="central",
    )
    assert same_feedback_id == feedback_id
    assert storage.confirm_research_consent_for_session(
        session_id,
        policy_version="10 d'agost de 2026",
    )

    with sqlite3.connect(storage.DB_PATH) as conn:
        takes = conn.execute(
            """
            SELECT id, take_index, take_role, research_consent
            FROM submissions
            WHERE analysis_session_id = ?
            ORDER BY take_index
            """,
            (session_id,),
        ).fetchall()
        session = conn.execute(
            """
            SELECT research_consent, final_result_json, take_count, terminal_state
            FROM analysis_sessions WHERE id = ?
            """,
            (session_id,),
        ).fetchone()
        feedback = conn.execute(
            """
            SELECT analysis_session_id, was_correct, comarca
            FROM feedback WHERE id = ?
            """,
            (feedback_id,),
        ).fetchone()

    assert takes == [
        (first_id, 1, "initial", 1),
        (second_id, 2, "validation", 1),
    ]
    assert session == (
        1,
        '{"topLabel":"central","scores":{"central":0.6}}',
        2,
        "results",
    )
    assert feedback == (session_id, 1, "osona")
    assert first_audio.exists()
    assert second_audio.exists()


def test_declining_analysis_session_removes_all_audio_and_unlinks_feedback(
    isolated_storage: Path,
) -> None:
    session_id = storage.create_analysis_session()
    _, first_audio = _insert_session_take(session_id, 1, "initial")
    _, second_audio = _insert_session_take(session_id, 2, "validation")
    feedback_id = storage.upsert_feedback(
        analysis_session_id=session_id,
        was_correct=False,
        self_reported_dialect="valencian",
        comarca="safor",
        notes="temporary note",
    )

    assert storage.decline_research_consent_for_session(session_id)
    assert not first_audio.exists()
    assert not second_audio.exists()

    with sqlite3.connect(storage.DB_PATH) as conn:
        session = conn.execute(
            "SELECT deleted_at, final_result_json, research_consent "
            "FROM analysis_sessions WHERE id = ?",
            (session_id,),
        ).fetchone()
        takes = conn.execute(
            """
            SELECT deleted_at, audio_path, scores_json, top_label, sentence_ids
            FROM submissions WHERE analysis_session_id = ?
            ORDER BY take_index
            """,
            (session_id,),
        ).fetchall()
        feedback = conn.execute(
            """
            SELECT analysis_session_id, submission_id, notes, was_correct,
                   self_reported_dialect, comarca
            FROM feedback WHERE id = ?
            """,
            (feedback_id,),
        ).fetchone()

    assert session[0] is not None
    assert session[1:] == (None, 0)
    assert all(
        row[0] is not None and row[1:] == ("", "{}", "deleted", None) for row in takes
    )
    assert feedback == (None, None, None, 0, "valencian", "safor")


def test_expired_analysis_session_purges_all_pending_takes(
    isolated_storage: Path,
) -> None:
    session_id = storage.create_analysis_session()
    _, first_audio = _insert_session_take(session_id, 1, "initial")
    _, second_audio = _insert_session_take(session_id, 2, "validation")
    past = (
        (datetime.now(timezone.utc) - timedelta(hours=1))
        .replace(microsecond=0)
        .isoformat()
    )
    with sqlite3.connect(storage.DB_PATH) as conn:
        conn.execute(
            "UPDATE analysis_sessions SET pending_expires_at = ? WHERE id = ?",
            (past, session_id),
        )
        conn.commit()

    assert storage.purge_expired_pending() == 1
    assert not first_audio.exists()
    assert not second_audio.exists()
    assert storage.analysis_session_exists(session_id) is False


def test_soft_delete_analysis_session_scrubs_all_linked_data(
    isolated_storage: Path,
) -> None:
    session_id = storage.create_analysis_session()
    _, first_audio = _insert_session_take(session_id, 1, "initial")
    _, second_audio = _insert_session_take(session_id, 2, "validation")
    feedback_id = storage.upsert_feedback(
        analysis_session_id=session_id,
        was_correct=True,
        self_reported_dialect="central",
        comarca="osona",
        notes="private note",
    )
    assert storage.confirm_research_consent_for_session(session_id, policy_version="v1")

    assert storage.soft_delete_analysis_session(session_id)
    assert not first_audio.exists()
    assert not second_audio.exists()

    with sqlite3.connect(storage.DB_PATH) as conn:
        session = conn.execute(
            """
            SELECT deleted_at, research_consent, final_result_json, policy_version
            FROM analysis_sessions WHERE id = ?
            """,
            (session_id,),
        ).fetchone()
        feedback = conn.execute(
            """
            SELECT analysis_session_id, submission_id, was_correct,
                   self_reported_dialect, comarca, notes
            FROM feedback WHERE id = ?
            """,
            (feedback_id,),
        ).fetchone()

    assert session[0] is not None
    assert session[1:] == (0, None, None)
    assert feedback == (None, None, None, None, None, None)
