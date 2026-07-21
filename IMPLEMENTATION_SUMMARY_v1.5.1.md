# V1.5.1 Historical Replay Recovery — Implementation Summary

## Replay fallback hierarchy

The backtester now chooses the strongest source available for each market date:

1. Full stored Market State and optional point-in-time Options Chain.
2. Exact frozen Trade Plan Assembly from legacy captured cycles.
3. On-demand Schwab five-minute underlying history when no cycle was captured.

## New server modules

- `historical-underlying-backtest.service.ts`: authenticated bounded Schwab history retrieval, token refresh, normalization, range controls, and DST-aware request windows.
- `historical-underlying-backtest.logic.ts`: point-in-time candle slicing and current-rule historical boundary construction.
- `historical-underlying-contract.logic.ts`: research-only adapter that preserves qualified underlying risk while explicitly returning no historical contract.

## Updated replay engine

- Detailed Zod validation errors replace generic source-invalid copy.
- Legacy Assembly fallback activates only after Market State validation fails.
- Legacy observations can be reconstructed into five-minute candles.
- Historical-underlying plans may become episodes when the underlying setup is qualified and the only missing layer is a historical contract.
- Episode source modes and per-mode counts are persisted with each backtest run.

## Updated user interface

- “Captured Cycles” is now “Replay Boundaries.”
- Scorecard separates exact Market State, legacy frozen plans, and historical underlying boundaries.
- Episode table and detail panel show replay source.
- Audit items use red for errors, yellow for warnings, and blue for informational disclosures.

## Compatibility

Older saved V1.5 run payloads remain readable through schema defaults for newly added fields. No database backfill is required.
