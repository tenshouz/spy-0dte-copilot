# SPY 0DTE Copilot V1.4.0 Release Notes

## Release objective

V1.4.0 is the **Execution Quality and False-Trigger Reduction** milestone. It applies the first recommended implementation sequence from the full trading-logic audit.

No claim is made that this release increases live win rate. The changes are designed to remove identifiable failure modes and to create the data needed for honest out-of-sample validation.

## Implemented

- Raw quote/candle/options timestamp-integrity model with fail-closed skew handling.
- Recent completed five-minute candles carried into Market State.
- `TRADE_PLAN_V3` trigger lifecycle with dynamic buffer, completed-close confirmation, maintenance, retest recognition, recross limit, volume participation, and anti-chase control.
- Material-versus-minor counterevidence policy.
- Capped execution-quality feature families; score is labeled uncalibrated and not a probability.
- `EXPOSURE_CONFIRMATION_V2`; GEX/DEX remain descriptive context and cannot change confidence or eligibility.
- `RISK_V2` setup-specific buffered invalidation, opening-range extension targets, gamma-wall target context, and advisory time-risk policy.
- `CONTRACT_V2` preflight, stricter freshness/spread/depth/activity/delta requirements, and conservative option-premium scenario reward/risk.
- Assembly and UI diagnostics for trigger confirmation and separate option reward/risk.
- Alert text and stable keys updated for confirmation lifecycle.
- Additive deterministic decision-cycle database audit with duplicate suppression.
- Safe backend `.env.example` restored.
- Focused pure-logic fixtures and tests for the V1.4 decision pipeline.

## Database migration

This release adds one table and requires:

```powershell
npx prisma migrate deploy --schema apps/server/prisma/schema.prisma
npx prisma generate --schema apps/server/prisma/schema.prisma
```

No new npm dependency was added, so `npm install` is not required merely to apply V1.4.0 when the existing installation is intact. Run it if `node_modules` is missing or the package lock has not previously been installed.

## Safety boundary

The application remains read-only decision support. It does not create, route, modify, or execute orders. Full-premium loss remains possible in 0DTE options, and option scenario values are estimates rather than guaranteed exits.

## Validation completed in the isolated audit environment

- Shared TypeScript validation passed.
- Web TypeScript validation passed.
- Server TypeScript reached only the pre-existing missing generated Prisma-client limitation.
- 90 focused V1.4 trading-pipeline assertions passed:
  - Trade Plan: 15
  - Exposure context: 8
  - Risk: 13
  - Contract: 19
  - Assembly: 8
  - Decision-cycle audit: 5
  - Alert candidate: 22

Additional existing pure service suites passed during the broader sweep. Prisma-dependent suites could not load in the isolated environment because the generated Prisma client binary was unavailable. Generate Prisma locally before running the complete verification suite.
