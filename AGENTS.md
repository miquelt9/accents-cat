# Agent guide — Catalan Accent Oracle

Instructions for AI coding agents (Cursor, Codex, etc.) working in this repository.

## Mission

Build a **Catalan dialect similarity** web experience: user reads aloud → model returns five macro-dialect scores → UI shows a geographic heatmap. Treat output as *acoustic similarity to dialect areas*, never as birthplace or identity.

## Architecture map

| Layer | Path | Role |
| --- | --- | --- |
| Web UI | `web/` | Vite + React + TypeScript. Catalan copy. Phases: landing → recording → mandatory validation when unsure → results → optional third refine → manage-data. |
| Inference client | `web/src/lib/accentOracleClient.ts` | `mock-fail` (default) or `api` via `VITE_ACCENT_ORACLE_MODE`; with `?dev=1`, Mode cycles `api` / `mock-fail` / `mock-success`. Shared `AccentOracleResult` shape (`recordingId?`). Also `submitFeedback` / `submitResearchConsent`. |
| Submission ledger | `web/src/lib/submissionLedger.ts` | Browser `localStorage` list of **research-consented** analysis-session IDs + feedback IDs (cap ~50) for Manage My Data. |
| Results map | `web/src/components/ResultsMapStage.tsx` | Ranking sidebar + interactive linework map. |
| Interactive map | `web/src/components/map/DialectMap.tsx` | Framer Motion pan/zoom, macro-region highlight, focus/inspect pin callout. |
| Region framing | `web/src/lib/dialectRegions.ts` | Comarca sets + camera fit per macro-dialect. |
| Focus pin | `web/src/lib/dialectFocusComarca.ts` | Score-weighted hotspot blend → nearest comarca (illustrative; always guesses). Adjacent pairs from `dialectGeography.ts`. |
| Dialect geography | `web/src/lib/dialectGeography.ts` | Mainland adjacency for pin blend; incoherent top-two (e.g. northern+valencian, any+balearic) for validation. |
| Hotspots (legacy heat) | `web/src/lib/dialectHotspots.ts` | Editorial anchors for focus blend + offline `buildComarcaHeat`. |
| Comarca heat (legacy) | `web/src/lib/buildComarcaHeat.ts` | Score → fills for offline experiments; not painted on the oracle stage. |
| Comarca metadata | `web/src/lib/comarcaMapMeta.ts` | **Generated** by `scripts/build_comarca_map.py` — do not hand-edit. |
| Comarca allowlist | `backend/comarques.py` | **Generated** by `scripts/build_comarca_map.py`: `COMARCA_SLUGS` + `COMARCA_MACRO_DIALECTS` for server-side validation. |
| Map asset (results) | `web/public/map-oracle-linework.svg` | Canonical interactive linework map. Built by `scripts/build_comarca_map.py`. |
| Map asset (source) | `web/public/mapa-comarcal-accents.svg` | Comarcal source geometry; edit this, then rebuild. |
| Backend | `backend/app.py` | FastAPI: HuBERT embed → calibrated SVM → JSON matching `AccentOracleResult` (+ session/take IDs). Also `/analysis-finalize`, `/research-consent`, `/feedback`, `/telemetry/event`, `/sentry-debug` (dev). |
| Observability | `backend/observability.py`, `web/src/lib/sentry.ts`, `web/src/lib/telemetry.ts` | Sentry (errors/logs/traces) + Grafana OTLP metrics. Never send audio/bodies/comarca/session IDs/recording IDs. See README Observability. |
| User submissions | `data/user_submissions/` | **Gitignored.** SQLite + audio: `/analyze` creates a pending analysis session and one row per take; durable research storage for all linked takes only after `POST /research-consent` with `consent: true`. Soft-delete: `python scripts/soft_delete_submission.py <session-or-recording-uuid>` (no admin UI in v1). |
| ML scripts | `scripts/` | Audits, manifests, audio prep, embeddings, training, evaluation. |
| Artifacts | `models/`, `embeddings/`, `data/` | **Gitignored.** Never commit large binaries or secrets. Inference classifier mirror: [`miquelt-9/cv26-hubert-svm-calibrated`](https://huggingface.co/miquelt-9/cv26-hubert-svm-calibrated) (`model.joblib` + `metadata.json`). |
| Reports | `reports/` | Human-readable experiment logs. Update when changing evaluation methodology. |

## Dialect contract

Fixed label order everywhere (backend metadata, frontend types, heatmap):

`balearic`, `central`, `northern`, `northwestern`, `valencian`

API response fields must stay aligned with `AccentOracleResult` in `accentOracleClient.ts`. Optional future field: `regionalHeatPoints` for finer maps. Successful analyze responses include a per-take `recordingId`, shared `analysisSessionId`, and one-based `takeIndex`.

### `/analyze` storage + load guards

- FormData: required `audio`; optional `promptId` / `promptText` / `sentenceIds` / `analysisSessionId` (web always sends the prompt, original CV26 IDs, and shared session ID; max 64 / 500 chars, max four 64-hex sentence IDs). Successful analyzes write a **pending** audio + DB take row (including prompt fields and sentence IDs) and return `recordingId`, `analysisSessionId`, and `takeIndex`. Pending sessions expire (`ORACLE_PENDING_CONSENT_TTL_SECONDS`, default 1800). **Research retention** is opt-in via landing pre-consent (auto-promote on results) or the results progressive funnel (`ResultsConsentFeedback`); footer links cover Privadesa / Termes on landing, recording, validation, and results.
- `POST /analysis-finalize` body: `{ analysisSessionId, finalResult, takeCount, terminalState }` → persists the displayed merged result while the session is pending.
- `POST /research-consent` body: `{ analysisSessionId, consent, ageConfirmed?, policyVersion? }` → promotes every pending take in the session → `research_consent=1` (+ `consent_at`, `policy_version`) or soft-deletes the complete session on decline. Train later **only** on `research_consent=1 AND deleted_at IS NULL`.
- Inference: fixed in-process FIFO worker pool (`ORACLE_WORKERS`, CPU-aware default) with bounded waiting queue (`ORACLE_MAX_QUEUE_SIZE`, default `20`) → HTTP 503 + `Retry-After` when full. `ORACLE_ENCODE_CONCURRENCY` is a deprecated compatibility fallback. HuBERT + classifier inference runs in dedicated worker threads with Torch thread caps.
- IP sliding-window rate limits: `/analyze` (`ORACLE_ANALYZE_RATE_LIMIT` / `ORACLE_ANALYZE_RATE_WINDOW`, default 10/60s); lighter on `/feedback` and `/research-consent` (30/60s). Set `ORACLE_TRUST_PROXY=1` behind a reverse proxy so `X-Forwarded-For` is used for IP. `client_ip()` feeds the in-memory limiters only — **no IP or User-Agent is ever persisted** (`ensure_storage()` NULLs the legacy columns on boot).
- Audio caps: min 3.0 s, max `ORACLE_MAX_AUDIO_SECONDS` (default 20) + 20 MB upload.

### Feedback + Manage My Data

- `POST /feedback` body: `{ feedbackId?, analysisSessionId, recordingId?, wasCorrect?: boolean | null, comarca?, selfReportedDialect?, notes? }` → `{ feedbackId }`. The funnel posts answers one at a time, so `storage.upsert_feedback` **updates only the supplied fields** (`storage.UNSET` sentinel; an absent `wasCorrect` keeps the stored thumb, an explicit `null` clears it). One session-level feedback row relates the outcome to every take and the final result. Sending back the returned `feedbackId` updates that row instead of adding one; an unknown id inserts a fresh server-generated row.
- `comarca` is a self-declared slug validated against generated `backend.comarques.COMARCA_SLUGS` (shape-checked against `^[a-z0-9-]{1,48}$` while the module has not been generated).
- Self-report values: `balearic` \| `central` \| `northern` \| `northwestern` \| `valencian` \| `mixed` \| `unknown`.
- UI: `ResultsConsentFeedback` after the heatmap — landing pre-consent auto-promotes all pending session takes; otherwise thumbs → research Sí/No (No closes the sheet and leaves thumbs re-clickable; Sí opens comarca). Comarca requires a selection to send; leaving validation/results without retention declines the pending session (API mode). After an affirmative research retain, «Tornar a l'inici» keeps that consent in memory for the visit (skips the landing checkbox, auto-promotes the next session) and may pre-fill the last declared comarca. Footer link «Gestiona les meves dades» → `manage-data` phase. Ledger lists only analysis sessions the user opted to store for research.
- Soft-delete (operator / Manage My Data) scrubs the session final result, every take's prompt / scores, clears consent fields, clears `audio_path`, removes every linked audio file, and clears linked feedback fields (including `comarca`). Decline / pending TTL purge also scrub the session and takes but **keep** feedback calibration (`was_correct`, `self_reported_dialect`, `comarca`) while **unlinking** the session and take IDs.
- Research-consented sessions keep every take's audio, prompt, scores, final merged result and one linked feedback outcome (not anonymity — the voice itself is personal data). Train filter: `research_consent=1 AND deleted_at IS NULL`.
- Retention: max ~3 years from session consent (`ORACLE_RESEARCH_RETENTION_YEARS`, default 3). Operator purge: `python scripts/purge_expired_research.py`. Session/take delete: `python scripts/soft_delete_submission.py <session-or-recording-uuid>`.
- Privacy contact + controller name come from build env: `VITE_PRIVACY_EMAIL`, `VITE_CONTROLLER_NAME` ([`web/.env.example`](web/.env.example)). Until set, UI shows provisional `privacy@example.com`. Deletion is email → soft-delete script, not an automated API in v1.
- In-app Catalan **Política de privadesa** / **Termes d'ús**: [`web/src/lib/legalDocs.ts`](web/src/lib/legalDocs.ts) (`LEGAL_POLICY_VERSION`, currently `15 d'agost de 2026`, must match backend `ORACLE_POLICY_VERSION` / default). Not legal advice; set contact + controller name before public launch.
- Do not frame feedback or results as geographic origin detection; the comarca is user-declared and optional, and Privadesa says so explicitly.

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
- Hand-edit `comarcaMapMeta.ts` or `backend/comarques.py` — regenerate from `scripts/build_comarca_map.py` and `scripts/comarca_dialect_map.json`.
- Present model output as geographic origin in user-facing text.

## Common tasks

### Web-only UI work

```bash
cd web && npm install && npm run dev
```

Mock mode needs no backend. Test API mode with backend running and `VITE_ACCENT_ORACLE_MODE=api`.

Developer status messages (CPU inference hint) and the in-UI Mode cycle (**API → mock fail → mock success**) are off by default. Enable with `VITE_ACCENT_ORACLE_DEV=1` or `?dev=1` (`web/src/lib/devFlags.ts`; persists as `localStorage` `accent-oracle-dev=1`). Use **mock fail** to force the mandatory-second + optional-third path; **mock success** for a clear first take (cycles five dialect winners across successive runs).

Results **Comparteix** uses the Web Share API with a PNG (`navigator.share({ files })`) on capable phones. That requires a secure context (`window.isSecureContext` — HTTPS or localhost). Mic recording has the same requirement. For phone LAN testing, use `npm run dev:lan` (Vite `@vitejs/plugin-basic-ssl` + `--host`); open the printed `https://<lan-ip>:5173/` URL and accept the self-signed cert warning. In API mode set `VITE_ACCENT_ORACLE_API_URL=` (empty) so the Vite proxy forwards to `127.0.0.1:8000` same-origin (avoids mixed content). On plain `http://` LAN IPs, mic/share stay blocked.

### Backend / inference

```bash
source .venv/bin/activate   # after: pip install -r requirements.txt
mkdir -p models/cv26-hubert-svm-calibrated
hf download miquelt-9/cv26-hubert-svm-calibrated \
  --local-dir models/cv26-hubert-svm-calibrated
uvicorn backend.app:app --reload --host 127.0.0.1 --port 8000
```

- Classifier Hub id: `miquelt-9/cv26-hubert-svm-calibrated` (small joblib; keep out of git).
- Encoder `BSC-LT/hubert-base-ca-2k` (Apache-2.0; see root [`NOTICE`](NOTICE)) downloads into the HF cache on first `/analyze` (slow on CPU).
- System **ffmpeg** required so `librosa` can decode browser WebM recordings.
- Web: `VITE_ACCENT_ORACLE_MODE=api` + `VITE_ACCENT_ORACLE_API_URL=http://localhost:8000` (+ `VITE_ACCENT_ORACLE_DEV=1` for diagnostics). Phone LAN: `npm run dev:lan` with empty `VITE_ACCENT_ORACLE_API_URL` (Vite HTTPS + API proxy). CORS allowlist is Vite’s `5173` (http/https localhost).

### Map changes

1. Edit `web/public/mapa-comarcal-accents.svg` or `scripts/comarca_dialect_map.json`.
2. Run `scripts/build_comarca_map.py` — emits `web/public/map-oracle-linework.svg`, `web/src/lib/comarcaMapMeta.ts` and `backend/comarques.py`.
3. Adjust `DialectMap` / stage CSS only if interaction or styling changes.

### New model version

1. Manifest → audio → embeddings → `train_embedding_model_artifact.py`.
2. `evaluate_model_artifact.py` on held-out and benchmark sets.
3. Update `backend/app.py` `MODEL_DIR` if path changes.
4. Add report under `reports/model-artifacts/`.
5. If this becomes the default inference artifact, re-upload to Hugging Face (`hf upload miquelt-9/cv26-hubert-svm-calibrated …` or a new repo id) and update the Hub id in `README.md` / this file / `CONTRIBUTING.md`.

## Key thresholds (API)

From `backend/app.py`:

- Min audio: 3.0 s; max duration: 20 s (env `ORACLE_MAX_AUDIO_SECONDS`); max upload: 20 MB.
- Worker pool defaults from logical CPUs; analyze rate 10/min; feedback/research-consent rate 30/min (see env knobs above). Queue depth, active workers, queue wait, inference duration, total request duration, and rejections are logged / exported through OTLP when enabled.
- Pending research-consent TTL default 30 minutes (`ORACLE_PENDING_CONSENT_TTL_SECONDS`).
- `evidenceBand`: `limited` if top-two gap &lt; 0.08 or confidence &lt; 0.32; `strong` if gap &gt; 0.18 and confidence &gt; 0.48.
- Frontend `needsValidation`: mandatory second take unless top score ≥ 0.50 **and** top-two gap ≥ 0.15 **and** the top-two macros are geographically coherent (or the runner-up is weak &lt; 0.20). Validation and refinement always average every raw take score vector equally; score-vector disagreement above `0.18` keeps the result uncertain and prevents a strong evidence band. After three takes, keep the full distribution while retaining the clearly labelled illustrative comarca affinity pin ([`needsValidation.ts`](web/src/lib/needsValidation.ts), [`ResultsMapStage.tsx`](web/src/components/ResultsMapStage.tsx)).

Keep backend and mock client evidence-band thresholds in sync when changing map copy; validation gate is independent.

Read-aloud prompts: the generated CV26 pool in [`web/src/lib/readAloudPrompts.generated.ts`](web/src/lib/readAloudPrompts.generated.ts), selected through [`web/src/lib/prompts.ts`](web/src/lib/prompts.ts). Each prompt is one intact sentence in the 110–170 character / 16–26 word window (no joined fragments); `/analyze` stores `promptId` + `promptText` + the original CV26 `sentenceIds` on each pending submission row. Regenerate with `python scripts/build_read_aloud_prompts.py` after updating the local CV26 metadata.

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
- `Tortosí` and other transitional labels in CV26 metadata — **keep excluded** from the five-way train set (Phase 3 ablation: mapping to NW or Valencian hurt AINA; see [`reports/model_improvement_phase1.md`](reports/model_improvement_phase1.md)).

### Public release checklist (Spain)

Use the repeatable deployment evidence in
[`docs/PRODUCTION_CHECKLIST.md`](docs/PRODUCTION_CHECKLIST.md) and the
assessment in [`docs/PRODUCTION_READINESS.md`](docs/PRODUCTION_READINESS.md);
the items below are the project-specific summary.

1. Set `VITE_PRIVACY_EMAIL` + `VITE_CONTROLLER_NAME` and rebuild the web app; confirm Privadesa no longer says «provisional».
2. Host API + data in Spain / EEE; set `ORACLE_TRUST_PROXY=1` if TLS terminates in front of uvicorn (rate limiting only); optionally name the VPS provider in the privacy «Encàrrecs» section.
3. Smoke-test: analyze without opt-in → after decline or TTL, no audio file; opt-in → `research_consent=1` + `consent_at` + `policy_version`, with `ip` / `user_agent` NULL.
4. Soft-delete a test UUID → audio gone, prompt / scores / comarca scrubbed.
5. Configure `SENTRY_*` / `VITE_SENTRY_*` / `GRAFANA_OTLP_*` for production; add production CORS origins.
6. Better Stack: homepage + `/health` monitors (60s, SSL on, email only) — see the production checklist.
7. Optional: run `python scripts/purge_expired_research.py --dry-run` after setting old `consent_at` in a test DB.
8. Optional: short review with a Spanish privacy lawyer before going viral.

When unsure about linguistic labeling policy, read `reports/cv26_label_strategy_audit.json` before changing manifest builders.
