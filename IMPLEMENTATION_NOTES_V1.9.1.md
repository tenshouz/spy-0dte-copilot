# SPY 0DTE Copilot V1.9.1 Implementation Notes

## Purpose

V1.9.1 corrects the contract-selection and position-sizing interpretation discussed for the paper-equivalent SPY 0DTE workflow. The system now distinguishes capital committed from the planned structural loss instead of treating the full option debit as the sizing risk.

## Implemented behavior

### CONTRACT_V3 — bounded nearby-contract selection

- Evaluates only the effective ATM strike and the immediately adjacent returned strike on each side for the selected Call or Put direction.
- Never searches a fourth or farther strike merely to force affordability or qualification.
- Preserves hard freshness, source-skew, standard-contract, multiplier, spread, displayed-size, activity, delta, and modeled option reward-to-risk gates.
- Applies the locked `$150` maximum premium limit.
- Applies the locked `$50` maximum modeled structural-loss limit using conservative Ask-entry and modeled Bid-side invalidation value.
- Ranks selectable candidates by execution cost, delta proximity to `0.55`, displayed depth, volume, open interest, modeled option reward-to-risk, premium, and deterministic tie-breakers.
- Returns candidate-level diagnostics and rejection reason codes so the UI can explain why each nearby contract passed or failed.

### SIZING_V2 — planned risk separated from full debit

- Capital capacity uses the selected contract Ask multiplied by `100`.
- Planned-risk capacity uses the modeled option loss at the SPY structural invalidation.
- The full premium remains visible as catastrophic exposure and is not represented as the normal planned loss.
- Zero contracts remains a valid fail-closed result when the premium, planned risk, cash, policy, or required source data does not qualify.

### Manual loss protection

- The SPY structural invalidation remains the primary exit condition.
- A separate `$50` Bid-side option-loss backstop is evaluated from the actual paper-equivalent entry price.
- The first condition reached—structural invalidation or the premium-loss backstop—produces an urgent manual-exit prompt.
- No broker order is created, submitted, modified, cancelled, or closed.

### Product surfaces and contracts

- Trade Plan displays the bounded candidate set, ranking, rejection reasons, premium debit, planned structural risk, and catastrophic full-premium exposure.
- Workspace displays the live Bid-side backstop reference and can record `PREMIUM_LOSS_BACKSTOP` as a paper-equivalent exit reason.
- Schwab-assisted sizing, shared schemas, Assembly, Guide, System Readiness, release metadata, and release documentation were updated to the V1.9.1 contracts.

## Methodology versions

- Product release: `1.9.1`
- Contract selection: `CONTRACT_V3`
- Reference sizing: `SIZING_V2`
- Schwab-assisted sizing: `SCHWAB_ASSISTED_SIZING_V2`
- Trading policy remains `TRADING_POLICY_V1`; its locked dollar limits are unchanged.

## Persistence and migration

No Prisma schema or database migration is required. Existing policy, opportunity, READY, position, mark, exit, and audit models can retain the revised versioned payloads and lifecycle events.

## Verification performed in this environment

- Static V1.9.1 release/source audit passed.
- `git diff --check` passed.
- All 350 TypeScript/TSX files parsed without syntax diagnostics.
- Focused deterministic tests passed with a local TypeScript dependency-stub harness:
  - Contract selection: 28/28
  - Reference sizing: 35/35
  - Schwab-assisted sizing core logic/services: 25/25
  - Trading policy: 14/14
  - Trade Plan Assembly: 8/8
  - Trading framework structure: 8/8
  - Dashboard Guide: 13/13

## Verification limitation

The supplied sanitized archive excludes installed dependencies. This environment could not reach the npm registry, so the complete dependency-backed npm test suite, Prisma validation/generation, lint, server build, and Next.js production build were not run here. Run the project’s normal consolidated verifier after replacing the changed files in a dependency-installed local checkout.
