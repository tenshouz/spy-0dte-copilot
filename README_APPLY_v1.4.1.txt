SPY 0DTE COPILOT V1.4.1 — APPLY INSTRUCTIONS

BASELINE
- Apply this package over the verified V1.4.0 project.
- Preserve the hidden .git directory.
- Preserve apps/server/.env.
- Do not copy node_modules, .next, dist, or cache folders from another machine.

DEPENDENCIES
- No dependency changed.
- npm install is not required when the existing V1.4.0 node_modules installation works.

DATABASE
- No Prisma schema or migration changed in V1.4.1.
- prisma migrate deploy and prisma generate are not required solely for this update.
- A fresh install must still apply the existing V1.4.0 migrations and generate Prisma.

START
Terminal 1:
  npm run dev:server

Terminal 2:
  npm run dev:web

VERIFY
  npx --no-install tsx apps/server/src/services/spy-exposure-structure.spec.ts
  npx --no-install tsx apps/server/src/services/empirical-gamma-research.spec.ts
  npx --no-install tsx apps/server/src/services/empirical-gamma-research.service.spec.ts
  npx --no-install tsx apps/server/src/routes/gamma-research.routes.spec.ts
  npx --no-install tsx apps/web/src/lib/empirical-gamma-research-view.spec.ts

USE
- Review journal outcomes as WIN, LOSS, or BREAKEVEN with realized P&L.
- Open GEX/DEX and review Empirical Gamma Research.
- Do not interpret candidate labels as live signals.
- Automatic Gamma weighting remains disabled.
