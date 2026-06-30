# CV26 Balanced Train Experiment: 1,440 Clips

This experiment tests whether the local Common Voice 26 Catalan archive improves the accent baseline when sampled by speaker rather than by raw clip frequency.

## Why This Experiment

The previous best controlled HuBERT baseline used only 200 clips from 117 speakers and reached:

| Subset | Best Model | Accuracy | Macro F1 | Top-2 Accuracy |
| --- | --- | ---: | ---: | ---: |
| `train-3shards-200` | Logistic regression | 0.3900 | 0.3870 | 0.6050 |

CV26 provides many more speakers, but it is extremely imbalanced. Central Catalan dominates the raw data, so this experiment balances by speaker and caps clips per speaker.

## Data Policy

- Source: `data/metadata/cv26-ca/train.tsv`
- Audio archive: `data/raw/common-voice-scripted-speech-26-0-catala-fe69b989.tar.gz`
- Label policy: `variant` first, controlled `accents` fallback
- Excluded label: `Tortosí`
- Reserved benchmark speakers excluded: yes, from `manifests/benchmark.csv`
- Split for evaluation: 5-fold `StratifiedGroupKFold`, grouped by `client_id`

The initial target was 150 speakers per dialect and 3 clips per speaker, or about 2,250 clips. After excluding reserved benchmark speakers, the limiting class was `northern` with 96 available speakers, so the final balanced subset is:

| Label | Clips | Speakers |
| --- | ---: | ---: |
| `balearic` | 288 | 96 |
| `central` | 288 | 96 |
| `northern` | 288 | 96 |
| `northwestern` | 288 | 96 |
| `valencian` | 288 | 96 |
| **Total** | **1,440** | **480** |

## Commands

```bash
python scripts/build_cv26_balanced_manifest.py \
  --metadata-dir data/metadata/cv26-ca \
  --source-split train \
  --out-manifest manifests/cv26_train_2250.csv \
  --max-speakers-per-label 150 \
  --max-clips-per-speaker 3 \
  --seed 13

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

## Artifacts

- Manifest: `manifests/cv26_train_2250.csv`
- Manifest summary: `manifests/cv26_train_2250.summary.md`
- Prepared audio: `data/audio/cv26-train-1440`
- Prepared audio summary: `data/audio/cv26-train-1440/summary.json`
- Embeddings: `embeddings/cv26-train-1440`
- Baseline report: `reports/baselines/cv26-train-1440/results.md`

## Results

| Model | Accuracy | Macro F1 | Top-2 Accuracy |
| --- | ---: | ---: | ---: |
| Majority dummy | 0.1979 | 0.1029 | 0.3979 |
| Logistic regression | 0.4944 | 0.4970 | 0.7285 |
| Calibrated linear SVM | 0.5042 | 0.5063 | 0.7236 |
| Nearest centroid | 0.3007 | 0.2905 | 0.5500 |

Per-class F1 for logistic regression:

| Label | F1 |
| --- | ---: |
| `balearic` | 0.7856 |
| `central` | 0.4372 |
| `northern` | 0.3564 |
| `northwestern` | 0.3425 |
| `valencian` | 0.5636 |

Per-class F1 for calibrated linear SVM:

| Label | F1 |
| --- | ---: |
| `balearic` | 0.8188 |
| `central` | 0.4497 |
| `northern` | 0.3257 |
| `northwestern` | 0.3757 |
| `valencian` | 0.5613 |

## Interpretation

This is the strongest baseline so far. The improvement appears to come from speaker diversity rather than raw clip count:

- 200-clip HuBERT logistic baseline: macro F1 `0.3870`
- 1,440-clip CV26 HuBERT logistic baseline: macro F1 `0.4970`
- 1,440-clip CV26 HuBERT calibrated SVM baseline: macro F1 `0.5063`

Balearic is now much easier for the model, while Central, Northern, Northwestern, and Valencian still show heavy confusion. The main confusions are linguistically plausible and likely reflect both macro-dialect proximity and noisy/fine-grained labels collapsed into five classes.

## Next Step

Use this as the new main CPU baseline. The next useful experiment is an external evaluation using CV26 `dev.tsv`/`test.tsv` or the reserved AINA benchmark speakers, not simply adding more clips from the same CV26 train speakers.
