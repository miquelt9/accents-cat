# Common Voice 26 Catalan Metadata Audit

Archive checked: `data/raw/common-voice-scripted-speech-26-0-catala-fe69b989.tar.gz`

Only metadata files were extracted to `data/metadata/cv26-ca`. Audio clips were not extracted.

## Available Metadata

The useful clip-level files are:

- `train.tsv`
- `dev.tsv`
- `test.tsv`
- `validated.tsv`
- `other.tsv`
- `invalidated.tsv`

Clip-level columns:

```text
client_id, path, sentence_id, sentence, sentence_domain, up_votes, down_votes, age, gender, accents, variant, locale, segment
```

For accent classification, the most useful fields are:

- `client_id`: required for speaker-disjoint splitting
- `path`: points to the MP3 filename inside `clips/`
- `sentence`: useful for fixed-script candidate analysis
- `variant`: cleanest dialect label when populated
- `accents`: noisier self-reported accent text, useful as fallback only
- `age`, `gender`: useful for auditing demographic skew
- `segment`: useful for detecting special subsets such as `Benchmark`

## Important Split Warning

Do not combine `validated.tsv` with `train.tsv`, `dev.tsv`, and `test.tsv` as if they were independent. `validated.tsv` is the broad validated pool and overlaps conceptually with the official train/dev/test split.

Recommended use:

- Use `train.tsv` for training expansion.
- Keep `dev.tsv` and `test.tsv` for evaluation or model-selection checks.
- Use `validated.tsv` only if we rebuild our own speaker-disjoint split from scratch.
- Avoid `invalidated.tsv` for model training.
- Treat `other.tsv` as lower-trust data unless manually reviewed.

## Conservative Macro Labels

This strategy maps only clean macro labels:

- `Central` -> `central`
- `Balear` -> `balearic`
- `Septentrional` -> `northern`
- `Nord-Occidental` -> `northwestern`
- `Valencià` -> `valencian`

### `train.tsv`

| Label | Rows | Speakers |
| --- | ---: | ---: |
| `balearic` | 19,472 | 479 |
| `central` | 534,720 | 5,223 |
| `northern` | 18,434 | 207 |
| `northwestern` | 47,088 | 593 |
| `valencian` | 28,102 | 481 |

This is enough to build a much stronger balanced training subset than our current 200-clip experiment, but the limiting class is still `northern` with 207 speakers.

### Official Evaluation Splits

`dev.tsv` conservative speakers:

| Label | Rows | Speakers |
| --- | ---: | ---: |
| `balearic` | 291 | 65 |
| `central` | 1,963 | 430 |
| `northern` | 119 | 26 |
| `northwestern` | 263 | 59 |
| `valencian` | 201 | 45 |

`test.tsv` conservative speakers:

| Label | Rows | Speakers |
| --- | ---: | ---: |
| `balearic` | 227 | 78 |
| `central` | 1,765 | 608 |
| `northern` | 61 | 21 |
| `northwestern` | 245 | 82 |
| `valencian` | 254 | 91 |

The official `dev`/`test` splits are useful, but small for `northern`. They should be treated as one evaluation signal, not the only final benchmark.

## Expanded Label Strategy

An expanded strategy can safely add some fine labels:

- `Valencià meridional`, `Valencià central`, `Valencià septentrional`, `Alacantí` -> `valencian`
- `mallorquí`, `menorquí`, `eivissenc` -> `balearic` if present
- `Barceloní`, `Gironí`, `Camp de Tarragona`, `Català central` -> `central` if present
- `Lleidatà` -> `northwestern` if present

For now, exclude `Tortosí` from the first training expansion. It is dialectologically transitional and could inject label noise if forced into `northwestern` or `valencian` without a deliberate policy.

### `train.tsv` Expanded, Excluding `Tortosí`

| Label | Rows | Speakers |
| --- | ---: | ---: |
| `balearic` | 20,038 | 500 |
| `central` | 536,591 | 5,264 |
| `northern` | 19,194 | 211 |
| `northwestern` | 47,341 | 609 |
| `valencian` | 49,599 | 536 |

This is the recommended label policy for the next experiment.

## Main Traps

Central is massively overrepresented. Training on raw rows would mostly teach the model dataset frequency and speaker identity, not dialect.

Many speakers have many clips. We must cap clips per speaker, otherwise the model may learn speaker-specific microphone/voice traits.

`variant` is cleaner than `accents`, but not complete. `accents` contains free text and combined values such as `balear|central`, `central|nord-occidental`, and local descriptions. Use it only as a controlled fallback.

`validated.tsv` is not a new independent split. Using it alongside train/dev/test can create evaluation leakage.

`invalidated.tsv` should not be used for training because the clips failed validation.

`other.tsv` may be useful later for semi-supervised or manually reviewed data, but should not be part of the next supervised baseline.

## Recommended Next Experiment

Build a balanced CV26 training manifest from `train.tsv` only:

- Use expanded labels excluding `Tortosí`.
- Balance by speakers, not clips.
- Target at most 200 speakers per class because `northern` has only 211 usable train speakers.
- Cap clips per speaker to 3-5 initially.
- Sample equal or near-equal clips per label after speaker balancing.
- Keep `dev.tsv` and `test.tsv` speaker-disjoint from training.
- Also exclude any speakers already reserved in the AINA benchmark metadata.

Suggested first scale-up:

- 150 speakers per dialect
- 3 clips per speaker
- about 2,250 clips total

Suggested second scale-up if CPU time/storage is acceptable:

- 200 speakers per dialect
- 5 clips per speaker
- about 5,000 clips total

This should be much more informative than adding more clips from the same small speaker pool. The goal is to improve generalization to new users, so unique speakers matter more than raw hours.

## Bottom Line

CV26 is useful for increasing the training dataset, but only after strict balancing and careful label policy. The safest next step is to create a speaker-balanced `train.tsv`-only manifest using `variant` as the primary label, controlled `accents` fallback, and no `Tortosí` until we decide how to handle transitional dialects.
