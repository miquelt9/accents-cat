# Catalan Accent Oracle

Research-first prototype for a Catalan dialect similarity web app inspired by BoldVoice Accent Oracle.

The first milestone is a metadata audit, not model training. The audit checks which Catalan speech datasets have usable dialect labels, speaker IDs, and split structure before downloading large audio files.

## Initial Goals

- Predict 5 macro dialect zones: `central`, `valencian`, `northwestern`, `northern`, `balearic`.
- Keep development CPU-friendly.
- Avoid speaker leakage by splitting on speaker IDs, not clips.
- Treat app output as dialect-zone similarity, not geographic origin.

## Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Cloud Notebook

Use `notebooks/cv26_accent_oracle_colab.ipynb` for the end-to-end Colab/Kaggle pipeline: setup, CV26 metadata handling, selective audio extraction, HuBERT embeddings, baseline training, evaluation, and calibrated SVM artifact export. A shorter alias lives at `notebooks/cv26_cloud_experiment.ipynb`.

**Do not upload** the ~85 GB archive `data/raw/common-voice-scripted-speech-26-0-catala-fe69b989.tar.gz`. On your PC, build a small zip with `scripts/package_cloud_upload_bundle.py`, then upload that zip to Drive or Kaggle:

```bash
# Recommended: pre-compute embeddings locally (~2 MB smoke, ~9 MB full)
python scripts/package_cloud_upload_bundle.py --mode smoke --bundle-type embeddings --device cuda
python scripts/package_cloud_upload_bundle.py --mode full_1440 --bundle-type embeddings --skip-prep

# Alternative: upload MP3s only (~8 MB smoke, ~46 MB full); cloud runs HuBERT
python scripts/package_cloud_upload_bundle.py --mode smoke --bundle-type audio
python scripts/package_cloud_upload_bundle.py --mode full_1440 --bundle-type audio --skip-prep
```

In the notebook set `INPUT_SOURCE = "embeddings_bundle"` (or `"audio_bundle"`) and place the zip where `BUNDLE_CANDIDATES` can find it. Start with the default smoke run (`25` speakers per dialect, `2` clips per speaker). When ready, change `RUN_MODE` to `full_1440` to reproduce the 1,440-clip CV26 setup documented in `reports/cv26_train_1440_experiment.md`. No tokens or secrets are required.

## Web App Prototype

The lightweight browser app lives in `web/`. It is a Vite + React + TypeScript scaffold for the read-aloud product flow:

- landing page
- fixed Catalan prompt
- microphone recording or audio upload
- mocked accent analysis
- smooth geographic similarity heatmap for `balearic`, `central`, `northern`, `northwestern`, and `valencian`

The app intentionally treats output as dialect-area similarity, not geographic origin. Current inference is mocked behind `web/src/lib/accentOracleClient.ts`; replace that client with a backend call when a calibrated model endpoint is ready.

The map keeps the model contract simple: the backend returns one score per macro dialect, and `web/src/lib/buildHeatmapPoints.ts` converts those scores into weighted geographic anchors from `web/src/lib/dialectGeoAnchors.ts`. The result is a smooth heat layer rather than five hard-painted regions.

The heat layer is clipped to the drawn land and island shapes, so mixed mainland/island scores can show multiple warm areas without inventing a hotspot in the sea.

Future finer-grained models can add optional `regionalHeatPoints` to the same response. If those points are absent, the frontend builds the heatmap from macro anchors; if present, it can blend the regional points into the same map without redesigning the UI.

```bash
cd web
npm install
npm run dev
```

By default the web app uses the mock scorer. To call the local model API instead:

```bash
cd web
VITE_ACCENT_ORACLE_MODE=api \
VITE_ACCENT_ORACLE_API_URL=http://localhost:8000 \
npm run dev
```

Useful checks:

```bash
cd web
npm run lint
npm run build
```

## Local Inference API

The local backend lives in `backend/` and serves the saved model artifact:

- API app: `backend/app.py`
- Model: `models/cv26-hubert-svm-calibrated/model.joblib`
- Metadata: `models/cv26-hubert-svm-calibrated/metadata.json`

Install backend dependencies:

```bash
pip install -r requirements.txt
```

Run the API:

```bash
uvicorn backend.app:app --reload --host 127.0.0.1 --port 8000
```

Useful endpoints:

- `GET /health`
- `POST /analyze` with multipart form field `audio`

The first `/analyze` request loads the HuBERT encoder and can take several seconds on CPU. The response matches the frontend result shape and includes five calibrated dialect scores for the heatmap.

## Dataset Audits

The Hugging Face dataset loaders are unreliable for some AINA script-backed datasets. Prefer direct TSV metadata audits.

```bash
python scripts/audit_aina_tsv_metadata.py --max-rows 200000
```

This writes:

- `reports/aina_tsv_metadata_audit.md`
- `reports/aina_tsv_metadata_audit.json`

The local Common Voice 26 Catalan archive has also been checked without extracting audio. Only TSV/README metadata files were extracted:

- source archive: `data/raw/common-voice-scripted-speech-26-0-catala-fe69b989.tar.gz`
- metadata folder: `data/metadata/cv26-ca`
- report: `reports/cv26_metadata_audit.md`
- raw audit JSON: `reports/cv26_metadata_audit.json`
- label strategy JSON: `reports/cv26_label_strategy_audit.json`

Current recommendation: use `train.tsv` only for the next training expansion, with speaker-balanced sampling, `variant` as the primary label, controlled `accents` fallback, and `Tortosí` excluded until we choose a dialect policy for transitional labels. Do not combine `validated.tsv` with official `train/dev/test` as independent data.

Build the first balanced CV26 experiment manifest:

```bash
python scripts/build_cv26_balanced_manifest.py \
  --metadata-dir data/metadata/cv26-ca \
  --source-split train \
  --out-manifest manifests/cv26_train_2250.csv \
  --max-speakers-per-label 150 \
  --max-clips-per-speaker 3 \
  --seed 13
```

The requested 2,250-clip target becomes 1,440 clips after excluding speakers reserved in `manifests/benchmark.csv`: 96 speakers per dialect and 3 clips per speaker.

The viewer-only audit is also available for schema checks:

```bash
python scripts/audit_hf_viewer.py
```

## Balanced Manifests

Create speaker-balanced, no-audio manifests:

```bash
python scripts/build_balanced_manifests.py \
  --max-speakers-per-accent 100 \
  --max-clips-per-speaker 10
```

This writes:

- `manifests/train.csv`
- `manifests/validation.csv`
- `manifests/calibration.csv`
- `manifests/benchmark.csv`
- `manifests/summary.md`

Current default result: 97 speakers per accent, 10 clips max per speaker, zero speaker overlap across internal splits or the held-out benchmark.

## Script Word Candidates

Analyze candidate words for fixed reading script design:

```bash
python scripts/analyze_word_candidates.py
```

This writes:

- `reports/word_candidates.md`
- `reports/word_candidates.json`

Use this for linguistic review only. The app should classify dialect similarity from acoustics, not lexical choice.

## Selected Audio Preparation

The AINA metadata points to Common Voice 17 audio. The official Hugging Face repo no longer exposes those old audio archives directly, but a community mirror (`fsicoli/common_voice_17_0`) currently includes the Catalan tar shards. The preparation script supports both that mirror and a local official Common Voice archive if you obtain one.

Tiny smoke test:

```bash
python scripts/prepare_selected_audio.py \
  --manifest manifests/train.csv \
  --out-dir data/audio/smoke-dev \
  --source-splits dev \
  --max-files 3
```

This has been tested and produced 3 selected MP3 files with zero missing clips.

Prepare only the small `dev` and `test` source clips from the training manifest:

```bash
python scripts/prepare_selected_audio.py \
  --manifest manifests/train.csv \
  --out-dir data/audio/train-dev-test \
  --source-splits dev test
```

Prepare all selected training audio from the mirror:

```bash
python scripts/prepare_selected_audio.py \
  --manifest manifests/train.csv \
  --out-dir data/audio/train
```

Warning: the full training command may download many large Common Voice train tar shards. Prefer a smaller smoke subset before doing this.

If you download the official Common Voice 17 Catalan archive yourself, point the script to the extracted `clips/` folder:

```bash
python scripts/prepare_selected_audio.py \
  --manifest manifests/train.csv \
  --out-dir data/audio/train \
  --local-clips-dir /path/to/cv-corpus-17.0-*/ca/clips
```

## Speech Encoder Embeddings

Extract frozen speech-encoder embeddings from a prepared audio manifest. The script name is historical; pass `--model-name` to compare encoders.

```bash
python scripts/extract_hubert_embeddings.py \
  --prepared-manifest data/audio/smoke-dev/prepared_manifest.csv \
  --out-dir embeddings/smoke-dev \
  --max-rows 3
```

This smoke test has been run successfully:

- model: `BSC-LT/hubert-base-ca-2k`
- device: CPU
- embedded rows: 3
- embedding dimension: 1536 (`mean` + `std` pooling)
- failures: 0

For a larger prepared subset, point `--prepared-manifest` to that subset's `prepared_manifest.csv` and choose a matching `--out-dir`.

Example Wav2Vec2 extraction:

```bash
python scripts/extract_hubert_embeddings.py \
  --prepared-manifest data/audio/train-3shards-200/prepared_manifest.csv \
  --out-dir embeddings/train-3shards-200-wav2vec2-ca \
  --model-name PereLluis13/wav2vec2-xls-r-300m-ca \
  --force-exit
```

## Small Baseline

Prepare a balanced 100-clip subset using only the smaller Common Voice `dev` and `test` archives:

```bash
python scripts/prepare_selected_audio.py \
  --manifest manifests/train.csv \
  --out-dir data/audio/train-small-dev-test-100 \
  --source-splits dev test \
  --max-files-per-label 20
```

Extract embeddings:

```bash
python scripts/extract_hubert_embeddings.py \
  --prepared-manifest data/audio/train-small-dev-test-100/prepared_manifest.csv \
  --out-dir embeddings/train-small-dev-test-100
```

Train speaker-grouped baseline classifiers:

```bash
python scripts/train_embedding_baselines.py \
  --embedding-index embeddings/train-small-dev-test-100/embedding_index.csv \
  --out-dir reports/baselines/train-small-dev-test-100
```

Current 100-clip smoke results:

| Model | Accuracy | Macro F1 | Top-2 Accuracy |
| --- | ---: | ---: | ---: |
| Majority dummy | 0.2000 | 0.0667 | 0.4000 |
| Logistic regression | 0.3200 | 0.3205 | 0.5000 |
| Calibrated linear SVM | 0.2300 | 0.1823 | 0.5000 |
| Nearest centroid | 0.2500 | 0.2380 | 0.4800 |

Interpretation: this is only a smoke test. Logistic regression is above random, but the set is too small and only uses `dev/test` source clips. The next meaningful experiment should use more speakers from the full balanced manifest and then evaluate on held-out speakers.

Larger `dev/test`-only internal experiment:

```bash
python scripts/prepare_selected_audio.py \
  --manifest manifests/all_internal.csv \
  --out-dir data/audio/internal-dev-test-150 \
  --source-splits dev test \
  --max-files-per-label 30

python scripts/extract_hubert_embeddings.py \
  --prepared-manifest data/audio/internal-dev-test-150/prepared_manifest.csv \
  --out-dir embeddings/internal-dev-test-150

python scripts/train_embedding_baselines.py \
  --embedding-index embeddings/internal-dev-test-150/embedding_index.csv \
  --out-dir reports/baselines/internal-dev-test-150
```

Current 150-clip result:

| Model | Accuracy | Macro F1 | Top-2 Accuracy |
| --- | ---: | ---: | ---: |
| Majority dummy | 0.2000 | 0.0667 | 0.4000 |
| Logistic regression | 0.3867 | 0.3926 | 0.6333 |
| Calibrated linear SVM | 0.2933 | 0.3040 | 0.5267 |
| Nearest centroid | 0.2067 | 0.1965 | 0.4400 |

Interpretation: logistic regression is the best baseline so far. The signal is real but still modest; `northern` remains the weakest class and is often confused with nearby classes. The next scale-up should add selected `train` source clips while minimizing the number of large train tar shards downloaded.

Shard-aware `train` experiment:

```bash
python scripts/plan_train_shards.py \
  --index-max-shards 6 \
  --max-shards 3 \
  --target-per-label 40 \
  --out-manifest manifests/train_shard_planned_3shards.csv

python scripts/prepare_selected_audio.py \
  --manifest manifests/train_shard_planned_3shards.csv \
  --out-dir data/audio/train-3shards-200 \
  --source-splits train

python scripts/extract_hubert_embeddings.py \
  --prepared-manifest data/audio/train-3shards-200/prepared_manifest.csv \
  --out-dir embeddings/train-3shards-200

python scripts/train_embedding_baselines.py \
  --embedding-index embeddings/train-3shards-200/embedding_index.csv \
  --out-dir reports/baselines/train-3shards-200
```

Current 200-clip train-shard result:

| Model | Accuracy | Macro F1 | Top-2 Accuracy |
| --- | ---: | ---: | ---: |
| Majority dummy | 0.2000 | 0.0667 | 0.4000 |
| Logistic regression | 0.3900 | 0.3870 | 0.6050 |
| Calibrated linear SVM | 0.2950 | 0.2715 | 0.5800 |
| Nearest centroid | 0.3250 | 0.3217 | 0.5750 |

Interpretation: adding 200 balanced train-shard clips did not materially beat the 150-clip dev/test-only logistic result, but it confirmed the result is not just a dev/test artifact. Speaker diversity in the 3-shard subset is still limited, so the next useful scale-up should optimize for more unique speakers per label, not just more clips.

## HuBERT vs Wav2Vec2 Comparison

Controlled 200-clip comparison report:

- `reports/embedding_model_comparison_200.md`
- HuBERT embeddings: `embeddings/train-3shards-200`
- Wav2Vec2 embeddings: `embeddings/train-3shards-200-wav2vec2-ca`
- Wav2Vec2 baseline report: `reports/baselines/train-3shards-200-wav2vec2-ca/results.md`

Current controlled result:

| Encoder | Best Model | Accuracy | Macro F1 | Top-2 Accuracy |
| --- | --- | ---: | ---: | ---: |
| Catalan HuBERT (`BSC-LT/hubert-base-ca-2k`) | Logistic regression | 0.3900 | 0.3870 | 0.6050 |
| Catalan Wav2Vec2/XLS-R (`PereLluis13/wav2vec2-xls-r-300m-ca`) | Logistic regression | 0.3300 | 0.3307 | 0.5250 |

Interpretation: Wav2Vec2 works on CPU and beats the dummy baseline, but it did not beat Catalan HuBERT on this controlled subset. Keep HuBERT as the default baseline for now; revisit Wav2Vec2 after building a larger, speaker-richer evaluation set.

## CV26 Balanced Baseline

First balanced CV26 scale-up:

```bash
python scripts/prepare_cv26_audio_from_archive.py \
  --archive data/raw/common-voice-scripted-speech-26-0-catala-fe69b989.tar.gz \
  --manifest manifests/cv26_train_2250.csv \
  --out-dir data/audio/cv26-train-1440

python scripts/extract_hubert_embeddings.py \
  --prepared-manifest data/audio/cv26-train-1440/prepared_manifest.csv \
  --out-dir embeddings/cv26-train-1440 \
  --force-exit

python scripts/train_embedding_baselines.py \
  --embedding-index embeddings/cv26-train-1440/embedding_index.csv \
  --out-dir reports/baselines/cv26-train-1440
```

Artifacts:

- `reports/cv26_train_1440_experiment.md`
- `manifests/cv26_train_2250.csv`
- `data/audio/cv26-train-1440`
- `embeddings/cv26-train-1440`
- `reports/baselines/cv26-train-1440/results.md`

Current CV26 result:

| Model | Accuracy | Macro F1 | Top-2 Accuracy |
| --- | ---: | ---: | ---: |
| Majority dummy | 0.1979 | 0.1029 | 0.3979 |
| Logistic regression | 0.4944 | 0.4970 | 0.7285 |
| Calibrated linear SVM | 0.5042 | 0.5063 | 0.7236 |
| Nearest centroid | 0.3007 | 0.2905 | 0.5500 |

Interpretation: this is the strongest baseline so far. The gain comes from more speaker diversity under balanced sampling, not from using raw CV26 frequencies.

Held-out CV26 evaluation:

- report: `reports/cv26_heldout_evaluation.md`
- dev report: `reports/heldout/cv26-train-1440_to_dev/results.md`
- test report: `reports/heldout/cv26-train-1440_to_test/results.md`
- combined report: `reports/heldout/cv26-train-1440_to_dev-test/results.md`

| Evaluation | Best Model | Accuracy | Macro F1 | Top-2 Accuracy |
| --- | --- | ---: | ---: | ---: |
| CV26 train cross-validation | Calibrated linear SVM | 0.5042 | 0.5063 | 0.7236 |
| CV26 held-out dev+test | Calibrated linear SVM | 0.5056 | 0.5104 | 0.7237 |

Interpretation: the held-out score is close to cross-validation, which suggests the balanced CV26 baseline is not just memorizing the selected training speakers.

## Current Model Artifact

The current inference candidate is saved as:

- `models/cv26-hubert-svm-calibrated/model.joblib`
- `models/cv26-hubert-svm-calibrated/metadata.json`
- report: `reports/model_artifact_cv26_hubert_svm_calibrated.md`
- artifact evaluation: `reports/model-artifacts/cv26-hubert-svm-calibrated_dev-test/artifact_eval.md`

Train and evaluate the artifact:

```bash
python scripts/train_embedding_model_artifact.py \
  --train-index embeddings/cv26-train-1440/embedding_index.csv \
  --out-dir models/cv26-hubert-svm-calibrated

python scripts/evaluate_model_artifact.py \
  --model models/cv26-hubert-svm-calibrated/model.joblib \
  --eval-index embeddings/cv26-eval-dev-test/embedding_index.csv \
  --out-dir reports/model-artifacts/cv26-hubert-svm-calibrated_dev-test
```

Current artifact result on held-out CV26 dev+test:

| Accuracy | Macro F1 | Top-2 Accuracy | Log Loss | Brier | ECE |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 0.5056 | 0.5104 | 0.7237 | 1.2282 | 0.6300 | 0.0640 |

External AINA benchmark result on `manifests/benchmark_eval_750.csv` (742 clips, 250 speakers, zero overlap with CV26 train):

| Accuracy | Macro F1 | Top-2 Accuracy | Log Loss | Brier | ECE |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 0.4960 | 0.4977 | 0.7049 | 1.2392 | 0.6270 | 0.0650 |

Report: `reports/aina_benchmark_evaluation.md`

This is ready for a local backend prototype, but not yet a polished public release. The inference API and AINA benchmark evaluation are in place; before a public launch, add real-user recordings and tighten low-confidence UX thresholds.

If a dataset requires Hugging Face authentication or accepted terms, login first:

```bash
hf auth login
```
