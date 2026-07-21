# Verification Report — V1.4.1 Empirical Gamma Research

Verification date: 2026-07-21

## Scope

V1.4.1 was verified as a narrowly scoped addition to the supplied V1.4.0 execution-quality baseline. It adds empirical Gamma research and does not intentionally change live direction, eligibility, trigger confirmation, risk, contract selection, sizing, or alert rules.

## Passed verification

- Shared TypeScript validation: passed.
- Server TypeScript validation: passed.
- Frontend TypeScript validation: passed.
- Frontend ESLint: passed.
- Server production build: passed.
- Next.js production build: passed, including all 15 static pages.
- Complete frontend suite: 22 specification files passed.
- Backend service suite excluding one documented pre-existing baseline failure: 43 specification files passed.
- Empirical Gamma and exposure-focused verification: 41 tests passed:
  - Exposure Structure: 22.
  - Empirical Gamma research logic: 10.
  - Empirical Gamma research service: 4.
  - Empirical Gamma research route: 1.
  - Frontend Gamma research view: 4.
- System readiness and release-document checks: 22 passed.
- Dashboard Guide checks: 12 passed.

## Compatibility checks

- Prisma schema is byte-for-byte unchanged from the supplied V1.4.0 ZIP.
- No migration was added.
- Dependency and development-dependency blocks are unchanged in every package.
- `package-lock.json` changes only release versions from 1.4.0 to 1.4.1.
- No environment variable was added.
- Existing V1.4.0 assemblies remain parseable because `gammaResearchContext` is optional.
- New assemblies preserve exposure context in the existing JSON snapshot field; no new database table is required.

## Live-trading isolation checks

- Gamma research responses explicitly disable automatic directional weighting.
- Candidate findings remain ineligible for live weighting.
- The research module is not imported by bias, trigger, risk, contract, sizing, or alert decision logic.
- GEX, DEX, walls, cliffs, and sign transitions remain context-only in live Trade Plan behavior.
- The new API is read-only, no-store, query-rejecting, and origin-restricted.
- No account, position-sizing, order-routing, or execution fields were added.

## Documented pre-existing baseline failure

`apps/server/src/services/trade-sizing-schwab.spec.ts` still fails its final last-resort Assembly test with:

`Risk sameSnapshotGuaranteed must match all Market-State source timestamps`

The identical failure was reproduced against the unmodified supplied V1.4.0 baseline. No file involved in that failing path was changed for V1.4.1, so it is not introduced by empirical Gamma research. It remains intentionally unfixed to preserve the user's request that this release add only empirical Gamma research.

Because the repository's full `verify:v1` script runs that pre-existing suite, the aggregate command will stop there even though the V1.4.1-specific and all other tested suites pass.

## Research limitations preserved in product output

- Outcomes are user-reviewed and observational.
- Snapshot rows are not guaranteed to represent independent trade identities.
- No multiple-comparison correction is applied.
- No causal claim or win-probability claim is made.
- Candidate states require future chronological and locked holdout validation.
- Historical V1.4.0 rows can contribute only limited legacy Gamma context.
