# Implementation Summary — V1.5.0

V1.5.0 implements a point-in-time research pipeline without connecting a historical options vendor.

## Backend

- Shared Zod contracts for requests, runs, episodes, outcomes, issues, disclosures, and history.
- Exact source-bundle capture in the Trade Plan Assembly service.
- Deduplicated Options Chain persistence and Decision Cycle foreign-key linkage.
- Current-rule historical recomputation with timestamp audit.
- Completed-five-minute-candle outcome engine.
- Option exit estimate hierarchy.
- Run persistence, listing, and detail retrieval.
- Private no-store same-origin routes under `/api/backtest/spy/runs`.
- Persistent automation capture-only behavior when delivery is disabled.

## Frontend

- API client and React Query hooks.
- New Point-in-Time Backtesting page.
- Saved-run history.
- Scorecard, episodes, plan review, outcome review, performance breakdowns, and source issues.
- Desktop/mobile navigation and Dashboard Guide entry.

## Safety

- No future source timestamp is accepted.
- No target/stop ordering is guessed inside one five-minute candle.
- Incomplete capture is not converted into a timeout.
- Option outputs are labeled observed estimates, model estimates, or unavailable.
- No account order or execution capability was added.
