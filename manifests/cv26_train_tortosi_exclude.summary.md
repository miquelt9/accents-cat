# CV26 Balanced Manifest Summary

- Source TSV: `data/metadata/cv26-ca/train.tsv`
- Output manifest: `manifests/cv26_train_tortosi_exclude.csv`
- Seed: `13`
- Label policy: expanded labels, variant first, controlled accents fallback, Tortosi excluded
- Tortosí policy: `exclude`
- Vote filter: min_up_votes=`None`, max_down_votes=`None`
- Rows before/after vote filter: `672582` / `672582`
- Max speakers per label requested: `150`
- Selected speakers per label: `96`
- Max clips per speaker: `3`
- Reserved speaker manifests: `['manifests/benchmark.csv']`
- Reserved speakers excluded: `1164`
- Ambiguous speakers excluded: `0`

| Label | Rows | Speakers | Available Speakers |
| --- | ---: | ---: | ---: |
| `balearic` | 288 | 96 | 288 |
| `central` | 288 | 96 | 4865 |
| `northern` | 288 | 96 | 96 |
| `northwestern` | 288 | 96 | 396 |
| `valencian` | 288 | 96 | 305 |
