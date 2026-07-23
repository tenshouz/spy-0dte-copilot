SPY 0DTE Copilot V1.5.3 Discord Alert Contract Hotfix

BASELINE
- Apply over V1.5.2 Discord Alert Hardening.

PRESERVE
- The hidden .git folder.
- apps/server/.env.
- Any local database volume.

INSTALLATION
1. Keep Trade Plan Alerts OFF while replacing files.
2. Stop backend and frontend.
3. Copy all V1.5.3 files over the current V1.5.2 project.
4. No npm install is required when node_modules already exists.
5. No Prisma migration or generate command is required.
6. Restart:

   npm run dev:server
   npm run dev:web

VERIFY FIRST
- Focused regression:
  npx --no-install tsx apps/server/src/services/discord-trade-plan-alert.spec.ts

- Expected result:
  Discord Trade Plan alert-delivery tests: 22 passed, 0 failed

- Complete verification:
  npm run verify:v1

RE-ENABLE
- Persistent Backend Automation: ON
- Trade Plan Alerts: ON only after the focused test passes
- Foreground Automatic Discord Delivery: STOPPED

EXPECTED LIVE RESULT
- No WAITING_FOR_TRIGGER -> WAITING_FOR_TRIGGER Discord spam.
- One-cent trigger/VWAP and minor confidence changes remain silent.
- Persistent backend ownership and duplicate fingerprint suppression return valid non-delivery responses instead of throwing ZodError.
- Point-in-time capture remains active.
