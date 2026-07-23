# V1.5.2 Implementation Summary

V1.5.2 permanently hardens deterministic Trade Plan Discord delivery against semantic duplicates, exact duplicate senders, and transient candidate gaps.

## Trading-engine boundary

No trading-rule calculation changed. The patch is isolated to:

- Candidate identity.
- Transition state maintenance.
- Discord delivery eligibility.
- Sender ownership and duplicate suppression.
- User-facing automation status copy.

Price structure, direction, confidence calculation, trigger confirmation, invalidation, targets, option qualification, sizing, historical replay, and Gamma research remain unchanged.

## Candidate identity changes

`stableCandidateKey` no longer includes floating numerical or quote fields. It is derived from market date, direction, setup type, category, and semantic lifecycle. This converts a stream of near-identical recalculations into one persistent setup episode.

## Transition-state changes

`TradePlanAlertTransitionMemoryState` now stores:

- `consecutiveMissingCandidatePolls`.
- A bounded `emittedTransitionFingerprints` history.
- `activeEpisodeId`, `lastClearedEpisodeId`, and `nextEpisodeSequence`.

Candidate clearing requires three consecutive misses. Clear events are state maintenance only and are not emitted. Same-key restoration inside the reappearance cooldown is silent. A longer absence starts a new sequence-backed episode. Withdrawal of a READY plan starts a fresh attempt episode so later requalification remains alertable without reusing the prior delivery key.

## Delivery-policy changes

`isDiscordTradePlanTransitionDeliverable` permits only READY, NO_QUALIFIED_CONTRACT, or withdrawal of a previously READY plan. Routine waiting and not-qualified transitions are committed to state but do not call Discord.

A backend-process claim map prevents two routes in one process from sending the same fingerprint. The foreground sender also checks persistent backend settings and exits before candidate evaluation whenever persistent Trade Plan delivery is active.

The persistent scheduler still uses:

- A database lease for one active scheduler owner.
- PostgreSQL delivery keys for delivered or ambiguous provider outcomes.
- Delivery history logging.

## Compatibility

Old persisted transition state remains compatible. Missing new fields normalize to zero and an empty fingerprint history. No migration is required.
