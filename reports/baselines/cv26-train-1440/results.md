# Embedding Baseline Results

Speaker-grouped cross-validation on frozen speech-encoder embeddings.

| Model | Accuracy | Macro F1 | Top-2 Accuracy |
| --- | ---: | ---: | ---: |
| majority_dummy | 0.1979 | 0.1029 | 0.3979 |
| logistic_regression | 0.4944 | 0.4970 | 0.7285 |
| linear_svm_calibrated | 0.5042 | 0.5063 | 0.7236 |
| nearest_centroid | 0.3007 | 0.2905 | 0.5500 |

Labels order for confusion matrices: `balearic, central, northern, northwestern, valencian`

## majority_dummy

- Confusion matrix: `[[228, 60, 0, 0, 0], [231, 57, 0, 0, 0], [231, 57, 0, 0, 0], [231, 57, 0, 0, 0], [231, 57, 0, 0, 0]]`

## logistic_regression

- Confusion matrix: `[[218, 33, 18, 10, 9], [24, 127, 76, 48, 13], [17, 72, 103, 63, 33], [6, 50, 57, 100, 75], [2, 11, 36, 75, 164]]`

## linear_svm_calibrated

- Confusion matrix: `[[226, 24, 18, 12, 8], [19, 132, 81, 38, 18], [16, 84, 93, 56, 39], [2, 49, 54, 108, 75], [1, 10, 37, 73, 167]]`

## nearest_centroid

- Confusion matrix: `[[114, 14, 71, 83, 6], [19, 43, 93, 126, 7], [20, 36, 108, 114, 10], [12, 25, 83, 141, 27], [12, 14, 80, 155, 27]]`
