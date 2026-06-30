# Embedding Baseline Results

Speaker-grouped cross-validation on frozen HuBERT embeddings.

| Model | Accuracy | Macro F1 | Top-2 Accuracy |
| --- | ---: | ---: | ---: |
| majority_dummy | 0.2000 | 0.0667 | 0.4000 |
| logistic_regression | 0.1800 | 0.1785 | 0.3000 |
| linear_svm_calibrated | 0.2400 | 0.1999 | 0.5000 |
| nearest_centroid | 0.1800 | 0.1760 | 0.3400 |

Labels order for confusion matrices: `balearic, central, northern, northwestern, valencian`

## majority_dummy

- Confusion matrix: `[[10, 0, 0, 0, 0], [10, 0, 0, 0, 0], [10, 0, 0, 0, 0], [10, 0, 0, 0, 0], [10, 0, 0, 0, 0]]`

## logistic_regression

- Confusion matrix: `[[2, 3, 2, 2, 1], [1, 2, 1, 4, 2], [0, 4, 1, 1, 4], [3, 3, 1, 1, 2], [1, 2, 2, 2, 3]]`

## linear_svm_calibrated

- Confusion matrix: `[[0, 3, 5, 2, 0], [0, 4, 4, 2, 0], [0, 2, 5, 3, 0], [0, 2, 6, 2, 0], [0, 3, 4, 2, 1]]`

## nearest_centroid

- Confusion matrix: `[[2, 1, 1, 5, 1], [2, 1, 2, 3, 2], [1, 1, 2, 3, 3], [1, 2, 2, 3, 2], [1, 1, 3, 4, 1]]`
