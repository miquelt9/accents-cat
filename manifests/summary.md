# Balanced Manifest Summary

- Seed: `13`
- Max speakers per accent requested: `100`
- Selected speakers per accent: `97`
- Max clips per speaker: `10`
- Benchmark reserved speakers: `1531`
- Ambiguous speakers dropped: `0`
- Source rows after filtering: `820404`
- Available speakers by label: `{'balearic': 383, 'central': 5559, 'northern': 97, 'northwestern': 547, 'valencian': 339}`

## Splits

### `train`

- Rows: `2366`
- Speakers: `340`
- Rows by label: `{'balearic': 433, 'central': 561, 'northern': 399, 'northwestern': 481, 'valencian': 492}`
- Speakers by label: `{'balearic': 68, 'central': 68, 'northern': 68, 'northwestern': 68, 'valencian': 68}`

### `validation`

- Rows: `491`
- Speakers: `75`
- Rows by label: `{'balearic': 76, 'central': 115, 'northern': 80, 'northwestern': 105, 'valencian': 115}`
- Speakers by label: `{'balearic': 15, 'central': 15, 'northern': 15, 'northwestern': 15, 'valencian': 15}`

### `calibration`

- Rows: `506`
- Speakers: `70`
- Rows by label: `{'balearic': 96, 'central': 120, 'northern': 76, 'northwestern': 101, 'valencian': 113}`
- Speakers by label: `{'balearic': 14, 'central': 14, 'northern': 14, 'northwestern': 14, 'valencian': 14}`

## Leakage Checks

- Speaker overlap between train/validation/calibration: `{'train_validation': 0, 'train_calibration': 0, 'validation_calibration': 0}`
- Speaker overlap with benchmark: `0`
