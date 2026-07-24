# V1.7.0 — Modular Setup Registry and Opportunity Consolidation

## Purpose

V1.7.0 introduces a versioned registry for the approved setup families while preserving the existing validated Trade Plan Assembly as the source for live setup eligibility.

## Registry

The registry contains exactly 14 setup families:

1. Opening-range breakout.
2. VWAP reclaim.
3. VWAP loss.
4. Breakout-retest continuation.
5. Failed bullish-break reversal.
6. Failed bearish-break reversal.
7. Bullish trend pullback.
8. Bearish trend pullback.
9. Bullish continuation base.
10. Bearish continuation base.
11. Range-low mean reversion.
12. Range-high mean reversion.
13. Gap-and-go continuation.
14. Gap-fill reversal.

The four setup families already supported by the validated legacy engine are live. The ten newly introduced families begin in `SHADOW` and cannot create READY alerts or positions.

## Opportunity rules

- Stable setup-episode identities use market date, setup, direction, level type, a five-cent level bucket, and confirmation context.
- Routine one- or two-cent recalculations do not create a new episode.
- Duplicate candidates in the same episode are consolidated deterministically.
- Opposite live directions that remain unresolved fail closed as `NO_TRADE`.
- Shadow observations remain visible for research but are excluded from risk, alerts, Discord, and position creation.
- An assembly cannot become live-eligible unless it satisfies the stricter V1.6 premium, risk, and both reward/risk controls, even when an older upstream selector labels it READY.

## Promotion

Shadow promotion requires an explicit code change and validation review. No setup is promoted automatically from a small sample or a favorable short-term result.
