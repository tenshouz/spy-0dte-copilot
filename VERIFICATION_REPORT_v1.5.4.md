# Verification Report — V1.5.4 Trigger Lifecycle & Retest Recovery

## Baseline integrity

- Uploaded baseline: `spy-0dte-copilot-current-sanitized-20260722-161435.zip`
- Expected SHA-256: `6a200e7e97c612c985b076146c54f34a93c70b871d3e316d48aecb08a57b2bf8`
- Calculated SHA-256: matched exactly.

## Completed in the packaging environment

- Package and workspace versions verified as `1.5.4`.
- All 329 non-declaration TypeScript/TSX implementation and specification files passed TypeScript syntax transpilation.
- `scripts/verify-v1.mjs` passed Node syntax validation.
- Nine JSON files parsed successfully.
- Changed trade-plan logic passed an additional semantic TypeScript check with local dependency stubs.
- Trigger-lifecycle runtime smoke: 6 passed, 0 failed:
  - Immediate Calls confirmation becomes `READY`.
  - Extended confirmation becomes `WAITING_FOR_RETEST`, not `INVALIDATED`.
  - Held Calls retest becomes `RETESTED` and qualifies.
  - A completed raw-level loss followed by a clean reclaim starts a new eligible episode.
  - An unresolved retest expires after six completed post-confirmation bars.
  - Puts use the symmetric retest lifecycle.
- Full-session execution-context smoke: retained all 78 completed five-minute RTH candles.
- Trade Plan presentation/static specification: 12 passed, 0 failed.
- A wide continuation candle that merely overlaps the retest zone is explicitly prevented from qualifying when its close remains beyond the maximum-chase allowance.
- Active-episode recross logic was verified so a prior failed breakout does not permanently block a later clean reclaim.
- Archive integrity, forbidden-file scan, source-manifest verification, and final ZIP SHA-256 verification are performed during release packaging.

## Dependency-backed verification limitation

The sanitized upload intentionally contains no `node_modules`. A fresh dependency installation could not be completed in the isolated packaging environment because registry access failed. Therefore the full dependency-backed repository suite, Prisma-dependent services, server production build, frontend lint, and Next.js production build were not claimed as completed here.

Run the following in the user's existing internet-connected project after applying V1.5.4:

```powershell
npm run verify:v1
```

Focused checks:

```powershell
npx --no-install tsx apps/server/src/services/trade-plan.spec.ts
npx --no-install tsx apps/server/src/services/trade-plan-assembly.spec.ts
npx --no-install tsx apps/server/src/services/market-context.spec.ts
npx --no-install tsx apps/web/src/lib/trade-plan-assembly-view.spec.ts
```

## Compatibility

- No dependency change.
- No environment-variable change.
- No Prisma schema change.
- No database migration.
- No account or order permission added.
- V1.5.2/V1.5.3 Discord alert hardening is retained.
