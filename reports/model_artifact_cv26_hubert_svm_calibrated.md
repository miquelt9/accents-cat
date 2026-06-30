# Model Artifact: CV26 HuBERT Calibrated SVM

This is the current inference candidate for the Catalan Accent Oracle prototype.

## Artifact

- Model: `models/cv26-hubert-svm-calibrated/model.joblib`
- Metadata: `models/cv26-hubert-svm-calibrated/metadata.json`
- Encoder: `BSC-LT/hubert-base-ca-2k`
- Classifier: `StandardScaler` + `CalibratedClassifierCV(LinearSVC)`
- Embedding: mean + standard deviation pooling over HuBERT last hidden states
- Labels: `balearic`, `central`, `northern`, `northwestern`, `valencian`

## Training Data

- Train index: `embeddings/cv26-train-1440/embedding_index.csv`
- Rows: 1,440
- Speakers: 480
- Balance: 288 clips and 96 speakers per dialect
- Label policy: expanded CV26 labels, `variant` first, controlled `accents` fallback, `Tortosí` excluded

## Held-Out Evaluation

Evaluation artifact:

- `reports/model-artifacts/cv26-hubert-svm-calibrated_dev-test/artifact_eval.md`
- `reports/model-artifacts/cv26-hubert-svm-calibrated_dev-test/artifact_eval.json`

| Metric | Value |
| --- | ---: |
| Accuracy | 0.5056 |
| Macro F1 | 0.5104 |
| Top-2 Accuracy | 0.7237 |
| Log Loss | 1.2282 |
| Brier Score | 0.6300 |
| Expected Calibration Error | 0.0640 |

Per-class F1:

| Label | F1 |
| --- | ---: |
| `balearic` | 0.7940 |
| `central` | 0.4319 |
| `northern` | 0.3540 |
| `northwestern` | 0.3732 |
| `valencian` | 0.5991 |

## Interpretation

The artifact is suitable for a local research prototype and for wiring a first backend endpoint. It is not yet strong enough for a polished public release without careful uncertainty language.

The calibration metrics are encouraging for a first heatmap prototype: ECE is low at `0.0640`, and top-2 accuracy is much stronger than top-1 accuracy. This supports showing a smooth similarity heatmap rather than a single hard answer.

## Release Readiness

Ready:

- Reusable classifier artifact exists.
- Label order and encoder metadata are saved.
- Held-out CV26 evaluation is documented.
- `predict_proba` is available for heatmap scores.

Still missing before public release:

- A backend endpoint that accepts audio and returns five calibrated scores.
- AINA benchmark evaluation.
- Real phone/laptop user recordings.
- Audio quality checks and low-confidence thresholds.
- Product copy that clearly says dialect similarity, not origin detection.
