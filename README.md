# Catalan Accent Oracle

**Quin és el meu accent en català?** — A research prototype that estimates which *macro dialect area* your Catalan speech sounds most similar to, inspired by [BoldVoice Accent Oracle](https://www.boldvoice.com/accent-oracle).

Record yourself reading a short Catalan passage (or upload audio), and the app shows a similarity heatmap across five dialect zones — not a claim about where you are from.

## What this is (and is not)

| This project does | This project does not |
| --- | --- |
| Compare your recording to five macro Catalan dialect areas | Pinpoint your town, comarca, or birthplace |
| Show calibrated similarity scores on a map of the Catalan-speaking territories | Replace linguistic expertise or self-identification |
| Offer a second recording when confidence is low (API mode) | Guarantee accuracy on short or noisy clips |

**Dialect zones:** `central`, `valencian`, `northwestern`, `northern`, `balearic`.

## Prerequisites

| Need | Mock UI | Local API |
| --- | --- | --- |
| Node.js 20+ (npm) | yes | yes |
| Python 3.11+ + venv | no | yes |
| System **ffmpeg** on `PATH` | no | yes — browser recordings are WebM; `librosa` needs ffmpeg to decode them |
| Disk / network | small | `pip install` pulls PyTorch + Transformers (multi‑GB); first analyze also caches HuBERT (`BSC-LT/hubert-base-ca-2k`) |

CORS is limited to `http://localhost:5173` and `http://127.0.0.1:5173`. If Vite prints a different port, free 5173 or open the app on 5173 so the browser origin matches.

## Quick start — web demo

The fastest way to explore the product flow is the browser app with a **mock scorer** (no model download):

```bash
cd web
npm install
VITE_ACCENT_ORACLE_DEV=1 npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). Record or upload audio, read the prompt aloud, and view the heatmap. With the dev flag you get the mock/API toggle and diagnostic UI (or use `?dev=1` instead).

### With the real model (local API)

1. **Python environment** (from repo root):

   ```bash
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

2. **Model artifact** — **not in git** (`models/` is gitignored). After step 1, `hf` is available via `huggingface_hub`. Download the published classifier ([`miquelt-9/cv26-hubert-svm-calibrated`](https://huggingface.co/miquelt-9/cv26-hubert-svm-calibrated)):

   ```bash
   mkdir -p models/cv26-hubert-svm-calibrated
   hf download miquelt-9/cv26-hubert-svm-calibrated \
     --local-dir models/cv26-hubert-svm-calibrated
   ```

   That pulls `model.joblib` + `metadata.json` (~225 KB; Hub may also drop a model-card `README.md` in the same folder — fine to keep). Alternatively, train your own via [docs/ML_PIPELINE.md](docs/ML_PIPELINE.md).

   On first inference, Transformers downloads **HuBERT** (`BSC-LT/hubert-base-ca-2k`) into the local HF cache (~hundreds of MB). The first `POST /analyze` on CPU is slow (model load); later requests are faster.

3. **Start the API:**

   ```bash
   uvicorn backend.app:app --reload --host 127.0.0.1 --port 8000
   ```

   Sanity check: `curl -s http://127.0.0.1:8000/health` should show `"ok": true` once the classifier files are in place (encoder loads lazily on first `/analyze`).

4. **Start the web app in API mode:**

   ```bash
   cd web
   VITE_ACCENT_ORACLE_MODE=api \
   VITE_ACCENT_ORACLE_API_URL=http://localhost:8000 \
   VITE_ACCENT_ORACLE_DEV=1 \
   npm run dev
   ```

**API endpoints:**

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Liveness |
| `POST` | `/analyze` | Multipart `audio` (+ `promptId` / `promptText`) → dialect scores + `recordingId` (audio + prompt stored) |
| `POST` | `/feedback` | JSON `{ recordingId, wasCorrect, selfReportedDialect?, notes? }` → `{ feedbackId }` |
| `GET` | `/client-info` | Server-seen `{ ip, userAgent }` for Manage My Data |

Successful `/analyze` calls store audio + metadata (including the read-aloud `promptId` / `promptText`) under gitignored `data/user_submissions/` (SQLite + audio files) and return `recordingId`. The recording UI discloses this; deletion is **manual** (email the placeholder contact in the UI → `python scripts/soft_delete_submission.py <uuid>`); there is no automated deletion API in v1.

Backend load guards (env overrides): `ORACLE_ENCODE_CONCURRENCY` (default `1`), `ORACLE_ANALYZE_RATE_LIMIT` / `ORACLE_ANALYZE_RATE_WINDOW` (default `10` / `60`s), `ORACLE_FEEDBACK_RATE_LIMIT` / `ORACLE_FEEDBACK_RATE_WINDOW` (default `30` / `60`s), `ORACLE_MAX_AUDIO_SECONDS` (default `25`), `ORACLE_ENCODE_RETRY_AFTER` (default `5`).

## How it works

```mermaid
flowchart LR
  subgraph web [Web app]
    Rec[Recorder / upload]
    Map[Interactive linework SVG]
    Rec --> Client[accentOracleClient]
    Client --> Map
  end

  subgraph api [Backend optional]
    HuBERT[BSC-LT/hubert-base-ca-2k]
    SVM[Calibrated Linear SVM]
    HuBERT --> SVM
  end

  Client -->|mock or POST /analyze| api
  SVM -->|5 dialect scores| Client
```

1. User reads a short Catalan prompt drawn from a dialect-sensitive pool ([`web/src/lib/prompts.ts`](web/src/lib/prompts.ts)).
2. Audio is sent to the mock client or the FastAPI backend ([`backend/app.py`](backend/app.py)), with the prompt id/text for storage.
3. The backend embeds audio with Catalan HuBERT (mean + std pooling), then runs a calibrated SVM.
4. Five dialect scores drive [`ResultsMapStage`](web/src/components/ResultsMapStage.tsx) — ranking sidebar plus interactive linework map ([`map-oracle-linework.svg`](web/public/map-oracle-linework.svg)).

In API mode, a second take is requested unless the first result clears a confidence bar (top score ≥ 0.50 and top-two gap ≥ 0.15); the second prompt is a different sentence from the same pool ([`needsValidation.ts`](web/src/lib/needsValidation.ts)).

## Current model (research snapshot)

| Metric | Held-out CV26 dev+test | External AINA benchmark |
| --- | ---: | ---: |
| Accuracy | ~50% | ~50% |
| Macro F1 | ~51% | ~50% |
| Top-2 accuracy | ~72% | ~70% |

Encoder: `BSC-LT/hubert-base-ca-2k`. Classifier: `StandardScaler` + `CalibratedClassifierCV(LinearSVC)` — published at [`miquelt-9/cv26-hubert-svm-calibrated`](https://huggingface.co/miquelt-9/cv26-hubert-svm-calibrated). Trained on 1,440 balanced CV26 clips (96 speakers × 3 clips × 5 dialects). Details: [`reports/model_artifact_cv26_hubert_svm_calibrated.md`](reports/model_artifact_cv26_hubert_svm_calibrated.md).

**Speaker scarcity:** the balanced set is capped by the **northern** dialect (~96 usable speakers after benchmark holdout), while central has thousands. Consenting user recordings plus self-reported dialect labels (via post-result feedback) are the main path to more speaker diversity beyond CV26.

Suitable for a **local research prototype**, not a polished public release without more real-user testing and UX guardrails.

## Repository layout

```
proj-accents/
├── web/                 # Vite + React + TypeScript UI
├── backend/             # FastAPI inference API
├── scripts/             # Data prep, embeddings, training, audits
├── notebooks/           # Colab/Kaggle end-to-end pipeline
├── manifests/           # Speaker-balanced CSV manifests (no audio)
├── reports/             # Audits, baselines, evaluation write-ups
├── docs/                # Deeper documentation
├── data/                # Local only (gitignored): raw archives, audio
│   └── user_submissions/  # API mode: SQLite + stored audio/feedback
├── embeddings/          # Local only (gitignored)
└── models/              # Local only (gitignored): joblib artifacts
```

Large artifacts (`data/`, `embeddings/`, `models/`, `*.tar.gz`, `*.zip`) stay out of git. The inference classifier is published on Hugging Face (see Quick start); training data/embeddings are regenerated from manifests and scripts.

## ML & dataset work

Training, audits, Colab bundles, and baseline commands live in **[docs/ML_PIPELINE.md](docs/ML_PIPELINE.md)**.

Highlights:

- Primary training data: Common Voice 26 Catalan (`train.tsv`, speaker-balanced).
- Hugging Face dataset loaders are unreliable for some AINA sets — prefer TSV metadata audits.
- Splits are **speaker-grouped** to avoid leakage.
- Cloud notebook: [`notebooks/cv26_accent_oracle_colab.ipynb`](notebooks/cv26_accent_oracle_colab.ipynb).

## Environment variables

Copy [`.env.example`](.env.example) to `.env` for Mozilla Data Collective downloads (~79 GB CV26 archive). Web app uses Vite env vars:

| Variable | Purpose |
| --- | --- |
| `VITE_ACCENT_ORACLE_MODE` | `api` or omit for mock |
| `VITE_ACCENT_ORACLE_API_URL` | Backend base URL (default `http://localhost:8000`) |
| `VITE_ACCENT_ORACLE_DEV` | `1` to show diagnostic UI (CPU hint, validation internals, mock IP label) + mock/API toggle. Also `?dev=1` (persists in `localStorage`; `?dev=0` clears). |

## Development checks

Before substantive web/backend PRs, run the same lightweight checks CI will enforce (no model download, no HuBERT, no ffmpeg):

```bash
# Web — lint, production build, unit tests
cd web && npm run lint && npm run build && npm test

# Python — unit tests (from repo root; use requirements-dev.txt, not full torch stack)
pytest -q
```

GitHub Actions (`.github/workflows/ci.yml`) runs these on pull requests and pushes to `main`. Optional ML audits (e.g. `python scripts/audit_aina_tsv_metadata.py --max-rows 200000`) stay local.

## Collaborating

See **[CONTRIBUTING.md](CONTRIBUTING.md)** for a short contributor checklist. Summary:

| Path | What you need |
| --- | --- |
| **Mock-first** | `cd web && npm install && VITE_ACCENT_ORACLE_DEV=1 npm run dev` — no backend or model |
| **API mode** | Python venv + `hf download miquelt-9/cv26-hubert-svm-calibrated --local-dir models/cv26-hubert-svm-calibrated` + uvicorn + `VITE_ACCENT_ORACLE_MODE=api` + `VITE_ACCENT_ORACLE_DEV=1` |
| **Dev UI** | Included via `VITE_ACCENT_ORACLE_DEV=1` above, or `?dev=1` in the browser (persists in `localStorage`; `?dev=0` clears) |

License: [AGPL-3.0](LICENSE). Architecture and safe edit boundaries for humans and AI agents: **[AGENTS.md](AGENTS.md)** and [`.cursor/rules/`](.cursor/rules/).

## Status & next steps

**Done (research prototype):**

- [x] Dataset metadata audits and balanced manifests
- [x] HuBERT + calibrated SVM baseline (~50% top-1, ~72% top-2)
- [x] Local FastAPI + web prototype with interactive linework map
- [x] Post-result feedback + Manage My Data (ledger in the browser; backend store under `data/user_submissions/`)

**Known limitations / not production-ready:**

- [ ] Privacy contact is a **placeholder** (`privacy@example.com`); deletion is email → manual soft-delete by ID (no self-serve API)
- [ ] Map community snap is **visual placement**, not true geographic topology
- [ ] User submissions are **not** auto-ingested into training
- [ ] Grow speaker diversity via consented recordings + self-labels (northern bottleneck)
- [ ] More real-user recordings and threshold tuning
- [ ] Optional finer-grained `regionalHeatPoints` in API responses
- [ ] Public deployment polish (hosting, model size, WASM vs server inference)
