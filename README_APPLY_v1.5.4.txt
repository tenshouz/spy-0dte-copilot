SPY 0DTE Copilot V1.5.4 — Apply Instructions

1. Keep a copy of the current working project.
2. Stop the backend and frontend terminals.
3. Preserve the hidden .git directory.
4. Preserve apps/server/.env.
5. Extract the V1.5.4 ZIP to a temporary folder.
6. Copy the V1.5.4 project files over the current project.
7. No npm install is required when the existing node_modules installation is intact.
8. No Prisma generation or migration is required.
9. Restart:

   npm run dev:server
   npm run dev:web

10. Verify:

   npm run verify:v1

Focused checks:

   npx --no-install tsx apps/server/src/services/trade-plan.spec.ts
   npx --no-install tsx apps/server/src/services/trade-plan-assembly.spec.ts
   npx --no-install tsx apps/web/src/lib/trade-plan-assembly-view.spec.ts

The V1.5.2/V1.5.3 Discord hardening remains active. WAITING_FOR_RETEST is informational and should not produce Discord spam.
