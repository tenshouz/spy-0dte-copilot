# Release Notes — V1.4.1 Empirical Gamma Research

## Scope

This release adds only the requested empirical Gamma research capability to the V1.4.0 execution-quality baseline. It does not implement the other proposed V1.5.0 additions.

## Added

- Read-only empirical Gamma research API: `GET /api/gamma-research/spy`.
- GEX/DEX page research panel with baselines and matched findings.
- Strict adjacent net-GEX sign-transition calculation and schema validation.
- Preservation of the complete exposure structure in new Trade Plan Assembly snapshots for research.
- Research features for Gamma regime, directional wall, opposing wall, nearest cliff, and nearest sign transition.
- Setup-and-direction-matched bucket comparisons.
- Wilson 95% intervals, win-rate and expectancy deltas, and explicit evidence states.
- Minimum sample rules of 30 bucket and 30 comparator observations.
- Backward-compatible partial extraction from older V1.4 exposure-confirmation data.
- Journal-query invalidation after outcome changes.
- Focused backend, service, route, schema, and frontend view tests.

## Safeguards

- Full findings require LIVE and COMPLETE GEX input.
- Breakevens remain in the win-rate denominator.
- Automatic directional Gamma weighting is disabled.
- Candidate findings require future locked out-of-sample validation.
- Findings cannot alter Trade Plan direction, eligibility, confidence, risk, targets, contract selection, sizing, or alerts.
- Research route is read-only, no-store, origin-restricted, and payload-sanitized.
- No private account data or order capabilities were added.

## Compatibility

- No new npm dependency.
- No environment variable.
- No Prisma schema change.
- No database migration.
- Existing V1.4.0 installations can apply the changed files and restart the backend and frontend.
- New captures contain full Gamma research context. Older V1.4 captures may contribute only regime and directional-wall context.

## Known limitations

- Outcomes are user-reviewed and observational.
- Snapshot observations are not guaranteed to be independent trades.
- Multiple comparisons are unadjusted.
- Open interest can be stale intraday.
- Historical data lacks complete cliff and sign-transition context.
- No objective forward outcome engine or raw event-sourced replay is included.
