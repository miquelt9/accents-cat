# Held-Out Embedding Evaluation

- Train rows: `1440`
- Eval rows: `300`
- Eval source filter: `dev.tsv`

| Model | Accuracy | Macro F1 | Top-2 Accuracy |
| --- | ---: | ---: | ---: |
| majority_dummy | 0.2000 | 0.0667 | 0.4000 |
| logistic_regression | 0.4667 | 0.4763 | 0.7133 |
| linear_svm_calibrated | 0.5100 | 0.5126 | 0.7367 |
| nearest_centroid | 0.3233 | 0.2922 | 0.6333 |

Labels order for confusion matrices: `balearic, central, northern, northwestern, valencian`

## majority_dummy

- Confusion matrix: `[[60, 0, 0, 0, 0], [60, 0, 0, 0, 0], [60, 0, 0, 0, 0], [60, 0, 0, 0, 0], [60, 0, 0, 0, 0]]`

## logistic_regression

- Confusion matrix: `[[40, 4, 11, 5, 0], [3, 29, 18, 10, 0], [5, 11, 18, 13, 13], [1, 8, 14, 24, 13], [1, 3, 8, 19, 29]]`

## linear_svm_calibrated

- Confusion matrix: `[[42, 3, 8, 6, 1], [2, 32, 21, 4, 1], [3, 14, 17, 9, 17], [2, 11, 10, 24, 13], [1, 2, 4, 15, 38]]`

## nearest_centroid

- Confusion matrix: `[[21, 1, 21, 17, 0], [5, 7, 30, 18, 0], [3, 4, 29, 23, 1], [0, 1, 22, 37, 0], [0, 0, 15, 42, 3]]`
