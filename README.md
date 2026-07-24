# SPY 0DTE Copilot — V1.9.0

Local, single-user SPY 0DTE decision-support and paper-equivalent trade-lifecycle platform.

V1.9.0 combines live Schwab market data, deterministic market structure, strict contract qualification, a locked trading policy, persistent risk and position state, setup-registry research, actionable Discord delivery, journaling, replay, backtesting, and a Trading Workspace. It never creates, modifies, or closes a brokerage order.

## Current pages

- `/dashboard` — current SPY structure, levels, bias, exposure context, and source-plan summary.
- `/market-data` — source coverage, freshness, warnings, and deterministic inputs.
- `/options` — normalized current-date SPY option chain.
- `/gamma` — returned-window GEX/DEX proxies and research-only evidence.
- `/trade-plan` — source structural thesis, trigger, invalidation, objectives, and strict effective-ATM contract result.
- `/workspace` — `TRADING_POLICY_V1`, daily risk ledger, opportunity consolidation, event/time gates, 60-second READY alerts, and manually confirmed paper-equivalent entries/exits.
- `/alerts` — legacy Trade Plan transition and Discord delivery monitoring.
- `/journal` — captured deterministic snapshots and user-entered outcomes.
- `/replay` — captured-snapshot historical replay and no-look-ahead audit.
- `/backtest` — point-in-time and historical-underlying research.
- `/system` — V1.9.0 configuration/runtime readiness and explicit five-component end-to-end probe.
- `/settings` — Schwab, Discord, and persistent automation settings.
- `/guide` — current page-by-page workflow, policy, status, alert, and glossary documentation.

## Locked trading policy

`TRADING_POLICY_V1` is authoritative for Trading Workspace eligibility:

- Paper-equivalent account: **$1,000**.
- Maximum contract premium: **$150**.
- Maximum planned structural loss: **$50 per trade**.
- Maximum daily loss: **$150**, including realized losses plus open planned risk.
- Maximum **3 trades** per market date; stop after **2 consecutive losses**.
- Maximum **1 open position**, **1 contract**, and **2 attempts per setup/direction/level episode**.
- Latest new entry: **3:00 p.m. ET**.
- Normal mandatory exit: **3:55 p.m. ET**; absolute deadline before **4:00 p.m. ET**.
- Minimum underlying and option-premium R:R: **1.5:1**; **2.0:1+ preferred**.
- Contract rule: **strict effective ATM**. If the nearest effective-ATM contract fails, the result is `NO_QUALIFIED_CONTRACT`; no farther strike is substituted.
- Target 2 is the primary one-contract exit; Target 1 is management; Target 3 is research-only.
- READY alerts expire after **60 seconds**.
- CPI, Employment Situation/NFP, and FOMC are full-day entry blocks.
- Manual confirmation is required for every paper-equivalent entry and exit.
- Modeled execution uses ask-side entry and bid-side exit.

## Setup registry

`SETUP_REGISTRY_V1` contains 14 setup families. Four validated bridges are live; ten newer families remain shadow-only. Shadow families can be measured and displayed but cannot create a live opportunity, READY alert, position, or actionable Discord event.

## Start locally

```powershell
docker compose up -d
npm run db:validate
npm run db:generate
npm run db:deploy
npm run dev:server
```

In another terminal:

```powershell
npm run dev:web
```

Open `http://localhost:3000/system` first, then run the explicit complete probe when live end-to-end confirmation is needed.

## Verify

With the backend and frontend stopped:

```powershell
npm run db:validate
npm run db:generate
npm run db:deploy
npm run verify:v1
```

Do not enable Trade Plan Alerts until verification passes, System Readiness shows the expected V1.9.0 framework state, and the Trading Workspace API/page load successfully.

## Safety and privacy

Never share `apps/server/.env`, OAuth tokens, refresh tokens, client secrets, account identifiers, Discord webhook URLs, database dumps, or raw provider responses. Use a sanitized source archive for technical review.
