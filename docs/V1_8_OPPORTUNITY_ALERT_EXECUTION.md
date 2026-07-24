# V1.8.0 — Persistent Opportunity, Alert, and Execution Foundation

## Purpose

V1.8.0 turns a qualifying consolidated opportunity into a short-lived, persistent, auditable READY lifecycle and adds conservative execution and position-management telemetry.

## READY lifecycle

- READY duration is exactly 60 seconds.
- Only one active READY alert may exist per user.
- An alert is revoked when its opportunity changes or stops qualifying.
- An alert expires at its exact timestamp and cannot be confirmed afterward.
- Manual confirmation re-evaluates the latest market state, policy, events, risk ledger, attempt count, contract, and economics.
- One READY alert may create at most one position and one attempt record.

## Contract policy

The contract selector now enforces one canonical effective ATM strike built from the returned Call and Put strike set. Exact-distance ties choose the lower strike. If the effective ATM contract is absent or fails freshness, liquidity, spread, premium-scenario, or policy checks, selection returns `NO_QUALIFIED_CONTRACT`; no farther strike is substituted.

## Execution model

- Modeled entry uses the displayed ask.
- Modeled exit uses the displayed bid.
- Spread cost is explicit.
- Commission and slippage fields are explicit and currently zero because no calibrated fee/slippage schedule is configured.
- No midpoint is represented as a guaranteed fill.
- Actual entry and exit prices are manually recorded and kept separate from modeled results.

## Position monitoring and delivery

The persistent backend monitors structural stop, Target 1, Target 2, Target 3 research, 15-minute review, 3:55 mandatory exit, and the absolute deadline. It records crossed boundaries, but only the deterministic highest-priority event in an evaluation is actionable for Discord. Informational and research-only events are suppressed from Discord and remain in the audit trail.
