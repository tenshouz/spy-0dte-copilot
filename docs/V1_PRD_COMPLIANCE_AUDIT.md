# SPY 0DTE Copilot V1.3.0 PRD Compliance Audit

## Release conclusion

The local SPY-only V1.3.0 is functionally complete for deterministic decision support. The repository now contains the live data pipeline, deterministic analytics, alerting, persistence, replay, reliability controls, security controls, verification tooling, and operations documentation required for a safe local release.

## Implemented capabilities

| Area | V1 implementation |
|---|---|
| Market data | Backend-only Schwab OAuth, encrypted tokens, refresh recovery, normalized SPY quote, bounded five-minute candles, current-date options chain, source freshness labels, active/off-hours refresh policy, focus/reconnect refetch, bounded cache, backoff, timeout, and in-flight deduplication |
| Session structure | Provider-aligned 07:00–09:30 ET premarket high/low, RTH VWAP, previous-session levels, gap, 5/15/30-minute opening ranges, Traditional daily/weekly pivots, NYSE holidays and early closes |
| Options analytics | ATM implied move, returned-window GEX and DEX proxies, ranked wall proxies, cumulative Gamma-balance proxy, cliffs, and DEX anchor |
| Deterministic reasoning | Market Context, Market State, bias, Trade Plan, objective risk, contract selection, and concise same-snapshot assembly; returned-window GEX/DEX structure modifies plan confidence only through a versioned soft-confirmation layer |
| Risk support | Manual and read-only Schwab-assisted sizing; no order submission |
| Reporting and alerts | Deterministic scheduled reports, candidate transitions, Discord test/manual/automatic delivery, persistent backend scheduler, lease protection, deduplication, and sanitized delivery audit |
| User onboarding | Searchable in-app Dashboard Guide, daily workflow, page-by-page feature explanations, Trade Plan state flow, data-state dictionary, alert checklist, Journal/replay explanation, glossary, and safe-sharing boundary |
| Journal | Explicit and opt-in automatic captured snapshots, user-entered outcomes, realized P&L annotations, and performance analytics |
| Replay | Persisted captured-snapshot historical replay, chronological timeline, no-look-ahead timestamp audit, and separate post-hoc outcome scorecard |
| Operations | System readiness endpoint and page, explicit provider probe, visible quote/candle data ages, stable in-place chart updates, release verification script, backup/recovery runbook, request IDs, graceful shutdown, bounded bodies, restrictive CORS, security headers, and write-rate limiting |

## Safety boundaries

- No order execution, order routing, order preview, position modification, or brokerage write endpoint exists.
- Schwab account access is read-only and only used for bounded risk context when explicitly requested.
- Discord delivery cannot expose the webhook URL or provider response body.
- Secrets, tokens, account hashes, database URLs, raw provider responses, and private balances are excluded from readiness, replay, journal, and automation audit payloads.
- Deterministic calculations remain code-owned and versioned. GEX/DEX confirmation cannot create a direction, satisfy an eligibility gate, or block a structurally eligible setup.
- LLM-generated trade decisions are not required for V1 correctness.
- Every market-data product discloses source state and warning codes instead of silently substituting real and mock data.
- Premarket completeness is evaluated only over the explicit provider-aligned 07:00–09:30 ET window; missing 04:00–07:00 data is neither fabricated nor treated as a failure.
- Historical replay uses persisted captured snapshots only and does not claim to reconstruct raw history that was never stored.

## Known intentional limitations

- Single local user and SPY only.
- Backend must be running for persistent automation.
- Quote, candle, and option caches are process-local and reset on restart. V1.3.0 uses a 2-second quote cache and 5-second candle cache during the faster frontend refresh cycle.
- OAuth CSRF state is memory-bound; restart during the OAuth flow requires starting the flow again.
- The Gamma-balance value is a cumulative returned-window proxy, not observed dealer inventory or a true dealer Gamma Flip.
- Open interest can be stale intraday.
- Legacy typed mock compatibility routes remain isolated from the primary deterministic dashboard pipeline and are not used by V1 decision panels.
- V1 replay validates captured decisions, not uncaptured raw-market history.

## Deferred post-V1 work

Cloud deployment, multi-user authentication, QQQ or multi-symbol support, mobile-native delivery, broker execution, editable scoring profiles, and optional AI coaching are separate post-V1 projects. Broker execution is not implied by V1 completion and requires an independent safety and compliance design.
