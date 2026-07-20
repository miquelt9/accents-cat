# Research-consent ingest and northern collection strategy

Design note for wiring consented oracle recordings into training and growing the scarce northern (and northwestern) speaker pool. Complements the Phase 1–3 CV26 experiments in [`reports/model_improvement_phase1.md`](model_improvement_phase1.md).

## Goal

Add **new speakers** in the product domain (phone / laptop mic, read-aloud prompts), with emphasis on **northern** and secondarily **northwestern**. Do not dilute speaker-grouped eval purity.

## Storage contract (already implemented)

| Rule | Detail |
| --- | --- |
| Train filter | `research_consent=1 AND deleted_at IS NULL` only |
| Pending rows | Created by `/analyze`; expire via `ORACLE_PENDING_CONSENT_TTL_SECONDS` |
| Soft-delete | `scripts/soft_delete_submission.py` scrubs audio + PII |
| Retention | ~3 years from `consent_at` (`scripts/purge_expired_research.py`) |

Never train on pending, declined, or tombstoned rows.

## Ingest pipeline (to implement)

```text
data/user_submissions/oracle.db
  → scripts/export_research_consent_manifest.py
  → data/audio/user-research-<date>/ + manifests/user_research_<date>.csv
  → scripts/extract_hubert_embeddings.py
  → merge with CV26 train index (speaker-disjoint)
  → train_embedding_model_artifact.py
  → evaluate on CV26 held-out + AINA (unchanged reserved speakers)
```

### Manifest fields

Reuse the CV26-ish columns where possible:

- `client_id` — stable pseudonymous session/device hash (not raw IP); one ID per consented recording session is enough for v1, but prefer a browser-side anonymous speaker token if added later
- `path` / `audio_path` — copied WebM→WAV/MP3
- `label` — **do not** use model `top_label` as gold; use `feedback.self_reported_dialect` when in `{balearic,central,northern,northwestern,valencian}`; skip `mixed` / `unknown` / null for supervised five-way training
- `source_dataset` = `oracle_research_consent`
- `prompt_id` / `prompt_text` — keep for phonetic analysis, not as lexical features
- `consent_at`, `policy_version`, `recording_id`

### Split rules

1. User speakers are **never** mixed into AINA benchmark reservation lists (different population).
2. If a user self-report conflicts with a future expert label, prefer expert / drop the clip.
3. Cap clips per `client_id` (e.g. 3–5) before merging with CV26 so a prolific tester cannot dominate.
4. Keep evaluation on CV26 held-out + AINA; optionally add a tiny user held-out once ≥50 consented speakers with self-reports exist.

## Northern collection playbook

CV26 still caps balanced train at **96 northern speakers** after AINA reservation (~211 raw expandable). Extra clips per existing CV26 northern speakers help less than **new northern speakers**.

### Priority recruiting

1. **Catalunya Nord / Rosselló** communities (northern / septentrional)
2. Northwestern (Lleida / Andorra-adjacent) as second priority for mainland disambiguation
3. Avoid oversampling central — already abundant in CV26

### Product levers

- Keep dialect-contrastive read-alouds in [`web/src/lib/prompts.ts`](../web/src/lib/prompts.ts) (see [`reports/word_candidates.md`](word_candidates.md))
- Landing research pre-consent + results funnel already promote retention
- Share / outreach copy should frame contribution as **acoustic dialect research**, not origin detection
- Track consented northern count via a small SQL report (weekly):  
  `SELECT self_reported_dialect, COUNT(*) FROM feedback JOIN submissions … WHERE research_consent=1`

### Success metrics

| Milestone | Target |
| --- | --- |
| Soft launch | ≥20 consented northern self-reports with audio |
| Retrain candidate | ≥50 new northern speakers (any source) beyond CV26-96 |
| Domain check | Phone/laptop eval subset; retune `needsValidation` / evidence bands |

## Out of scope for v1 ingest

- Automatic continuous retrain in production
- Using IP geolocation as a dialect label
- Training on `mixed` / `unknown` self-reports without review
- Encoder fine-tuning until northern speaker count grows past the CV26 cap (see Phase 5 in the improvement report)

## Immediate next engineering steps

1. Add `scripts/export_research_consent_manifest.py` (SQL → CSV + audio copy). **Done.**
2. Dry-run on local `oracle.db` (2026-07-19): 1 consented row, 0 macro self-reports; export script reports `rows_by_label` all zero when unlabeled are skipped.
3. When northern consented ≥20, run a frozen-HuBERT retrain merge experiment and compare AINA northern F1.
4. Prefer promoting the Phase-2 candidate `models/cv26-hubert-svm-clips5-votes` only after more northern speakers land — vote-filtered clips5 already lifts AINA macro F1 ~+0.018 without new speakers.
