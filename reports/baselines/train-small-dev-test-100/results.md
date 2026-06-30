# Embedding Baseline Results

Speaker-grouped cross-validation on frozen HuBERT embeddings.

| Model | Accuracy | Macro F1 | Top-2 Accuracy |
| --- | ---: | ---: | ---: |
| majority_dummy | 0.2000 | 0.0667 | 0.4000 |
| logistic_regression | 0.3200 | 0.3205 | 0.5000 |
| linear_svm_calibrated | 0.2300 | 0.1823 | 0.5000 |
| nearest_centroid | 0.2500 | 0.2380 | 0.4800 |

Labels order for confusion matrices: `balearic, central, northern, northwestern, valencian`

## majority_dummy

- Confusion matrix: `[[20, 0, 0, 0, 0], [20, 0, 0, 0, 0], [20, 0, 0, 0, 0], [20, 0, 0, 0, 0], [20, 0, 0, 0, 0]]`

## logistic_regression

- Confusion matrix: `[[13, 3, 3, 1, 0], [2, 5, 8, 1, 4], [3, 6, 2, 5, 4], [4, 3, 8, 4, 1], [2, 3, 5, 2, 8]]`

## linear_svm_calibrated

- Confusion matrix: `[[1, 1, 11, 7, 0], [0, 1, 13, 5, 1], [0, 0, 13, 7, 0], [1, 0, 13, 6, 0], [0, 1, 14, 3, 2]]`

## nearest_centroid

- Confusion matrix: `[[4, 2, 2, 11, 1], [4, 3, 6, 3, 4], [3, 2, 4, 6, 5], [2, 2, 2, 10, 4], [0, 4, 4, 8, 4]]`
