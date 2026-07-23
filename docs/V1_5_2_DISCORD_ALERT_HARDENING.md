# V1.5.2 Discord Alert Hardening

## Problem reproduced

The prior alert key included rapidly changing fields. A waiting CALL setup could therefore generate a sequence like:

```text
WAITING_FOR_TRIGGER at 748.23
WAITING_FOR_TRIGGER at 748.24
WAITING_FOR_TRIGGER at 748.25
```

Each item was practically the same setup but technically a different key. Confidence and exposure changes could also alter the key. In addition, browser foreground delivery and persistent backend automation could compete.

## Semantic episode model

Candidate identity is now semantic, and the transition engine assigns a sequence-backed episode ID. The combined identity is:

```text
SPY | market date | EPISODE_n | direction | setup type | category | lifecycle
```

Examples:

```text
SPY|2026-07-22|CALLS|VWAP_RECLAIM_BREAKOUT|WAITING_FOR_TRIGGER|ARMED
SPY|2026-07-22|CALLS|VWAP_RECLAIM_BREAKOUT|PLAN_READY|READY
```

Moving prices and explanatory values are payload updates, not episode identity.

## Outbound event policy

### Sent to Discord

- Initial or changed `PLAN_READY` event.
- `NO_QUALIFIED_CONTRACT` after the underlying setup qualifies.
- A previously READY plan becoming non-ready.

### Dashboard and capture only

- `WAITING_FOR_TRIGGER`.
- `SETUP_NOT_QUALIFIED`.
- Minor trigger, target, invalidation, confidence, exposure, or contract refreshes.
- Candidate clear state maintenance.

## Clear behavior

An active episode is not cleared until three consecutive evaluations contain no candidate. This filters one-poll source gaps. A clear does not send Discord. The same setup returning inside the reappearance cooldown restores the prior episode silently; after the cooldown it receives a new episode ID. A READY withdrawal also opens a new attempt episode for any later requalification.

## Duplicate layers

1. Semantic candidate key equality.
2. Transition fingerprint history for the current market date.
3. Shared process fingerprint claim across server delivery paths.
4. Server-side foreground suppression when persistent backend Trade Plan alerts are active.
5. PostgreSQL delivery-key commitment and database lease in persistent automation.

## Failure semantics

- Definite HTTP failure: release the process claim so a retry is possible.
- Timeout or network ambiguity: retain the claim and persistent automation records an ambiguous commitment where applicable, because Discord may have accepted the message even when the client did not receive a response.
- Provider success: commit state and retain the event identity as delivered.

## Operational settings

The recommended production arrangement is:

```text
Persistent Backend Automation: ON
Persistent Trade Plan Alerts: ON after V1.5.2 installation
Foreground Automatic Discord Delivery: STOPPED
One backend process
```

Point-in-time capture continues when Persistent Trade Plan Alerts are OFF.
