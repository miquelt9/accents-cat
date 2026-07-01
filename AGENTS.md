# Agent guide — Catalan Accent Oracle

Instructions for AI coding agents (Cursor, Codex, etc.) working in this repository.

## Mission

Build a **Catalan dialect similarity** web experience: user reads aloud → model returns five macro-dialect scores → UI shows a geographic heatmap. Treat output as *acoustic similarity to dialect areas*, never as birthplace or identity.

## Architecture map

| Layer | Path | Role |
| --- | --- | --- |
| Web UI | `web/` | Vite + React + TypeScript. Catalan copy. Phases: landing → recording → optional validation → results. |
| Inference client | `web/src/lib/accentOracleClient.ts` | `mock` (default) or `api` via `VITE_ACCENT_ORACLE_MODE`. Shared `AccentOracleResult` shape. |
| Heatmap | `web/src/components/GeographicDialectHeatmap.tsx` | Loads SVG, applies comarca fills from scores. |
| Comarca coloring | `web/src/lib/buildComarcaHeat.ts` | Score → per-comarca fill. Do not confuse with legacy `buildHeatmapPoints.ts` / `dialectGeoAnchors.ts`. |
| Comarca metadata | `web/src/lib/comarcaMapMeta.ts` | **Generated** by `scripts/refactor_catalan_map.py` — do not hand-edit. |
| Map asset | `web/public/map-paisos-catalans.svg` | Canonical map for the app. Root `map-paisos-catalans.svg` / `paisos_catalans.svg` are source/working copies. |
| Backend | `backend/app.py` | FastAPI: HuBERT embed → calibrated SVM → JSON matching `AccentOracleResult`. |
| ML scripts | `scripts/` | Audits, manifests, audio prep, embeddings, training, evaluation. |
| Artifacts | `models/`, `embeddings/`, `data/` | **Gitignored.** Never commit large binaries or secrets. |
| Reports | `reports/` | Human-readable experiment logs. Update when changing evaluation methodology. |

## Dialect contract

Fixed label order everywhere (backend metadata, frontend types, heatmap):

`balearic`, `central`, `northern`, `northwestern`, `valencian`

API response fields must stay aligned with `AccentOracleResult` in `accentOracleClient.ts`. Optional future field: `regionalHeatPoints` for finer maps.

## Safe edit boundaries

### Do

- Keep UI copy in **Catalan** unless explicitly translating.
- Preserve speaker-grouped splits in any new training/eval code.
- Match existing patterns: minimal diffs, no drive-by refactors.
- Run `cd web && npm run lint && npm run build` after substantive web changes.
- Document new experiments under `reports/` with reproducible commands.

### Do not

- Commit `.env`, API keys, or `data/` / `models/` / `embeddings/`.
- Download multi-GB archives without user intent.
- Change dialect label strings without updating model metadata, backend, and frontend types together.
- Hand-edit `comarcaMapMeta.ts` — regenerate from `scripts/refactor_catalan_map.py` and `scripts/comarca_dialect_map.json`.
- Present model output as geographic origin in user-facing text.

## Common tasks

### Web-only UI work

```bash
cd web && npm install && npm run dev
```

Mock mode needs no backend. Test API mode with backend running and `VITE_ACCENT_ORACLE_MODE=api`.

### Backend / inference

```bash
source .venv/bin/activate
uvicorn backend.app:app --reload --host 127.0.0.1 --port 8000
```

Requires `models/cv26-hubert-svm-calibrated/` locally. First request is slow (model load).

### Map changes

1. Edit SVG or `scripts/comarca_dialect_map.json`.
2. Run `scripts/refactor_catalan_map.py`.
3. Copy/sync SVG to `web/public/map-paisos-catalans.svg`.
4. Adjust `buildComarcaHeat.ts` only if coloring logic changes.

### New model version

1. Manifest → audio → embeddings → `train_embedding_model_artifact.py`.
2. `evaluate_model_artifact.py` on held-out and benchmark sets.
3. Update `backend/app.py` `MODEL_DIR` if path changes.
4. Add report under `reports/model-artifacts/`.

## Key thresholds (API)

From `backend/app.py`:

- Min audio: 1.5 s; max upload: 20 MB.
- `evidenceBand`: `limited` if top-two gap &lt; 0.08 or confidence &lt; 0.32; `strong` if gap &gt; 0.18 and confidence &gt; 0.48.
- Frontend `needsValidation`: `limited` band or `isAmbiguousTopTwo` in API mode.

Keep backend and mock client thresholds in sync when changing UX.

## Documentation

| Doc | Audience |
| --- | --- |
| [README.md](README.md) | Humans — overview, quick start |
| [docs/ML_PIPELINE.md](docs/ML_PIPELINE.md) | ML engineers — training & data |
| [AGENTS.md](AGENTS.md) | AI agents — this file |
| `.cursor/rules/*.mdc` | Cursor — scoped conventions |

## Open questions / planned work

- Finer-grained heat via `regionalHeatPoints`.
- Real-user recording corpus for threshold tuning.
- Public deployment (hosting, model size, WASM vs server inference).
- `Tortosí` and other transitional labels in CV26 metadata.

When unsure about linguistic labeling policy, read `reports/cv26_label_strategy_audit.json` before changing manifest builders.
