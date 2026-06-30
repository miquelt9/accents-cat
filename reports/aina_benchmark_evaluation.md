# AINA Benchmark Evaluation

External validation of the saved `cv26-hubert-svm-calibrated` model on a speaker-balanced subset of `projecte-aina/commonvoice_benchmark_catalan_accents`.

## Why this benchmark matters

The AINA benchmark uses expert-annotated accent labels and speakers that were **reserved from CV26 training**. It is a stronger external check than CV26 dev/test alone because it comes from a separate curation effort and was never used to build the train manifest.

## Evaluation subset

- Source manifest: `manifests/benchmark.csv` (16,625 clips, 485 speakers)
- Eval subset: `manifests/benchmark_eval_750.csv`
- Selection: 50 speakers per dialect, up to 3 clips per speaker
- Rows: 742
- Speakers: 250
- Random seed: 29
- Audio source: Common Voice 26 Catalan archive (`cv-corpus-26.0-2026-06-12/ca/clips/`)
- Speaker overlap with CV26 train (`manifests/cv26_train_2250.csv`): 0

| Dialect | Clips | Speakers |
| --- | ---: | ---: |
| Balearic | 150 | 50 |
| Central | 148 | 50 |
| Northern | 150 | 50 |
| Northwestern | 150 | 50 |
| Valencian | 144 | 50 |

## Commands

```bash
python scripts/prepare_cv26_audio_from_archive.py \
  --archive data/raw/common-voice-scripted-speech-26-0-catala-fe69b989.tar.gz \
  --manifest manifests/benchmark_eval_750.csv \
  --out-dir data/audio/benchmark-eval-750

python scripts/extract_hubert_embeddings.py \
  --prepared-manifest data/audio/benchmark-eval-750/prepared_manifest.csv \
  --out-dir embeddings/benchmark-eval-750 \
  --model-name BSC-LT/hubert-base-ca-2k \
  --device cpu \
  --force-exit

python scripts/evaluate_model_artifact.py \
  --model models/cv26-hubert-svm-calibrated/model.joblib \
  --eval-index embeddings/benchmark-eval-750/embedding_index.csv \
  --out-dir reports/model-artifacts/cv26-hubert-svm-calibrated_aina-benchmark
```

## Results

| Accuracy | Macro F1 | Top-2 Accuracy | Log Loss | Brier | ECE |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 0.4960 | 0.4977 | 0.7049 | 1.2392 | 0.6270 | 0.0650 |

### Per-dialect performance

| Dialect | Precision | Recall | F1 | Support |
| --- | ---: | ---: | ---: | ---: |
| Balearic | 0.822 | 0.740 | 0.779 | 150 |
| Central | 0.404 | 0.453 | 0.427 | 148 |
| Northern | 0.294 | 0.267 | 0.280 | 150 |
| Northwestern | 0.371 | 0.373 | 0.372 | 150 |
| Valencian | 0.610 | 0.653 | 0.631 | 144 |

### Confusion matrix

Rows = true label, columns = predicted label.

| True \\ Pred | Balearic | Central | Northern | Northwestern | Valencian |
| --- | ---: | ---: | ---: | ---: | ---: |
| Balearic | 111 | 6 | 19 | 10 | 4 |
| Central | 9 | 67 | 38 | 22 | 12 |
| Northern | 9 | 56 | 40 | 35 | 10 |
| Northwestern | 2 | 28 | 30 | 56 | 34 |
| Valencian | 4 | 9 | 9 | 28 | 94 |

## Comparison with CV26 held-out evaluation

| Evaluation set | Accuracy | Macro F1 | Top-2 Accuracy |
| --- | ---: | ---: | ---: |
| CV26 dev+test (held-out) | 0.5056 | 0.5104 | 0.7237 |
| AINA benchmark subset | 0.4960 | 0.4977 | 0.7049 |

The AINA benchmark score is slightly below CV26 held-out, but the gap is small. That suggests the current model generalizes reasonably to this external benchmark and is not only fitting CV26 split quirks.

## Interpretation

**What works**

- Balearic remains the easiest class, with strong precision and recall.
- Valencian is the second strongest mainland class.
- Top-2 accuracy around 70% means the heatmap can often show a useful runner-up region even when the top label is wrong.
- Calibration (ECE ~0.065) is similar to CV26 held-out, so probability scores remain usable for UX bands.

**Main weaknesses**

- `central`, `northern`, and `northwestern` are heavily confused with each other.
- Northern is the weakest class on this benchmark (F1 ~0.28).
- Macro F1 near 0.50 is only modestly above chance for five classes; the app should continue to communicate uncertainty clearly.

**Likely causes**

- Macro dialect labels collapse real sub-regional variation.
- Training data is still relatively small (1,440 clips) and scripted.
- The benchmark clips come from a different curation path than CV26 train, so some domain shift is expected.

## Implications for next improvements

1. **Do not over-trust single-label accuracy.** Keep the geographic heatmap and top-two ambiguity UX; benchmark top-2 is materially better than top-1.
2. **Prioritize mainland confusion pairs.** Future work should target `central` vs `northwestern` vs `northern`, not Balearic detection.
3. **Add more speaker-diverse training data** before chasing bigger models. More balanced speakers per dialect will likely help more than a larger neural head.
4. **Use real user recordings as a second external test.** The benchmark is useful, but the product goal is phone/laptop read-aloud audio.
5. **Consider a scripted reading prompt** with phonetic contrasts across dialects before fine-tuning the encoder.

## Artifacts

- Manifest: `manifests/benchmark_eval_750.csv`
- Manifest summary: `manifests/benchmark_eval_750.summary.md`
- Prepared audio: `data/audio/benchmark-eval-750/`
- Embeddings: `embeddings/benchmark-eval-750/`
- Raw eval JSON: `reports/model-artifacts/cv26-hubert-svm-calibrated_aina-benchmark/artifact_eval.json`
- Raw eval markdown: `reports/model-artifacts/cv26-hubert-svm-calibrated_aina-benchmark/artifact_eval.md`
