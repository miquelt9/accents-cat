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
  agreement-aware winner selection;
- adaptive equal aggregation, which retains every used score vector and
  requests another take when the mean pairwise score disagreement exceeds
  `0.18`;
- geometric pooling of two and three takes;
- tempered logarithmic pooling of three takes at exponents `0.50`, `0.75` and
  `1.00`;
- adaptive aggregation driven by the geometric pool.

Each policy reports accuracy, balanced accuracy, macro-F1, log loss, Brier
score, expected calibration error, and average takes used. Production
thumbs-up/down and self-declared comarca feedback can be used as weak
calibration signals, but not as definitive dialect labels.

## Choosing a pooling rule

The shipped web flow averages the score vectors of every take it used. That is
a linear opinion pool, and it is deliberately conservative: it cannot be
dragged around by one confident take, but it is also idempotent, so three
consistent takes produce exactly the confidence of one. Repeated agreement
never raises the top score, and the same `top >= 0.50` / `gap >= 0.15` gate is
applied to pooled vectors even though it was set for single takes.

Logarithmic pooling raises the alternative: with an exponent of `1 / n` it is
the geometric mean, which is also idempotent but multiplicatively penalizes any
class that a single take rejects; with an exponent of `1.0` it is the
naive-Bayes product under a uniform prior, where agreement genuinely sharpens
the posterior. Repeated takes from one speaker, microphone and room are not
conditionally independent, so `1.0` is expected to over-sharpen and the useful
setting is somewhere between the two.

Pick the exponent on log loss, Brier score and expected calibration error
rather than accuracy alone, since the differences between these rules are
mostly about confidence rather than about the predicted label. Re-tune the
validation gate together with the pooling rule; thresholds carried over from
single takes do not transfer to a pooled vector.
