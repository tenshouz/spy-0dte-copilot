# V1.5.0 Verification Report

## Release

**SPY 0DTE Copilot V1.5.0 — Point-in-Time Backtesting**

Baseline: `spy-0dte-copilot-v1.4.1-empirical-gamma-research.zip`

## Verification summary

The V1.5.0 source passed the available deterministic, static, TypeScript, lint, and production-build checks in the isolated audit environment.

| Check | Result |
|---|---|
| Shared TypeScript validation | Passed |
| Server TypeScript validation | Passed |
| Frontend TypeScript validation | Passed |
| Backend service specifications | Passed: 46 files, 936 assertions |
| Route specifications | Passed: Gamma route 1 check; Point-in-Time Backtest route 7 checks |
| Frontend library specifications | Passed: 23 files, 181 assertions |
| Focused point-in-time replay coverage | Passed: replay logic, exact Assembly bundle, decision-cycle capture, route, and frontend view |
| Server production TypeScript build | Passed |
| Frontend ESLint | Passed |
| Next.js production build | Passed; all 16 static pages generated, including `/backtest` |
| Forbidden-file audit for release package | Passed on the final staged ZIP |

## Focused V1.5 safeguards verified

- Exact Market State and same-request Options Chain capture are persisted through deterministic decision-cycle storage.
- Options Chain payloads are deduplicated before decision-cycle linkage.
- Persistent Backend Automation evaluates one capture-only candidate even when Trade Plan delivery is disabled; it performs no Discord provider request in that mode.
- Replay recomputes bias, plan, risk, contract, and final Assembly from the stored historical boundary.
- Source timestamps after the replay boundary fail closed as explicit audit issues.
- Completed five-minute candles, rather than quote samples, decide target-before-stop ordering.
- A candle containing both target and stop is labeled `AMBIGUOUS_SAME_CANDLE`.
- Incomplete future capture is labeled `INSUFFICIENT_FUTURE_DATA`; the engine does not fabricate timeout, R multiple, or option P&L.
- The first `READY` observation per unique plan signature creates one episode, preventing repeated cadence snapshots from becoming duplicate trades.
- Entry uses the captured SPY price and selected-contract ask rather than a favorable midpoint assumption.
- Gamma remains a research breakdown only and cannot alter live direction, eligibility, alignment, risk, contract, sizing, or alerts.
- The inherited same-snapshot schema mismatch was corrected; the previously failing Schwab-assisted sizing suite now passes 44/44 assertions.

## Production-build note

The audit container exposes an unusually large CPU count. Next.js initially created excessive build workers and stalled during trace collection. V1.5 now caps Next.js build workers at four and explicitly constrains output-file tracing to the repository. The complete production build then passed and generated the `/backtest` page.

## Prisma limitation in the audit environment

`prisma validate` and `prisma generate` could not download the required Prisma engine because the isolated environment had no network access to `binaries.prisma.sh` (`EAI_AGAIN`). This was an environment limitation, not a reported schema validation result.

For TypeScript and deterministic service testing only, a minimal temporary Prisma module stub was placed under the local `node_modules` directory. That directory is excluded from the release package. No stub, generated engine, secret, or local database is included in the ZIP.

The user must stop the backend and run the following locally after applying V1.5.0:

```powershell
npx prisma migrate deploy --schema apps/server/prisma/schema.prisma
npx prisma generate --schema apps/server/prisma/schema.prisma
```

A live database migration and end-to-end persistence run were not possible in the isolated audit environment.

## Dependency note

No dependency or environment-variable name changed in V1.5.0. The clean install used for verification reported two moderate dependency advisories inherited from the existing lockfile; this release does not claim to remediate them.

## Research limitation

V1.5.0 does not claim a higher win rate or profitable expectancy. Exact replay begins only after the V1.5 migration is active and complete decision cycles are captured. Earlier inputs are not reconstructed, and a licensed historical Options Chain source is intentionally deferred.
