# Embedding Model Comparison: 200-Clip Shard-Aware Subset

This experiment compares frozen speech encoders while keeping the audio subset, pooling, classifiers, and evaluation protocol fixed.

## Setup

- Audio subset: `data/audio/train-3shards-200/prepared_manifest.csv`
- Rows: 200 clips, balanced to 40 clips per macro-dialect
- Speakers: 117 unique `client_id` values
- Evaluation: 5-fold `StratifiedGroupKFold`, grouped by speaker
- Pooling: mean + standard deviation over encoder frames
- Classifiers: majority dummy, logistic regression, calibrated linear SVM, nearest centroid
- Device: CPU

## Encoders

| Encoder | Checkpoint | Embedding Dim | Output Dir |
| --- | --- | ---: | --- |
| Catalan HuBERT | `BSC-LT/hubert-base-ca-2k` | 1536 | `embeddings/train-3shards-200` |
| Catalan Wav2Vec2/XLS-R | `PereLluis13/wav2vec2-xls-r-300m-ca` | 2048 | `embeddings/train-3shards-200-wav2vec2-ca` |

The Wav2Vec2 checkpoint is an ASR/CTC checkpoint, so loading it with `AutoModel` reports unexpected `lm_head` weights. That is expected for embedding extraction because the CTC output head is discarded and only the base encoder hidden states are pooled.

## Commands

```bash
python scripts/extract_hubert_embeddings.py \
  --prepared-manifest data/audio/train-3shards-200/prepared_manifest.csv \
  --out-dir embeddings/train-3shards-200-wav2vec2-ca \
  --model-name PereLluis13/wav2vec2-xls-r-300m-ca \
  --force-exit

python scripts/train_embedding_baselines.py \
  --embedding-index embeddings/train-3shards-200-wav2vec2-ca/embedding_index.csv \
  --out-dir reports/baselines/train-3shards-200-wav2vec2-ca
```

## Results

| Encoder | Best Model | Accuracy | Macro F1 | Top-2 Accuracy |
| --- | --- | ---: | ---: | ---: |
| Catalan HuBERT | Logistic regression | 0.3900 | 0.3870 | 0.6050 |
| Catalan Wav2Vec2/XLS-R | Logistic regression | 0.3300 | 0.3307 | 0.5250 |
| Catalan HuBERT | Nearest centroid | 0.3250 | 0.3217 | 0.5750 |
| Catalan Wav2Vec2/XLS-R | Nearest centroid | 0.2350 | 0.2327 | 0.4550 |

## Interpretation

On this small controlled subset, Catalan HuBERT is the stronger frozen encoder. Wav2Vec2/XLS-R still beats the majority baseline with logistic regression, but it underperforms HuBERT on macro F1 and top-2 accuracy.

This does not prove HuBERT will always win. The current subset is small, source-shard limited, and uses generic mean/std pooling. However, it is enough evidence to keep `BSC-LT/hubert-base-ca-2k` as the default CPU-friendly baseline while treating Wav2Vec2 as a secondary comparison rather than the main path.

## Next Research Step

The more valuable next comparison is not another model on the same 200 clips. It is the same HuBERT baseline on a larger, speaker-richer subset from the newly downloaded Common Voice data, because the current bottleneck is likely speaker diversity and domain coverage rather than encoder choice.
