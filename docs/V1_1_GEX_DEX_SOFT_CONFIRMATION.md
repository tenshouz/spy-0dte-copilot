# V1.1 GEX/DEX Soft Confirmation Methodology

## Purpose

V1.1 makes the existing returned-window GEX and DEX analytics materially useful inside the Trade Plan while preserving the price-structure eligibility engine. Exposure data is a confidence modifier and conflict label, never a directional signal or eligibility gate.

## Fixed component weights

| Component | Supportive | Conflicting | Partial-source multiplier |
|---|---:|---:|---:|
| GEX regime | +8 points | -8 points | 50% |
| DEX regime | +6 points | -6 points | 50% |
| Primary directional wall within 1% of SPY | +4 points | -4 points | 50% |

The maximum adjustment is +18 or -18 confidence points. Final plan confidence is clamped to 0–100.

## Directional interpretation

For a Calls thesis, Call-dominant GEX and positive DEX are supportive. Put-dominant GEX and negative DEX are conflicting. A primary Call Wall above SPY and within 1% is supportive; a nearby Call Wall below SPY is conflicting.

For a Puts thesis, Put-dominant GEX and negative DEX are supportive. Call-dominant GEX and positive DEX are conflicting. A primary Put Wall below SPY and within 1% is supportive; a nearby Put Wall above SPY is conflicting.

Balanced regimes and walls farther than 1% are neutral. Missing exposure data leaves structural confidence unchanged.

## Output states

- `SUPPORTIVE`: one or more supportive components and no conflicts
- `CONFLICTING`: one or more conflicts and no support
- `MIXED`: supportive and conflicting components coexist
- `NEUTRAL`: all usable components are neutral
- `NOT_APPLICABLE`: no structural direction exists
- `UNAVAILABLE`: no usable exposure structure exists

## Safety boundaries

- Exposure cannot create a Calls or Puts direction.
- Exposure cannot pass or fail any Trade Plan eligibility gate.
- Exposure cannot alter the trigger, invalidation, objective, reward-to-risk requirement, or contract-liquidity rules.
- GEX/DEX remain returned-chain-window analytical proxies, not observed dealer inventory.
- Open interest may be stale intraday.
- No order is created or executed.

## Downstream behavior

The adjusted confidence and exposure state appear on the Trade Plan page, deterministic scheduled reports, and alert-candidate text. Alert deduplication includes the categorical exposure state so a material shift such as supportive to conflicting can produce a new transition, while small numerical changes within the same state do not create repeated alerts.
