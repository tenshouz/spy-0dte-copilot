# V1.4.0 Execution-Quality Trading Logic

## Purpose

V1.4.0 hardens the deterministic SPY 0DTE decision pipeline against false breakout activation, unsynchronized inputs, poor option execution, and unvalidated exposure assumptions. The release is intended to reduce avoidable failed trades and improve auditability. It does **not** claim a higher win rate. Every threshold introduced here is an explicit conservative research hypothesis that must be evaluated chronologically on unseen data.

The system remains decision support only. It does not create, route, modify, or execute orders.

## Decision pipeline

The active path is:

`raw quote/candles/options -> snapshot integrity -> market state -> bias -> TRADE_PLAN_V3 -> RISK_V2 -> CONTRACT_V2 -> ASSEMBLY_V2 -> alert candidate -> decision-cycle audit`

A plan reaches `READY` only when data integrity, directional structure, completed-candle trigger confirmation, underlying risk qualification, and option execution quality all pass.

## 1. Raw snapshot integrity

Market Context now records provider/receipt timestamps for the quote, candle set, and options chain. `SNAPSHOT_INTEGRITY_V1` exposes:

- A stable snapshot identifier.
- Quote, candle, and option-chain fetch timestamps.
- Market-structure and execution skew in milliseconds.
- Maximum allowed skew.
- `COHERENT`, `SKEWED`, or `UNAVAILABLE` state.
- Explicit warning codes.

A raw-source skew violation fails closed. Equal downstream `calculatedAt` values are no longer treated as proof that the underlying data was synchronized.

## 2. Completed-candle trigger confirmation

A current-price tick crossing VWAP/opening-range structure no longer activates a trade by itself. `TRIGGER_CONFIRMATION_V1` uses completed five-minute candles and a lifecycle:

- `ARMED`: directional setup exists but no raw cross.
- `DETECTED`: a cross exists but confirmation is incomplete.
- `READY`: completed close and maintenance conditions pass.
- `RETESTED`: confirmation passes and the latest candle tested the buffered level.
- `INVALIDATED`: excessive recrossing or a late chase invalidates activation.

The confirmation policy requires:

- Raw price on the correct side of the trigger.
- A completed five-minute close beyond a dynamic buffer.
- Current price still beyond the buffered trigger.
- No more than two recent close recrosses.
- Latest volume at least 0.80 times the recent median when volume context is available.
- Entry distance not beyond the dynamic maximum chase distance.

Dynamic buffer:

`max($0.03, min($0.25, 15% of median completed-candle range))`

Maximum chase distance:

`max($0.15, min($0.75, 75% of median completed-candle range))`

These values are deterministic and visible in the response. They are not statistically calibrated yet.

## 3. Counterevidence and alignment score

V1.4.0 replaces the previous all-or-nothing treatment of every opposing location feature:

- Material counterevidence remains a hard veto.
- One minor opposing item can be tolerated.
- Correlated evidence is grouped into capped families rather than presented as independent probability evidence.

The new `TRADE_QUALITY_V1` output is an **uncalibrated alignment score**, not a win probability. Its capped families are:

- VWAP behavior.
- Session structure.
- Trigger confirmation.
- Participation.
- Data integrity.

GEX and DEX do not add or subtract directional confidence in V1.4.0.

## 4. Exposure context

`EXPOSURE_CONFIRMATION_V2` treats GEX, DEX, gamma walls, and related structures as context only. Exposure can describe:

- Model-implied stabilizing/amplifying regime.
- Nearby wall, cliff, or concentration location.
- Potential target, resistance/support, pin, or behavior-change zone.

It cannot:

- Create a CALL or PUT direction.
- Pass a failed eligibility gate.
- Block an otherwise valid setup by an uncalibrated weight.
- Alter deterministic trigger, invalidation, target, or contract calculations.

Directional exposure weights may be reintroduced only after setup-specific out-of-sample evidence supports them.

## 5. Risk framework

`RISK_V2` uses setup-specific buffered trigger failure as the first invalidation candidate, then falls back to valid structural references. The noise buffer is:

`max($0.05, min($0.30, 20% of median completed-candle range))`

Targets now include opening-range extensions and gamma-wall context in addition to prior-day, premarket, and expected-move structures. Expected move remains context, not a guaranteed destination.

Underlying qualification still requires at least 2.0 reward/risk in SPY points. A separate 15-minute advisory time-risk policy is exposed because 0DTE premium can decay even when an underlying stop has not been hit.

## 6. Contract execution policy

`CONTRACT_V2` preflights the option chain while the setup is waiting and selects a contract only after the underlying setup is confirmed. Hard filters include:

- Contract quote age no greater than 20 seconds.
- Source assembly skew no greater than 30 seconds.
- Relative spread no greater than 10% of mark.
- Absolute spread no greater than $0.20.
- Bid and ask size at least one contract.
- Open interest at least 100 **or** current volume at least 20.
- Absolute delta between 0.35 and 0.75.
- Ranking centered on 0.55 absolute delta.
- Standard 100-share contracts only.

The engine estimates option value at invalidation and objective using a conservative delta/gamma/theta, constant-IV, 15-minute scenario with spread-adjusted exits. Estimated premium reward/risk must be at least 1.25. This estimate is explicitly not a guarantee and is separate from the underlying 2.0 reward/risk gate.

## 7. Alerts

Alert messaging distinguishes conditional and confirmed states:

- Waiting/armed alerts are informational and disclose that contract selection is deferred.
- A `READY` alert requires the trigger-confirmation policy and option execution policy to pass.
- Stable alert keys include trigger lifecycle and confirmation state.

Audit capture is best-effort and can never block a live decision response.

## 8. Decision-cycle persistence

The additive `DeterministicDecisionCycle` table stores each evaluated, non-last-resort assembly snapshot with:

- Market date and exact source calculation time.
- Plan state, direction, setup type, and trigger lifecycle.
- Confirmation status and execution alignment score.
- Snapshot-integrity state.
- Selected contract symbol when present.
- Reason/warning codes.
- Full structured assembly JSON.

The unique user/snapshot key suppresses duplicate observations. This creates the foundation for objective future calibration, including rejected setups and `NO_SETUP`/waiting states rather than only user-entered trades.

## Required database update

Stop the backend first, then run from the project root:

```powershell
$databaseLine = Get-Content apps\server\.env |
  Where-Object { $_ -match '^\s*DATABASE_URL\s*=' -and $_ -notmatch '^\s*#' } |
  Select-Object -First 1
if (!$databaseLine) { throw "DATABASE_URL is missing from apps/server/.env." }
$env:DATABASE_URL = (($databaseLine -split '=', 2)[1].Trim()).Trim('"').Trim("'")

npx prisma migrate deploy --schema apps/server/prisma/schema.prisma
npx prisma generate --schema apps/server/prisma/schema.prisma
```

On Windows, stop the backend before Prisma generation to avoid an `EPERM` file-lock error.

## Verification expectations

Confirm that:

- A price tick beyond the trigger remains `DETECTED` until a completed candle confirms it.
- Excessive recrossing or chasing prevents `READY`.
- Snapshot skew produces an unavailable plan.
- Waiting plans may show a preflight contract but no selected contract.
- `READY` exposes both underlying and estimated option-premium reward/risk.
- Exposure adjustment points remain zero.
- Decision-cycle rows appear without duplicate rows for the same assembly calculation.
