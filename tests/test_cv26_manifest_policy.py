"""Unit tests for CV26 balanced-manifest label and vote filters."""

from __future__ import annotations

import pandas as pd

from scripts.build_cv26_balanced_manifest import apply_vote_filter, expanded_label


def test_tortosi_exclude_policy() -> None:
    assert expanded_label("Tortosí", tortosi_policy="exclude") is None
    assert expanded_label("tortosi", tortosi_policy="exclude") is None


def test_tortosi_map_policies() -> None:
    assert expanded_label("Tortosí", tortosi_policy="northwestern") == "northwestern"
    assert expanded_label("Tortosí", tortosi_policy="valencian") == "valencian"


def test_vote_filter_keeps_quality_clips() -> None:
    df = pd.DataFrame(
        {
            "client_id": ["a", "b", "c"],
            "up_votes": ["2", "1", "3"],
            "down_votes": ["0", "0", "1"],
            "label": ["central", "central", "central"],
        }
    )
    filtered = apply_vote_filter(df, min_up_votes=2, max_down_votes=0)
    assert list(filtered["client_id"]) == ["a"]
