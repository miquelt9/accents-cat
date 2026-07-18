# Contributing

This is a **research prototype**, not a production product. Small, focused PRs that match existing style are welcome.

## Paths to run the app

**Mock-first (no model):**

```bash
cd web && npm install && npm run dev
```

**API mode (real scores):** download the classifier, then start FastAPI and run the web app with `VITE_ACCENT_ORACLE_MODE=api`:

```bash
mkdir -p models/cv26-hubert-svm-calibrated
hf download miquelt-9/cv26-hubert-svm-calibrated \
  --local-dir models/cv26-hubert-svm-calibrated
```

Or train via [docs/ML_PIPELINE.md](docs/ML_PIPELINE.md). Details in the README.

Developer diagnostics (CPU hint, mock/API toggle, etc.) are off by default. Enable with `VITE_ACCENT_ORACLE_DEV=1` or `?dev=1`.

## Conventions

- UI copy stays in **Catalan** unless you are explicitly translating.
- Dialect labels (fixed order): `balearic`, `central`, `northern`, `northwestern`, `valencian`.
- Do not commit `.env`, `data/`, `models/`, `embeddings/`, or large binaries.
- After web changes: `cd web && npm run lint && npm run build`.
- Map metadata: do not hand-edit `web/src/lib/comarcaMapMeta.ts` — regenerate via scripts.

For architecture, safe edit boundaries, and agent-oriented notes, see **[AGENTS.md](AGENTS.md)**.
