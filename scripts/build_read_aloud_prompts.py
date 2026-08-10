"""Build a small, coherent read-aloud pool from CV26 sentence metadata.

The Common Voice sentence catalogue is too large to ship to the browser. This
script samples it deterministically, groups sentences by their source corpus,
and uses TF-IDF similarity to join sentences that are likely to belong to the
same topic. The generated TypeScript file is the runtime prompt catalogue.

Only the original sentence IDs are persisted with a generated prompt. The
prompt text is still stored with the take so a retained research row remains
auditable, while ``sentence_ids`` lets later analysis join back to CV26.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import random
import re
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = PROJECT_ROOT / "data/metadata/cv26-ca/validated_sentences.tsv"
DEFAULT_OUTPUT = PROJECT_ROOT / "web/src/lib/readAloudPrompts.generated.ts"

TARGET_PROMPTS = 300
MIN_PROMPT_CHARS = 180
MAX_PROMPT_CHARS = 220
MIN_PROMPT_WORDS = 28
MAX_PROMPT_WORDS = 36
MIN_SENTENCE_CHARS = 20
MAX_SENTENCE_CHARS = 280
MIN_SINGLE_FALLBACK_CHARS = 180
MAX_SENTENCES_PER_PROMPT = 4
MAX_CANDIDATES_PER_SOURCE = 3000
MAX_SOURCE_BUCKETS = 12
SIMILARITY_FLOOR = 0.15
PROGRESS_INTERVAL_ROWS = 100_000

SENTENCE_ID_RE = re.compile(r"^[0-9a-f]{64}$")
WORD_RE = re.compile(r"[^\W\d_][\w'-]*", re.UNICODE)

# Removing frequent function words makes a shared topic word meaningful. This
# is deliberately a small, conservative list: the TF-IDF score remains the
# primary coherence gate.
CATALAN_STOPWORDS = frozenset(
    """
    a al als amb ambdós abans anar aquí ara això aquell aquella aquelles
    aquells aquest aquesta aquestes aquests cap com contra d' de del dels des
    dins durant e el els em en ens entre era eren és es estar està estava
    estaré estàvem et fer fou ha han he hem hi ho i jo la les li lo l' molt
    més me mateix mateixos no nos nosaltres o on per però pot perquè que què
    qui se ser si sí sense s' sobre són també tenir té te tenen tot tota
    totes tots un una unes uns us va van ve veritat vosaltres
    """.split()  # noqa: SIM905
)


@dataclass(frozen=True)
class Sentence:
    sentence_id: str
    text: str
    source: str


@dataclass(frozen=True)
class Prompt:
    prompt_id: str
    text: str
    sentence_ids: tuple[str, ...]
    source: str
    similarity: float


def normalize_text(value: str) -> str:
    return " ".join(value.split())


def word_count(text: str) -> int:
    return len(text.split())


def content_tokens(text: str) -> set[str]:
    return {
        token.lower()
        for token in WORD_RE.findall(text)
        if len(token) >= 3 and token.lower() not in CATALAN_STOPWORDS
    }


def sentence_type(text: str) -> str:
    stripped = text.rstrip()
    if stripped.endswith("?"):
        return "question"
    if stripped.endswith("!"):
        return "exclamation"
    return "statement"


ProgressReporter = Callable[[str], None]


def reservoir_sentences(
    input_path: Path,
    *,
    seed: int,
    max_candidates_per_source: int,
    progress: ProgressReporter | None = None,
) -> tuple[dict[str, list[Sentence]], int]:
    """Read valid rows while bounding memory for the 1.3M-row catalogue."""
    rng = random.Random(seed)
    buckets: dict[str, list[Sentence]] = {}
    seen_by_source: dict[str, int] = {}
    valid_rows = 0
    rows_read = 0

    with input_path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        required = {"sentence_id", "sentence", "source"}
        missing = required - set(reader.fieldnames or ())
        if missing:
            raise ValueError(
                f"{input_path} is missing required columns: {', '.join(sorted(missing))}"
            )

        for row in reader:
            rows_read += 1
            if progress and rows_read % PROGRESS_INTERVAL_ROWS == 0:
                progress(
                    f"Read {rows_read:,} catalogue rows "
                    f"({valid_rows:,} valid so far)"
                )
            sentence_id = (row.get("sentence_id") or "").strip().lower()
            text = normalize_text(row.get("sentence") or "")
            if (
                not SENTENCE_ID_RE.fullmatch(sentence_id)
                or len(text) < MIN_SENTENCE_CHARS
                or len(text) > MAX_SENTENCE_CHARS
                or not text.isprintable()
            ):
                continue

            source = normalize_text(row.get("source") or "") or "(sense font)"
            item = Sentence(sentence_id=sentence_id, text=text, source=source)
            bucket = buckets.setdefault(source, [])
            seen_by_source[source] = seen_by_source.get(source, 0) + 1
            valid_rows += 1

            if len(bucket) < max_candidates_per_source:
                bucket.append(item)
                continue
            replacement_index = rng.randrange(seen_by_source[source])
            if replacement_index < max_candidates_per_source:
                bucket[replacement_index] = item

    return buckets, valid_rows


def make_prompt_id(sentence_ids: Iterable[str]) -> str:
    digest_input = "|".join(sorted(sentence_ids)).encode("ascii")
    return f"cv26-{hashlib.sha1(digest_input).hexdigest()[:16]}"


def candidate_indices(
    similarities: np.ndarray,
    *,
    seed_index: int,
    unused: set[int],
) -> list[int]:
    ranked = np.argsort(-similarities, kind="stable")
    return [
        int(index)
        for index in ranked
        if int(index) != seed_index and int(index) in unused
    ]


def build_source_prompts(
    source: str,
    sentences: list[Sentence],
    *,
    source_cap: int,
    similarity_floor: float,
) -> list[Prompt]:
    if len(sentences) < 2:
        return []

    vectorizer = TfidfVectorizer(
        lowercase=True,
        ngram_range=(1, 2),
        stop_words=list(CATALAN_STOPWORDS),
        token_pattern=r"(?u)\b[\wÀ-ÿ'-]{2,}\b",
        sublinear_tf=True,
        max_features=50_000,
    )
    matrix = vectorizer.fit_transform(sentence.text for sentence in sentences)
    content = [content_tokens(sentence.text) for sentence in sentences]
    kinds = [sentence_type(sentence.text) for sentence in sentences]

    unused = set(range(len(sentences)))
    prompts: list[Prompt] = []
    while unused and len(prompts) < source_cap:
        seed_index = min(unused)
        unused.remove(seed_index)
        selected = [seed_index]
        selected_sentence_keys = {sentences[seed_index].text.casefold()}
        selected_text = sentences[seed_index].text
        pair_scores: list[float] = []
        current_index = seed_index

        while len(selected) < MAX_SENTENCES_PER_PROMPT:
            similarities = matrix[current_index].dot(matrix.T).toarray().ravel()
            chosen_index: int | None = None
            chosen_score = 0.0
            for index in candidate_indices(
                similarities,
                seed_index=current_index,
                unused=unused,
            ):
                score = float(similarities[index])
                if score < similarity_floor:
                    break
                candidate = sentences[index]
                if candidate.text.casefold() in selected_sentence_keys:
                    continue
                next_text = f"{selected_text} {candidate.text}"
                if (
                    len(next_text) > MAX_PROMPT_CHARS
                    or word_count(next_text) > MAX_PROMPT_WORDS
                ):
                    continue
                if (
                    not content[current_index] & content[index]
                    and score < similarity_floor + 0.08
                ):
                    continue
                # A different sentence type is allowed only with a stronger
                # match, which avoids jarring question/statement transitions.
                if kinds[current_index] != kinds[index] and score < similarity_floor + 0.08:
                    continue
                chosen_index = index
                chosen_score = score
                break

            if chosen_index is None:
                break

            unused.remove(chosen_index)
            selected.append(chosen_index)
            selected_sentence_keys.add(sentences[chosen_index].text.casefold())
            selected_text = f"{selected_text} {sentences[chosen_index].text}"
            pair_scores.append(chosen_score)
            current_index = chosen_index

            if (
                len(selected_text) >= MIN_PROMPT_CHARS
                and word_count(selected_text) >= MIN_PROMPT_WORDS
            ):
                break

        if (
            len(selected_text) < MIN_PROMPT_CHARS
            or word_count(selected_text) < MIN_PROMPT_WORDS
        ):
            # A single long sentence is preferable to an incoherent join. A
            # short unfinished group is discarded rather than padded at random.
            if (
                len(sentences[seed_index].text) < MIN_SINGLE_FALLBACK_CHARS
                or word_count(sentences[seed_index].text) < MIN_PROMPT_WORDS
                or word_count(sentences[seed_index].text) > MAX_PROMPT_WORDS
            ):
                continue
            selected = [seed_index]
            selected_text = sentences[seed_index].text
            pair_scores = []

        prompt = Prompt(
            prompt_id=make_prompt_id(sentences[index].sentence_id for index in selected),
            text=selected_text,
            sentence_ids=tuple(sentences[index].sentence_id for index in selected),
            source=source,
            similarity=float(np.mean(pair_scores)) if pair_scores else 1.0,
        )
        prompts.append(prompt)

    return prompts


def choose_prompts(
    buckets: dict[str, list[Sentence]],
    *,
    target_prompts: int,
    seed: int,
    similarity_floor: float,
    progress: ProgressReporter | None = None,
) -> list[Prompt]:
    active_sources = sorted(
        (source for source, sentences in buckets.items() if len(sentences) >= 2),
        key=lambda source: (-len(buckets[source]), source),
    )[:MAX_SOURCE_BUCKETS]
    if not active_sources:
        return []

    source_cap = max(1, (target_prompts + min(len(active_sources), 10) - 1) // min(len(active_sources), 10))
    source_prompts: dict[str, list[Prompt]] = {}
    if progress:
        progress(f"Building prompts from {len(active_sources)} source buckets")
    for source_index, source in enumerate(active_sources, start=1):
        if progress:
            progress(
                f"[{source_index}/{len(active_sources)}] "
                f"Processing {source!r} ({len(buckets[source]):,} candidates)"
            )
        source_prompts[source] = build_source_prompts(
            source,
            buckets[source],
            source_cap=source_cap,
            similarity_floor=similarity_floor,
        )
        if progress:
            progress(
                f"[{source_index}/{len(active_sources)}] "
                f"Generated {len(source_prompts[source])} source prompts"
            )

    # Round-robin prevents the largest corpus from taking over the catalogue.
    chosen: list[Prompt] = []
    seen_texts: set[str] = set()
    while len(chosen) < target_prompts:
        made_progress = False
        for source in active_sources:
            prompts = source_prompts[source]
            if not prompts:
                continue
            prompt = prompts.pop(0)
            if prompt.text in seen_texts:
                continue
            seen_texts.add(prompt.text)
            chosen.append(prompt)
            made_progress = True
            if len(chosen) >= target_prompts:
                break
        if not made_progress:
            break

    rng = random.Random(seed)
    rng.shuffle(chosen)
    if progress:
        progress(f"Selected {len(chosen)} prompts after round-robin balancing")
    return chosen


def write_typescript(output_path: Path, prompts: list[Prompt]) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "// Generated by scripts/build_read_aloud_prompts.py; do not hand-edit.",
        "",
        "export type GeneratedReadAloudPrompt = {",
        "  id: string;",
        "  text: string;",
        "  sentenceIds: readonly string[];",
        "};",
        "",
        "export const GENERATED_READ_ALOUD_PROMPTS: readonly GeneratedReadAloudPrompt[] = ",
        json.dumps(
            [
                {
                    "id": prompt.prompt_id,
                    "text": prompt.text,
                    "sentenceIds": list(prompt.sentence_ids),
                }
                for prompt in prompts
            ],
            ensure_ascii=False,
            indent=2,
        ),
        ";",
        "",
    ]
    output_path.write_text("\n".join(lines), encoding="utf-8")


def print_summary(prompts: list[Prompt], valid_rows: int) -> None:
    joined = [prompt for prompt in prompts if len(prompt.sentence_ids) > 1]
    lengths = [len(prompt.text) for prompt in prompts]
    similarities = [prompt.similarity for prompt in joined]
    print(f"Read {valid_rows:,} valid CV26 sentence rows.")
    print(f"Generated {len(prompts)} prompts ({len(joined)} joined).")
    if lengths:
        print(
            f"Prompt chars: min={min(lengths)} median={int(np.median(lengths))} "
            f"max={max(lengths)}"
        )
    if similarities:
        print(f"Mean joined TF-IDF similarity: {float(np.mean(similarities)):.3f}")
    for prompt in prompts[:5]:
        ids = ", ".join(prompt.sentence_ids)
        print(f"- [{prompt.prompt_id}] ({prompt.similarity:.3f}) {prompt.text}")
        print(f"  sentence_ids: {ids}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--target-prompts", type=int, default=TARGET_PROMPTS)
    parser.add_argument("--seed", type=int, default=2608)
    parser.add_argument(
        "--max-candidates-per-source",
        type=int,
        default=MAX_CANDIDATES_PER_SOURCE,
    )
    parser.add_argument("--similarity-floor", type=float, default=SIMILARITY_FLOOR)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.target_prompts < 1:
        raise SystemExit("--target-prompts must be positive")
    if args.max_candidates_per_source < 2:
        raise SystemExit("--max-candidates-per-source must be at least 2")
    if not args.input.is_file():
        raise SystemExit(f"Input TSV not found: {args.input}")

    def report(message: str) -> None:
        print(f"[read-aloud-prompts] {message}", flush=True)

    report(f"Loading sentence catalogue from {args.input}")
    buckets, valid_rows = reservoir_sentences(
        args.input,
        seed=args.seed,
        max_candidates_per_source=args.max_candidates_per_source,
        progress=report,
    )
    report(f"Loaded {valid_rows:,} valid rows across {len(buckets)} sources")
    prompts = choose_prompts(
        buckets,
        target_prompts=args.target_prompts,
        seed=args.seed,
        similarity_floor=args.similarity_floor,
        progress=report,
    )
    if len(prompts) < args.target_prompts:
        raise SystemExit(
            f"Only generated {len(prompts)} of {args.target_prompts} prompts; "
            "lower --similarity-floor or inspect the source catalogue."
        )

    report(f"Writing generated catalogue to {args.output}")
    write_typescript(args.output, prompts)
    print_summary(prompts, valid_rows)
    print(f"Wrote {args.output}")


if __name__ == "__main__":
    main()
