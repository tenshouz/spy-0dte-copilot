# SPY 0DTE Copilot V1.5.2 Release Notes

**Release:** V1.5.2 Discord Alert Hardening  
**Baseline:** V1.5.1 Historical Replay Recovery  
**Scope:** Permanent suppression of duplicate and low-value Discord Trade Plan alerts

## Why this release exists

V1.5.1 could treat ordinary live recalculations as new alert candidates. A one-cent VWAP/trigger update, a confidence refresh, an exposure-state refresh, or a selected-contract refresh could change the candidate fingerprint even though the practical state remained `WAITING_FOR_TRIGGER`. This produced repeated messages such as `WAITING_FOR_TRIGGER → WAITING_FOR_TRIGGER`, including exact duplicates from competing delivery paths.

V1.5.2 changes alert identity and delivery policy without changing live trading calculations, backtesting, risk, contract selection, GEX/DEX research, or order behavior.

## Permanent fixes

### Semantic setup identity

A Trade Plan candidate key now uses only:

- Symbol.
- Market date.
- Direction.
- Setup type.
- Candidate category.
- Meaningful trigger lifecycle state.

The key intentionally excludes:

- VWAP and trigger price.
- Confidence or alignment score.
- Exposure state.
- Contract symbol or quote.
- Invalidation and target values.
- Current market price.

Those values continue updating on the dashboard and in point-in-time captures, but they no longer manufacture a new Discord alert identity.

### Actionable-only Discord policy

Discord Trade Plan delivery is now limited to:

- A plan becoming `PLAN_READY`.
- A qualified underlying setup having `NO_QUALIFIED_CONTRACT`.
- Withdrawal or invalidation of a previously `PLAN_READY` plan.

Routine `WAITING_FOR_TRIGGER` and `SETUP_NOT_QUALIFIED` recalculations remain available on the dashboard and in replay captures but are not sent to Discord.

### Multi-poll clear confirmation

One missing candidate snapshot no longer clears an active setup. Three consecutive missing-candidate evaluations are required before the episode is cleared, and that clear is silent. If the same semantic setup returns, it is restored without a reappearance alert.

### Transition fingerprint history

The transition state remembers recent semantic fingerprints and assigns a sequence-backed episode ID. Ordinary oscillation inside one episode cannot emit the same transition repeatedly. A confirmed clear that remains absent through the reappearance cooldown starts a new episode, and withdrawal of a READY plan starts a new attempt episode so a later legitimate requalification can alert once.

### Competing-sender protection

- Persistent backend automation remains the preferred delivery owner and continues using its PostgreSQL delivery-key ledger and database lease.
- When persistent backend Trade Plan delivery is active, the foreground Discord endpoint now refuses competing browser-session delivery requests at the server layer.
- A shared backend-process fingerprint claim prevents another delivery path in the same process from posting the same event.
- Confirmed provider failures release the claim for a retry. Timeout or network ambiguity keeps the event claimed to avoid an uncertain duplicate.

## Unchanged behavior

- Persistent Backend Automation may remain enabled while Trade Plan Alerts are disabled; point-in-time capture continues.
- Scheduled Discord reports are unchanged.
- The deterministic market-state, bias, trigger, risk, contract, sizing, and backtesting engines are unchanged.
- Empirical Gamma remains research-only.
- No order is created or executed.

## Installation impact

- No npm dependency changes.
- No environment-variable changes.
- No Prisma schema changes.
- No database migration.

Copy the V1.5.2 files over V1.5.1 while preserving `.git` and `apps/server/.env`, then restart backend and frontend.

## Recommended re-enable sequence

1. Install V1.5.2.
2. Start one backend process and one frontend process.
3. Keep Foreground Automatic Discord Delivery stopped.
4. Leave Persistent Backend Automation enabled.
5. Turn Persistent Trade Plan Alerts back on.
6. Use **Evaluate now** once and confirm that routine waiting states are recorded as non-deliveries.
7. Leave the dashboard running through a normal live refresh cycle and confirm that no `WAITING_FOR_TRIGGER → WAITING_FOR_TRIGGER` Discord messages appear.
