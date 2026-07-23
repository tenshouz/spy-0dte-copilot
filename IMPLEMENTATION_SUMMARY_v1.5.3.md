# SPY 0DTE Copilot V1.5.3 Implementation Summary

## Root cause

`DiscordTradePlanAlertDeliveryResponseSchema` encoded the pre-hardening assumption that every `NO_EMITTED_TRANSITION` response must contain a `SUPPRESSED` transition. V1.5.2 added delivery-layer filtering and ownership gates, creating additional legitimate non-delivery shapes that the service produced but the schema rejected.

## Code change

Modified `packages/shared/src/schemas.ts` so the `NO_EMITTED_TRANSITION` refinement validates the actual delivery-layer contract:

- Always rejects provider requests and retryable responses.
- Accepts `transition: null` only when no transition state was committed.
- Accepts a `SUPPRESSED` transition with no event.
- Accepts a committed `EMIT` transition with an event when delivery was filtered or deduplicated.
- Rejects every other transition state or inconsistent commit shape.

## Why the fix is narrow

The service flow, transition engine, candidate identity, setup episodes, persistent ownership, fingerprint claims, provider handling, and Discord payload policy were not changed. The patch only makes the shared response validator match the already-intended safe behavior.

## Expected regression result

`apps/server/src/services/discord-trade-plan-alert.spec.ts` should report:

- 22 passed
- 0 failed

The three previously failing cases are:

- persistent backend delivery suppresses competing foreground sender
- non-actionable WAITING transition is captured but never posted
- process-wide fingerprint claim blocks competing senders
