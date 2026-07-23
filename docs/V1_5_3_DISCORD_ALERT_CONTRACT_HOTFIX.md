# V1.5.3 Discord Alert Contract Hotfix

## Problem

The V1.5.2 service correctly blocked non-actionable or duplicate Discord sends, but the shared response validator recognized only one kind of non-delivery. Valid safety paths threw before returning a response.

## Accepted non-delivery states

For `NO_EMITTED_TRANSITION`, V1.5.3 permits only:

1. **Owner gate before evaluation:** no transition and no committed state.
2. **Transition suppression:** `SUPPRESSED`, no event.
3. **Delivery-layer filtering/deduplication:** `EMIT`, event present, state committed, no provider request.

All three are non-retryable and never call Discord.

## Safety invariants

- A provider request cannot be hidden as `NO_EMITTED_TRANSITION`.
- An emitted transition cannot be filtered without committing the deduplication state.
- An unavailable transition cannot be mislabeled as a normal no-delivery result.
- Persistent capture continues independently of Discord delivery.
