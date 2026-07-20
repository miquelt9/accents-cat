# Embedding Baseline Results

Speaker-grouped cross-validation on frozen speech-encoder embeddings.

| Model | Accuracy | Macro F1 | Top-2 Accuracy |
| --- | ---: | ---: | ---: |
| majority_dummy | 0.1992 | 0.1035 | 0.4014 |
| logistic_regression | 0.4992 | 0.5008 | 0.7240 |
| linear_svm_calibrated | 0.4971 | 0.4971 | 0.7185 |
| nearest_centroid | 0.3066 | 0.3067 | 0.5659 |

Labels order for confusion matrices: `balearic, central, northern, northwestern, valencian`

## majority_dummy

- Confusion matrix: `[[0, 95, 0, 0, 382], [0, 95, 0, 0, 383], [0, 96, 0, 0, 376], [0, 95, 0, 0, 383], [0, 99, 0, 0, 380]]`

## logistic_regression

- Confusion matrix: `[[365, 52, 39, 11, 10], [41, 215, 114, 89, 19], [26, 127, 153, 110, 56], [9, 70, 99, 182, 118], [11, 20, 50, 123, 275]]`

## linear_svm_calibrated

- Confusion matrix: `[[376, 41, 33, 18, 9], [31, 213, 131, 69, 34], [23, 124, 142, 115, 68], [7, 73, 93, 170, 135], [12, 21, 51, 111, 284]]`

## nearest_centroid

- Confusion matrix: `[[202, 57, 84, 122, 12], [34, 121, 134, 177, 12], [38, 98, 130, 163, 43], [20, 66, 105, 218, 69], [14, 39, 111, 255, 60]]`
