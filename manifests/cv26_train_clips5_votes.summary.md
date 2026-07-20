# CV26 Balanced Manifest Summary

- Source TSV: `data/metadata/cv26-ca/train.tsv`
- Output manifest: `manifests/cv26_train_clips5_votes.csv`
- Seed: `13`
- Label policy: expanded labels, variant first, controlled accents fallback, Tortosi excluded
- Tortosí policy: `exclude`
- Vote filter: min_up_votes=`2`, max_down_votes=`0`
- Rows before/after vote filter: `672582` / `620181`
- Max speakers per label requested: `150`
- Selected speakers per label: `96`
- Max clips per speaker: `5`
- Reserved speaker manifests: `['manifests/benchmark.csv']`
- Reserved speakers excluded: `1160`
- Ambiguous speakers excluded: `0`

| Label | Rows | Speakers | Available Speakers |
| --- | ---: | ---: | ---: |
| `balearic` | 449 | 96 | 288 |
| `central` | 473 | 96 | 4865 |
| `northern` | 448 | 96 | 96 |
| `northwestern` | 466 | 96 | 396 |
| `valencian` | 462 | 96 | 305 |
