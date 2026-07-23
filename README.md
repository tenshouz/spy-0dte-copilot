# SPY 0DTE Copilot — V1.5.4 Trigger Lifecycle & Retest Recovery

V1.5.4 fixes the false-negative entry behavior where a structurally valid breakout was permanently labeled `INVALIDATED` simply because the first confirmed move was already beyond the maximum chase distance.

The no-chase guard remains intact. An extended confirmation now enters a bounded `WAITING_FOR_RETEST` lifecycle. The engine can requalify only after SPY revisits a volatility-adjusted retest zone, closes back on the correct side of the buffered trigger, remains within the post-retest chase allowance, and still passes risk, target-room, contract-liquidity, and option-premium reward/risk checks.

## V1.5.4 behavior

- Separates a historical/raw trigger cross from the current quote relationship.
- Retains the full current RTH five-minute session and records the first completed confirmation candle in the active raw-side episode, even when the dashboard opens later in the day.
- Preserves the maximum-chase protection for immediate entries.
- Uses `WAITING_FOR_RETEST` instead of permanent invalidation when the breakout is valid but extended.
- Defines a volatility-adjusted retest zone and a six-completed-bar retest window.
- Requires the retest candle to overlap the zone, close beyond the buffered trigger, and keep its close within the original maximum-chase allowance.
- Scopes recross counting to the active buffered-trigger episode so a prior failed breakout does not permanently block a later clean reclaim.
- Rejects a retest when the raw trigger is lost, the window expires, active-episode recrosses become excessive, participation is insufficient, or the post-retest entry is already extended again.
- Recalculates the complete current risk, objectives, option contract, liquidity, and premium reward/risk before a plan can become `READY`.
- Runs the same completed-candle lifecycle in point-in-time and historical-underlying replay.
- Keeps `WAITING_FOR_RETEST` silent in Discord; only actionable lifecycle events are eligible for delivery under the V1.5.2/V1.5.3 alert hardening.

The Trade Plan page now displays raw-cross state, current raw-side state, confirmation candle/time, confirmation extension, maximum observed completed-close extension for the episode, maximum chase distance, current extension, retest zone, retest progress, and whether the retest held. The former ambiguous `Trigger Satisfied` label is replaced by `Entry Qualification Passed`.

No dependency, environment variable, Prisma schema, database migration, account permission, order route, or automated execution capability changed.

See `RELEASE_NOTES_v1.5.4.md`, `IMPLEMENTATION_SUMMARY_v1.5.4.md`, `VERIFICATION_REPORT_v1.5.4.md`, and `docs/V1_5_4_TRIGGER_LIFECYCLE_RETEST_RECOVERY.md`.

## Installation from V1.5.3

Preserve `.git` and `apps/server/.env`, copy the V1.5.4 files over the current project, then restart:

```powershell
npm run dev:server
```

```powershell
npm run dev:web
```

No `npm install`, Prisma generation, or migration is required when the existing dependency installation is intact. Run `npm run verify:v1` before relying on the updated lifecycle.

---

# SPY 0DTE Copilot — V1.5.3 Discord Alert Contract Hotfix

V1.5.3 corrects the response-schema contract mismatch discovered by the local V1.5.2 Discord delivery specification. The alert hardening behavior remains unchanged: routine waiting recalculations stay silent, persistent backend delivery owns the webhook when enabled, and duplicate emitted events are suppressed.

## What V1.5.3 fixes

V1.5.2 intentionally returned `NO_EMITTED_TRANSITION` for three safe non-delivery situations:

- Persistent backend automation blocked a competing foreground sender before transition evaluation.
- A transition was emitted internally but filtered because it was not actionable for Discord.
- A duplicate emitted transition was blocked by the process-wide fingerprint claim.

The shared Zod response schema still allowed only a `SUPPRESSED` transition for that reason code. This caused three valid non-delivery paths to throw during response construction. V1.5.3 updates the schema to accept exactly these three fail-closed shapes while continuing to reject provider requests, retries, uncommitted emitted transitions, and unavailable transitions.

No trading, backtesting, risk, contract, Gamma, sizing, database, or order logic changed. No dependency, environment variable, Prisma schema, or migration changed.

See `RELEASE_NOTES_v1.5.3.md`, `IMPLEMENTATION_SUMMARY_v1.5.3.md`, `VERIFICATION_REPORT_v1.5.3.md`, and `docs/V1_5_3_DISCORD_ALERT_CONTRACT_HOTFIX.md`.

## Installation from V1.5.2

Preserve `.git` and `apps/server/.env`, keep Trade Plan Alerts off while copying the update, then restart:

```powershell
npm run dev:server
```

```powershell
npm run dev:web
```

No `npm install`, Prisma generation, or migration is required. Run the focused Discord specification before re-enabling alerts.

## V1.5.1 historical replay capabilities retained

V1.5.1 fixed two replay problems discovered immediately after V1.5.0:

1. Pre-V1.5 captured cycles no longer fail solely because their full Market State was not stored.
2. A requested date with zero captured cycles can be replayed from Schwab historical five-minute SPY candles.

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

## Historical V1.5.1 installation notes

For direct upgrades from a pre-V1.5 release, preserve the hidden `.git` directory and `apps/server/.env`, then apply the existing V1.5 database migration as described below.

### Historical V1.5.0 to V1.5.1 path

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

Historical replay detail remains in `RELEASE_NOTES_v1.5.1.md`, `IMPLEMENTATION_SUMMARY_v1.5.1.md`, `VERIFICATION_REPORT_v1.5.1.md`, and `docs/V1_5_1_HISTORICAL_REPLAY_RECOVERY.md`.
