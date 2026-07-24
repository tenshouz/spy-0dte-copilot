# V1.6.0 — Trading Policy, Risk Ledger, and Position Foundation

## Purpose

V1.6.0 makes the approved trading rules executable, versioned, auditable, and persistent without adding broker order submission. `TRADING_POLICY_V1` is the single policy authority for workspace eligibility and manual paper-equivalent position recording.

## Locked controls

- Paper-equivalent account: $1,000.
- Maximum contract premium: $150.
- Maximum planned structural loss: $50 per trade.
- Maximum daily loss: $150, calculated as realized losses plus open planned risk.
- Maximum trades: 3 per New York market date.
- Stop after 2 consecutive losses; breakeven neither increments nor resets the streak.
- Maximum concurrent positions: 1.
- Maximum initial quantity: 1 contract.
- Maximum attempts per setup/direction/level episode: 2.
- Latest new entry: 3:00 p.m. America/New_York.
- Mandatory normal exit: 3:55 p.m.; absolute deadline before 4:00 p.m.
- Minimum underlying and option-premium reward/risk: 1.5:1.
- Preferred reward/risk: 2.0:1 or better.
- Conservative modeled execution: ask-side entry and bid-side exit.
- Manual confirmation required for every paper-equivalent entry and exit.

## Persistence

The migration adds day ledgers, positions, attempts, READY alerts, event restrictions, runtime state, delivery events, position marks, and manual overrides. Database constraints enforce one open position, one active READY alert, one contract, maximum $50 planned risk, and two attempts per setup episode.

## Safety behavior

- No route submits a Schwab order.
- Policy limits are rechecked inside the entry transaction.
- Entry and exit transactions use PostgreSQL advisory locks.
- READY alerts must still be active, unexpired, and source-compatible at confirmation time.
- Manual overrides are audit records only; they do not bypass hard policy controls.
- Actual user-entered performance is stored separately from conservative engine performance.
