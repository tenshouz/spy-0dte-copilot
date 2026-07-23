# SPY 0DTE Copilot V1.5.3 Release Notes

**Release:** V1.5.3 Discord Alert Contract Hotfix  
**Baseline:** V1.5.2 Discord Alert Hardening  
**Scope:** Correct the Discord non-delivery response contract without widening outbound alert behavior

## Defect corrected

The V1.5.2 delivery service used `NO_EMITTED_TRANSITION` for several legitimate fail-closed outcomes, but the shared Zod response schema accepted only a transition whose state was `SUPPRESSED`. Three valid paths therefore threw a `ZodError`:

1. Persistent backend automation blocked a competing foreground sender before candidate evaluation, leaving `transition: null`.
2. A non-actionable `WAITING_FOR_TRIGGER` transition was evaluated and committed but intentionally filtered from Discord, leaving an `EMIT` transition with an event.
3. A process-wide fingerprint claim blocked a competing sender after transition evaluation, also leaving a committed `EMIT` transition with an event.

## Contract after the fix

`NO_EMITTED_TRANSITION` is accepted only when no provider request was attempted and no retry is eligible, and one of these conditions is true:

- No transition evaluation occurred and no transition state was committed.
- The transition engine returned `SUPPRESSED` with no event.
- The transition engine returned `EMIT` with an event, but the delivery layer intentionally filtered or deduplicated it and committed transition state.

Unavailable transitions, provider attempts, retryable outcomes, and uncommitted emitted transitions remain invalid.

## Unchanged behavior

- Routine `WAITING_FOR_TRIGGER` and `SETUP_NOT_QUALIFIED` updates are not posted.
- Persistent backend automation remains the exclusive sender when enabled.
- Process-wide duplicate fingerprints remain blocked.
- READY, qualified no-contract, and READY-withdrawal events retain the V1.5.2 policy.
- Point-in-time capture and backtesting are unchanged.
- No orders are created or executed.

## Installation impact

- No dependency changes.
- No environment-variable changes.
- No Prisma schema changes.
- No migration.
- Restart backend and frontend after copying the files.
