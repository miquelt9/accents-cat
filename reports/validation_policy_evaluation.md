# Validation policy evaluation

This report defines the reproducible comparison for repeated recordings. It
does not claim that validation improves accuracy until a speaker-grouped
JSONL fixture has been collected and evaluated.

## Input contract

`evaluate_validation_policy.py` expects one JSON object per line, with all
repeated takes for one speaker on the same line:

```json
{"speaker_id":"speaker-1","label":"central","takes":[{"balearic":0.1,"central":0.5,"northern":0.1,"northwestern":0.1,"valencian":0.2}]}
```

Keep every take from a speaker in the same evaluation partition. Never split
repeated takes across train and test sets.

## Reproducible command

```bash
python scripts/evaluate_validation_policy.py \
  --input data/validation_policy/speaker_grouped.jsonl \
  --output reports/validation_policy_evaluation.json
```

The output compares:

- first take only;
- average of two takes;
- average of three takes;
- the current adaptive policy, including the geographic-coherence guard and
  agreement-aware merge.

Each policy reports accuracy, balanced accuracy, macro-F1, log loss, Brier
score, expected calibration error, and average takes used. Production
thumbs-up/down and self-declared comarca feedback can be used as weak
calibration signals, but not as definitive dialect labels.
