# Leakage audit

## Scope

This audit covers the repository’s documented split design, training/evaluation code, available artifacts, and the current checkout. It does not claim a full row-level duplicate audit because the canonical embedding indexes and audio/manifests used by the historical run are not present in this working tree.

## Verified controls

| Risk | Finding | Status |
| --- | --- | --- |
| Speaker overlap | The documented pipeline uses speaker-grouped splits and `StratifiedGroupKFold`; the current training script accepts speaker groups. | Control documented; row-level verification blocked by absent index |
| Scaler leakage | The documented baseline fits `StandardScaler` inside the training workflow. | Code-level control present; rerun blocked |
| Calibration leakage | Calibration is part of the training workflow, not a post-test operation in the documented artifact path. | Code-level control present; rerun blocked |
| Test-set model selection | The project documents separate validation/held-out evaluation paths. | Control documented; raw split verification blocked |
| Duplicate/repeated takes | The current checkout has no canonical audio or embedding index to compare. | BLOCKED |
| Filename/path leakage | No canonical feature index is present to inspect path-derived features. | BLOCKED |
| Embedding contamination | No embedding files are present. | BLOCKED |

## Conclusion

No leakage was newly discovered from the available source code and documentation. However, this is not a substitute for a data-level audit. Before using new benchmark metrics, rerun duplicate, speaker-overlap, repeated-take, and path-leakage checks on the supplied canonical bundle.
