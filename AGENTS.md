# Agent guide — Catalan Accent Oracle

Instructions for AI coding agents (Cursor, Codex, etc.) working in this repository.

## Mission

Build a **Catalan dialect similarity** web experience: user reads aloud → model returns five macro-dialect scores → UI shows a geographic heatmap. Treat output as *acoustic similarity to dialect areas*, never as birthplace or identity.

## Architecture map

| Layer | Path | Role |
| --- | --- | --- |
| Web UI | `web/` | Vite + React + TypeScript. Catalan copy. Phases: landing → recording → mandatory validation when unsure → results → optional third refine → manage-data. |
| Inference client | `web/src/lib/accentOracleClient.ts` | `mock-fail` (default) or `api` via `VITE_ACCENT_ORACLE_MODE`; with `?dev=1`, Mode cycles `api` / `mock-fail` / `mock-success`. Shared `AccentOracleResult` shape (`recordingId?`). Also `submitFeedback` / `submitResearchConsent` / `fetchClientInfo`. |
| Submission ledger | `web/src/lib/submissionLedger.ts` | Browser `localStorage` list of **research-consented** recording IDs + feedback IDs (cap ~50) for Manage My Data. |
| Results map | `web/src/components/ResultsMapStage.tsx` | Ranking sidebar + interactive linework map. |
| Interactive map | `web/src/components/map/DialectMap.tsx` | Framer Motion pan/zoom, focus, pin/label callout. |
| Comarca heat (legacy) | `web/src/lib/buildComarcaHeat.ts` | Score → fills for offline experiments; not painted on the oracle stage. |
| Comarca metadata | `web/src/lib/comarcaMapMeta.ts` | **Generated** by `scripts/refactor_catalan_map.py` — do not hand-edit. |
| Map asset (results) | `web/public/map-oracle-linework.svg` | Canonical interactive linework map. Built by `scripts/build_oracle_linework_map.py` (chains community snap). |
| Map asset (legacy filled) | `web/public/map-paisos-catalans.svg` | Filled choropleth source geometry; edit this, then rebuild linework. |
| Backend | `backend/app.py` | FastAPI: HuBERT embed → calibrated SVM → JSON matching `AccentOracleResult` (+ `recordingId`). Also `/research-consent`, `/feedback`, `/client-info`. |
| User submissions | `data/user_submissions/` | **Gitignored.** SQLite + audio: `/analyze` creates **pending** rows; durable research storage only after `POST /research-consent` with `consent: true`. Soft-delete: `python scripts/soft_delete_submission.py <uuid>` (no admin UI in v1). |
| ML scripts | `scripts/` | Audits, manifests, audio prep, embeddings, training, evaluation. |
| Artifacts | `models/`, `embeddings/`, `data/` | **Gitignored.** Never commit large binaries or secrets. Inference classifier mirror: [`miquelt-9/cv26-hubert-svm-calibrated`](https://huggingface.co/miquelt-9/cv26-hubert-svm-calibrated) (`model.joblib` + `metadata.json`). |
| Reports | `reports/` | Human-readable experiment logs. Update when changing evaluation methodology. |

## Dialect contract

Fixed label order everywhere (backend metadata, frontend types, heatmap):

`balearic`, `central`, `northern`, `northwestern`, `valencian`

API response fields must stay aligned with `AccentOracleResult` in `accentOracleClient.ts`. Optional future field: `regionalHeatPoints` for finer maps. Optional `recordingId` is set by the API on successful analyze (mock invents a client UUID).

### `/analyze` storage + load guards

- FormData: required `audio`; optional `promptId` / `promptText` (web always sends both; max 64 / 500 chars). Successful analyzes write a **pending** audio + DB row (including prompt fields) and return `recordingId`. Pending rows expire (`ORACLE_PENDING_CONSENT_TTL_SECONDS`, default 1800). **Research retention** is opt-in via landing pre-consent (auto-promote on results) or the results progressive funnel (`ResultsConsentFeedback`); footer links cover Privadesa / Termes on landing, recording, validation, and results.
- `POST /research-consent` body: `{ recordingId, consent, ageConfirmed?, policyVersion? }` → promotes pending → `research_consent=1` (+ `consent_at`, `policy_version`) or soft-deletes on decline. Train later **only** on `research_consent=1 AND deleted_at IS NULL`.
- Encode concurrency: in-process slot limit (`ORACLE_ENCODE_CONCURRENCY`, default `1`) → HTTP 503 + `Retry-After` when full. HuBERT `extract_embedding` runs in `asyncio.to_thread`.
- IP sliding-window rate limits: `/analyze` (`ORACLE_ANALYZE_RATE_LIMIT` / `ORACLE_ANALYZE_RATE_WINDOW`, default 10/60s); lighter on `/feedback` and `/research-consent` (30/60s). Set `ORACLE_TRUST_PROXY=1` behind a reverse proxy so `X-Forwarded-For` is used for IP.
- Audio caps: min 1.5 s, max `ORACLE_MAX_AUDIO_SECONDS` (default 25) + 20 MB upload.

### Feedback + Manage My Data

- `POST /feedback` body: `{ recordingId, wasCorrect: boolean | null, selfReportedDialect?, notes? }` → `{ feedbackId }`.
- Self-report values: `balearic` \| `central` \| `northern` \| `northwestern` \| `valencian` \| `mixed` \| `unknown`.
- `GET /client-info` → `{ ip, userAgent }` for the Manage My Data page (API mode).
- UI: `ResultsConsentFeedback` after the heatmap — landing pre-consent auto-promotes pending audio; otherwise Sí/No → dialect if No → research opt-in → feedback then consent; leaving results without retention declines pending audio (API mode). Footer link «Gestiona les meves dades» → `manage-data` phase. Ledger lists only recordings the user opted to store for research.
- Soft-delete (operator / Manage My Data) scrubs IP / User-Agent / prompt / scores, clears consent fields, clears `audio_path`, removes audio, and clears linked feedback fields. Decline / pending TTL purge also scrub IP/UA/audio but **keep** feedback calibration (`was_correct`, `self_reported_dialect`) while **unlinking** `submission_id` (no join to the tombstone).
- Research-consented rows keep **IP + User-Agent with the audio** for later training and coarse IP geolocation (not anonymity). Train filter: `research_consent=1 AND deleted_at IS NULL`.
- Retention: max ~3 years from consent (`ORACLE_RESEARCH_RETENTION_YEARS`, default 3). Operator purge: `python scripts/purge_expired_research.py`. Per-ID delete: `python scripts/soft_delete_submission.py <uuid>`.
- Privacy contact + controller name come from build env: `VITE_PRIVACY_EMAIL`, `VITE_CONTROLLER_NAME` ([`web/.env.example`](web/.env.example)). Until set, UI shows provisional `privacy@example.com`. Deletion is email → soft-delete script, not an automated API in v1.
- In-app Catalan **Política de privadesa** / **Termes d'ús**: [`web/src/lib/legalDocs.ts`](web/src/lib/legalDocs.ts) (`LEGAL_POLICY_VERSION` must match backend `ORACLE_POLICY_VERSION` / default). Not legal advice; set contact + controller name before public launch.
- Do not frame feedback or results as geographic origin detection; IP geolocation for corpus context is disclosed separately in Privadesa.

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

Developer status messages (CPU inference hint, mock IP label) and the in-UI Mode cycle (**API → mock fail → mock success**) are off by default. Enable with `VITE_ACCENT_ORACLE_DEV=1` or `?dev=1` (`web/src/lib/devFlags.ts`; persists as `localStorage` `accent-oracle-dev=1`). Use **mock fail** to force the mandatory-second + optional-third path; **mock success** for a clear first take.

Results **Comparteix** uses the Web Share API with a PNG (`navigator.share({ files })`) on capable phones. That requires a secure context (`window.isSecureContext` — HTTPS or localhost). On plain `http://` LAN IPs, native share is unavailable and the UI falls back to downloading the image; test share on a deployed HTTPS host (or add Vite HTTPS locally if you need phone LAN testing).

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

- Min audio: 1.5 s; max duration: 25 s (env `ORACLE_MAX_AUDIO_SECONDS`); max upload: 20 MB.
- Encode concurrency default 1; analyze rate 10/min; feedback/research-consent rate 30/min (see env knobs above).
- Pending research-consent TTL default 30 minutes (`ORACLE_PENDING_CONSENT_TTL_SECONDS`).
- `evidenceBand`: `limited` if top-two gap &lt; 0.08 or confidence &lt; 0.32; `strong` if gap &gt; 0.18 and confidence &gt; 0.48.
- Frontend `needsValidation`: mandatory second take unless top score ≥ 0.50 **and** top-two gap ≥ 0.15; merge with `mergeValidationResults` (same top → clearer; else average). If still uncertain, optional third take ([`needsValidation.ts`](web/src/lib/needsValidation.ts)).

Keep backend and mock client evidence-band thresholds in sync when changing map copy; validation gate is independent.

Read-aloud prompts: short pool in [`web/src/lib/prompts.ts`](web/src/lib/prompts.ts); `/analyze` stores `promptId` + `promptText` on the pending submission row.

## Documentation

| Doc | Audience |
| --- | --- |
| [README.md](README.md) | Humans — overview, quick start |
| [docs/ML_PIPELINE.md](docs/ML_PIPELINE.md) | ML engineers — training & data |
| [AGENTS.md](AGENTS.md) | AI agents — this file |
| `.cursor/rules/*.mdc` | Cursor — scoped conventions |

## Open questions / planned work

- Ingest **research-consented** `data/user_submissions/` into training (filter `research_consent=1`; not automatic in v1).
- Finer-grained heat via `regionalHeatPoints`.
- Real-user recording corpus for threshold tuning (northern speaker bottleneck).
- Public deployment (hosting, model size, WASM vs server inference).
- Replace placeholder privacy email / controller name (`VITE_PRIVACY_EMAIL`, `VITE_CONTROLLER_NAME`) before launch.
- `Tortosí` and other transitional labels in CV26 metadata.

### Public release checklist (Spain)

1. Set `VITE_PRIVACY_EMAIL` + `VITE_CONTROLLER_NAME` and rebuild the web app; confirm Privadesa no longer says «provisional».
2. Host API + data in Spain / EEE; set `ORACLE_TRUST_PROXY=1` if TLS terminates in front of uvicorn; optionally name the VPS provider in the privacy «Encàrrecs» section.
3. Smoke-test: analyze without opt-in → after decline or TTL, no audio file; opt-in → `research_consent=1` + `consent_at` + `policy_version` (IP retained with audio).
4. Soft-delete a test UUID → audio gone, IP/UA/scores scrubbed.
5. Optional: run `python scripts/purge_expired_research.py --dry-run` after setting old `consent_at` in a test DB.
6. Optional: short review with a Spanish privacy lawyer before going viral.

When unsure about linguistic labeling policy, read `reports/cv26_label_strategy_audit.json` before changing manifest builders.
