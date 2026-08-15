"""Build a small read-aloud pool from CV26 sentence metadata.

The Common Voice sentence catalogue is too large to ship to the browser. This
script samples intact sentences that are already long enough for a useful
HuBERT embedding, without joining fragments (joined prompts read like the
same idea repeated two or three times).

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
import statistics
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = PROJECT_ROOT / "data/metadata/cv26-ca/validated_sentences.tsv"
DEFAULT_OUTPUT = PROJECT_ROOT / "web/src/lib/readAloudPrompts.generated.ts"

TARGET_PROMPTS = 300
MIN_PROMPT_CHARS = 110
MAX_PROMPT_CHARS = 170
MIN_PROMPT_WORDS = 16
MAX_PROMPT_WORDS = 26
MAX_CANDIDATES_PER_SOURCE = 3000
MAX_SOURCE_BUCKETS = 12
PROGRESS_INTERVAL_ROWS = 100_000

SENTENCE_ID_RE = re.compile(r"^[0-9a-f]{64}$")
# Official-gazette / Generalitat catalogues are readable Catalan but dry to
# speak aloud. The source column is enough to down-weight them; they are only
# used if preferred buckets cannot fill TARGET_PROMPTS.
BUREAUCRATIC_SOURCE_RE = re.compile(
    r"(?:^|[_\s.-])(gencat|dogc|dogv)(?:$|[_\s.-])",
    re.IGNORECASE,
)
SENTENCE_TERMINATORS = frozenset(".!?…")
TRAILING_CLOSERS = frozenset("\"'»”’)]")


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


def normalize_text(value: str) -> str:
    return " ".join(value.split())


def word_count(text: str) -> int:
    return len(text.split())


def ensure_sentence_final_punctuation(text: str) -> str:
    """Guarantee a terminator so the prompt reads as a finished sentence.

    CV26 sentences often omit a final period.
    Colons and semicolons already mark a pause, so they are left unchanged.
    """
    stripped = text.rstrip()
    if not stripped:
        return stripped
    core = stripped
    while core and core[-1] in TRAILING_CLOSERS:
        core = core[:-1].rstrip()
    if not core:
        return stripped
    if core[-1] in SENTENCE_TERMINATORS or core[-1] in ":;":
        return stripped
    return f"{stripped}."


def prompt_fits_limits(text: str) -> bool:
    chars = len(text)
    words = word_count(text)
    return (
        MIN_PROMPT_CHARS <= chars <= MAX_PROMPT_CHARS
        and MIN_PROMPT_WORDS <= words <= MAX_PROMPT_WORDS
    )


def is_bureaucratic_source(source: str) -> bool:
    return bool(BUREAUCRATIC_SOURCE_RE.search(source))


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
                    f"({valid_rows:,} long-enough so far)"
                )
            sentence_id = (row.get("sentence_id") or "").strip().lower()
            text = ensure_sentence_final_punctuation(
                normalize_text(row.get("sentence") or "")
            )
            if (
                not SENTENCE_ID_RE.fullmatch(sentence_id)
                or not text.isprintable()
                or not prompt_fits_limits(text)
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


def choose_prompts(
    buckets: dict[str, list[Sentence]],
    *,
    target_prompts: int,
    seed: int,
    progress: ProgressReporter | None = None,
) -> list[Prompt]:
    ranked_sources = sorted(
        (source for source, sentences in buckets.items() if sentences),
        key=lambda source: (
            int(is_bureaucratic_source(source)),
            -len(buckets[source]),
            source,
        ),
    )
    active_sources = ranked_sources[:MAX_SOURCE_BUCKETS]
    if not active_sources:
        return []

    source_queues: dict[str, list[Sentence]] = {}
    rng = random.Random(seed)
    if progress:
        skipped = sum(1 for source in active_sources if is_bureaucratic_source(source))
        progress(
            f"Sampling intact sentences from {len(active_sources)} source buckets"
            + (
                f" ({skipped} bureaucratic overflow)"
                if skipped
                else " (bureaucratic sources down-weighted)"
            )
        )
    for source in active_sources:
        sentences = list(buckets[source])
        rng.shuffle(sentences)
        source_queues[source] = sentences

    chosen: list[Prompt] = []
    seen_texts: set[str] = set()
    while len(chosen) < target_prompts:
        made_progress = False
        for source in active_sources:
            queue = source_queues[source]
            while queue:
                sentence = queue.pop(0)
                key = sentence.text.casefold()
                if key in seen_texts:
                    continue
                seen_texts.add(key)
                chosen.append(
                    Prompt(
                        prompt_id=make_prompt_id((sentence.sentence_id,)),
                        text=sentence.text,
                        sentence_ids=(sentence.sentence_id,),
                        source=source,
                    )
                )
                made_progress = True
                break
            if len(chosen) >= target_prompts:
                break
        if not made_progress:
            break

    rng.shuffle(chosen)
    if progress:
        progress(f"Selected {len(chosen)} single-sentence prompts")
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
    lengths = [len(prompt.text) for prompt in prompts]
    words = [word_count(prompt.text) for prompt in prompts]
    print(f"Read {valid_rows:,} CV26 sentences that already fit the length window.")
    print(f"Generated {len(prompts)} single-sentence prompts.")
    if lengths:
        print(
            f"Prompt chars: min={min(lengths)} median={int(statistics.median(lengths))} "
            f"max={max(lengths)}"
        )
    if words:
        print(
            f"Prompt words: min={min(words)} median={int(statistics.median(words))} "
            f"max={max(words)}"
        )
    sources = {}
    for prompt in prompts:
        sources[prompt.source] = sources.get(prompt.source, 0) + 1
    print("Sources:")
    for source, count in sorted(sources.items(), key=lambda item: (-item[1], item[0])):
        print(f"  {count:3}  {source}")
    for prompt in prompts[:5]:
        print(f"- [{prompt.prompt_id}] {prompt.text}")
        print(f"  sentence_ids: {prompt.sentence_ids[0]}")


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
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.target_prompts < 1:
        raise SystemExit("--target-prompts must be positive")
    if args.max_candidates_per_source < 1:
        raise SystemExit("--max-candidates-per-source must be at least 1")
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
    report(f"Loaded {valid_rows:,} long-enough rows across {len(buckets)} sources")
    prompts = choose_prompts(
        buckets,
        target_prompts=args.target_prompts,
        seed=args.seed,
        progress=report,
    )
    if len(prompts) < args.target_prompts:
        raise SystemExit(
            f"Only generated {len(prompts)} of {args.target_prompts} prompts; "
            "inspect the source catalogue."
        )

    report(f"Writing generated catalogue to {args.output}")
    write_typescript(args.output, prompts)
    print_summary(prompts, valid_rows)
    print(f"Wrote {args.output}")


if __name__ == "__main__":
    main()
