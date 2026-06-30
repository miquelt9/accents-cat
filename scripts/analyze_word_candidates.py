#!/usr/bin/env python3
"""Analyze word candidates for fixed-script design.

This is not a classifier. It mines manifest transcriptions for:
- frequent words with broad speaker coverage across dialect labels;
- words that are disproportionately common in one label, which may be useful
  for manual linguistic review but can also reveal corpus/topic artifacts.

Use this report to choose natural fixed-script words with useful phonetic
contexts. Do not train a model to identify dialect from lexical choice; app
users will read the same text.
"""

from __future__ import annotations

import argparse
import json
import math
import re
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass
from pathlib import Path

import pandas as pd


LABELS = ["balearic", "central", "northern", "northwestern", "valencian"]
TOKEN_RE = re.compile(r"[a-zàèéíïòóúüç]+(?:[·'’-][a-zàèéíïòóúüç]+)?", re.IGNORECASE)

STOPWORDS = {
    "a",
    "al",
    "als",
    "amb",
    "aquesta",
    "aquest",
    "aquestes",
    "aquests",
    "cada",
    "cap",
    "com",
    "d",
    "de",
    "del",
    "dels",
    "des",
    "el",
    "els",
    "en",
    "ens",
    "entre",
    "era",
    "es",
    "i",
    "ja",
    "la",
    "les",
    "li",
    "l",
    "m",
    "més",
    "no",
    "o",
    "per",
    "perquè",
    "que",
    "s",
    "sa",
    "se",
    "segons",
    "sense",
    "ser",
    "si",
    "són",
    "també",
    "un",
    "una",
    "unes",
    "uns",
    "va",
    "van",
}


@dataclass
class WordCoverage:
    word: str
    total_count: int
    speaker_count_total: int
    count_by_label: dict[str, int]
    speaker_count_by_label: dict[str, int]


@dataclass
class DistinctiveWord:
    word: str
    label: str
    label_count: int
    other_count: int
    score: float
    speaker_count_for_label: int


def tokenize(text: str) -> list[str]:
    return [token.lower().replace("’", "'") for token in TOKEN_RE.findall(text or "")]


def build_counts(df: pd.DataFrame) -> tuple[Counter[str], dict[str, Counter[str]], dict[str, dict[str, set[str]]]]:
    total_counts: Counter[str] = Counter()
    counts_by_label: dict[str, Counter[str]] = {label: Counter() for label in LABELS}
    speakers_by_word_label: dict[str, dict[str, set[str]]] = defaultdict(lambda: defaultdict(set))

    for row in df.itertuples(index=False):
        label = row.label
        speaker = row.client_id
        if label not in LABELS or not isinstance(row.sentence, str):
            continue
        tokens = tokenize(row.sentence)
        total_counts.update(tokens)
        counts_by_label[label].update(tokens)
        for token in set(tokens):
            speakers_by_word_label[token][label].add(speaker)
    return total_counts, counts_by_label, speakers_by_word_label


def broad_coverage_words(
    total_counts: Counter[str],
    counts_by_label: dict[str, Counter[str]],
    speakers_by_word_label: dict[str, dict[str, set[str]]],
    min_speakers_per_label: int,
    top_n: int,
) -> list[WordCoverage]:
    candidates = []
    for word, total_count in total_counts.items():
        if word in STOPWORDS or len(word) < 3:
            continue
        speaker_counts = {
            label: len(speakers_by_word_label[word].get(label, set()))
            for label in LABELS
        }
        if min(speaker_counts.values()) < min_speakers_per_label:
            continue
        candidates.append(
            WordCoverage(
                word=word,
                total_count=int(total_count),
                speaker_count_total=int(sum(speaker_counts.values())),
                count_by_label={label: int(counts_by_label[label][word]) for label in LABELS},
                speaker_count_by_label=speaker_counts,
            )
        )
    return sorted(candidates, key=lambda item: (item.speaker_count_total, item.total_count), reverse=True)[:top_n]


def distinctive_words(
    total_counts: Counter[str],
    counts_by_label: dict[str, Counter[str]],
    speakers_by_word_label: dict[str, dict[str, set[str]]],
    min_speakers_for_label: int,
    top_n_per_label: int,
) -> dict[str, list[DistinctiveWord]]:
    output: dict[str, list[DistinctiveWord]] = {}
    vocabulary = [word for word in total_counts if word not in STOPWORDS and len(word) >= 3]
    totals_by_label = {label: sum(counts_by_label[label].values()) for label in LABELS}
    total_all = sum(totals_by_label.values())

    for label in LABELS:
        rows = []
        label_total = totals_by_label[label]
        other_total = max(1, total_all - label_total)
        for word in vocabulary:
            speaker_count = len(speakers_by_word_label[word].get(label, set()))
            if speaker_count < min_speakers_for_label:
                continue
            label_count = counts_by_label[label][word]
            other_count = sum(counts_by_label[other][word] for other in LABELS if other != label)
            # Smoothed log odds-like score, enough for ranking candidates for review.
            label_rate = (label_count + 1) / (label_total + len(vocabulary))
            other_rate = (other_count + 1) / (other_total + len(vocabulary))
            score = math.log(label_rate / other_rate)
            if score <= 0:
                continue
            rows.append(
                DistinctiveWord(
                    word=word,
                    label=label,
                    label_count=int(label_count),
                    other_count=int(other_count),
                    score=round(score, 4),
                    speaker_count_for_label=int(speaker_count),
                )
            )
        output[label] = sorted(rows, key=lambda item: item.score, reverse=True)[:top_n_per_label]
    return output


def write_markdown(
    broad_words: list[WordCoverage],
    distinctive: dict[str, list[DistinctiveWord]],
    path: Path,
) -> None:
    lines = [
        "# Word Candidate Analysis",
        "",
        "This report mines manifest sentences to guide fixed-script design. It should not be used as a lexical dialect classifier.",
        "",
        "## Broad-Coverage Words",
        "",
        "Words here occur across all five labels and many speakers. They are good candidates for natural script wording if they also contain useful phonetic contexts.",
        "",
    ]
    for item in broad_words:
        lines.append(
            f"- `{item.word}`: speakers={item.speaker_count_total}, counts={item.count_by_label}, speaker_counts={item.speaker_count_by_label}"
        )

    lines.extend(
        [
            "",
            "## Label-Distinctive Words For Manual Review",
            "",
            "These can reveal useful lexical/phonetic material, but they can also be topic artifacts. Review manually before using them in a fixed script.",
            "",
        ]
    )
    for label, words in distinctive.items():
        lines.append(f"### `{label}`")
        lines.append("")
        for item in words:
            lines.append(
                f"- `{item.word}`: score={item.score}, label_count={item.label_count}, other_count={item.other_count}, label_speakers={item.speaker_count_for_label}"
            )
        lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, default=Path("manifests/all_internal.csv"))
    parser.add_argument("--out-dir", type=Path, default=Path("reports"))
    parser.add_argument("--min-speakers-per-label", type=int, default=8)
    parser.add_argument("--min-speakers-for-distinctive", type=int, default=6)
    parser.add_argument("--top-n", type=int, default=80)
    parser.add_argument("--top-n-distinctive", type=int, default=25)
    args = parser.parse_args()

    args.out_dir.mkdir(parents=True, exist_ok=True)
    df = pd.read_csv(args.manifest)
    total_counts, counts_by_label, speakers_by_word_label = build_counts(df)
    broad_words = broad_coverage_words(
        total_counts,
        counts_by_label,
        speakers_by_word_label,
        min_speakers_per_label=args.min_speakers_per_label,
        top_n=args.top_n,
    )
    distinctive = distinctive_words(
        total_counts,
        counts_by_label,
        speakers_by_word_label,
        min_speakers_for_label=args.min_speakers_for_distinctive,
        top_n_per_label=args.top_n_distinctive,
    )

    payload = {
        "broad_coverage_words": [asdict(item) for item in broad_words],
        "distinctive_words": {
            label: [asdict(item) for item in items] for label, items in distinctive.items()
        },
    }
    (args.out_dir / "word_candidates.json").write_text(
        json.dumps(payload, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    write_markdown(broad_words, distinctive, args.out_dir / "word_candidates.md")
    print(f"Wrote {args.out_dir / 'word_candidates.md'}")


if __name__ == "__main__":
    main()
