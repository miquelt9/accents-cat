# Train Shard Plan

- Source manifest: `manifests/all_internal.csv`
- Output manifest: `manifests/train_shard_planned_3shards.csv`
- Target rows per label: `40`
- Max shards: `3`
- Selected shards: `['audio/ca/train/ca_train_5.tar', 'audio/ca/train/ca_train_0.tar', 'audio/ca/train/ca_train_4.tar']`
- Rows: `200`
- Speakers: `117`
- Rows by label: `{'balearic': 40, 'central': 40, 'northern': 40, 'northwestern': 40, 'valencian': 40}`
- Speakers by label: `{'balearic': 23, 'central': 18, 'northern': 26, 'northwestern': 26, 'valencian': 24}`
- Rows by shard: `{'audio/ca/train/ca_train_0.tar': 75, 'audio/ca/train/ca_train_5.tar': 70, 'audio/ca/train/ca_train_4.tar': 55}`
