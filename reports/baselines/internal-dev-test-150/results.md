# Embedding Baseline Results

Speaker-grouped cross-validation on frozen HuBERT embeddings.

| Model | Accuracy | Macro F1 | Top-2 Accuracy |
| --- | ---: | ---: | ---: |
| majority_dummy | 0.2000 | 0.0667 | 0.4000 |
| logistic_regression | 0.3867 | 0.3926 | 0.6333 |
| linear_svm_calibrated | 0.2933 | 0.3040 | 0.5267 |
| nearest_centroid | 0.2067 | 0.1965 | 0.4400 |

Labels order for confusion matrices: `balearic, central, northern, northwestern, valencian`

## majority_dummy

- Confusion matrix: `[[30, 0, 0, 0, 0], [30, 0, 0, 0, 0], [30, 0, 0, 0, 0], [30, 0, 0, 0, 0], [30, 0, 0, 0, 0]]`

## logistic_regression

- Confusion matrix: `[[16, 4, 4, 4, 2], [5, 12, 9, 2, 2], [3, 9, 7, 6, 5], [2, 3, 6, 12, 7], [0, 3, 10, 6, 11]]`

## linear_svm_calibrated

- Confusion matrix: `[[7, 9, 8, 5, 1], [1, 13, 9, 4, 3], [0, 17, 7, 6, 0], [2, 10, 8, 9, 1], [0, 10, 6, 6, 8]]`

## nearest_centroid

- Confusion matrix: `[[4, 5, 3, 9, 9], [2, 3, 9, 2, 14], [2, 9, 3, 7, 9], [3, 4, 2, 12, 9], [3, 6, 4, 8, 9]]`
