# Architecture

accents-cat is a Vite + React + TypeScript web app plus an optional FastAPI inference API. Scripts under `scripts/` prepare data, train, and evaluate. The UI runs without them.

## Web

`web/` is the product. Phase state lives in `web/src/App.tsx` (no router): landing, recording, validation when the first take is unsure, results, an optional third refine, and manage-data. The inference client is `web/src/lib/accentOracleClient.ts`.

| Mode | How |
| --- | --- |
| `mock-fail` | Default when `VITE_ACCENT_ORACLE_MODE` is unset. No backend. |
| `mock-success` | Dev Mode cycle (`?dev=1` or `VITE_ACCENT_ORACLE_DEV=1`). |
| `api` | `VITE_ACCENT_ORACLE_MODE=api` and `VITE_ACCENT_ORACLE_API_URL`. Calls `/analyze`. |

Results rendering is `web/src/components/ResultsMapStage.tsx` and `web/src/components/map/DialectMap.tsx`, on `web/public/map-oracle-linework.svg`.

## Backend

`backend/app.py` serves FastAPI: HuBERT embedding, a calibrated SVM, and JSON aligned with `AccentOracleResult`. Related modules: `backend/inference_pool.py` (worker pool) and `backend/observability.py` (Sentry and OTLP). The comarca allowlist is generated `backend/comarques.py`. Classifier files live in gitignored `models/`. Submissions live in gitignored `data/user_submissions/`.

Endpoint shapes, consent, rate limits, and the fixed label order are in [../AGENTS.md](../AGENTS.md).

## Scripts

`scripts/` covers audits, manifests, audio prep, embeddings, training, evaluation, and `scripts/build_comarca_map.py` (linework SVG, `web/src/lib/comarcaMapMeta.ts`, and `backend/comarques.py`). Pipeline steps: [../docs/ML_PIPELINE.md](../docs/ML_PIPELINE.md).
