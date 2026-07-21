# Release Notes — V1.5.0 Point-in-Time Backtesting

## Added

- Exact forward capture of deterministic Market State and deduplicated Options Chain snapshots.
- Additive Prisma models for Options Chain snapshots and saved point-in-time backtest runs.
- Historical-boundary recomputation through the current Bias, Trade Plan, Risk, Contract, and Assembly engines.
- No-look-ahead timestamp audit.
- Unique trade-episode construction.
- Objective target/stop outcome engine with ambiguous same-candle handling.
- MFE, MAE, duration, realized underlying points, R multiples, and labeled option estimates.
- Persistent run history and private same-origin API routes.
- New `/backtest` page and navigation entry.
- Setup, direction, and Gamma-regime breakdowns.
- Background forward capture when persistent backend automation is active, even without Discord delivery.

## Preserved

- No automated order execution.
- Deterministic calculations remain separate from language generation.
- Empirical Gamma remains research-only and cannot influence live rules.
- Existing V1.4 execution-quality gates remain unchanged.
- Existing V1.4.1 empirical Gamma feature remains available.

## Database

Migration required:

`20260721040000_add_point_in_time_backtesting`

Prisma generation is required after applying the migration.

## Dependencies and environment

- No npm dependency added.
- No environment-variable name added or changed.
- Existing `DATABASE_URL` is required for capture and saved runs.

## Compatibility

Earlier decision-cycle rows remain in the database but may lack full Market State and Options Chain payloads. They are reported as invalid/unusable for exact point-in-time recomputation rather than reconstructed from hindsight.
