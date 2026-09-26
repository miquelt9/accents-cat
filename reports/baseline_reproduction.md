# Baseline reproduction

## Attempted execution

The documented command was executed after installing `scikit-learn` and `joblib`:

```bash
python3 scripts/train_embedding_baselines.py \
  --embedding-index embeddings/cv26-train-1440/embedding_index.csv \
  --out-dir reports/experiments/current-svm-baseline
```

The command reached `load_embeddings()` and failed with:

```text
FileNotFoundError: [Errno 2] No such file or directory:
'embeddings/cv26-train-1440/embedding_index.csv'
```

Therefore, no new SVM metric was produced in this VM session.

## Historical repository reference, not a new execution

The repository reports a calibrated linear SVM using Catalan HuBERT mean+std pooled embeddings at 0.5042 accuracy, 0.5063 Macro F1, and 0.7236 top-2 accuracy under its CV26 1,440-clip experiment. Those numbers are retained as historical context only; they were not re-created in the current checkout because the referenced embedding index and `.npz` files are absent.

## Missing artifact required to continue

The smallest direct unblock is the canonical `embeddings/cv26-train-1440/` directory, including `embedding_index.csv` and every referenced embedding file, plus the held-out embedding directories for final evaluation. The alternative is prepared canonical audio and the ability to install/load `BSC-LT/hubert-base-ca-2k`.
