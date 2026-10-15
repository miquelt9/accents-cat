---
title: Accents Cat Api
emoji: ⚡
colorFrom: yellow
colorTo: indigo
sdk: gradio
sdk_version: 6.30.0
python_version: '3.12'
app_file: app.py
pinned: false
short_description: API for accents-cat project
---

# Catalan Accent Oracle API

This public Gradio Space exposes the FastAPI service used by the [GitHub Pages frontend](https://miquelt9.github.io/accents-cat/). The source backend is maintained in [miquelt9/accents-cat](https://github.com/miquelt9/accents-cat) and synchronized automatically from its `main` branch.

- `GET /health` reports whether the classifier is available.
- `GET /live` and `GET /ready` provide process and full readiness checks, including the inference worker pool.
- `POST /analyze` accepts an audio upload and returns dialect similarity scores.
- `/analysis-finalize`, `/research-consent`, and `/feedback` remain compatible API routes.

## Audio and user data

The Space runs with `ORACLE_RETAIN_USER_DATA=0`. Each uploaded recording is written to an ephemeral temporary file only while inference runs and is deleted before the response is returned. Analysis sessions, recordings, consent, audio, transcripts, scores, and results are not written to persistent storage. The `/research-consent` route reports `retained: false`; `/analysis-finalize` does not persist submitted data.

Users may optionally submit a comarca. With `ORACLE_RETAIN_ORIGIN_COUNTS=1`, the API increments only global counts for selected comarques in SQLite; it stores no individual response, timestamp, session or recording ID, audio, score, or result linkage. The database is on ephemeral Space storage.

The classifier revision is pinned in `model-revision.txt`. A daily GitHub Actions run checks for a new public model revision and syncs it to this Space. HuBERT files and the classifier are cached under `/tmp`; both locations are ephemeral. The Gradio page includes a ZeroGPU allocation check; inference runs on CPU.

To restore research retention in a future deployment, set `ORACLE_RETAIN_USER_DATA=1` on the Space and `VITE_RESEARCH_RETENTION_ENABLED=1` in the frontend build. `ORACLE_RETAIN_ORIGIN_COUNTS` can be set to `0` independently.
