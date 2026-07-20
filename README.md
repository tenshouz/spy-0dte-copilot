# SPY 0DTE Copilot — Local V1.1 Complete

SPY 0DTE Copilot is a local, single-user decision-support dashboard for discretionary SPY same-day options trading. It combines backend-only Schwab connectivity, deterministic market structure, 0DTE options analytics, Trade Plan assembly, read-only sizing support, Discord notifications, persistent journaling, performance analytics, and captured-snapshot historical replay.

**V1.1 does not create, route, modify, or execute brokerage orders.** It is not investment advice.

## V1.1 capabilities

- Encrypted Schwab OAuth token storage and refresh recovery
- Normalized SPY quote, bounded five-minute candles, and current-date options chain
- RTH VWAP, gaps, session levels, 5/15/30-minute opening ranges, and Traditional daily/weekly pivots
- ATM straddle-Mark expected move
- Returned-window GEX/DEX proxies, ranked walls, Gamma-balance proxy, cliffs, and DEX anchor
- Deterministic Market Context, Market State, bias, Trade Plan, risk, contract selection, and assembly
- Soft GEX/DEX exposure confirmation that adjusts plan confidence without creating direction or blocking eligibility
- Manual and read-only Schwab-assisted position sizing
- Deterministic scheduled reports and Discord delivery
- Persistent backend automation with lease protection, restart-safe deduplication, and sanitized audit history
- Persistent Journal snapshots, user-entered outcomes, P&L annotations, and performance analytics
- Captured-snapshot historical replay with no-look-ahead timestamp validation
- V1 System Readiness page and explicit live-data probe

## Repository structure

```text
spy-0dte-copilot/
├── apps/
│   ├── web/       Next.js 15 / React 19 dashboard
│   └── server/    Express / Prisma deterministic API
├── packages/
│   └── shared/    Shared Zod contracts and TypeScript types
├── docs/
│   ├── V1_RELEASE_RUNBOOK.md
│   ├── V1_PRD_COMPLIANCE_AUDIT.md
│   └── V1_1_GEX_DEX_SOFT_CONFIRMATION.md
└── scripts/
    ├── run-specs.mjs
    └── verify-v1.mjs
```

## Prerequisites

- Node.js 20+
- npm 10+
- Docker Desktop
- A Schwab developer application
- An HTTPS tunnel for the exact Schwab callback during local development
- Optional Discord incoming webhook

## Initial local setup

```powershell
npm install
docker compose up -d
Copy-Item apps\server\.env.example apps\server\.env
```

Edit `apps/server/.env` locally. Never commit or upload it.

Generate an encryption key:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Load `DATABASE_URL` from the ignored backend environment file without displaying it, then deploy migrations and generate Prisma:

```powershell
$databaseLine = Get-Content apps\server\.env |
  Where-Object { $_ -match '^\s*DATABASE_URL\s*=' -and $_ -notmatch '^\s*#' } |
  Select-Object -First 1

if (!$databaseLine) { throw "DATABASE_URL is missing from apps/server/.env." }

$databaseValue = ($databaseLine -split '=', 2)[1].Trim()
if (
  ($databaseValue.StartsWith('"') -and $databaseValue.EndsWith('"')) -or
  ($databaseValue.StartsWith("'") -and $databaseValue.EndsWith("'"))
) {
  $databaseValue = $databaseValue.Substring(1, $databaseValue.Length - 2)
}

$env:DATABASE_URL = $databaseValue
Remove-Variable databaseLine, databaseValue

npx prisma migrate deploy --schema apps/server/prisma/schema.prisma
npx prisma generate --schema apps/server/prisma/schema.prisma
```

## Run locally

Use separate terminals:

```powershell
npm run dev:server
```

```powershell
npm run dev:web
```

Open `http://localhost:3000`. The API defaults to `http://localhost:4000`.

For Schwab OAuth, keep the HTTPS tunnel pointed at backend port 4000 and register this exact path:

```text
https://<stable-tunnel-host>/api/auth/schwab/callback
```

## V1.1 readiness and verification

Open:

```text
http://localhost:3000/system
```

The page separates configuration/runtime readiness from an explicit provider probe. The probe may call Schwab but never sends Discord messages, writes Journal entries, accesses private account data, sizes a position, or creates an order.

After Prisma generation, run the complete source verification:

```powershell
npm run verify:v1
```

This executes every backend and frontend specification, server and frontend TypeScript validation, lint, the production frontend build, tracked-secret checks, route safety checks, and whitespace validation.

## Important operational notes

- Market-data payloads explicitly identify LIVE, STALE, MOCK, or UNAVAILABLE state.
- A current-date options chain can be legitimately not applicable on weekends, holidays, or dates without a same-day SPY expiration.
- Persistent automation is safely disabled by default.
- The backend must remain running for scheduled automation.
- Keep real Schwab credentials, tokens, the encryption key, Discord webhook URL, database dumps, and account identifiers private.
- The legacy typed mock compatibility endpoints are not used by the primary deterministic V1.1 panels.

See [the V1.1 release runbook](docs/V1_RELEASE_RUNBOOK.md) for backup, restore, recovery, incident handling, and shutdown procedures. See [the V1.1 PRD compliance audit](docs/V1_PRD_COMPLIANCE_AUDIT.md) for scope and known limitations, and [the GEX/DEX soft-confirmation methodology](docs/V1_1_GEX_DEX_SOFT_CONFIRMATION.md) for the fixed weights and safety boundaries.
