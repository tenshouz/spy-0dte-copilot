SPY 0DTE COPILOT V1.5.1 — APPLY INSTRUCTIONS

CURRENT V1.5.0 INSTALLATION

1. Preserve the hidden .git directory and apps/server/.env.
2. Copy the V1.5.1 files over the existing project.
3. No npm install is required.
4. No new Prisma migration is required.
5. Stop and restart the backend and frontend in separate PowerShell terminals:

npm run dev:server
npm run dev:web

6. Confirm Schwab is connected.
7. Open Point-in-Time Backtesting.
8. Enter explicit Start and End market dates. Use the same date for a one-day replay.
9. Run:

npm run verify:v1

EXPECTED BEHAVIOR

- Pre-V1.5 captured dates use LEGACY_FROZEN_ASSEMBLY instead of repeated SOURCE_MARKET_STATE_INVALID errors.
- Trading dates with no captures use HISTORICAL_UNDERLYING_ONLY when Schwab five-minute history is available.
- Historical options, GEX, DEX, contract selection, and option-premium P&L remain unavailable until a historical options dataset is connected.

DIRECT UPGRADE FROM PRE-V1.5

The existing V1.5 database migration must still be deployed and Prisma regenerated before starting the app.
