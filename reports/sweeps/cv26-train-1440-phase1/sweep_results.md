# Embedding Classifier Sweep

- Train index: `embeddings/cv26-train-1440/embedding_index.csv`
- Rows / speakers: `1440` / `480`
- Folds: `5`

| Model | Acc | Macro F1 | Top-2 | Northern F1 | Central F1 | Northwestern F1 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| linear_svm_c1.0_sigmoid | 0.5042 | 0.5063 | 0.7236 | 0.3257 | 0.4497 | 0.3757 |
| linear_svm_c3.0_sigmoid | 0.5042 | 0.5062 | 0.7236 | 0.3263 | 0.4497 | 0.3750 |
| linear_svm_c10.0_sigmoid | 0.5042 | 0.5062 | 0.7229 | 0.3263 | 0.4497 | 0.3750 |
| linear_svm_c0.3_sigmoid | 0.5042 | 0.5061 | 0.7243 | 0.3234 | 0.4490 | 0.3757 |
| linear_svm_c0.1_sigmoid | 0.5035 | 0.5060 | 0.7222 | 0.3252 | 0.4463 | 0.3772 |
| logistic_regression | 0.4944 | 0.4970 | 0.7285 | 0.3564 | 0.4372 | 0.3425 |
| linear_svm_c0.1_isotonic | 0.4917 | 0.4954 | 0.7167 | 0.3210 | 0.4460 | 0.3655 |
| linear_svm_c1.0_isotonic | 0.4917 | 0.4950 | 0.7139 | 0.3173 | 0.4395 | 0.3682 |
| linear_svm_c0.3_isotonic | 0.4910 | 0.4948 | 0.7167 | 0.3239 | 0.4406 | 0.3621 |
| linear_svm_c3.0_isotonic | 0.4903 | 0.4938 | 0.7104 | 0.3121 | 0.4361 | 0.3682 |
| linear_svm_c10.0_isotonic | 0.4903 | 0.4938 | 0.7125 | 0.3115 | 0.4361 | 0.3689 |
| mlp_small | 0.4840 | 0.4830 | 0.7056 | 0.3504 | 0.4048 | 0.3428 |
| rbf_svm_calibrated | 0.4632 | 0.4588 | 0.6757 | 0.3043 | 0.4405 | 0.3179 |

## Best CV model

- Name: `linear_svm_c1.0_sigmoid`
- Macro F1: `0.5063`
- Params: `{'C': 1.0, 'calibration': 'sigmoid', 'cv': 3}`

## Held-out / external evaluations

| Eval | Acc | Macro F1 | Top-2 | Northern F1 |
| --- | ---: | ---: | ---: | ---: |
| cv26_heldout | 0.5056 | 0.5104 | 0.7237 | 0.3540 |
| aina_benchmark | 0.4960 | 0.4977 | 0.7049 | 0.2797 |
