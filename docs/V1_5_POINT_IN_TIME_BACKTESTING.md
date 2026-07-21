# V1.5.0 Point-in-Time Backtesting Methodology

## Objective

V1.5.0 determines what the dashboard's deterministic engine would produce at a past captured boundary and then grades what occurred afterward. It is designed to prevent hindsight from entering the plan.

## Source capture

Each useful deterministic decision cycle can now retain:

1. The complete `SpyZeroDteDeterministicMarketStateResponse`.
2. The complete normalized current-date SPY Options Chain, when fetched.
3. The final Trade Plan Assembly.
4. Source and capture timestamps.

Options Chain payloads are deduplicated by user, market date, and provider `fetchedAt` timestamp. Decision cycles reference the stored chain row instead of duplicating the payload on every cadence.

## Capture cadence

Any normal Assembly request performs best-effort capture. Persistent Backend Automation also evaluates a candidate each enabled automation cadence even when Trade Plan alert delivery is disabled or Discord is not configured. This allows research capture without requiring outbound alerts.

The backend and database must remain available. V1.5 cannot capture while the computer or backend is off.

## Replay clock and no-look-ahead audit

The replay boundary is the decision cycle's stored `sourceCalculatedAt`. Before recomputation, the engine validates:

- Market State schema.
- Options Chain schema when present.
- Market State calculation and context timestamps.
- Quote timestamp.
- raw snapshot assembly, quote, candle, and Options Chain timestamps.
- execution-candle fetch timestamp.
- every completed five-minute candle end.
- every stored option quote/trade timestamp.

Any timestamp after the boundary disqualifies that cycle from replay and creates an explicit audit issue.

## Plan recomputation

The source Market State and Options Chain are passed through the current deterministic modules at the historical boundary:

1. Bias.
2. Conditional Trade Plan.
3. Objective/Risk framework.
4. Contract selection.
5. Trade Plan Assembly.

The stored final Assembly is retained for audit, but the test recomputes the plan so current rules can be evaluated against historical captured inputs.

This means a V1.5 backtest answers: **How would the currently installed deterministic rules have evaluated the data that existed at that stored time?**

## Episode construction

An episode begins at the first recomputed `READY` Assembly for a unique signature consisting of:

- Market date.
- Direction.
- Setup type.
- Buffered trigger.
- Invalidation.
- Primary objective.
- Selected contract.

Repeated captures of the same plan do not create repeated trades.

## Entry assumptions

- Entry time: source decision-cycle boundary.
- Underlying entry: captured current SPY price.
- Option entry: captured selected-contract ask.
- Contract multiplier: captured multiplier, normally 100.

No midpoint fill is assumed for entry.

## Outcome ordering

Future completed five-minute candles are deduplicated by candle time and evaluated in chronological order.

For Calls:

- Target hit when candle high reaches or exceeds the objective.
- Stop hit when candle low reaches or falls below invalidation.

For Puts the rules are symmetric.

When both levels occur within the same candle, the result is `AMBIGUOUS_SAME_CANDLE`. V1.5 does not infer intrabar order.

Future quote samples can contribute to MFE and MAE. A quote sample cannot decide target-before-stop ordering.

## Future coverage

An unresolved episode is labeled `TIMEOUT` only when the stored future observations reach the selected hold boundary within the fixed tolerance. It is labeled `SESSION_END` only when capture reaches the official supported NYSE session close. Otherwise it is `INSUFFICIENT_FUTURE_DATA`.

Incomplete capture never receives fabricated realized points, R multiple, or option P&L.

## Option outcome estimate

The preferred exit reference is the first captured bid for the same contract at or after outcome resolution and within 90 seconds. If unavailable:

- Target-first may use the contract engine's stored objective-premium scenario.
- Stop-first may use the stored invalidation-premium scenario.
- Other outcomes remain unavailable unless an observed bid exists.

All option results are estimates. They do not model partial fills, hidden liquidity, fees, or every possible path-dependent IV change.

## Research outputs

Each episode records:

- Frozen source Assembly summary and plan snapshot.
- Setup and direction.
- Entry, invalidation, objective, and planned reward/risk.
- Contract and entry premium.
- Outcome state and resolution time.
- MFE and MAE.
- Underlying result and R multiple.
- Estimated option P&L and source type.
- Execution-quality alignment score.
- Gamma regime and nearest Gamma-cliff distance when captured.

## Gamma guardrail

Gamma remains context-only. V1.5 reports outcomes by Gamma regime but does not use those observations to change direction, eligibility, confidence, trigger, risk, contract, sizing, or alerts.

A future calibrated release may promote a Gamma relationship only after a predefined chronological development, validation, and untouched holdout protocol.

## Known limitations

- Exact history starts after the V1.5 migration and capture are active.
- No licensed historical Options Chain dataset is connected.
- The most recent stored execution context contains a rolling candle window, not a full raw tick tape.
- Five-minute OHLC cannot determine intrabar order.
- Option P&L estimates are not executable fill records.
- Current-rule recomputation is not the same as version-pinned historical-rule replay; version pinning is a V1.6 priority.
- Backtest performance does not guarantee future results.
