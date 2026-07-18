# Agent guide — Catalan Accent Oracle

Instructions for AI coding agents (Cursor, Codex, etc.) working in this repository.

## Mission

Build a **Catalan dialect similarity** web experience: user reads aloud → model returns five macro-dialect scores → UI shows a geographic heatmap. Treat output as *acoustic similarity to dialect areas*, never as birthplace or identity.

## Architecture map

| Layer | Path | Role |
| --- | --- | --- |
| Web UI | `web/` | Vite + React + TypeScript. Catalan copy. Phases: landing → recording → optional validation → results → manage-data. |
| Inference client | `web/src/lib/accentOracleClient.ts` | `mock` (default) or `api` via `VITE_ACCENT_ORACLE_MODE` (dev override via `devFlags.ts`). Shared `AccentOracleResult` shape (`recordingId?`). Also `submitFeedback` / `fetchClientInfo`. |
| Submission ledger | `web/src/lib/submissionLedger.ts` | Browser `localStorage` list of recording/feedback IDs (cap ~50) for Manage My Data. |
| Results map | `web/src/components/ResultsMapStage.tsx` | Ranking sidebar + interactive linework map. |
| Interactive map | `web/src/components/map/DialectMap.tsx` | Framer Motion pan/zoom, focus, pin/label callout. |
| Comarca heat (legacy) | `web/src/lib/buildComarcaHeat.ts` | Score → fills for offline experiments; not painted on the oracle stage. |
| Comarca metadata | `web/src/lib/comarcaMapMeta.ts` | **Generated** by `scripts/refactor_catalan_map.py` — do not hand-edit. |
| Map asset (results) | `web/public/map-oracle-linework.svg` | Canonical interactive linework map. Built by `scripts/build_oracle_linework_map.py` (chains community snap). |
| Map asset (legacy filled) | `web/public/map-paisos-catalans.svg` | Filled choropleth source geometry; edit this, then rebuild linework. |
| Backend | `backend/app.py` | FastAPI: HuBERT embed → calibrated SVM → JSON matching `AccentOracleResult` (+ `recordingId`). Also `/feedback`, `/client-info`. |
| User submissions | `data/user_submissions/` | **Gitignored.** SQLite + audio for consented API recordings/feedback. Manual delete by UUID (no admin UI in v1). |
| ML scripts | `scripts/` | Audits, manifests, audio prep, embeddings, training, evaluation. |
| Artifacts | `models/`, `embeddings/`, `data/` | **Gitignored.** Never commit large binaries or secrets. Inference classifier mirror: [`miquelt-9/cv26-hubert-svm-calibrated`](https://huggingface.co/miquelt-9/cv26-hubert-svm-calibrated) (`model.joblib` + `metadata.json`). |
| Reports | `reports/` | Human-readable experiment logs. Update when changing evaluation methodology. |

## Dialect contract

Fixed label order everywhere (backend metadata, frontend types, heatmap):

`balearic`, `central`, `northern`, `northwestern`, `valencian`

API response fields must stay aligned with `AccentOracleResult` in `accentOracleClient.ts`. Optional future field: `regionalHeatPoints` for finer maps. Optional `recordingId` is set by the API (and by mock with a client UUID).

### Feedback + Manage My Data

- `POST /feedback` body: `{ recordingId, wasCorrect: boolean | null, selfReportedDialect?, notes? }` → `{ feedbackId }`.
- Self-report values: `balearic` \| `central` \| `northern` \| `northwestern` \| `valencian` \| `mixed` \| `unknown`.
- `GET /client-info` → `{ ip, userAgent }` for the Manage My Data page (API mode).
- UI: `ResultsFeedback` after the heatmap; footer link «Gestiona les meves dades» → `manage-data` phase.
- Privacy contact in UI is a **placeholder**: `privacy@example.com` (clearly marked provisional). Deletion is email → manual soft-delete by ID, not an automated API in v1.
- Do not frame feedback or results as geographic origin detection.

## Safe edit boundaries

### Do

- Keep UI copy in **Catalan** unless explicitly translating.
- Preserve speaker-grouped splits in any new training/eval code.
- Match existing patterns: minimal diffs, no drive-by refactors.
- After substantive web changes: `cd web && npm run lint && npm run build && npm test`.
- After substantive backend/helper changes: `pytest -q` (dev deps via `requirements-dev.txt`; CI does not install full `requirements.txt`).
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

Developer status messages (CPU inference hint, “second sample did not improve”, mock IP label) and the in-UI mock/API toggle are off by default. Enable with `VITE_ACCENT_ORACLE_DEV=1` or `?dev=1` (`web/src/lib/devFlags.ts`; persists as `localStorage` `accent-oracle-dev=1`).

### Backend / inference

```bash
source .venv/bin/activate   # after: pip install -r requirements.txt
mkdir -p models/cv26-hubert-svm-calibrated
hf download miquelt-9/cv26-hubert-svm-calibrated \
  --local-dir models/cv26-hubert-svm-calibrated
uvicorn backend.app:app --reload --host 127.0.0.1 --port 8000
```

- Classifier Hub id: `miquelt-9/cv26-hubert-svm-calibrated` (small joblib; keep out of git).
- Encoder `BSC-LT/hubert-base-ca-2k` downloads into the HF cache on first `/analyze` (slow on CPU).
- System **ffmpeg** required so `librosa` can decode browser WebM recordings.
- Web: `VITE_ACCENT_ORACLE_MODE=api` + `VITE_ACCENT_ORACLE_API_URL=http://localhost:8000` (+ `VITE_ACCENT_ORACLE_DEV=1` for diagnostics). CORS allowlist is Vite’s default `5173` only.

### Map changes

1. Edit SVG source or `scripts/comarca_dialect_map.json`.
2. Run `scripts/refactor_catalan_map.py` (filled map + `comarcaMapMeta.ts`).
3. Run `scripts/build_oracle_linework_map.py` to refresh `web/public/map-oracle-linework.svg` (extracts paths + snaps floating communities). Requires `shapely`.
4. Adjust `DialectMap` / stage CSS only if interaction or styling changes.

### New model version

1. Manifest → audio → embeddings → `train_embedding_model_artifact.py`.
2. `evaluate_model_artifact.py` on held-out and benchmark sets.
3. Update `backend/app.py` `MODEL_DIR` if path changes.
4. Add report under `reports/model-artifacts/`.
5. If this becomes the default inference artifact, re-upload to Hugging Face (`hf upload miquelt-9/cv26-hubert-svm-calibrated …` or a new repo id) and update the Hub id in `README.md` / this file / `CONTRIBUTING.md`.

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

- Ingest consented `data/user_submissions/` into training (not automatic in v1).
- Finer-grained heat via `regionalHeatPoints`.
- Real-user recording corpus for threshold tuning (northern speaker bottleneck).
- Public deployment (hosting, model size, WASM vs server inference).
- `Tortosí` and other transitional labels in CV26 metadata.

When unsure about linguistic labeling policy, read `reports/cv26_label_strategy_audit.json` before changing manifest builders.
