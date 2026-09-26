# Experiment log

| Status | Timestamp | Experiment | Result | Next action |
| --- | --- | --- | --- | --- |
| EXECUTED | 2026-08-17 21:22 | Canonical SVM baseline command after installing scikit-learn/joblib | Reached data loader; failed because `embeddings/cv26-train-1440/embedding_index.csv` is absent | Supply canonical embedding bundle or regenerate from prepared audio |
| EXECUTED | 2026-08-17 21:20 | Historical artifact consolidation script | Generated `reports/model_comparison/artifact_metrics.csv`, summary text, and chart from checked-in artifact JSON files | Use as historical evidence only |
| EXECUTED | 2026-08-17 21:36 | Website regression checks | Lint, build, and Vitest all exited successfully; build emitted existing URL and chunk-size warnings | Review the new research overlay in the browser |
| EXECUTED | 2026-08-17 21:36 | Website interaction | Research overlay opened and rendered pipeline, metrics, conclusion, and blocker | Package PR patches |
| BLOCKED | 2026-08-17 | Classifier alternatives: logistic regression, RBF SVM, Random Forest, Extra Trees, HistGradientBoosting, MLP | Not started because canonical features are absent | Do not fabricate metrics |
| BLOCKED | 2026-08-17 | Pooling, duration, prompts, repeated-take, threshold, calibration, robustness, encoder, and fine-tuning experiments | Not started because canonical audio/features are absent | Obtain canonical bundle first |
