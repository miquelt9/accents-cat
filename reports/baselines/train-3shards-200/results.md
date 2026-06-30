# Embedding Baseline Results

Speaker-grouped cross-validation on frozen HuBERT embeddings.

| Model | Accuracy | Macro F1 | Top-2 Accuracy |
| --- | ---: | ---: | ---: |
| majority_dummy | 0.2000 | 0.0667 | 0.4000 |
| logistic_regression | 0.3900 | 0.3870 | 0.6050 |
| linear_svm_calibrated | 0.2950 | 0.2715 | 0.5800 |
| nearest_centroid | 0.3250 | 0.3217 | 0.5750 |

Labels order for confusion matrices: `balearic, central, northern, northwestern, valencian`

## majority_dummy

- Confusion matrix: `[[40, 0, 0, 0, 0], [40, 0, 0, 0, 0], [40, 0, 0, 0, 0], [40, 0, 0, 0, 0], [40, 0, 0, 0, 0]]`

## logistic_regression

- Confusion matrix: `[[21, 3, 8, 3, 5], [3, 10, 12, 7, 8], [6, 6, 14, 8, 6], [4, 10, 3, 11, 12], [1, 3, 4, 10, 22]]`

## linear_svm_calibrated

- Confusion matrix: `[[11, 3, 8, 14, 4], [2, 2, 7, 26, 3], [4, 3, 11, 20, 2], [3, 3, 6, 27, 1], [0, 2, 6, 24, 8]]`

## nearest_centroid

- Confusion matrix: `[[8, 14, 7, 6, 5], [4, 16, 2, 14, 4], [7, 11, 10, 4, 8], [1, 13, 3, 17, 6], [0, 12, 7, 7, 14]]`
