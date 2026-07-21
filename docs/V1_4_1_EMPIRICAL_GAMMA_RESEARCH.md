# V1.4.1 Empirical Gamma Research

## Purpose

V1.4.1 adds an observational research layer for testing whether model-implied SPY 0DTE Gamma context is associated with better or worse outcomes inside the dashboard's existing named setups.

The feature is research-only and intentionally separated from live trade logic. It cannot create direction, change the execution-quality alignment score, satisfy a trade gate, change invalidation or targets, select a contract, size a position, or emit an order.

## Research data source

The engine reads the existing local `DeterministicJournalSnapshot` table. No new database table or migration is required.

An observation is eligible only when:

- The persisted plan state is `READY`.
- Direction is `CALLS` or `PUTS`.
- The reviewed outcome is `WIN`, `LOSS`, or `BREAKEVEN`.
- Realized P&L is present and finite.
- The stored Assembly validates against the shared contract.
- Assembly direction and market date match the persisted row.
- A named setup type and positive current price are available.

The database service loads only reviewed trade outcomes and their stored Assembly JSON. It separately counts all persisted snapshots, avoiding retrieval of every unreviewed automatic-capture payload.

## Gamma input quality

Full-context feature findings require:

- A stored exposure structure in the Assembly.
- GEX source state `LIVE`.
- GEX coverage state `COMPLETE`.
- A valid current-date exposure structure.

Stale, unavailable, or partial GEX inputs do not enter Gamma feature buckets.

Older V1.4.0 assemblies did not preserve the full exposure structure. When a valid complete legacy exposure-confirmation component exists, those rows may contribute only:

- Gamma regime.
- Primary directional-wall location.

They cannot contribute cliff or strict sign-transition research.

## Features studied

### Gamma regime

Buckets:

- `CALL_DOMINANT`
- `PUT_DOMINANT`
- `BALANCED`

These labels remain model-implied returned-window states. They are not direct observations of dealer inventory and are not assumed to be directionally predictive.

### Directional-wall location

The highest-ranked call wall is used for a CALLS plan; the highest-ranked put wall is used for a PUTS plan. The wall is categorized by:

- Ahead, behind, or at price relative to the planned direction.
- Near or far from spot.

### Opposing-wall location

The highest-ranked wall on the opposite option side is categorized using the same direction-relative and proximity rules.

### Nearest Gamma cliff

The nearest ranked adjacent net-GEX change is categorized by:

- Positive or negative jump.
- Ahead, behind, or straddling spot.
- Near or far.

A Gamma cliff is an adjacent change in modeled net GEX. Its jump sign is not itself a bullish or bearish signal.

### Nearest strict Gamma sign transition

V1.4.1 adds transparent adjacent sign-transition detection. A transition exists only when neighboring strikes have strictly opposite net-GEX signs. Zero-touch rows and same-sign neighbors are excluded.

The estimated transition strike is linearly interpolated between the two adjacent strikes. The research bucket includes:

- Negative-to-positive or positive-to-negative transition.
- Ahead, behind, or straddling spot.
- Near or far.

The schema validates endpoint signs, interpolation bounds, direction, magnitude, and contiguous deterministic rank.

## Proximity threshold

`NEAR` means the level is no more than 1% from the underlying price. Otherwise it is `FAR`.

This is a fixed V1 research threshold and is not claimed to be optimal.

## Matching and comparator design

Every finding is evaluated inside the same:

- Setup type.
- Trade direction.
- Feature type.

For a selected bucket, the comparator is all other observed buckets for that same setup, direction, and feature.

Example:

> Opening-range breakout CALLS in `CALL_DOMINANT` Gamma are compared only with opening-range breakout CALLS in other Gamma-regime buckets.

This prevents the engine from attributing setup or direction differences to Gamma context. It does not eliminate all confounding.

## Metrics

For both the selected bucket and its matched comparator, the engine reports:

- Trade count.
- Wins.
- Losses.
- Breakevens.
- Win rate.
- Wilson 95% win-rate interval.
- Total realized P&L.
- Average realized P&L.
- Expectancy in dollars per observation.

Win rate is:

\[
\text{Win Rate}=\frac{\text{Wins}}{\text{Wins}+\text{Losses}+\text{Breakevens}}
\]

Breakevens therefore remain in the denominator.

## Evidence states

### `INSUFFICIENT_SAMPLE`

Returned when either:

- Bucket sample is below 30 observations.
- Matched comparator sample is below 30 observations.

### `NO_CLEAR_SEPARATION`

Returned when samples are sufficient but the conservative candidate rule is not satisfied.

### `POSITIVE_CANDIDATE`

Requires all of the following:

- Bucket sample at least 30.
- Comparator sample at least 30.
- Bucket Wilson 95% lower bound exceeds comparator Wilson 95% upper bound.
- Bucket expectancy exceeds comparator expectancy.

### `NEGATIVE_CANDIDATE`

Requires the mirror conditions:

- Bucket Wilson 95% upper bound is below comparator Wilson 95% lower bound.
- Bucket expectancy is lower than comparator expectancy.

Candidate labels are exploratory evidence states, not trading recommendations.

## Weighting lock

There is no automatic directional weighting in V1.4.1.

Every finding explicitly returns:

- `eligibleForDirectionalWeight: false`
- `automaticDirectionalWeightingEnabled: false`
- `holdoutValidationPresent: false`

Even a positive or negative candidate remains blocked by:

- Missing locked holdout validation.
- Observational user-entered outcome limitations.
- Any unmet bucket/comparator minimum sample.

The existing V1.4.0 policy remains unchanged: GEX, DEX, walls, and cliffs are context-only in the live Trade Plan.

## API and UI

### API

```text
GET /api/gamma-research/spy
```

Properties:

- Read-only GET.
- No-store and no-cache headers.
- Same-origin/same-site protection.
- Query parameters rejected.
- Database failures sanitized.
- No private account, position-sizing, or order fields.

### UI

The GEX/DEX page displays:

- Eligible outcome and context counts.
- Setup/direction baselines.
- Matched Gamma findings.
- Research state badges.
- Explicit weighting lock and methodological warnings.

The query is invalidated when a journal outcome is updated.

## Important limitations

V1.4.1 does not claim causality or a proven edge. Important limitations include:

- User-entered outcome and P&L labels.
- Possible selection bias in which snapshots are reviewed.
- Snapshot-level observations may not equal independent trade identities.
- Open interest can be stale intraday.
- Returned-window GEX may differ from broader vendor or full-chain methods.
- No multiple-comparison correction is applied.
- Market regime, time of day, volatility, events, and execution quality may confound results.
- No raw event-sourced replay or objective target-before-stop labeling exists yet.
- Historical rows have incomplete Gamma context.

## Promotion standard

A Gamma bucket should not be considered for a live weight unless all of these occur after the rule is frozen:

1. Objective outcome labels replace or corroborate user-entered results.
2. Trade identity or cluster-aware statistics address repeated snapshots.
3. Chronological development and validation periods reproduce the effect.
4. A locked untouched test period confirms the effect.
5. Paper-trading holdout confirms implementation behavior.
6. Net expectancy remains positive after spread, slippage, and fees.
7. The effect remains stable by setup, direction, time, volatility, and market regime.
8. A reviewed explicit rule change enables the weight; no silent automatic promotion is permitted.
