# Release Notes — V1.5.4 Trigger Lifecycle & Retest Recovery

## Purpose

V1.5.4 corrects a trading-logic defect introduced by the V1.4 execution-quality guard: a completed breakout confirmation that exceeded the maximum chase distance was labeled `INVALIDATED`, even though the directional structure could remain valid and later offer a safer retest entry.

## Trading-logic changes

### Trigger Confirmation V2

`TRIGGER_CONFIRMATION_V2` now evaluates a completed-candle lifecycle:

1. `ARMED` — no raw cross has been observed.
2. `DETECTED` — a raw quote/candle cross exists, but no completed five-minute close has confirmed it.
3. `CONFIRMED` — a completed close is beyond the buffered trigger, but another non-chase condition remains incomplete.
4. `WAITING_FOR_RETEST` — the completed breakout is valid but the immediate entry is too extended.
5. `RETESTED` — a later completed candle overlaps the retest zone, closes beyond the buffered trigger, and the current quote remains within the post-retest chase allowance.
6. `READY` — the immediate confirmed entry is still within the chase allowance.
7. `INVALIDATED` — the raw level is lost, recrosses exceed policy, or the bounded retest window expires.

### Full-session lifecycle reconstruction

The execution context now retains up to all 78 completed five-minute RTH candles instead of only the latest 12. This lets the live dashboard and replay identify the first confirmation, a later raw-level failure, and a subsequent reclaim episode even when the UI is opened after the move began. A live Discord alert still cannot be delivered retroactively for a period when no backend sender was running.

### Retest policy

- Retest window: six completed five-minute bars after confirmation; the setup expires after the sixth bar if no valid retest has held.
- Retest zone: the raw trigger through the buffered trigger plus a volatility-adjusted tolerance.
- Calls must close above the buffered trigger after touching the zone.
- Puts must close below the buffered trigger after touching the zone.
- The retest candle close itself must remain within the original maximum-chase allowance; a wide continuation candle that merely wicks through the zone is not a valid retest.
- Current price must still be on the valid side and within the post-retest chase allowance.
- Recross counting is scoped to the active confirmation episode around the buffered trigger, so an older failed breakout cannot permanently block a later clean reclaim.
- The original breakout-volume check remains active.
- The full risk and contract pipeline reruns from the current retest-qualified price.

### No-chase protection retained

The patch does not widen the chase threshold or send a late breakout entry. It creates a second, bounded opportunity only after a valid retest.

## UI changes

The Trade Plan page now exposes:

- Raw Trigger Crossed.
- Current Quote Beyond Raw Trigger.
- Actionable Entry Confirmed.
- Confirmation Candle and close.
- Confirmation Extension.
- Maximum Observed Close Extension.
- Maximum Chase Distance.
- Current Extension.
- Retest Required, Observed, and Held.
- Retest Zone.
- Retest Candle and close.
- Retest-window progress.
- Post-Retest Chase.

The ambiguous `Trigger Satisfied` label is replaced by `Entry Qualification Passed`.

## Replay and capture

No new persistence table is required. Existing point-in-time decision-cycle capture stores each full Assembly snapshot, including the new lifecycle fields. Exact and historical-underlying replay call the same deterministic trigger-confirmation function, so the retest logic is replayable without a separate backtest-only rule set.

## Discord behavior

`WAITING_FOR_RETEST` remains non-actionable and is not posted to Discord. Existing V1.5.2/V1.5.3 semantic deduplication and exclusive-sender protections remain unchanged.

## Unchanged areas

- GEX/DEX remain research/context-only.
- No order execution.
- No account permissions added.
- No dependency changes.
- No environment-variable changes.
- No Prisma schema or migration changes.
