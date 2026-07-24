# V1.9.0 Product Alignment and Internal Consistency

This alignment pass makes the visible product, shared contracts, operational checks, and current documentation describe the installed V1.9.0 trading framework consistently.

## Alignment changes

- One shared release metadata constant now supplies the V1.9.0 label to shared schemas and the Guide.
- System Readiness reports V1.9.0 and validates 13 checks, including the locked policy, V1.9 database tables, 14-family setup registry, and Trading Workspace heartbeat.
- The explicit probe now validates five components: quote, candles, options chain, Trade Plan Assembly, and Trading Workspace.
- The Guide documents Trading Workspace, the full locked policy, strict effective ATM, 1.5:1 minimum/2.0:1 preferred R:R, setup episodes, shadow mode, conflicts, event restrictions, the risk ledger, 60-second READY alerts, Target 2, and manual lifecycle confirmation.
- System, Guide, root README, frontend README, runbook, PRD audit, and V1.9 framework documentation use current language.
- Verification rejects stale current-facing V1.5 labels and stale 2:1-minimum Guide copy while preserving historical V1.5 methodology documents.

## Historical references intentionally retained

References such as `V1.5.0 Point-in-Time Backtesting` and statements about captures beginning in V1.5 remain valid historical methodology references. Methodology identifiers such as `TRADING_POLICY_V1`, `SYSTEM_READINESS_V1`, and `TRADING_WORKSPACE_V1` are contract versions, not product-release numbers.
