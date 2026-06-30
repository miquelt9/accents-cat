# Embedding Baseline Results

Speaker-grouped cross-validation on frozen speech-encoder embeddings.

| Model | Accuracy | Macro F1 | Top-2 Accuracy |
| --- | ---: | ---: | ---: |
| majority_dummy | 0.2000 | 0.0667 | 0.4000 |
| logistic_regression | 0.3300 | 0.3307 | 0.5250 |
| linear_svm_calibrated | 0.2550 | 0.1952 | 0.4350 |
| nearest_centroid | 0.2350 | 0.2327 | 0.4550 |

Labels order for confusion matrices: `balearic, central, northern, northwestern, valencian`

## majority_dummy

- Confusion matrix: `[[40, 0, 0, 0, 0], [40, 0, 0, 0, 0], [40, 0, 0, 0, 0], [40, 0, 0, 0, 0], [40, 0, 0, 0, 0]]`

## logistic_regression

- Confusion matrix: `[[17, 5, 12, 6, 0], [3, 12, 10, 13, 2], [9, 5, 14, 4, 8], [6, 11, 7, 5, 11], [3, 1, 7, 11, 18]]`

## linear_svm_calibrated

- Confusion matrix: `[[3, 9, 2, 26, 0], [2, 12, 1, 25, 0], [3, 7, 2, 25, 3], [1, 8, 0, 31, 0], [0, 11, 1, 25, 3]]`

## nearest_centroid

- Confusion matrix: `[[7, 9, 9, 8, 7], [4, 14, 8, 9, 5], [5, 7, 13, 10, 5], [13, 12, 5, 6, 4], [8, 12, 3, 10, 7]]`
