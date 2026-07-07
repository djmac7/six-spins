"""Shared helpers for the BUILD THE GOAT data/scoring pipeline.

Every stage script (01..05) imports from here. Pure, deterministic functions only —
no randomness, no network, no clock. See build-the-goat-data-scoring-spec.md.
"""
from __future__ import annotations

import os
import re
import sys

import numpy as np
import pandas as pd
import yaml
from scipy.stats import rankdata, norm

# --- repo layout ------------------------------------------------------------
PIPELINE_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_DIR = os.path.dirname(PIPELINE_DIR)


def load_config(path: str | None = None) -> dict:
    path = path or os.path.join(PIPELINE_DIR, "config.yml")
    with open(path) as f:
        return yaml.safe_load(f)


def repo_path(*parts: str) -> str:
    return os.path.join(REPO_DIR, *parts)


def work_path(cfg: dict, name: str) -> str:
    return repo_path(cfg["paths"]["work"], name)


# --- schema -----------------------------------------------------------------
# Aggregate team labels for a player traded mid-season (this dataset version uses
# 2TM/3TM/...; older Basketball-Reference exports used "TOT"). §3.
_AGG_TEAM_RE = re.compile(r"^(TOT|\dTM)$")


def is_agg_team(team: pd.Series) -> pd.Series:
    return team.astype("string").str.match(_AGG_TEAM_RE).fillna(False)


def require_columns(df: pd.DataFrame, cols: list[str], table_name: str) -> None:
    """Fail loudly on a missing expected column — schemas drift between dataset
    versions, so we verify rather than trust (§2)."""
    missing = [c for c in cols if c not in df.columns]
    if missing:
        raise SystemExit(
            f"[FATAL] table '{table_name}' is missing expected column(s): {missing}\n"
            f"        present columns: {list(df.columns)}\n"
            f"        Verify the dataset schema and update config/common.py."
        )


def read_table(cfg: dict, filename: str, required: list[str]) -> pd.DataFrame:
    raw_dir = repo_path(cfg["paths"]["raw"])
    fpath = os.path.join(raw_dir, filename)
    if not os.path.exists(fpath):
        raise SystemExit(
            f"[FATAL] missing raw CSV: {fpath}\n"
            f"        Download the Kaggle dataset (sumitrodatta/nba-aba-baa-stats) "
            f"into {raw_dir}/ — see README."
        )
    df = pd.read_csv(fpath)
    require_columns(df, required, filename)
    return df


def collapse_to_season(df: pd.DataFrame) -> pd.DataFrame:
    """Reduce a table to exactly one row per (player_id, season): the combined
    season-total row for traded players, else the player's single team row (§3).
    `team` column must be present. Used only when `rating_unit: season`."""
    df = df.copy()
    df["_is_agg"] = is_agg_team(df["team"])
    # prefer the aggregate row; among ties (shouldn't happen) take the most minutes.
    sort_cols = ["player_id", "season", "_is_agg"]
    asc = [True, True, False]
    if "mp" in df.columns:
        sort_cols.append("mp")
        asc.append(False)
    df = df.sort_values(sort_cols, ascending=asc, kind="stable")
    out = df.drop_duplicates(subset=["player_id", "season"], keep="first")
    return out.drop(columns=["_is_agg"])


def keep_team_stints(df: pd.DataFrame) -> pd.DataFrame:
    """Reduce a table to one row per (player_id, season, team): the per-team STINT
    rows, with the aggregate season-total rows (TOT / 2TM / 3TM ...) dropped.

    This is the team-split rating unit (`rating_unit: team_split`): a player traded
    mid-season becomes MULTIPLE rows, each carrying only that team's stats, rather than
    one combined season row. `team` column must be present."""
    df = df[~is_agg_team(df["team"])].copy()
    sort_cols = ["player_id", "season", "team"]
    asc = [True, True, True]
    if "mp" in df.columns:
        sort_cols.append("mp")
        asc.append(False)
    df = df.sort_values(sort_cols, ascending=asc, kind="stable")
    return df.drop_duplicates(subset=["player_id", "season", "team"], keep="first")


# --- scoring primitives -----------------------------------------------------
def shrink(makes: pd.Series, attempts: pd.Series, mu: pd.Series, K: float) -> pd.Series:
    """Empirical-Bayes shrinkage (§6): p_shrunk = (p*n + mu*K)/(n + K).

    Computed directly from makes & attempts (p*n == makes), which also makes the
    n==0 case fall out cleanly to the league mean mu instead of NaN.
    """
    makes = pd.to_numeric(makes, errors="coerce").fillna(0.0)
    attempts = pd.to_numeric(attempts, errors="coerce").fillna(0.0)
    return (makes + mu * K) / (attempts + K)


def credibility_shrink(values: pd.Series, volume: pd.Series, K: float,
                       mu: float | None = None) -> pd.Series:
    """Volume-credibility shrinkage for rate/ratio stats (§7 volume rule).

    A rate stat (per-100, %, or attempt-ratio) carries no information about how
    MUCH a player did it, so a low-volume specialist with a gaudy rate ranks
    alongside a high-volume star. We regress each value toward the universe mean
    by a reliability weight w = n/(n+K), where n is the volume backing that stat:

        value_adj = mu + (value - mu) * n / (n + K)

    Small n -> value_adj collapses toward mu (≈ median percentile); large n keeps
    the player's true value. mu defaults to the (volume-blind) population mean of
    `values`. NaN values stay NaN (the component is simply absent for that row).
    """
    v = pd.to_numeric(values, errors="coerce")
    n = pd.to_numeric(volume, errors="coerce").fillna(0.0).clip(lower=0.0)
    if mu is None:
        mu = float(np.nanmean(v.to_numpy(dtype=float)))
    w = n / (n + float(K))
    return mu + (v - mu) * w


def percentile_rank(values: pd.Series | np.ndarray) -> np.ndarray:
    """Empirical-CDF percentile with averaged ties, highest value -> highest score (§8):

        rating = 100 * (rank - 0.5) / N

    NaNs are ignored (rows missing this component get NaN back and don't affect N).
    """
    x = np.asarray(values, dtype=float)
    out = np.full(x.shape, np.nan)
    mask = ~np.isnan(x)
    n = int(mask.sum())
    if n == 0:
        return out
    ranks = rankdata(x[mask], method="average")  # smallest->1, so high value high rank
    out[mask] = 100.0 * (ranks - 0.5) / n
    return out


def scoring_guardrail(ts: pd.Series, mu_ts: pd.Series, band: float, gmin: float) -> pd.Series:
    """Efficiency gate for scoring-VOLUME components. Returns a multiplier in [gmin, 1]
    that is 1.0 at (or above) the season's league-average TS% and ramps down to gmin a
    `band` of TS% below it.

    Multiplying raw scoring volume (points / makes) by this credits high-volume EFFICIENT
    scorers (Kobe, MJ, Durant) while discounting inefficient chuckers — so volume only
    pays off at acceptable efficiency. Efficient low-volume specialists are unaffected
    (g≈1) and keep their rating through the separate efficiency components; the gate only
    ever pulls the inefficient DOWN, never rewards extra efficiency (capped at 1).
    """
    ts = pd.to_numeric(ts, errors="coerce")
    mu = pd.to_numeric(mu_ts, errors="coerce")
    return np.clip((ts - (mu - band)) / band, gmin, 1.0)


def bell_curve(percentile: np.ndarray, mean: float, sd: float, floor: float = 0.0) -> np.ndarray:
    """Reshape a flat 0-100 percentile into a clipped normal distribution so that
    high ratings are scarce/elite instead of uniformly common (a flat percentile
    puts a fixed 10% at 90+; a bell curve makes 90+ a genuine outlier).

    Maps each percentile to its z-score, rescales by `sd` around `mean`, and clips
    to [floor, 100]. The median stays ≈ mean, so the overall 'game feel' is preserved
    while both tails thin out. `floor` lifts the bottom off a literal 0/1/2 (which a
    regular-minutes player misreads as "zero skill"); ordering is unchanged. NaN-safe.
    """
    p = np.asarray(percentile, dtype=float)
    out = np.full(p.shape, np.nan)
    mask = ~np.isnan(p)
    z = norm.ppf(np.clip(p[mask] / 100.0, 1e-6, 1.0 - 1e-6))
    out[mask] = np.clip(mean + sd * z, floor, 100.0)
    return out


def game_curve(percentile: np.ndarray, mean: float, sd: float,
               floor: float = 0.0, cap: float = 100.0) -> np.ndarray:
    """2K-style rating scale for the playable (decade-grain) pool: same z-score mapping
    as bell_curve but clipped to [floor, cap]. The decade pool is peaks of real NBA
    rotation players, so its median maps to a 'solid NBA player' number (~75) rather
    than 50, and `cap` keeps 100 unreachable. Monotonic — ordering is unchanged. NaN-safe."""
    p = np.asarray(percentile, dtype=float)
    out = np.full(p.shape, np.nan)
    mask = ~np.isnan(p)
    z = norm.ppf(np.clip(p[mask] / 100.0, 1e-6, 1.0 - 1e-6))
    out[mask] = np.clip(mean + sd * z, floor, cap)
    return out


def percentile_rank_within(values: pd.Series | np.ndarray,
                           groups: pd.Series | np.ndarray) -> np.ndarray:
    """Era-relative percentile: rank each value only against its same-group (season)
    peers, not the whole cross-era universe. Same ECDF formula as percentile_rank,
    applied independently per group. Normalizes eras — a scoring leader ranks at the
    top of his own season regardless of pace/era inflation. NaNs ignored per group."""
    values = np.asarray(values, dtype=float)
    groups = np.asarray(groups)
    out = np.full(values.shape, np.nan)
    for gval in pd.unique(groups):
        idx = np.where(groups == gval)[0]
        sub = values[idx]
        mask = ~np.isnan(sub)
        n = int(mask.sum())
        if n == 0:
            continue
        res = np.full(sub.shape, np.nan)
        res[mask] = 100.0 * (rankdata(sub[mask], method="average") - 0.5) / n
        out[idx] = res
    return out


def weighted_composite(rank_df: pd.DataFrame, weights: dict) -> np.ndarray:
    """Weighted average of component percentile-ranks, renormalizing weights over
    the components actually present for each row.

    This is exactly the §7 'redistribute proportionally' rule for the gated at-rim
    component: dropping a component and spreading its weight proportionally across
    the rest == renormalizing the remaining weights to sum to 1.
    """
    cols = list(weights)
    W = np.array([weights[c] for c in cols], dtype=float)
    R = rank_df[cols].to_numpy(dtype=float)            # (n_rows, n_comps), NaN where missing
    present = ~np.isnan(R)
    Wm = present * W                                   # zero the weight of a missing component
    denom = Wm.sum(axis=1)
    num = np.where(present, R, 0.0) * Wm
    num = num.sum(axis=1)
    with np.errstate(invalid="ignore", divide="ignore"):
        comp = np.where(denom > 0, num / denom, np.nan)
    return comp


def desaturated_rank(vals, ds: dict) -> np.ndarray:
    """De-saturated ranking for sparse ACCOLADE components (§7). A plain percentile_rank
    saturates: only a small fraction of seasons are honored at all, so every honored
    season — fringe votes or First-Team — piles into the same top band and the honor
    can't separate real recognition from a token vote. Instead the honored seasons are
    ranked AMONG THEMSELVES and spread across [honored_floor, 100] by magnitude, while
    non-honored seasons sit at a neutral `zero_rank` baseline.

    ds keys: enabled (bool), zero_rank, honored_floor. Disabled -> plain percentile_rank."""
    if not (ds or {}).get("enabled", False):
        return percentile_rank(vals)
    zero_rank = float(ds.get("zero_rank", 35.0))
    floor = float(ds.get("honored_floor", 60.0))
    x = np.asarray(vals, dtype=float)
    out = np.full(x.shape, np.nan)
    finite = ~np.isnan(x)
    out[finite] = zero_rank                       # non-honored (or gated-out) -> neutral baseline
    pos = finite & (x > 0)
    if pos.any():
        pr = percentile_rank(x[pos])              # 0-100 among honored seasons only
        out[pos] = floor + (100.0 - floor) * (pr / 100.0)
    return out


def smooth_reputation(df: pd.DataFrame, col: str, window: int, decay: float) -> pd.Series:
    """Turn a per-season accolade value into a REPUTATION signal: recognition persists a
    few years, so a season inherits a decayed share of its recent peak (TRAILING window —
    no future leakage). Prevents a consistently-recognized player's rating bouncing on
    single-season voting noise. Expects df with player_id/season/col (any row grain);
    returns the smoothed value aligned to df's rows."""
    if window <= 0 or not (df[col] > 0).any():
        return df[col]
    sa = (df.groupby(["player_id", "season"], as_index=False)[col].max()
            .sort_values(["player_id", "season"]))

    def _smooth(g):
        yrs, vals = g["season"].to_numpy(), g[col].to_numpy()
        g["_rep"] = [max([vals[j] * decay ** (yrs[i] - yrs[j])
                          for j in range(len(yrs)) if 0 <= yrs[i] - yrs[j] <= window] or [0.0])
                     for i in range(len(yrs))]
        return g
    sa = sa.groupby("player_id", group_keys=False).apply(_smooth)
    rep = sa.set_index(["player_id", "season"])["_rep"]
    return pd.Series([float(rep.get((p, s), 0.0))
                      for p, s in zip(df["player_id"], df["season"])], index=df.index)


def league_rate_by_season(df: pd.DataFrame, makes_col: str, att_col: str) -> pd.Series:
    """Season league rate mu = sum(makes)/sum(attempts) over the (already filtered)
    universe rows of that season. Mapped back onto every row by season (§6)."""
    makes = pd.to_numeric(df[makes_col], errors="coerce").fillna(0.0)
    att = pd.to_numeric(df[att_col], errors="coerce").fillna(0.0)
    g = pd.DataFrame({"season": df["season"], "m": makes, "a": att}).groupby("season").sum()
    rate = (g["m"] / g["a"]).rename("mu")
    return df["season"].map(rate)
