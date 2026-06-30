# Held-Out Embedding Evaluation

- Train rows: `1440`
- Eval rows: `532`
- Eval source filter: `None`

| Model | Accuracy | Macro F1 | Top-2 Accuracy | Log Loss | Brier | ECE |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| majority_dummy | 0.1974 | 0.0659 | 0.4041 | 28.9298 | 1.6053 | 0.8026 |
| logistic_regression | 0.4812 | 0.4881 | 0.7049 | 2.6819 | 0.8616 | 0.3756 |
| linear_svm_calibrated | 0.5056 | 0.5104 | 0.7237 | 1.2282 | 0.6300 | 0.0640 |
| nearest_centroid | 0.3083 | 0.2777 | 0.5808 | 22.0380 | 1.3690 | 0.6836 |

Labels order for confusion matrices: `balearic, central, northern, northwestern, valencian`

## majority_dummy

- Confusion matrix: `[[105, 0, 0, 0, 0], [100, 0, 0, 0, 0], [110, 0, 0, 0, 0], [107, 0, 0, 0, 0], [110, 0, 0, 0, 0]]`

## logistic_regression

- Confusion matrix: `[[77, 6, 15, 7, 0], [4, 43, 36, 16, 1], [6, 26, 45, 18, 15], [4, 19, 23, 41, 20], [6, 7, 17, 30, 50]]`

## linear_svm_calibrated

- Confusion matrix: `[[79, 5, 12, 8, 1], [5, 46, 34, 14, 1], [4, 35, 40, 13, 18], [4, 21, 21, 39, 22], [2, 6, 9, 28, 65]]`

## nearest_centroid

- Confusion matrix: `[[40, 1, 37, 27, 0], [9, 9, 36, 46, 0], [6, 11, 41, 49, 3], [2, 6, 30, 68, 1], [1, 2, 30, 71, 6]]`
