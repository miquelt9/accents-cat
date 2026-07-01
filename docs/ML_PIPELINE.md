# ML Pipeline & Dataset Guide

Technical reference for training, evaluation, and data preparation. For a human overview, see the [main README](../README.md).

## Design principles

- **Five macro dialect zones:** `central`, `valencian`, `northwestern`, `northern`, `balearic`.
- **Speaker-grouped splits** — never split clips from the same speaker across train/eval.
- **CPU-friendly development** — smoke tests before large downloads.
- **Output is dialect-area similarity**, not geographic origin.

## Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

For Hugging Face gated datasets:

```bash
hf auth login
```

For CV26 archive download via Mozilla Data Collective, copy `.env.example` → `.env` and set `MDC_API_KEY`.

## Cloud notebook

Use [`notebooks/cv26_accent_oracle_colab.ipynb`](../notebooks/cv26_accent_oracle_colab.ipynb) for the end-to-end Colab/Kaggle pipeline. Shorter alias: [`notebooks/cv26_cloud_experiment.ipynb`](../notebooks/cv26_cloud_experiment.ipynb).

**Do not upload** the ~85 GB archive `data/raw/common-voice-scripted-speech-26-0-catala-fe69b989.tar.gz`. Build a small zip locally:

```bash
# Recommended: pre-compute embeddings locally (~2 MB smoke, ~9 MB full)
python scripts/package_cloud_upload_bundle.py --mode smoke --bundle-type embeddings --device cuda
python scripts/package_cloud_upload_bundle.py --mode full_1440 --bundle-type embeddings --skip-prep

# Alternative: upload MP3s only (~8 MB smoke, ~46 MB full); cloud runs HuBERT
python scripts/package_cloud_upload_bundle.py --mode smoke --bundle-type audio
python scripts/package_cloud_upload_bundle.py --mode full_1440 --bundle-type audio --skip-prep
```

In the notebook set `INPUT_SOURCE = "embeddings_bundle"` (or `"audio_bundle"`). Start with smoke (`25` speakers per dialect, `2` clips per speaker). For full reproduction see [`reports/cv26_train_1440_experiment.md`](../reports/cv26_train_1440_experiment.md).

## Dataset audits

Prefer direct TSV metadata audits over unreliable HF loaders for AINA script-backed sets:

```bash
python scripts/audit_aina_tsv_metadata.py --max-rows 200000
```

Writes `reports/aina_tsv_metadata_audit.md` and `.json`.

CV26 metadata (no audio extraction):

- Archive: `data/raw/common-voice-scripted-speech-26-0-catala-fe69b989.tar.gz`
- Metadata: `data/metadata/cv26-ca`
- Reports: `reports/cv26_metadata_audit.md`, `reports/cv26_label_strategy_audit.json`

**Recommendation:** use `train.tsv` only for training expansion, speaker-balanced sampling, `variant` as primary label, controlled `accents` fallback, exclude `Tortosí` until dialect policy is decided. Do not mix `validated.tsv` with official train/dev/test as independent data.

Viewer-only schema check:

```bash
python scripts/audit_hf_viewer.py
```

## Manifests

### Balanced internal manifests (AINA / CV17 paths)

```bash
python scripts/build_balanced_manifests.py \
  --max-speakers-per-accent 100 \
  --max-clips-per-speaker 10
```

Writes `manifests/train.csv`, `validation.csv`, `calibration.csv`, `benchmark.csv`, `summary.md`.

### CV26 balanced experiment manifest

```bash
python scripts/build_cv26_balanced_manifest.py \
  --metadata-dir data/metadata/cv26-ca \
  --source-split train \
  --out-manifest manifests/cv26_train_2250.csv \
  --max-speakers-per-label 150 \
  --max-clips-per-speaker 3 \
  --seed 13
```

Target 2,250 clips → 1,440 after benchmark speaker reservation (96 speakers/dialect × 3 clips).

## Audio preparation

AINA metadata points to Common Voice 17 audio. Mirror: `fsicoli/common_voice_17_0`, or a local CV17 archive.

Smoke test:

```bash
python scripts/prepare_selected_audio.py \
  --manifest manifests/train.csv \
  --out-dir data/audio/smoke-dev \
  --source-splits dev \
  --max-files 3
```

Full train (warning: large downloads):

```bash
python scripts/prepare_selected_audio.py \
  --manifest manifests/train.csv \
  --out-dir data/audio/train
```

Local CV17 clips folder:

```bash
python scripts/prepare_selected_audio.py \
  --manifest manifests/train.csv \
  --out-dir data/audio/train \
  --local-clips-dir /path/to/cv-corpus-17.0-*/ca/clips
```

CV26 from local archive:

```bash
python scripts/prepare_cv26_audio_from_archive.py \
  --archive data/raw/common-voice-scripted-speech-26-0-catala-fe69b989.tar.gz \
  --manifest manifests/cv26_train_2250.csv \
  --out-dir data/audio/cv26-train-1440
```

## Embeddings

```bash
python scripts/extract_hubert_embeddings.py \
  --prepared-manifest data/audio/smoke-dev/prepared_manifest.csv \
  --out-dir embeddings/smoke-dev \
  --max-rows 3
```

Default encoder: `BSC-LT/hubert-base-ca-2k`. Pooling: mean + std → 1536 dims.

Wav2Vec2 comparison:

```bash
python scripts/extract_hubert_embeddings.py \
  --prepared-manifest data/audio/train-3shards-200/prepared_manifest.csv \
  --out-dir embeddings/train-3shards-200-wav2vec2-ca \
  --model-name PereLluis13/wav2vec2-xls-r-300m-ca \
  --force-exit
```

HuBERT wins on controlled 200-clip comparison — see [`reports/embedding_model_comparison_200.md`](../reports/embedding_model_comparison_200.md).

## Baseline training

```bash
python scripts/train_embedding_baselines.py \
  --embedding-index embeddings/train-small-dev-test-100/embedding_index.csv \
  --out-dir reports/baselines/train-small-dev-test-100
```

### CV26 scale-up (current best baseline)

```bash
python scripts/extract_hubert_embeddings.py \
  --prepared-manifest data/audio/cv26-train-1440/prepared_manifest.csv \
  --out-dir embeddings/cv26-train-1440 \
  --force-exit

python scripts/train_embedding_baselines.py \
  --embedding-index embeddings/cv26-train-1440/embedding_index.csv \
  --out-dir reports/baselines/cv26-train-1440
```

| Model | Accuracy | Macro F1 | Top-2 |
| --- | ---: | ---: | ---: |
| Calibrated linear SVM | 0.5042 | 0.5063 | 0.7236 |

Held-out evaluation: [`reports/cv26_heldout_evaluation.md`](../reports/cv26_heldout_evaluation.md).

## Model artifact (inference)

```bash
python scripts/train_embedding_model_artifact.py \
  --train-index embeddings/cv26-train-1440/embedding_index.csv \
  --out-dir models/cv26-hubert-svm-calibrated

python scripts/evaluate_model_artifact.py \
  --model models/cv26-hubert-svm-calibrated/model.joblib \
  --eval-index embeddings/cv26-eval-dev-test/embedding_index.csv \
  --out-dir reports/model-artifacts/cv26-hubert-svm-calibrated_dev-test
```

Artifact paths:

- `models/cv26-hubert-svm-calibrated/model.joblib`
- `models/cv26-hubert-svm-calibrated/metadata.json`

External benchmark: [`reports/aina_benchmark_evaluation.md`](../reports/aina_benchmark_evaluation.md).

## Script word candidates

Linguistic review only — classification should rely on acoustics, not lexical choice:

```bash
python scripts/analyze_word_candidates.py
```

## Incremental experiments (reference)

Smaller smoke baselines (100–200 clips), shard planning (`scripts/plan_train_shards.py`), and Wav2Vec2 comparisons are documented in git history and under `reports/baselines/`. Prefer CV26 1,440-clip pipeline for meaningful numbers.
