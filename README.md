# SPY 0DTE Copilot — V1.5.0 Point-in-Time Backtesting

SPY 0DTE Copilot is a local, deterministic, read-only trading decision-support dashboard. V1.5.0 adds the strongest backtesting foundation that can be built before connecting a licensed historical options dataset: exact **forward capture**, historical-boundary recomputation, objective outcome grading, and a dedicated Point-in-Time Backtesting page.

V1.5.0 does not place, route, modify, or cancel brokerage orders. Backtest results are research outputs, not guarantees of future performance.

## What V1.5.0 adds

- Stores the exact deterministic Market State used by every captured decision cycle.
- Deduplicates and stores the exact same-day SPY Options Chain snapshot when the contract engine requested it.
- Recomputes the current deterministic bias, plan, risk, contract, and Assembly at each historical source boundary.
- Audits timestamps and rejects any source containing data after the simulated boundary.
- Creates one episode from the first `READY` observation per unique plan signature.
- Grades target-first, stop-first, ambiguous same-candle, timeout, session-end, and insufficient-coverage outcomes.
- Calculates MFE, MAE, duration, underlying points, realized R, and estimated option P&L.
- Uses future completed five-minute candles for target/stop ordering; quote samples can improve excursion measurements but never decide first touch.
- Separates the frozen historical plan from the later outcome in the user interface.
- Preserves empirical Gamma as an observational research dimension only.
- Saves backtest runs and breakdowns by setup, direction, and Gamma regime.

## Critical limitation

Exact V1.5 replay begins **after this release is installed and the new migration is applied**. Earlier V1.4 decision-cycle rows did not store the full Market State and Options Chain payloads required for exact recomputation. V1.5 does not invent those missing inputs.

A historical options dataset can be connected later through a dedicated adapter without changing the replay methodology.

## Installation

Preserve the existing hidden `.git` directory and `apps/server/.env`, then copy the V1.5.0 files over the project.

Stop the backend before running Prisma commands. From the repository root in PowerShell:

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

No npm dependency or environment-variable name changed. If the existing `node_modules` folder is intact, `npm install` is not required solely for V1.5.0.

Restart the application:

```powershell
npm run dev:server
```

```powershell
npm run dev:web
```

## Building the capture history

For continuous capture, keep the backend running and enable **Persistent Backend Automation** in Settings. V1.5 evaluates and captures one deterministic candidate each automation cadence even when Trade Plan Discord alerts are disabled or the webhook is not configured. No outbound message is required for research capture.

The capture system is best effort: a database failure never changes the live trading output.

## Point-in-Time Backtesting page

Open **Point-in-Time Backtest** from the navigation. Select optional market-date bounds and a maximum hold time, then run the test.

The page shows:

- Source decision-cycle and date coverage.
- Recomputed trade episodes.
- Win rate among target-first and stop-first outcomes.
- Average R and estimated option P&L.
- MFE and MAE.
- Setup, direction, and Gamma-regime breakdowns.
- Audit issues and incomplete-capture warnings.
- A per-episode frozen plan panel separate from the post-plan outcome.

## Methodology safeguards

- Historical clock: stored `sourceCalculatedAt`.
- No look-ahead: all source timestamps and completed-candle boundaries must be at or before the replay clock.
- Entry: first `READY` occurrence per unique plan signature.
- Underlying fill: captured current price.
- Option fill: captured ask.
- Target/stop ordering: completed five-minute OHLC first touch.
- Same-candle target and stop: ambiguous; no favorable or unfavorable ordering is invented.
- Missing future coverage: `INSUFFICIENT_FUTURE_DATA`, not a fabricated timeout.
- Option exit: first observed later bid within the allowed lag, otherwise the stored conservative target/stop scenario when applicable.

## Verification

After Prisma generation, run:

```powershell
npm run verify:v1
```

The focused backtest tests can also be run directly:

```powershell
npx --no-install tsx apps/server/src/services/point-in-time-backtest.spec.ts
npx --no-install tsx apps/server/src/services/trade-plan-assembly.service.spec.ts
npx --no-install tsx apps/server/src/routes/point-in-time-backtest.routes.spec.ts
npx --no-install tsx apps/web/src/lib/point-in-time-backtest-view.spec.ts
```

See [the complete methodology](docs/V1_5_POINT_IN_TIME_BACKTESTING.md), [release notes](RELEASE_NOTES_v1.5.0.md), [implementation summary](IMPLEMENTATION_SUMMARY_v1.5.0.md), [verification report](VERIFICATION_REPORT_v1.5.0.md), and [the strongest next-version roadmap](STRONGEST_NEXT_VERSION.md).
