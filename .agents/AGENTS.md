# Working in accents-cat

Catalan Accent Oracle: a read-aloud recording becomes five macro-dialect similarity scores and an illustrative comarca map. This file is how to change the repo. Install, features, and the full dialect and API contract stay in the docs below.

## Scope

- Change the UI in `web/`, inference and storage in `backend/`, and training or map generation in `scripts/` when the task needs it.
- Treat scores as acoustic similarity to dialect areas, never as birthplace or identity.
- Do not commit `models/`, `embeddings/`, `data/`, `.env`, or other secrets. Those artifact paths are gitignored.
- Prefer this `.agents/` index over expanding `.cursor/rules`. Keep Cursor rules thin; put new agent guidance here.

## Docs

| File | What it is |
| --- | --- |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Web, API, and ML script shape |
| [DESIGN.md](./DESIGN.md) | Look and copy intent |
| [testing.md](./testing.md) | What CI runs |
| [../AGENTS.md](../AGENTS.md) | Dialect labels, API, consent, and edit boundaries |
| [../README.md](../README.md) | Human overview and local setup |
| [../docs/ML_PIPELINE.md](../docs/ML_PIPELINE.md) | Training, manifests, and evaluation |

Link those files. Do not paste the dialect contract, endpoint list, or consent rules into a new note.

## Changes

- UI copy stays Catalan. Map interaction stays in `ResultsMapStage` and `DialectMap`.
- `web/src/lib/comarcaMapMeta.ts` and `backend/comarques.py` are generated. Rebuild them with `scripts/build_comarca_map.py`.
- New training or eval code keeps speaker-grouped splits.

## Verify

After web changes: `cd web && npm run lint && npm run build && npm test`. After backend or helper changes: `pytest -q` from the repo root (dev deps in `requirements-dev.txt`). CI does not download the model. Details: [testing.md](./testing.md).
