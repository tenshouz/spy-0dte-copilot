# V1.9.1 — Contract Selection and Planned Risk Correction

## Purpose

V1.9.1 corrects a mismatch between the intended trading policy and the earlier contract-sizing implementation. The policy has always distinguished a maximum **$150 option premium** from a maximum **$50 planned structural loss**. Earlier sizing treated the entire debit as the normal risk amount, which could reduce one-contract capacity to zero for an otherwise acceptable $100–$150 SPY 0DTE contract.

This release keeps full-premium exposure visible and conservative while using modeled structural loss for normal risk capacity.

## CONTRACT_V3 bounded candidate selection

After a completed-candle SPY trigger qualifies, `CONTRACT_V3` evaluates at most three returned same-day contracts on the required side:

1. the effective ATM strike;
2. the immediately adjacent returned strike below it; and
3. the immediately adjacent returned strike above it.

The effective ATM strike remains the nearest returned strike to SPY, with the lower strike winning an exact-distance tie. The selector never searches a fourth or farther strike merely to force affordability or qualification.

Every candidate must pass the existing source, freshness, source-skew, spread, displayed-size, activity, delta, multiplier, and conservative option-scenario gates, plus:

- premium debit no greater than **$150**; and
- modeled planned structural loss no greater than **$50**.

Passing candidates are ranked deterministically by:

1. estimated spread/execution cost;
2. delta distance from approximately 0.55;
3. displayed quote depth and trading activity;
4. conservative option reward-to-risk;
5. lower premium; and
6. stable strike/symbol tie-breakers.

The response preserves candidate role, metrics, and rejection reason codes so `NO_QUALIFIED_CONTRACT` is explainable rather than opaque.

## SIZING_V2 risk separation

V1.9.1 explicitly separates four references:

- **Premium debit / capital committed:** selected Ask × 100.
- **Catastrophic full-premium exposure:** the debit that could be lost if the option becomes worthless or an exit cannot be executed.
- **Planned structural loss:** the conservative estimated Ask-entry to Bid-exit loss when SPY reaches the approved structural invalidation.
- **Premium-loss backstop:** the executable Bid level corresponding to a **$50 loss from the actual manual entry price**.

Normal risk capacity uses planned structural loss. Capital capacity uses the premium debit. Both must fit policy, and the initial quantity remains one contract.

A typical qualifying reference may therefore be:

- Ask: $1.40;
- debit/full-premium exposure: $140;
- modeled Bid at SPY invalidation: $0.95;
- planned structural loss: $45; and
- hard $50 loss backstop from a $1.40 actual entry: $0.90 executable Bid.

The full $140 remains disclosed as possible catastrophic exposure. It is not misrepresented as a guaranteed $45–$50 maximum outcome.

## Exit management

SPY structural invalidation remains the primary thesis stop. The Workspace also emits a deterministic manual-exit prompt when the live executable option Bid implies a loss of at least $50 from the recorded actual entry price. The first applicable condition governs, with structural invalidation retaining higher priority when both are true.

The backstop:

- uses the actual manually recorded entry price;
- uses the live executable Bid rather than midpoint or last;
- creates a paper-equivalent management event only; and
- never creates, modifies, routes, or closes a broker order.

## Safety and research boundaries

- Missing or invalid planned-risk inputs fail closed.
- Wider spreads, stale quotes, weak liquidity, and unsupported delta are not relaxed.
- The selector remains bounded and cannot roam through cheap far-OTM strikes.
- Ask-entry/Bid-exit execution assumptions remain conservative.
- Actual fills and losses can exceed modeled planned risk because of gaps, spread expansion, latency, fast 0DTE convexity, or failure to exit.
- Manual overrides must remain explicitly labeled and separately evaluated.

## Data and migration impact

No database migration is required. Existing persistence models already retain the policy, contract, position, mark, lifecycle, and audit state needed for this correction. Shared API schemas and methodology identifiers are versioned to distinguish new V1.9.1 records from historical `CONTRACT_V2` / `SIZING_V1` records.
