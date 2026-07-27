# Dashboard Guide — Introduced in V1.3.0, aligned through V1.9.1

## Purpose

The in-application Dashboard Guide at `/guide` was introduced in V1.3.0 and is maintained as current product documentation. It must describe the installed release rather than freeze the original V1.3 behavior.

## Current V1.9.1 coverage

The Guide now includes:

- the V1.9.1 release label and current local decision-support boundary;
- the complete daily workflow from System Readiness through Trading Workspace and result review;
- plain-English descriptions of every user-facing page, including Trading Workspace and Point-in-Time Backtesting;
- the locked `TRADING_POLICY_V1` account, premium, planned-loss, daily-loss, trade-count, loss-streak, attempt, position, timing, event, R:R, bounded-contract, planned-risk, loss-backstop, alert, and manual-confirmation controls;
- the 14-family setup registry, including the live-versus-shadow boundary;
- duplicate consolidation and fail-closed Calls/Puts conflicts;
- the distinction between the source Trade Plan and Workspace policy eligibility;
- the 60-second READY lifecycle, actionable-only Discord behavior, and position-management priorities;
- Target 1 management, Target 2 primary exit, Target 3 research-only, and the 15-minute review;
- Journal, Workspace performance, replay, and backtest separation;
- current source states, sharing guidance, and searchable glossary.

## Current methodology boundaries

- Provider-aligned premarket remains 07:00–09:30 ET.
- Minimum underlying and option-premium R:R is 1.5:1; 2.0:1 or better is preferred.
- `CONTRACT_V3` evaluates effective ATM plus the immediately adjacent returned strike below and above; it never searches a fourth or farther strike. The $150 full-premium exposure and $50 modeled planned structural loss remain separate.
- GEX/DEX remains context/research and cannot override policy eligibility.
- New setup families default to shadow mode.
- READY alerts expire after 60 seconds.
- SPY structural invalidation remains primary, with a manual executable-Bid $50 loss backstop. Manual confirmation is required; no order creation or execution capability is added.

## Public deployment warning

The application remains local and single-user. A public product requires authentication, authorization, tenant isolation, hosted secret management, HTTPS, monitoring, and deployment-specific abuse controls.
