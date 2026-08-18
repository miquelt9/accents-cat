# Current SVM baseline execution failure

**Timestamp:** 2026-08-17 21:22 GMT+2
**Repository commit:** `f3a32a67ba4160bc8c9ba8ee365ff4df826bc290`
**Command attempted:**

```bash
python3 scripts/train_embedding_baselines.py \
  --embedding-index embeddings/cv26-train-1440/embedding_index.csv \
  --out-dir reports/experiments/current-svm-baseline
```

## Execution history

The first attempt failed because `scikit-learn` was not installed in the VM. The lightweight dependency was then installed successfully with `sudo pip3 install -q scikit-learn joblib`.

The second attempt reached the repository loader and failed because the canonical embedding index is absent:

```text
FileNotFoundError: [Errno 2] No such file or directory:
'embeddings/cv26-train-1440/embedding_index.csv'
```

The `embeddings/`, `models/`, and `data/` directories contain no usable local files in this checkout. The repository contains manifests and historical JSON/Markdown reports, but not the `.npz` embedding files or embedding indexes required to train/evaluate classifiers.

## VM state

| Resource | Observed value |
| --- | --- |
| CPU | 6 logical CPUs, Intel Xeon @ 2.50 GHz |
| RAM | 3.8 GiB total; approximately 1.2 GiB available at inspection |
| GPU | None detected; no `nvidia-smi` |
| Disk | 32 GiB available on `/home/ubuntu` |
| PyTorch | Not installed |
| Transformers | Not installed |
| scikit-learn | Installed during this attempt |
| joblib | Installed during this attempt |

## Consequence

No classifier benchmark was executed on real embedding data during this run. Logistic regression, RBF SVM, Random Forest, Extra Trees, HistGradientBoosting, MLP, and pooling experiments were not started because doing so without the canonical embeddings would require fabricating or substituting data, which would invalidate the requested comparison.

The historical results in `reports/` remain useful context, but they are not claimed as newly executed results in this run. To continue with actual experiments, the canonical embedding bundle or the corresponding prepared audio plus sufficient runtime dependencies must be supplied. The safest next artifact to provide is the existing `embeddings/cv26-train-1440/` directory, including `embedding_index.csv` and all referenced `.npz` files, plus the held-out embedding directories used by the historical evaluation.
