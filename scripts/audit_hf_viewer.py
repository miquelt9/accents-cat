#!/usr/bin/env python3
"""Metadata-only audit through the Hugging Face Dataset Viewer API.

This avoids executing legacy dataset scripts locally. It is intentionally a
lightweight schema/split probe; full row counts and speaker statistics should
come later from a controlled download of metadata files.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

import requests


DATASETS = [
    "projecte-aina/annotated_catalan_common_voice_v17",
    "projecte-aina/commonvoice_benchmark_catalan_accents",
    "projecte-aina/LaFrescat",
    "softcatala/catalan-youtube-speech",
    "BSC-LT/distilled-catalan-youtube-speech",
    "projecte-aina/corts_valencianes_asr_a",
]

BASE_URL = "https://datasets-server.huggingface.co"


def hf_headers() -> dict[str, str]:
    token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN")
    return {"Authorization": f"Bearer {token}"} if token else {}


def get_json(endpoint: str, params: dict[str, Any]) -> dict[str, Any]:
    response = requests.get(
        f"{BASE_URL}/{endpoint}",
        params=params,
        headers=hf_headers(),
        timeout=60,
    )
    payload: dict[str, Any]
    try:
        payload = response.json()
    except Exception:
        payload = {"text": response.text}
    if response.status_code >= 400:
        return {
            "ok": False,
            "status_code": response.status_code,
            "url": f"{BASE_URL}/{endpoint}?{urlencode(params)}",
            "error": payload,
        }
    payload["ok"] = True
    return payload


def audit_dataset(dataset_id: str, rows_per_split: int) -> dict[str, Any]:
    result: dict[str, Any] = {"dataset": dataset_id}
    splits_payload = get_json("splits", {"dataset": dataset_id})
    result["splits_response"] = splits_payload
    if not splits_payload.get("ok"):
        return result

    split_rows = splits_payload.get("splits", [])
    result["splits"] = []
    for split_info in split_rows:
        config = split_info.get("config")
        split = split_info.get("split")
        split_result: dict[str, Any] = {
            "config": config,
            "split": split,
            "num_examples": split_info.get("num_examples"),
        }
        first_rows = get_json(
            "first-rows",
            {
                "dataset": dataset_id,
                "config": config,
                "split": split,
            },
        )
        split_result["first_rows_response"] = first_rows
        if first_rows.get("ok"):
            rows = first_rows.get("rows", [])[:rows_per_split]
            split_result["features"] = first_rows.get("features", [])
            split_result["rows"] = rows
        result["splits"].append(split_result)
    return result


def write_markdown(audits: list[dict[str, Any]], path: Path) -> None:
    lines = [
        "# Hugging Face Dataset Viewer Audit",
        "",
        "This report uses the Dataset Viewer API and does not execute local dataset scripts.",
        "",
    ]
    for audit in audits:
        lines.append(f"## {audit['dataset']}")
        if not audit.get("splits_response", {}).get("ok"):
            lines.append(f"- Error: `{audit['splits_response']}`")
            lines.append("")
            continue
        for split in audit.get("splits", []):
            lines.append(f"### `{split['config']}` / `{split['split']}`")
            lines.append(f"- Viewer examples: {split.get('num_examples')}")
            features = split.get("features") or []
            if features:
                columns = [feature.get("name") for feature in features]
                lines.append(f"- Columns: `{columns}`")
            rows = split.get("rows") or []
            if rows:
                sample = rows[0].get("row", rows[0])
                preview = {
                    key: value
                    for key, value in sample.items()
                    if key != "audio" and not str(key).startswith("__")
                }
                lines.append(f"- First row preview: `{preview}`")
            else:
                lines.append(f"- First rows error: `{split.get('first_rows_response')}`")
            lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--rows-per-split", type=int, default=3)
    parser.add_argument("--out-dir", type=Path, default=Path("reports"))
    args = parser.parse_args()

    args.out_dir.mkdir(parents=True, exist_ok=True)
    audits = [audit_dataset(dataset_id, args.rows_per_split) for dataset_id in DATASETS]
    json_path = args.out_dir / "dataset_viewer_audit.json"
    md_path = args.out_dir / "dataset_viewer_audit.md"
    json_path.write_text(json.dumps(audits, indent=2, ensure_ascii=False), encoding="utf-8")
    write_markdown(audits, md_path)
    print(f"Wrote {json_path}")
    print(f"Wrote {md_path}")


if __name__ == "__main__":
    main()
