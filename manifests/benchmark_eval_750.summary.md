# AINA Benchmark Evaluation Subset

Speaker-balanced held-out subset from `projecte-aina/commonvoice_benchmark_catalan_accents`, prepared for external evaluation of the CV26 HuBERT calibrated SVM artifact.

## Selection

- Source manifest: `manifests/benchmark.csv` (16,625 clips, 485 speakers reserved from training)
- Subset: 50 speakers per dialect, up to 3 clips per speaker
- Random seed: 29
- Audio source: Common Voice 26 Catalan archive (`cv-corpus-26.0-2026-06-12/ca/clips/`)
- Speaker overlap with CV26 train manifest (`manifests/cv26_train_2250.csv`): 0

## Summary

| Metric | Value |
| --- | ---: |
| Rows | 742 |
| Speakers | 250 |
| Balearic clips / speakers | 150 / 50 |
| Central clips / speakers | 148 / 50 |
| Northern clips / speakers | 150 / 50 |
| Northwestern clips / speakers | 150 / 50 |
| Valencian clips / speakers | 144 / 50 |

## Artifacts

- Manifest: `manifests/benchmark_eval_750.csv`
- Summary JSON: `manifests/benchmark_eval_750.summary.json`
- Prepared audio: `data/audio/benchmark-eval-750/`
- Embeddings: `embeddings/benchmark-eval-750/`
- Evaluation report: `reports/aina_benchmark_evaluation.md`
