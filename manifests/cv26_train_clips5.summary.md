# CV26 Balanced Manifest Summary

- Source TSV: `data/metadata/cv26-ca/train.tsv`
- Output manifest: `manifests/cv26_train_clips5.csv`
- Seed: `13`
- Label policy: expanded labels, variant first, controlled accents fallback, Tortosi excluded
- Tortosí policy: `exclude`
- Vote filter: min_up_votes=`None`, max_down_votes=`None`
- Rows before/after vote filter: `672582` / `672582`
- Max speakers per label requested: `150`
- Selected speakers per label: `96`
- Max clips per speaker: `5`
- Reserved speaker manifests: `['manifests/benchmark.csv']`
- Reserved speakers excluded: `1164`
- Ambiguous speakers excluded: `0`

| Label | Rows | Speakers | Available Speakers |
| --- | ---: | ---: | ---: |
| `balearic` | 477 | 96 | 288 |
| `central` | 478 | 96 | 4865 |
| `northern` | 472 | 96 | 96 |
| `northwestern` | 478 | 96 | 396 |
| `valencian` | 479 | 96 | 305 |
