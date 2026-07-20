# Model improvement experiments (Phases 1–5)

Roadmap execution report for the Catalan Accent Oracle classifier. Encoder stays [`BSC-LT/hubert-base-ca-2k`](https://huggingface.co/BSC-LT/hubert-base-ca-2k).

## Phase 1 — Classifier hyperparameter sweep

**Setup:** speaker-grouped 5-fold CV on `embeddings/cv26-train-1440` (1,440 clips / 480 speakers). Sweep: LinearSVC `C ∈ {0.1,0.3,1,3,10}` × calibration `{sigmoid,isotonic}`, plus logistic regression, RBF SVM, and a small MLP.

**Script:** [`scripts/sweep_embedding_classifiers.py`](../scripts/sweep_embedding_classifiers.py)  
**Artifacts:** [`reports/sweeps/cv26-train-1440-phase1/`](sweeps/cv26-train-1440-phase1/)

| Result | Macro F1 | Northern F1 |
| --- | ---: | ---: |
| Best CV (`linear_svm_c1.0_sigmoid`) | **0.5063** | 0.3257 |
| Prior baseline (same config) | 0.5063 | 0.3257 |
| Best alternate (logistic) | 0.4970 | 0.3564 |
| RBF SVM | 0.4588 | 0.3043 |
| MLP (128) | 0.4830 | 0.3504 |

Held-out with best linear SVM (unchanged defaults):

| Eval | Acc | Macro F1 | Top-2 | Northern F1 |
| --- | ---: | ---: | ---: | ---: |
| CV26 held-out | 0.5056 | 0.5104 | 0.7237 | 0.3540 |
| AINA benchmark | 0.4960 | 0.4977 | 0.7049 | 0.2797 |

**Verdict:** No head beats `C=1.0` + sigmoid calibration on macro F1. Isotonic and non-linear heads are worse or trade northern F1 for overall F1 without beating the baseline. **Ceiling is data, not the linear head.** Production artifact hyperparameters stay as-is.

## Phase 2 — More clips per speaker (+ vote filter)

Manifest builder gained `--min-up-votes` / `--max-down-votes`.

| Manifest | Clips | Speakers | Notes |
| --- | ---: | ---: | --- |
| `manifests/cv26_train_clips5.csv` | 2,384 | 480 (96×5) | Same speakers as 1,440; +944 clips |
| `manifests/cv26_train_clips5_votes.csv` | 2,298 | 480 | `up_votes≥2`, `down_votes≤0`; only 701 paths overlap base |

Audio seeded from `cv26-train-1440`, residuals prepared in one archive scan (`scripts/prepare_cv26_residuals_batch.py`).

### Held-out + AINA results

| Model | Eval | Acc | Macro F1 | Top-2 | Northern F1 |
| --- | --- | ---: | ---: | ---: | ---: |
| Baseline (3 clips) | held-out | 0.5056 | 0.5104 | 0.7237 | 0.3540 |
| Baseline (3 clips) | AINA | 0.4960 | 0.4977 | 0.7049 | 0.2797 |
| clips5 (no vote filter) | held-out | 0.4925 | 0.5006 | 0.7162 | 0.2991 |
| clips5 (no vote filter) | AINA | 0.4933 | 0.4948 | 0.7170 | 0.2724 |
| **clips5 + votes** | held-out | **0.5150** | **0.5159** | **0.7350** | 0.3378 |
| **clips5 + votes** | AINA | **0.5202** | **0.5157** | 0.7183 | **0.2989** |

**Verdict:** Extra clips from the same speakers *without* a vote filter slightly hurt generalization (speaker redundancy). Combining 5 clips/speaker with `up_votes≥2` / `down_votes≤0` is the Phase 2 win: **+0.018 macro F1 on AINA** and **+0.019 northern F1 on AINA** vs baseline. Local artifact: `models/cv26-hubert-svm-clips5-votes/`. Production Hub mirror left unchanged pending explicit promote/upload.

## Phase 3 — Tortosí policy ablation

Manifest builder gained `--tortosi-policy {exclude,northwestern,valencian}`.

| Policy | Manifest | Available NW speakers | Paths vs exclude |
| --- | --- | ---: | --- |
| A exclude | `cv26_train_tortosi_exclude.csv` | 396 | = current 1,440 |
| B → NW | `cv26_train_tortosi_nw.csv` | **418** | 435 new paths |
| C → Valencian | `cv26_train_tortosi_val.csv` | (reshuffled) | 243 new paths |

Selected NW clips under B include only **6 Tortosí** rows; under C, Valencian includes **9 Tortosí**. Mapping mainly reshuffles speakers.

| Policy | Eval | Macro F1 | Northern F1 | NW F1 |
| --- | --- | ---: | ---: | ---: |
| exclude (baseline) | AINA | **0.4977** | **0.2797** | 0.3721 |
| → northwestern | AINA | 0.4611 | 0.2568 | 0.3442 |
| → valencian | AINA | 0.4773 | 0.2231 | 0.3673 |

**Verdict: keep Tortosí excluded.** Both forced mappings hurt AINA macro F1 and northern F1. Do not map Tortosí into NW or Valencian for the five-way head.

## Phase 4 — Research-consent ingest design

- Design: [`reports/research_consent_ingest_design.md`](research_consent_ingest_design.md)
- Export script: [`scripts/export_research_consent_manifest.py`](../scripts/export_research_consent_manifest.py)
- Local dry-run: **1** consented submission, **0** macro self-reports usable for supervised five-way training. Northern collection remains the binding long-term lever.

## Phase 5 — Encoder decision

Keep **Catalan HuBERT**. Do not swap to English `hubert-base-ls960` or Wav2Vec2 before more speakers. Optional fine-tune of Catalan HuBERT only after northern speaker count grows past the CV26-96 cap. Evidence: BSC accent-classification card + this repo’s 200-clip HuBERT vs Wav2Vec2 bake-off.

## Go / no-go summary

| Lever | Decision |
| --- | --- |
| Classifier HP / RBF / MLP | No-go — keep `C=1.0` sigmoid |
| More clips/speaker alone | No-go — slight regression |
| Clips=5 + vote filter | **Go (candidate)** — best AINA so far; promote Hub only after explicit upload |
| Tortosí → NW or Valencian | **No-go — keep exclude** |
| New northern / consented users | **Go (next)** — data ceiling |
| Encoder swap | **No-go** |

## Tooling added

| Script | Role |
| --- | --- |
| `scripts/sweep_embedding_classifiers.py` | Phase 1 sweep + optional held-out eval |
| `scripts/seed_prepared_from_existing.py` | Hardlink/copy audio + vectors from prior subsets |
| `scripts/prepare_cv26_residuals_batch.py` | One archive scan for many residual manifests |
| `scripts/export_research_consent_manifest.py` | Consent→manifest export |
| `tests/test_cv26_manifest_policy.py` | Tortosí + vote-filter unit tests |

`scripts/build_cv26_balanced_manifest.py` and `scripts/train_embedding_model_artifact.py` accept the new policy / `C` / calibration flags.