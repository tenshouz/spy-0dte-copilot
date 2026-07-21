# V1.5.1 Historical Replay Recovery — Release Notes

## Purpose

V1.5.1 is a focused corrective release for the first real-world V1.5 backtest results. It addresses repeated `SOURCE_MARKET_STATE_INVALID` errors on pre-V1.5 rows and zero captured cycles on dates before continuous V1.5 capture began.

## Fixed

### Pre-V1.5 source validation

- A missing or older stored Market State no longer automatically discards the cycle.
- The replay engine attempts the exact frozen Trade Plan Assembly as a safe legacy fallback.
- Frozen-plan timestamps are audited against the decision-cycle boundary.
- Captured prices are aggregated into deterministic five-minute OHLC bars for outcome ordering.
- Legacy usage is aggregated into one warning per market date.

### Dates with no captures

- Explicitly bounded missing dates now request five-minute SPY price history from Schwab.
- Historical reconstruction is DST-aware and uses `America/New_York` session boundaries.
- Previous-session and premarket data are included in the bounded request window.
- Historical boundaries begin at 9:45 a.m. ET after the 15-minute opening range exists.
- Current deterministic price-action logic is replayed at every completed five-minute boundary.
- A qualified underlying setup can be graded even though contract selection remains unavailable.

### Backtest transparency

- Added replay source mode to every episode.
- Added exact, legacy, and historical-underlying boundary counts.
- Added INFO, WARNING, and ERROR audit severities.
- Updated the Backtest page to distinguish the three methodologies.
- Historical options, exposure, contract, and premium limitations are shown explicitly.

## Unchanged safety boundaries

- No historical options data is fabricated.
- GEX and DEX remain unavailable in historical-underlying replay.
- No contract or premium return is shown without point-in-time option data.
- Same-candle target/stop ordering remains ambiguous.
- The system does not execute trades.

## Operational changes

- Package version: 1.5.1.
- No dependency changes.
- No environment-variable changes.
- No new Prisma migration.
- Existing V1.5 database tables remain compatible.
