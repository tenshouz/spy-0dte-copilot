# V1.9.1 — Complete Trading Framework, Contract Selection, and Planned Risk

## Scope

V1.9.1 preserves the V1.6–V1.9 complete trading framework and adds the contract-selection/planned-risk correction. `CONTRACT_V3` evaluates a bounded ATM-adjacent candidate set, `SIZING_V2` uses modeled structural loss for risk capacity while retaining full debit as capital/catastrophic exposure, and the Workspace adds a manual $50 Bid-side loss backstop.

## Trading Workspace

Route: `GET /api/trading-workspace/spy`

Write routes:

- `POST /api/trading-workspace/spy/confirm-entry`
- `POST /api/trading-workspace/spy/positions/:positionId/close`
- `POST /api/trading-workspace/spy/override`
- `POST /api/trading-workspace/events`
- `PUT /api/trading-workspace/events/:eventId`
- `DELETE /api/trading-workspace/events/:eventId`

All writes validate origin, reject unsupported query parameters, validate request bodies, and return no-store responses. No route creates a broker order.

## Scheduled events

CPI, Employment Situation/NFP, and FOMC are full-day blocks. Other major events use explicit configurable windows. Event boundaries are evaluated in absolute timestamps while market-date and entry/exit cutoffs use America/New_York.

## Exit policy

- Target 2 remains the primary one-contract exit.
- Target 1 is a management level.
- Target 3 is research-only.
- The 15-minute rule creates a review event, not an automatic exit.
- Structural stop, the $50 executable-Bid premium-loss backstop, Target 2, time review, 3:55 exit, and absolute deadline use deterministic priority.
- The application never submits an exit order.

## Research separation

Exit-policy comparison reports Target 1 early, Target 2 primary, Target 3 extension, time-stop review, and actual user exits. Engine marks use modeled ask-entry/bid-exit performance and only LIVE bid observations. Actual user performance uses manually confirmed prices. Manual overrides are excluded from pure-engine performance.

## Operational ownership

The persistent backend owns READY reconciliation, open-position monitoring, event deduplication, and actionable Discord delivery. Runtime leases prevent two backend processes from evaluating the same user simultaneously. Existing backend automation settings and webhook validation remain authoritative.

## Non-goals

- No autonomous order placement.
- No new Schwab account permissions.
- No confidence-to-probability claim.
- No promotion of new setup families without validation.
- No gamma or volatility relationship promoted beyond research context.

## Product alignment

The current Guide and System Readiness surfaces are release-aware and describe V1.9.1 rather than the earlier V1.5 UI baseline. System Readiness verifies the locked trading policy, V1.9 persistence tables, setup registry, and Workspace heartbeat; its explicit probe includes the Trading Workspace. Current documentation uses the 1.5:1 minimum / 2.0:1 preferred R:R policy, bounded `CONTRACT_V3`, and explicit $150 full-exposure / $50 planned-risk separation.
