# SPY 0DTE Copilot — Milestone 1: Project Foundation

This is the scaffolded foundation for the SPY 0DTE AI decision-support platform described in the
PRD. **Milestone 1 only**: layout, navigation, design system, and typed mock data. No Schwab
connection, no GEX/DEX math, no AI reasoning yet — those are Milestones 2–3.

See `/apps/web/README.md` for frontend specifics and the root PRD (`PRD_SPY_0DTE_Assistant.md`)
for full product context. This README covers running the whole monorepo.

## Structure

```
spy-0dte-copilot/
├── apps/
│   ├── web/       Next.js 15 dashboard (the actual Milestone 1 deliverable)
│   └── server/    Express + Prisma skeleton (routes stubbed, returns mock data)
└── packages/
    └── shared/    Zod schemas + TS types shared by web and server
```

## Prerequisites

- Node.js 20+
- npm 10+
- Docker Desktop (for the local Postgres database — see Windows quick start below)
- (Later milestones only) a Schwab developer account, once you're ready to connect real credentials

## Windows Quick Start — local database for Schwab OAuth

You only need this if you want the Settings page's Schwab connection card to work end-to-end
(it will show "Database not configured" without it, which is expected and harmless otherwise).

1. Install [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/) and start it.
2. From the repo root, in a terminal (PowerShell, VS Code terminal, etc.), start the database:
   ```bash
   npm run db:up
   ```
3. Copy the server env file:
   ```bash
   copy apps\server\.env.example apps\server\.env
   ```
   (On macOS/Linux use `cp apps/server/.env.example apps/server/.env` instead.)
4. Generate a token-encryption key and paste it into `apps/server/.env` as `SCHWAB_TOKEN_ENCRYPTION_KEY`:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
5. Create the database tables:
   ```bash
   npm install
   npm run db:migrate
   ```
6. Start the server:
   ```bash
   npm run dev:server
   ```

At this point Settings → Connections will show **"Schwab credentials not configured"** until you
also fill in real `SCHWAB_CLIENT_ID` / `SCHWAB_CLIENT_SECRET` / `SCHWAB_REDIRECT_URI` from a Schwab
developer app — that's expected; the database step above is independent of having real Schwab
credentials. To stop the database later: `npm run db:down` (data persists in a Docker volume).

## HTTPS tunnel for Schwab OAuth (local development only)

Schwab requires an HTTPS callback URL and rejects `http://localhost`. For local development, run an
HTTPS tunnel that forwards to the backend:

```bash
ngrok http 4000
# or
cloudflared tunnel --url http://localhost:4000
```

Then set in `apps/server/.env` (and register the **exact** same URL in your Schwab developer app):

```
SCHWAB_REDIRECT_URI="https://<your-tunnel-host>/api/auth/schwab/callback"
```

Important notes:
- The tunnel must stay running for the entire OAuth flow (Schwab redirects the browser back through it).
- Free/temporary tunnel hostnames change between runs — when the hostname changes, update both
  `SCHWAB_REDIRECT_URI` and the callback registered with Schwab, then restart the server.
- The URL registered with Schwab must match `SCHWAB_REDIRECT_URI` exactly: same host, the path
  `/api/auth/schwab/callback`, no query string, no fragment.
- The tunnel approach is for local development only. Production requires a stable HTTPS domain
  pointing at the backend.
- ngrok/cloudflared are external tools, not application dependencies.

## Install & run

```bash
npm install                 # installs all three workspaces
npm run dev:web             # http://localhost:3000
npm run dev:server          # http://localhost:4000 (mock API, optional for M1)
```

The web app now fetches its dashboard data from the Express server (see `apps/web/src/lib/api-client.ts`),
so run both `dev:web` and `dev:server` for the full experience. Only the Schwab OAuth routes need
the database from the Windows Quick Start above — the rest of the API (`/api/snapshot`, `/api/reports`,
`/api/journal`, `/api/alerts`) is mock data and needs no database.

## What's real vs. mock in Milestone 1

| Area | Status |
|---|---|
| Layout, navigation, theme | Real, production code |
| Component library (cards, tables, panels, alerts) | Real, production code |
| Chart container (TradingView Lightweight Charts) | Real integration, fed mock candles |
| Market data, GEX/DEX, AI trade plan, alerts, journal | Typed **mock data**, shaped exactly like the PRD's final schemas |
| Schwab OAuth (login/callback/status, encrypted token storage) | Real, requires local Postgres + real Schwab credentials |
| Schwab market data retrieval | Not implemented — auth only so far |
| GEX/DEX/Gamma Flip/Wall math | Not implemented (Milestone 2) |
| AI scoring + LLM narrative | Not implemented (Milestone 3) |

## A note on this sandbox

This code was written and reviewed in an offline sandbox with no package-registry access, so
`npm install` / `npm run dev` could not be executed here to produce a live preview. Everything
below is production-shaped code following Next.js 15 / React 19 / shadcn conventions, but please
run the install + dev server on your machine as the first step and report back anything that
doesn't compile — see the "What still needs to be built / verified" note at the end of the build
summary.
