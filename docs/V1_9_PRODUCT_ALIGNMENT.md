# V1.9.1 Product Alignment and Internal Consistency

This alignment pass makes the visible product, shared contracts, operational checks, and current documentation describe the installed V1.9.1 trading framework consistently.

## Alignment changes

- Shared release metadata supplies the V1.9.1 label to shared schemas and the Guide.
- System Readiness reports V1.9.1 and validates 13 checks, including the locked policy, V1.9 database tables, 14-family setup registry, and Trading Workspace heartbeat.
- The explicit probe validates five components: quote, candles, options chain, Trade Plan Assembly, and Trading Workspace.
- The Guide documents Trading Workspace, the full locked policy, bounded `CONTRACT_V3`, `SIZING_V2`, $150 premium/full-exposure versus $50 planned-risk separation, the Bid-side $50 loss backstop, 1.5:1 minimum/2.0:1 preferred R:R, setup episodes, shadow mode, conflicts, event restrictions, the risk ledger, 60-second READY alerts, Target 2, and manual lifecycle confirmation.
- System, Guide, root README, frontend README, runbook, PRD audit, and framework documentation use current language.
- Verification rejects stale current-facing V1.5/V1.9.0 labels and the superseded strict-effective-ATM rule while preserving historical methodology documents.

## Historical references intentionally retained

References such as `V1.5.0 Point-in-Time Backtesting`, `CONTRACT_V2`, and `SIZING_V1` remain valid in historical methodology and replay contexts. Current live behavior is `CONTRACT_V3` plus `SIZING_V2`. Methodology identifiers such as `TRADING_POLICY_V1`, `SYSTEM_READINESS_V1`, and `TRADING_WORKSPACE_V1` are contract versions, not product-release numbers.
