# Held-Out Embedding Evaluation

- Train rows: `1440`
- Eval rows: `232`
- Eval source filter: `test.tsv`

| Model | Accuracy | Macro F1 | Top-2 Accuracy |
| --- | ---: | ---: | ---: |
| majority_dummy | 0.1940 | 0.0650 | 0.4095 |
| logistic_regression | 0.5000 | 0.4993 | 0.6940 |
| linear_svm_calibrated | 0.5000 | 0.5047 | 0.7069 |
| nearest_centroid | 0.2888 | 0.2558 | 0.5129 |

Labels order for confusion matrices: `balearic, central, northern, northwestern, valencian`

## majority_dummy

- Confusion matrix: `[[45, 0, 0, 0, 0], [40, 0, 0, 0, 0], [50, 0, 0, 0, 0], [47, 0, 0, 0, 0], [50, 0, 0, 0, 0]]`

## logistic_regression

- Confusion matrix: `[[37, 2, 4, 2, 0], [1, 14, 18, 6, 1], [1, 15, 27, 5, 2], [3, 11, 9, 17, 7], [5, 4, 9, 11, 21]]`

## linear_svm_calibrated

- Confusion matrix: `[[37, 2, 4, 2, 0], [3, 14, 13, 10, 0], [1, 21, 23, 4, 1], [2, 10, 11, 15, 9], [1, 4, 5, 13, 27]]`

## nearest_centroid

- Confusion matrix: `[[19, 0, 16, 10, 0], [4, 2, 6, 28, 0], [3, 7, 12, 26, 2], [2, 5, 8, 31, 1], [1, 2, 15, 29, 3]]`
