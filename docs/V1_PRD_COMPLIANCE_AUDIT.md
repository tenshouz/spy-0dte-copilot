# SPY 0DTE Copilot V1.9.0 PRD Compliance Audit

## Release conclusion

The local SPY-only V1.9.0 implements deterministic decision support, manually confirmed paper-equivalent lifecycle recording, persistent risk controls, research separation, operational readiness, and recovery tooling without broker execution.

## Implemented capabilities

| Area | V1.9.0 implementation |
|---|---|
| Market data | Backend-only Schwab OAuth, encrypted tokens, normalized SPY quote/candles/options, source freshness, bounded caches, timeouts, backoff, and in-flight deduplication |
| Deterministic source engines | Session structure, VWAP, levels, expected move, GEX/DEX proxies, Market Context/State/Bias, Trade Plan, strict effective-ATM contract selection, and same-snapshot Assembly |
| Trading policy | Versioned `TRADING_POLICY_V1` with $1,000 account, $150 premium, $50 planned risk, $150 daily loss, 3 trades, 2 losses, one position/contract, two attempts, time/event gates, 1.5:1 minimum R:R, and Target 2 primary exit |
| Persistence | Day ledgers, positions, attempts, READY alerts, restricted events, Workspace runtime, lifecycle events, marks, and manual overrides with database constraints and transaction locks |
| Setup registry | 14 independent families; 4 live bridges and 10 shadow-only families; explicit promotion status and analytics boundary |
| Opportunity layer | Stable setup episodes, duplicate consolidation, fail-closed direction conflicts, strict policy eligibility, and no farther-strike contract fallback |
| Lifecycle | 60-second READY expiration/revocation, manual entry/exit confirmation, audited overrides, ask-entry/bid-exit modeling, and user-executed versus pure-engine separation |
| Monitoring and Discord | Persistent backend ownership, runtime lease/heartbeat, deterministic management-event priority, deduplication, and actionable-only delivery |
| Research | Target 1/2/3 and time-review comparison, Gamma/volatility research-only context, Journal analytics, replay, and point-in-time backtesting |
| Product UX | Trading Workspace, current Dashboard Guide, V1.9.0 System Readiness, five-component explicit probe, current page descriptions, and shared release metadata |
| Operations | Verification script, Prisma deployment, source hygiene checks, backup/recovery runbook, request IDs, graceful shutdown, restrictive CORS, headers, bounded bodies, and write-rate limiting |

## Safety boundaries

- No order execution, routing, preview, modification, or brokerage write endpoint exists.
- Every paper-equivalent entry and exit requires explicit manual confirmation.
- Manual overrides require reasons and remain separated from pure-engine results; they do not bypass hard transaction controls.
- GEX/DEX and newer setup families cannot create direction or bypass eligibility.
- Shadow setups cannot create live opportunities, READY alerts, positions, or actionable Discord events.
- CPI, Employment Situation/NFP, and FOMC are full-day blocks; other major events use explicit windows.
- The nearest effective-ATM strike must qualify; no farther strike is substituted.
- Modeled execution uses ask-side entry and bid-side exit.
- Secrets, tokens, account identifiers, raw provider bodies, and private balances are excluded from user-facing readiness and audit payloads.
- Historical decision inputs remain separated from later outcome data.

## Known intentional limitations

- Single local user and SPY only.
- Backend and PostgreSQL must remain running for persistent monitoring.
- Provider/open-interest limitations remain honestly disclosed.
- Exact option-chain backtesting is limited to captures stored after capture support was installed.
- Ten setup families remain shadow-only pending independent samples and promotion review.
- The 15-minute rule is a review, not an automatic exit.
- No cloud tenancy, public authentication, billing, or broker execution is included.
