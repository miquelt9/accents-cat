# Contributing

This is a **research prototype**, not a production product. Small, focused PRs that match existing style are welcome.

## Paths to run the app

**Mock-first (no model):**

```bash
cd web && npm install && VITE_ACCENT_ORACLE_DEV=1 npm run dev
```

**API mode (real scores):** needs system **ffmpeg**, then download the classifier, start FastAPI, and run the web app with API + dev flags:

```bash
mkdir -p models/cv26-hubert-svm-calibrated
hf download miquelt-9/cv26-hubert-svm-calibrated \
  --local-dir models/cv26-hubert-svm-calibrated
```

Or train via [docs/ML_PIPELINE.md](docs/ML_PIPELINE.md). Details (including `VITE_ACCENT_ORACLE_DEV=1`) in the README.

## Conventions

- UI copy stays in **Catalan** unless you are explicitly translating.
- Dialect labels (fixed order): `balearic`, `central`, `northern`, `northwestern`, `valencian`.
- Do not commit `.env`, `data/`, `models/`, `embeddings/`, or large binaries.
- After web changes: `cd web && npm run lint && npm run build && npm test`.
- After backend helper changes: `pytest -q` from the repo root (dev deps in `requirements-dev.txt`).
- Map metadata: do not hand-edit `web/src/lib/comarcaMapMeta.ts` — regenerate via scripts.

### CI

PRs and pushes to `main` run [`.github/workflows/ci.yml`](.github/workflows/ci.yml): web job (`npm ci` → lint → build → test) and python job (`pytest`). No torch, HuBERT, or ffmpeg in CI.

For architecture, safe edit boundaries, and agent-oriented notes, see **[AGENTS.md](AGENTS.md)**.
