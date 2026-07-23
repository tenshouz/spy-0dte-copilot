SPY 0DTE Copilot V1.5.2 Discord Alert Hardening

BASELINE
- Apply over the exact V1.5.1 project used to create the sanitized package.

PRESERVE
- The hidden .git folder.
- apps/server/.env.
- Any local database volume.

INSTALLATION
1. Keep Trade Plan Alerts OFF while replacing files.
2. Stop backend and frontend.
3. Copy all V1.5.2 files over the current project.
4. No npm install is required when node_modules already exists.
5. No Prisma migration or generate command is required for this release.
6. Restart:

   npm run dev:server
   npm run dev:web

7. Confirm only one backend process is running.
8. Keep Foreground Automatic Discord Delivery stopped.
9. Re-enable Persistent Backend Automation -> Trade Plan Alerts.

VERIFY
- Run: npm run verify:v1
- Focused checks:
  npx --no-install tsx apps/server/src/services/trade-plan-alert-candidate.spec.ts
  npx --no-install tsx apps/server/src/services/trade-plan-alert-transition.spec.ts
  npx --no-install tsx apps/server/src/services/discord-trade-plan-alert.spec.ts
  npx --no-install tsx apps/server/src/services/backend-automation.spec.ts
  npx --no-install tsx apps/web/src/lib/backend-automation-view.spec.ts

EXPECTED LIVE RESULT
- No WAITING_FOR_TRIGGER -> WAITING_FOR_TRIGGER Discord spam.
- One-cent trigger or VWAP changes do not send alerts.
- Routine confidence/exposure refreshes do not send alerts.
- READY, no-contract-after-qualification, and READY withdrawal events remain eligible.
- Point-in-time capture remains active.
