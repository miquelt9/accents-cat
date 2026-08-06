"""Liveness, readiness, and build-metadata helpers (no heavy ML imports)."""

from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path
from typing import Any, Callable

from backend import storage

DEFAULT_APP_VERSION = "0.1.0"


def live_payload() -> dict[str, Any]:
    return {"ok": True}


def version_payload() -> dict[str, Any]:
    version = (
        os.environ.get("ORACLE_APP_VERSION", "").strip()
        or os.environ.get("SENTRY_RELEASE", "").strip()
        or DEFAULT_APP_VERSION
    )
    git_sha = os.environ.get("ORACLE_GIT_SHA", "").strip() or None
    built_at = os.environ.get("ORACLE_BUILT_AT", "").strip() or None
    return {
        "version": version,
        "gitSha": git_sha,
        "builtAt": built_at,
    }


def storage_is_writable() -> bool:
    """True when the submissions directory can be created and written."""
    try:
        storage.ensure_storage()
        probe = storage.SUBMISSIONS_DIR / ".ready_write_probe"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink(missing_ok=True)
        return True
    except (OSError, sqlite3.Error):
        return False


def metadata_is_loadable(metadata_path: Path) -> bool:
    try:
        data = json.loads(metadata_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        return False
    if not isinstance(data, dict):
        return False
    labels = data.get("labels")
    return isinstance(labels, list) and len(labels) > 0


def ready_payload(
    *,
    model_path: Path,
    metadata_path: Path,
    storage_writable: Callable[[], bool] | None = None,
) -> dict[str, Any]:
    """Classifier files present + metadata parseable + storage writable."""
    writable_fn = storage_writable or storage_is_writable
    checks = {
        "modelFile": model_path.is_file(),
        "metadataFile": metadata_path.is_file(),
        "metadataLoadable": metadata_is_loadable(metadata_path)
        if metadata_path.is_file()
        else False,
        "storageWritable": writable_fn(),
    }
    ok = all(checks.values())
    return {"ok": ok, "checks": checks}
