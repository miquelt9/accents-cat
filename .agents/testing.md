# Tests

Web, from `web/`:

```bash
npm run lint && npm run build && npm test
```

`lint` is ESLint, `build` is `tsc --noEmit` plus Vite, and `test` is Vitest.

Python, from the repo root after `pip install -r requirements-dev.txt`:

```bash
pytest -q
```

GitHub Actions workflow [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs both on pull requests and on pushes to `main`. The web job uses Node 20. The Python job uses 3.12, runs `ruff` on `backend` and `tests`, then `pytest -q`. CI installs `requirements-dev.txt` only. It does not install full `requirements.txt` and does not download the HuBERT encoder or the classifier.
