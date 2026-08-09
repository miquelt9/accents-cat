"""Unit tests for the repeated-take pooling rules compared by the policy report."""

from __future__ import annotations

import math

from scripts.evaluate_validation_policy import (
    LABELS,
    adaptive_aggregated_result,
    geometric_pool,
    log_pool,
    mean_pool,
    take_disagreement,
)

CLEAR_TAKE = {
    "balearic": 0.05,
    "central": 0.65,
    "northern": 0.10,
    "northwestern": 0.10,
    "valencian": 0.10,
}

UNCLEAR_TAKE = {
    "balearic": 0.10,
    "central": 0.40,
    "northern": 0.30,
    "northwestern": 0.10,
    "valencian": 0.10,
}

SECOND_UNCLEAR_TAKE = {
    "balearic": 0.10,
    "central": 0.38,
    "northern": 0.32,
    "northwestern": 0.10,
    "valencian": 0.10,
}


def _sums_to_one(scores: dict[str, float]) -> bool:
    return math.isclose(sum(scores[label] for label in LABELS), 1.0, abs_tol=1e-9)


def test_mean_pool_does_not_reward_repeated_agreement() -> None:
    """Averaging is idempotent, so consistency alone never raises confidence."""
    pooled = mean_pool([CLEAR_TAKE, CLEAR_TAKE, CLEAR_TAKE])
    assert math.isclose(pooled["central"], CLEAR_TAKE["central"], abs_tol=1e-9)


def test_geometric_pool_also_ignores_repetition() -> None:
    pooled = geometric_pool([CLEAR_TAKE, CLEAR_TAKE])
    for label in LABELS:
        assert math.isclose(pooled[label], CLEAR_TAKE[label], abs_tol=1e-9)


def test_product_pool_sharpens_repeated_agreement() -> None:
    pooled = log_pool([CLEAR_TAKE, CLEAR_TAKE], 1.0)
    assert pooled["central"] > CLEAR_TAKE["central"]
    assert _sums_to_one(pooled)


def test_log_pool_penalizes_a_class_that_one_take_rejects() -> None:
    rejecting = dict(UNCLEAR_TAKE, central=0.05, northern=0.65)
    geometric = geometric_pool([UNCLEAR_TAKE, rejecting])
    arithmetic = mean_pool([UNCLEAR_TAKE, rejecting])
    assert geometric["central"] < arithmetic["central"]


def test_log_pool_survives_zero_scores() -> None:
    silent = dict(UNCLEAR_TAKE, balearic=0.0, central=0.5)
    pooled = geometric_pool([UNCLEAR_TAKE, silent])
    assert _sums_to_one(pooled)
    assert all(math.isfinite(pooled[label]) for label in LABELS)
    assert pooled["balearic"] < 1e-3


def test_take_disagreement_is_total_variation_distance() -> None:
    assert take_disagreement([UNCLEAR_TAKE]) == 0.0
    assert math.isclose(
        take_disagreement([UNCLEAR_TAKE, SECOND_UNCLEAR_TAKE]), 0.02, abs_tol=1e-9
    )


def test_adaptive_aggregation_stops_on_a_clear_first_take() -> None:
    _, used = adaptive_aggregated_result([CLEAR_TAKE, UNCLEAR_TAKE, UNCLEAR_TAKE])
    assert used == 1


def test_adaptive_aggregation_uses_every_take_while_unclear() -> None:
    _, used = adaptive_aggregated_result(
        [UNCLEAR_TAKE, SECOND_UNCLEAR_TAKE, UNCLEAR_TAKE]
    )
    assert used == 3


def test_adaptive_aggregation_accepts_an_alternative_pool() -> None:
    result, used = adaptive_aggregated_result(
        [UNCLEAR_TAKE, SECOND_UNCLEAR_TAKE, UNCLEAR_TAKE], pool=geometric_pool
    )
    assert used == 3
    assert _sums_to_one(result)
