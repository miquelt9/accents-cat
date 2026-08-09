from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient

from backend import app as oracle_app
from backend import storage


RESULT: dict[str, Any] = {
    "scores": {
        "balearic": 0.08,
        "central": 0.55,
        "northern": 0.12,
        "northwestern": 0.13,
        "valencian": 0.12,
    },
    "topLabel": "central",
    "runnerUpLabel": "northwestern",
    "topTwoGap": 0.42,
    "isAmbiguousTopTwo": False,
    "evidenceBand": "strong",
    "confidenceSummary": "strong",
    "interpretation": "test",
}


class AllowAllLimiter:
    def allow(self, _: str) -> bool:
        return True


class FakeInferenceJob:
    started = True

    async def result(self) -> SimpleNamespace:
        return SimpleNamespace(
            value=(dict(RESULT), 0.001),
            queue_wait_seconds=0.0,
        )


class FakeInferencePool:
    queue_depth = 0
    active_workers = 1
    average_queue_wait_seconds = 0.0

    def submit(self, _fn: Any, _path: Path) -> FakeInferenceJob:
        return FakeInferenceJob()


@pytest.fixture()
def api_client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    submissions_dir = tmp_path / "user_submissions"
    monkeypatch.setattr(storage, "SUBMISSIONS_DIR", submissions_dir)
    monkeypatch.setattr(storage, "AUDIO_DIR", submissions_dir / "audio")
    monkeypatch.setattr(storage, "DB_PATH", submissions_dir / "oracle.db")
    monkeypatch.setattr(storage, "PROJECT_ROOT", tmp_path)

    model_path = tmp_path / "model.joblib"
    metadata_path = tmp_path / "metadata.json"
    model_path.write_bytes(b"model")
    metadata_path.write_text(json.dumps({"labels": list(storage.DIALECT_LABELS)}))
    monkeypatch.setattr(oracle_app, "MODEL_PATH", model_path)
    monkeypatch.setattr(oracle_app, "METADATA_PATH", metadata_path)
    oracle_app.load_metadata.cache_clear()

    monkeypatch.setattr(oracle_app, "_inference_pool", FakeInferencePool())
    monkeypatch.setattr(oracle_app, "_analyze_limiter", AllowAllLimiter())
    monkeypatch.setattr(oracle_app, "_feedback_limiter", AllowAllLimiter())
    monkeypatch.setattr(oracle_app, "_telemetry_limiter", AllowAllLimiter())
    return TestClient(oracle_app.app)


def post_take(client: TestClient, session_id: str | None = None):
    data = {
        "promptId": "pluja-vinya",
        "promptText": "La pluja fina cau sobre la vinya vella.",
    }
    if session_id is not None:
        data["analysisSessionId"] = session_id
    return client.post(
        "/analyze",
        data=data,
        files={"audio": ("take.webm", b"fake-audio", "audio/webm")},
    )


def test_session_handshake_reuses_two_followup_takes_and_finalizes(
    api_client: TestClient,
) -> None:
    first = post_take(api_client)
    assert first.status_code == 200
    first_payload = first.json()
    session_id = first_payload["analysisSessionId"]
    assert session_id
    assert first_payload["takeIndex"] == 1

    second = post_take(api_client, session_id)
    third = post_take(api_client, session_id)
    assert second.status_code == 200
    assert third.status_code == 200
    assert second.json()["analysisSessionId"] == session_id
    assert third.json()["analysisSessionId"] == session_id
    assert second.json()["takeIndex"] == 2
    assert third.json()["takeIndex"] == 3

    too_many = post_take(api_client, session_id)
    assert too_many.status_code == 409

    final_result = dict(RESULT, analysisSessionId=session_id)
    finalized = api_client.post(
        "/analysis-finalize",
        json={
            "analysisSessionId": session_id,
            "finalResult": final_result,
            "takeCount": 3,
            "terminalState": "results",
        },
    )
    assert finalized.status_code == 200
    assert finalized.json() == {
        "analysisSessionId": session_id,
        "finalized": True,
    }

    with sqlite3.connect(storage.DB_PATH) as conn:
        row = conn.execute(
            "SELECT take_count, terminal_state, final_result_json "
            "FROM analysis_sessions WHERE id = ?",
            (session_id,),
        ).fetchone()
    assert row is not None
    assert row[0:2] == (3, "results")
    assert json.loads(row[2]) == final_result


def test_consent_promotes_every_take_and_decline_purges_session(
    api_client: TestClient,
) -> None:
    first = post_take(api_client)
    session_id = first.json()["analysisSessionId"]
    second = post_take(api_client, session_id)
    assert second.status_code == 200

    consented = api_client.post(
        "/research-consent",
        json={
            "analysisSessionId": session_id,
            "consent": True,
            "ageConfirmed": True,
            "policyVersion": "test",
        },
    )
    assert consented.status_code == 200
    assert consented.json()["researchConsent"] is True

    with sqlite3.connect(storage.DB_PATH) as conn:
        consent_count = conn.execute(
            """
            SELECT COUNT(*) FROM submissions
            WHERE analysis_session_id = ? AND research_consent = 1
            """,
            (session_id,),
        ).fetchone()[0]
    assert consent_count == 2

    pending = post_take(api_client)
    pending_session_id = pending.json()["analysisSessionId"]
    pending_recording_id = pending.json()["recordingId"]
    pending_audio = next(storage.AUDIO_DIR.glob(f"{pending_recording_id}.*"))

    declined = api_client.post(
        "/research-consent",
        json={"analysisSessionId": pending_session_id, "consent": False},
    )
    assert declined.status_code == 200
    assert declined.json()["researchConsent"] is False
    assert not pending_audio.exists()
    assert storage.analysis_session_exists(pending_session_id) is False


def test_analyze_purges_expired_pending_sessions(api_client: TestClient) -> None:
    expired = post_take(api_client)
    expired_session_id = expired.json()["analysisSessionId"]
    expired_recording_id = expired.json()["recordingId"]
    expired_at = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
    with sqlite3.connect(storage.DB_PATH) as conn:
        conn.execute(
            "UPDATE analysis_sessions SET pending_expires_at = ? WHERE id = ?",
            (expired_at, expired_session_id),
        )
        conn.commit()
    expired_audio = next(storage.AUDIO_DIR.glob(f"{expired_recording_id}.*"))

    fresh = post_take(api_client)
    assert fresh.status_code == 200
    assert fresh.json()["analysisSessionId"] != expired_session_id
    assert not expired_audio.exists()
    assert storage.analysis_session_exists(expired_session_id) is False


@pytest.mark.parametrize(
    ("path", "payload"),
    [
        (
            "/analysis-finalize",
            {
                "analysisSessionId": "",
                "finalResult": {},
                "takeCount": 1,
                "terminalState": "results",
            },
        ),
        ("/research-consent", {"analysisSessionId": "x" * 65, "consent": False}),
    ],
)
def test_malformed_session_ids_are_rejected(
    api_client: TestClient,
    path: str,
    payload: dict[str, Any],
) -> None:
    response = api_client.post(path, json=payload)
    assert response.status_code == 422


def test_proxy_relevant_health_and_telemetry_routes_reach_fastapi(
    api_client: TestClient,
) -> None:
    assert api_client.get("/live").status_code == 200
    assert api_client.get("/version").status_code == 200
    assert api_client.get("/health").status_code == 200
    assert api_client.get("/ready").status_code == 200
    assert (
        api_client.post(
            "/telemetry/event",
            json={"event": "homepage_viewed"},
        ).status_code
        == 204
    )
