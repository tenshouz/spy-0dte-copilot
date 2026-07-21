# SPY 0DTE Copilot — V1.5.1 Historical Replay Recovery

SPY 0DTE Copilot is a local, deterministic, read-only trading decision-support dashboard. V1.5.1 fixes the two replay problems discovered immediately after V1.5.0:

1. Pre-V1.5 captured cycles no longer fail solely because their full Market State was not stored.
2. A requested date with zero captured cycles can now be replayed from Schwab historical five-minute SPY candles.

The backtester still does not invent historical option chains, Greeks, GEX, DEX, contracts, or option-premium returns. Those outputs remain unavailable until a point-in-time historical options dataset is connected.

## What V1.5.1 changes

### Legacy captured-date recovery

Older decision-cycle rows contain the exact frozen Trade Plan Assembly but not the complete V1.5 Market State payload. V1.5.1 now:

- Validates and uses the frozen Assembly when the stored Market State is missing or incompatible.
- Reconstructs five-minute OHLC outcome bars from the captured SPY price observations when completed candles are unavailable.
- Grades target/stop outcomes without allowing later prices to alter the original plan.
- Emits one yellow `LEGACY_FROZEN_ASSEMBLY_USED` warning per affected market date instead of hundreds of red Market State errors.

This is a faithful frozen-plan replay, not current-rule recomputation, because the original raw Market State did not exist.

### Uncaptured-date historical replay

When both date fields are supplied and a trading date has no saved decision cycles, V1.5.1 now:

- Fetches bounded five-minute SPY price history through the existing Schwab Market Data connection.
- Reconstructs each historical boundary from completed candles only.
- Recalculates VWAP, session levels, gap context, opening range, market state, bias, trigger confirmation, risk, and the underlying trade plan using the current deterministic rules.
- Begins evaluation only after the 15-minute opening range is complete.
- Grades the resulting underlying plan against later completed five-minute candles.
- Clearly labels every such episode `HISTORICAL_UNDERLYING_ONLY`.

One request may cover up to 31 calendar days. Use explicit start and end dates. Schwab must be connected for dates that have no local captures.

## Replay source modes

- `EXACT_MARKET_STATE_RECOMPUTE`: V1.5+ capture with the full point-in-time Market State; current rules are recomputed.
- `LEGACY_FROZEN_ASSEMBLY`: pre-V1.5 capture; the exact stored plan is preserved and later captured prices grade the outcome.
- `HISTORICAL_UNDERLYING_ONLY`: no capture existed; current price-action rules are rebuilt from historical five-minute SPY candles.

The Backtest Scorecard reports the count for each source mode.

## Installation

Preserve the hidden `.git` directory and `apps/server/.env`, then copy the V1.5.1 files over the current project.

### Already running V1.5.0

No npm dependency, environment variable, Prisma schema, or database migration changed in V1.5.1. Stop and restart the backend and frontend:

```powershell
npm run dev:server
```

```powershell
npm run dev:web
```

### Upgrading directly from a pre-V1.5 release

Apply the existing V1.5 migration and regenerate Prisma before restarting:

```powershell
$databaseLine = Get-Content apps\server\.env |
  Where-Object { $_ -match '^\s*DATABASE_URL\s*=' -and $_ -notmatch '^\s*#' } |
  Select-Object -First 1

if (!$databaseLine) {
  throw "DATABASE_URL is missing from apps/server/.env."
}

$databaseValue = ($databaseLine -split '=', 2)[1].Trim()

if (
  ($databaseValue.StartsWith('"') -and $databaseValue.EndsWith('"')) -or
  ($databaseValue.StartsWith("'") -and $databaseValue.EndsWith("'"))
) {
  $databaseValue = $databaseValue.Substring(1, $databaseValue.Length - 2)
}

$env:DATABASE_URL = $databaseValue
Remove-Variable databaseLine, databaseValue

npx prisma migrate deploy --schema apps/server/prisma/schema.prisma
npx prisma generate --schema apps/server/prisma/schema.prisma
```

## How to use the fix

1. Keep Schwab connected.
2. Open **Point-in-Time Backtesting**.
3. Enter the same explicit date in Start and End for a one-day replay.
4. Choose a maximum hold time between 5 and 390 minutes.
5. Run the backtest.

For a date such as July 17, 2026 with no captures, the scorecard should show historical-underlying replay boundaries instead of zero total boundaries. For a pre-V1.5 captured date such as July 20, the page should show legacy frozen-plan boundaries and a single warning rather than repeated red Market State errors.

## Methodology safeguards

- No source timestamp may be after the simulated boundary.
- Only candles completed by the boundary are visible to the plan.
- Historical-underlying replay begins after the completed 15-minute opening range.
- A qualified underlying plan may be graded without pretending a historical option contract existed.
- Target and stop ordering uses future completed or reconstructed five-minute OHLC.
- If target and stop occur in the same candle, the outcome remains ambiguous.
- Missing future coverage is not mislabeled as timeout.
- Historical underlying mode reports no contract, premium P&L, GEX, DEX, or Gamma research result.
- Backtesting remains research-only and does not place orders.

## Verification

```powershell
npm run verify:v1
```

Focused replay checks:

```powershell
npx --no-install tsx apps/server/src/services/historical-underlying-backtest.spec.ts
npx --no-install tsx apps/server/src/services/point-in-time-backtest.spec.ts
npx --no-install tsx apps/server/src/routes/point-in-time-backtest.routes.spec.ts
npx --no-install tsx apps/web/src/lib/point-in-time-backtest-view.spec.ts
```

See `RELEASE_NOTES_v1.5.1.md`, `IMPLEMENTATION_SUMMARY_v1.5.1.md`, `VERIFICATION_REPORT_v1.5.1.md`, and `docs/V1_5_1_HISTORICAL_REPLAY_RECOVERY.md`.
