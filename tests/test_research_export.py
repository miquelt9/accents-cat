from __future__ import annotations

import csv
import sqlite3
import sys
from pathlib import Path

from scripts import export_research_consent_manifest as exporter


def _create_export_db(db_path: Path) -> None:
    with sqlite3.connect(db_path) as conn:
        conn.executescript(
            """
            CREATE TABLE submissions (
                id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                consent_at TEXT,
                policy_version TEXT,
                audio_path TEXT,
                analysis_session_id TEXT,
                prompt_id TEXT,
                prompt_text TEXT,
                top_label TEXT,
                research_consent INTEGER NOT NULL,
                deleted_at TEXT
            );

            CREATE TABLE feedback (
                id TEXT PRIMARY KEY,
                submission_id TEXT,
                analysis_session_id TEXT,
                created_at TEXT NOT NULL,
                was_correct INTEGER,
                self_reported_dialect TEXT,
                comarca TEXT
            );
            """
        )
        conn.executemany(
            """
            INSERT INTO submissions (
                id, created_at, consent_at, policy_version, audio_path,
                analysis_session_id, prompt_id, prompt_text, top_label,
                research_consent, deleted_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL)
            """,
            [
                (
                    "take-1",
                    "2026-08-01T10:00:00+00:00",
                    "2026-08-01T10:01:00+00:00",
                    "v1",
                    "data/user_submissions/audio/take-1.webm",
                    "session-1",
                    "prompt-1",
                    "Prompt 1",
                    "central",
                ),
                (
                    "take-2",
                    "2026-08-01T10:02:00+00:00",
                    "2026-08-01T10:01:00+00:00",
                    "v1",
                    "data/user_submissions/audio/take-2.webm",
                    "session-1",
                    "prompt-2",
                    "Prompt 2",
                    "central",
                ),
                (
                    "legacy-take",
                    "2026-08-02T10:00:00+00:00",
                    "2026-08-02T10:01:00+00:00",
                    "v1",
                    "audio/legacy-take.webm",
                    None,
                    None,
                    None,
                    "valencian",
                ),
                (
                    "unlabeled-take",
                    "2026-08-03T10:00:00+00:00",
                    "2026-08-03T10:01:00+00:00",
                    "v1",
                    None,
                    None,
                    None,
                    None,
                    "central",
                ),
            ],
        )
        conn.executemany(
            """
            INSERT INTO feedback (
                id, submission_id, analysis_session_id, created_at,
                was_correct, self_reported_dialect, comarca
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    "session-feedback",
                    None,
                    "session-1",
                    "2026-08-01T10:03:00+00:00",
                    1,
                    "central",
                    None,
                ),
                (
                    "legacy-feedback",
                    "legacy-take",
                    None,
                    "2026-08-02T10:03:00+00:00",
                    0,
                    "valencian",
                    None,
                ),
            ],
        )
        conn.commit()


def test_resolve_audio_path_supports_project_and_legacy_paths(tmp_path: Path) -> None:
    project_root = tmp_path / "project"
    audio_root = project_root / "data" / "user_submissions"
    audio_dir = audio_root / "audio"
    audio_dir.mkdir(parents=True)
    current_path = audio_dir / "current.webm"
    legacy_path = audio_dir / "legacy.webm"
    current_path.write_bytes(b"current")
    legacy_path.write_bytes(b"legacy")

    assert (
        exporter.resolve_audio_path(
            "data/user_submissions/audio/current.webm",
            audio_root=audio_root,
            project_root=project_root,
        )
        == current_path
    )
    assert (
        exporter.resolve_audio_path(
            "audio/legacy.webm",
            audio_root=audio_root,
            project_root=project_root,
        )
        == legacy_path
    )


def test_export_joins_session_feedback_and_groups_session_takes(
    tmp_path: Path,
    monkeypatch,
) -> None:
    project_root = tmp_path / "project"
    audio_root = project_root / "data" / "user_submissions"
    audio_dir = audio_root / "audio"
    audio_dir.mkdir(parents=True)
    (audio_dir / "take-1.webm").write_bytes(b"take 1")
    (audio_dir / "take-2.webm").write_bytes(b"take 2")
    (audio_dir / "legacy-take.webm").write_bytes(b"legacy")

    db_path = tmp_path / "oracle.db"
    _create_export_db(db_path)
    out_dir = tmp_path / "exported"
    manifest_path = tmp_path / "manifest.csv"

    monkeypatch.setattr(exporter, "ROOT", project_root)
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "export_research_consent_manifest.py",
            "--db",
            str(db_path),
            "--audio-root",
            str(audio_root),
            "--out-dir",
            str(out_dir),
            "--out-manifest",
            str(manifest_path),
            "--include-unlabeled",
        ],
    )

    exporter.main()

    with manifest_path.open(newline="", encoding="utf-8") as handle:
        rows = {row["recording_id"]: row for row in csv.DictReader(handle)}

    assert rows["take-1"]["client_id"] == "oracle:session-1"
    assert rows["take-2"]["client_id"] == "oracle:session-1"
    assert rows["take-1"]["label"] == "central"
    assert float(rows["take-1"]["was_correct"]) == 1
    assert rows["legacy-take"]["client_id"] == "oracle:legacy-take"
    assert rows["legacy-take"]["label"] == "valencian"
    assert float(rows["legacy-take"]["was_correct"]) == 0
    assert rows["unlabeled-take"]["label"] == ""
    assert rows["unlabeled-take"]["audio_prepared"] == "False"
    assert (out_dir / "take-1.webm").read_bytes() == b"take 1"
    assert (out_dir / "take-2.webm").read_bytes() == b"take 2"
    assert (out_dir / "legacy-take.webm").read_bytes() == b"legacy"
