# Catalan Accent Oracle — project research summary

## Baseline

The canonical SVM command was actually executed in the current VM after installing the missing lightweight `scikit-learn` and `joblib` packages. It did not reach model fitting because the canonical embedding index is not present:

```text
FileNotFoundError: embeddings/cv26-train-1440/embedding_index.csv
```

The repository’s historical CV26 reference is a calibrated LinearSVC over Catalan HuBERT mean+std embeddings, with 0.5042 accuracy, 0.5063 Macro F1, and 0.7236 top-2 accuracy. These are historical artifact values, not newly reproduced values.

## Best model supported by available evidence

| Field | Supported conclusion |
| --- | --- |
| Encoder | `BSC-LT/hubert-base-ca-2k` |
| Pooling | Mean + standard deviation over hidden-state frames |
| Classifier | Calibrated linear SVM with sigmoid calibration |
| Historical Macro F1 | 0.5063 cross-validation; 0.5104 held-out artifact; 0.4977 AINA artifact |
| Historical top-2 | 0.7236 cross-validation; 0.7237 held-out artifact; 0.7049 AINA artifact |
| Calibration | Calibrated scores are useful for ranking, but current execution could not recompute ECE/Brier |
| Latency/model size | Not measured in this VM run |

## Improvement

The strongest documented candidate is five clips per speaker with quality-vote filtering and multi-take aggregation. Its held-out artifact Macro F1 is 0.5159 versus 0.5104 for the single-clip artifact, and its AINA Macro F1 is 0.5157 versus 0.4977. This is a historical repository result, not a new execution in this checkout.

The absolute AINA Macro F1 difference is 0.0180, or 1.80 percentage points. It must be revalidated with the canonical embeddings and paired predictions before being called statistically significant.

## What actually worked

The executed work successfully inspected the full repository history, confirmed that the working tree is a shallow clone only until it was unshallowed, checked ignored paths and home caches, queried the public GitHub repository and Hugging Face artifact references, measured VM resources, installed scikit-learn/joblib, attempted the canonical baseline, generated historical artifact comparisons, added a transparent research view to the website, and passed the website lint/build/test checks.

## What did not execute

Alternative classifiers, pooling comparisons, duration analysis, prompt analysis, repeated-take policy evaluation, threshold tuning, calibration metrics, robustness tests, speaker analysis, alternative encoder tests, and fine-tuning were **NOT EXECUTED — reason: canonical embeddings and audio are absent**. These experiments must not be represented by historical report values as if they were run now.

## Biggest discovered weakness

The immediate engineering bottleneck is unavailable canonical data, not evidence that the SVM head is inadequate. The historical sweep already shows the calibrated linear SVM ahead of logistic regression, RBF SVM, and a small MLP on the same frozen features. The next scientific bottlenecks are speaker diversity, northern-class coverage, and multi-take quality/aggregation.

## Validation

Historical five-clip-plus-votes artifacts suggest that additional recordings can help when low-quality takes are filtered and scores are aggregated. A new policy comparison was not executed in this VM because the underlying embeddings are missing.

## Robustness

NOT EXECUTED — reason: no canonical audio is available locally, and downloading the documented monolithic Common Voice archive would exceed the VM’s available disk.

## Production recommendation

**NOT YET — promising but insufficient evidence.** Keep the calibrated SVM as the production/research baseline. Do not replace it with another classifier based on historical reports alone. Promote the five-clips-plus-votes candidate only after obtaining the canonical bundle and rerunning the baseline, validation selection, held-out evaluation, per-dialect comparison, calibration, and latency checks.

## Reproduction

From the repository root, the documented baseline command is:

```bash
python scripts/train_embedding_baselines.py \
  --embedding-index embeddings/cv26-train-1440/embedding_index.csv \
  --out-dir reports/baselines/cv26-train-1440
```

The smallest artifact needed to unblock the benchmark is `embeddings/cv26-train-1440/`, including `embedding_index.csv` and all referenced `.npz` files, plus the held-out embedding directories. The alternative is prepared canonical audio and the `BSC-LT/hubert-base-ca-2k` runtime.
