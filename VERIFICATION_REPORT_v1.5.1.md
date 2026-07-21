# SPY 0DTE Copilot V1.5.1 Verification Report

**Release:** V1.5.1 Historical Replay Recovery  
**Baseline:** V1.5.0 Point-in-Time Backtesting  
**Verification date:** 2026-07-21

## Result

All constituent release checks passed when run separately in the isolated audit environment. The aggregate `npm run verify:v1` command completed its static audit, full backend suite, route checks, and most of the frontend suite, but the container-level command was terminated by the audit timeout while rerunning frontend tests; no assertion failure was reported. Run the aggregate verifier locally for the final machine-specific confirmation.

## Automated checks completed

- Complete backend service suite: **47 specification files passed**.
- Complete frontend library suite: **23 specification files passed**.
- Point-in-Time Backtest route: **7 checks passed**.
- Empirical Gamma research route: **passed**.
- Shared TypeScript validation: **passed**.
- Server production TypeScript build: **passed**.
- Frontend ESLint: **passed**.
- Frontend production build: **passed**.
- Aggregate verifier: **audit-environment timeout during a duplicate frontend-suite run; no failed assertion**.
- Next.js generated **16 static pages**, including `/backtest`.

## New recovery-path coverage

The V1.5.1 tests verify:

- Summer and winter New York DST conversion.
- Historical request lookback boundaries.
- Historical replay begins only after the 15-minute opening range is complete.
- No future candle is visible at a historical decision boundary.
- A fully uncaptured historical date can produce an underlying-only replay episode.
- The 31-calendar-day provider-request limit is enforced before a provider call.
- A provider 401 receives one bounded token refresh and retry.
- A pre-V1.5 row with an invalid or missing Market State can use its frozen deterministic Assembly.
- Legacy validation errors are aggregated instead of producing one red error per stored cycle.
- Historical-underlying episodes never invent a contract or option-premium result.

## Synthetic end-to-end proof

A synthetic historical trading date produced:

- 76 completed historical replay boundaries.
- One qualified `HISTORICAL_UNDERLYING_ONLY` episode.
- An objectively graded target-first outcome.
- Null contract and null option-premium P&L, as required without historical options data.

## Boundaries not verified in this environment

- The patch was not executed against the user's private PostgreSQL data.
- A live authenticated Schwab historical request was not performed from the isolated audit environment.
- Therefore, local database contents, broker entitlements, provider retention, and account authentication must be confirmed by the user's local run.

## Safety conclusion

The implementation fails closed when historical candles cannot be obtained, does not fabricate historical options data, does not add order execution, and keeps Empirical Gamma research separate from live directional eligibility.
