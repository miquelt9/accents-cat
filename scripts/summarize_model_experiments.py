from __future__ import annotations

import json
from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "reports" / "model_comparison"
OUT.mkdir(parents=True, exist_ok=True)

rows: list[dict[str, object]] = []
for path in sorted((ROOT / "reports" / "model-artifacts").glob("*/artifact_eval.json")):
    name = path.parent.name
    parts = name.rsplit("_", 1)
    variant = parts[0]
    evaluation = parts[1] if len(parts) == 2 else "unknown"
    payload = json.loads(path.read_text())
    rows.append({
        "variant": variant,
        "evaluation": evaluation,
        "accuracy": payload.get("accuracy"),
        "macro_f1": payload.get("macro_f1"),
        "top2_accuracy": payload.get("top2_accuracy"),
        "log_loss": payload.get("log_loss"),
    })

frame = pd.DataFrame(rows).sort_values(["evaluation", "macro_f1"], ascending=[True, False])
frame.to_csv(OUT / "artifact_metrics.csv", index=False)

selected = frame[frame["variant"].isin([
    "cv26-hubert-svm-calibrated",
    "cv26-hubert-svm-clips5-votes",
    "cv26-hubert-svm-clips5",
])].copy()

fig, axes = plt.subplots(1, 2, figsize=(12, 4.8), constrained_layout=True)
for ax, metric, title in zip(
    axes,
    ["macro_f1", "top2_accuracy"],
    ["Macro F1", "Top-2 accuracy"],
):
    pivot = selected.pivot(index="variant", columns="evaluation", values=metric)
    pivot = pivot.reindex(["cv26-hubert-svm-calibrated", "cv26-hubert-svm-clips5", "cv26-hubert-svm-clips5-votes"])
    pivot.plot(kind="bar", ax=ax, color=["#4c78a8", "#f58518"], width=0.78)
    ax.set_title(title)
    ax.set_xlabel("")
    ax.set_ylabel("Score")
    ax.set_ylim(0.0, 0.8)
    ax.grid(axis="y", alpha=0.25)
    ax.legend(title="Evaluation", labels=["AINA", "Dev/test"] if set(pivot.columns) == {"aina-benchmark", "dev-test"} else None)
    ax.set_xticklabels(["single clip", "5 clips", "5 clips + votes"], rotation=18, ha="right")

fig.suptitle("Checked-in accents-cat model variants")
fig.savefig(OUT / "model_variants_comparison.png", dpi=180)
print(frame.to_string(index=False))
