# CV26 Held-Out Evaluation

This evaluation trains classifiers on the balanced CV26 train subset and evaluates on separate CV26 `dev.tsv` and `test.tsv` subsets.

## Setup

- Train embeddings: `embeddings/cv26-train-1440/embedding_index.csv`
- Eval embeddings: `embeddings/cv26-eval-dev-test/embedding_index.csv`
- Encoder: `BSC-LT/hubert-base-ca-2k`
- Train rows: 1,440
- Train speakers: 480
- Dev rows: 300
- Dev speakers: 100
- Test rows: 232
- Test speakers: 100
- Speaker overlap with train: excluded during manifest construction
- Reserved AINA benchmark speakers: excluded during manifest construction

## Commands

```bash
python scripts/build_cv26_balanced_manifest.py \
  --metadata-dir data/metadata/cv26-ca \
  --source-split dev \
  --out-manifest manifests/cv26_dev_eval.csv \
  --max-speakers-per-label 20 \
  --max-clips-per-speaker 3 \
  --seed 17 \
  --reserved-speakers-manifest manifests/benchmark.csv \
  --reserved-speakers-manifest manifests/cv26_train_2250.csv

python scripts/build_cv26_balanced_manifest.py \
  --metadata-dir data/metadata/cv26-ca \
  --source-split test \
  --out-manifest manifests/cv26_test_eval.csv \
  --max-speakers-per-label 20 \
  --max-clips-per-speaker 3 \
  --seed 19 \
  --reserved-speakers-manifest manifests/benchmark.csv \
  --reserved-speakers-manifest manifests/cv26_train_2250.csv

python scripts/prepare_cv26_audio_from_archive.py \
  --archive data/raw/common-voice-scripted-speech-26-0-catala-fe69b989.tar.gz \
  --manifest manifests/cv26_dev_test_eval.csv \
  --out-dir data/audio/cv26-eval-dev-test

python scripts/extract_hubert_embeddings.py \
  --prepared-manifest data/audio/cv26-eval-dev-test/prepared_manifest.csv \
  --out-dir embeddings/cv26-eval-dev-test \
  --force-exit

python scripts/evaluate_embedding_baselines.py \
  --train-index embeddings/cv26-train-1440/embedding_index.csv \
  --eval-index embeddings/cv26-eval-dev-test/embedding_index.csv \
  --eval-source-file dev.tsv \
  --out-dir reports/heldout/cv26-train-1440_to_dev

python scripts/evaluate_embedding_baselines.py \
  --train-index embeddings/cv26-train-1440/embedding_index.csv \
  --eval-index embeddings/cv26-eval-dev-test/embedding_index.csv \
  --eval-source-file test.tsv \
  --out-dir reports/heldout/cv26-train-1440_to_test

python scripts/evaluate_embedding_baselines.py \
  --train-index embeddings/cv26-train-1440/embedding_index.csv \
  --eval-index embeddings/cv26-eval-dev-test/embedding_index.csv \
  --out-dir reports/heldout/cv26-train-1440_to_dev-test
```

## Results

### CV26 Dev

| Model | Accuracy | Macro F1 | Top-2 Accuracy |
| --- | ---: | ---: | ---: |
| Majority dummy | 0.2000 | 0.0667 | 0.4000 |
| Logistic regression | 0.4667 | 0.4763 | 0.7133 |
| Calibrated linear SVM | 0.5100 | 0.5126 | 0.7367 |
| Nearest centroid | 0.3233 | 0.2922 | 0.6333 |

### CV26 Test

| Model | Accuracy | Macro F1 | Top-2 Accuracy |
| --- | ---: | ---: | ---: |
| Majority dummy | 0.1940 | 0.0650 | 0.4095 |
| Logistic regression | 0.5000 | 0.4993 | 0.6940 |
| Calibrated linear SVM | 0.5000 | 0.5047 | 0.7069 |
| Nearest centroid | 0.2888 | 0.2558 | 0.5129 |

### CV26 Dev + Test

| Model | Accuracy | Macro F1 | Top-2 Accuracy |
| --- | ---: | ---: | ---: |
| Majority dummy | 0.1974 | 0.0659 | 0.4041 |
| Logistic regression | 0.4812 | 0.4881 | 0.7049 |
| Calibrated linear SVM | 0.5056 | 0.5104 | 0.7237 |
| Nearest centroid | 0.3083 | 0.2777 | 0.5808 |

## Interpretation

The held-out result is close to the internal speaker-grouped cross-validation result:

| Evaluation | Best Model | Accuracy | Macro F1 | Top-2 Accuracy |
| --- | --- | ---: | ---: | ---: |
| CV26 train cross-validation | Calibrated linear SVM | 0.5042 | 0.5063 | 0.7236 |
| CV26 held-out dev+test | Calibrated linear SVM | 0.5056 | 0.5104 | 0.7237 |

This suggests the balanced CV26 baseline is not merely memorizing the selected train speakers. The main weakness remains confusion among `central`, `northern`, `northwestern`, and `valencian`, while `balearic` is much easier for the model.

## Next Step

Use calibrated linear SVM on HuBERT embeddings as the current model candidate. The next research step should be calibration for web heatmap scores and an evaluation against the reserved AINA benchmark, not more CV26 train cross-validation.
