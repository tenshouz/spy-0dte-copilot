# Implementation Summary — V1.5.4

## Baseline

The implementation was applied to the user-supplied sanitized V1.5.3 project package dated 2026-07-22 16:14:35.

## Core implementation

### Shared contracts

`packages/shared/src/schemas.ts`

- Added `WAITING_FOR_RETEST` to the trigger lifecycle enum.
- Added `TRIGGER_CONFIRMATION_V2` while retaining V1 compatibility for stored historical payloads.
- Added confirmation-candle, retest-zone, retest-window, and post-retest diagnostics.
- Added retest-specific reason and warning codes.
- Added schema invariants for `WAITING_FOR_RETEST`, `RETESTED`, and `READY`.
- Extended the Assembly entry-condition schema with the new diagnostics.

### Deterministic trigger state machine

`apps/server/src/services/trade-plan.logic.ts`

- Expands the execution snapshot from 12 to up to 78 current-session five-minute candles, then filters to completed current-date candles at or after the 09:45 ET opening-range completion boundary.
- Locates the first completed-close confirmation in the latest raw-side episode; a buffer-only pullback remains part of the original episode, while a close through the raw trigger resets it.
- Separates observed raw-cross state from the current quote-only raw-cross state.
- Records the confirmation candle, its directional extension, and the largest completed-close extension observed in the active episode.
- Preserves the existing dynamic buffer, volume, recross, and maximum-chase policies.
- Creates a bounded volatility-adjusted retest path when immediate entry is extended.
- Requires zone overlap, a correct-side retest close that is itself within chase allowance, current-side maintenance, and post-retest chase control.
- Scopes recross counting to the active buffered-trigger episode so a prior failure does not poison a later clean reclaim.
- Invalidates on raw-level loss, excessive active-episode recrosses, or retest-window expiry.
- Maps retest states to explicit deterministic gate reasons and top-level warnings.

### Assembly and UI

`apps/server/src/services/trade-plan-assembly.logic.ts`

- Propagates all lifecycle diagnostics into the canonical Assembly.

`apps/web/src/app/trade-plan/page.tsx`

- Displays trigger, confirmation, chase, and retest as separate concepts.
- Adds a clear do-not-chase explanation while waiting for retest.

`apps/web/src/app/backtest/page.tsx`

- Displays lifecycle, raw cross, and retest qualification for a selected historical episode.

### Tests

- Expanded trade-plan tests for immediate confirmation, waiting-for-retest, successful retest recovery, and raw-level failure.
- Updated Assembly diagnostics expectations.
- Added UI static checks for the new labels and no-chase/retest explanation.

## Methodological limitation

The lifecycle is derived from the most recent completed execution candles and the current deterministic trigger level. For exact historical recreation of a moving VWAP trigger at every intrabar instant, a full event-sourced historical VWAP/quote stream is still preferable. The current implementation remains look-ahead safe because it uses only completed candles available at each evaluation boundary.
