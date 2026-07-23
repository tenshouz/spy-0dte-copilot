# V1.5.4 Trigger Lifecycle & Retest Recovery

## Problem

V1.4 correctly prevented chasing a breakout that had already moved too far beyond its trigger. The defect was semantic and operational: `MAXIMUM_CHASE_DISTANCE_EXCEEDED` forced the lifecycle to `INVALIDATED`. That confused a valid directional breakout with a bad entry price and eliminated any later retest opportunity.

## Design principle

A setup can be structurally valid while the current entry is unacceptable. V1.5.4 separates:

- Directional structure.
- Raw trigger detection.
- Completed-candle confirmation.
- Immediate entry qualification.
- Retest qualification.
- True structural invalidation.

## Full-session source window

V1.5.4 expands the execution context from the latest 12 completed candles to as many as all 78 five-minute RTH candles. This is required to reconstruct an active trigger episode when the dashboard is opened later in the session. The engine ignores pre-09:45 confirmation candidates, uses completed candles only, and starts a new episode only after a completed close loses the raw trigger.

This reconstruction does not retroactively send a live Discord alert for a time when the backend was not running; it makes the current dashboard state and historical replay auditable.

## Calls lifecycle

- Raw trigger: `max(VWAP, 15-minute opening-range high)`.
- Buffered trigger: raw trigger plus the dynamic buffer.
- Immediate confirmation: completed five-minute close above the buffered trigger.
- Immediate entry: confirmation/current price within maximum chase distance.
- Extended confirmation: transition to `WAITING_FOR_RETEST`.
- Retest zone: raw trigger through buffered trigger plus tolerance.
- Held retest: candle overlaps the zone, closes above the buffered trigger, and its close remains within the maximum chase allowance from the raw trigger.
- A wide continuation candle that merely wicks into the zone but closes too far away is not treated as a retest.
- Invalidation: completed close below the raw trigger, excessive active-episode recrosses, or retest-window expiry.

Puts use the exact symmetric policy.

## Dynamic values

- Dynamic buffer: `max(0.03, min(0.25, median five-minute range × 0.15))`.
- Maximum chase: `max(0.15, min(0.75, median five-minute range × 0.75))`.
- Retest tolerance: `max(0.03, min(0.20, median five-minute range × 0.25))`.
- Maximum observed close extension: the largest directional completed-close distance from the raw trigger in the active episode; once this exceeds the chase allowance, the retest requirement persists.
- Retest window: six completed five-minute bars.
- Maximum active-episode buffered-trigger recrosses: two. A prior failed episode is excluded after a clean reclaim begins.
- Minimum breakout-volume ratio: 0.80× the prior median when available.

These remain research hypotheses, not statistically calibrated universal constants. Point-in-time capture and replay should be used to test them by setup and regime.

## Entry requalification

A held retest does not bypass the rest of the system. It only allows `confirmationPassed=true`. The current-price risk engine then recalculates:

- Structural invalidation.
- Objective ordering and target room.
- Underlying reward/risk.
- Contract eligibility and liquidity.
- Conservative option-premium reward/risk.
- Sizing and risk-budget constraints.

## Alerts

`WAITING_FOR_RETEST` is not actionable and remains silent under the hardened Discord policy. A message can be sent only after the complete plan becomes actionable or another approved lifecycle event occurs.

## Backtesting

The same function is used by live assembly, exact stored-market-state replay, and historical-underlying replay. No backtest-only shortcut is introduced.
