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
- (Later milestones only) PostgreSQL 15+ and a Schwab developer account

## Install & run

```bash
npm install                 # installs all three workspaces
npm run dev:web             # http://localhost:3000
npm run dev:server          # http://localhost:4000 (mock API, optional for M1)
```

The web app is fully usable with `npm run dev:web` alone — it reads from local mock data via
TanStack Query hooks, not from the Express server, so the server is not required to explore the
UI in this milestone. The server exists so the *shape* of the future real API is already in place
and the frontend's data-fetching layer won't need to change when Schwab is wired in.

## What's real vs. mock in Milestone 1

| Area | Status |
|---|---|
| Layout, navigation, theme | Real, production code |
| Component library (cards, tables, panels, alerts) | Real, production code |
| Chart container (TradingView Lightweight Charts) | Real integration, fed mock candles |
| Market data, GEX/DEX, AI trade plan, alerts, journal | Typed **mock data**, shaped exactly like the PRD's final schemas |
| Schwab API | Not connected (Milestone 2) |
| GEX/DEX/Gamma Flip/Wall math | Not implemented (Milestone 2) |
| AI scoring + LLM narrative | Not implemented (Milestone 3) |
| Prisma migrations / real DB reads | Schema only, no live queries (Milestone 1 scaffolding → wired in Milestone 2+) |

## A note on this sandbox

This code was written and reviewed in an offline sandbox with no package-registry access, so
`npm install` / `npm run dev` could not be executed here to produce a live preview. Everything
below is production-shaped code following Next.js 15 / React 19 / shadcn conventions, but please
run the install + dev server on your machine as the first step and report back anything that
doesn't compile — see the "What still needs to be built / verified" note at the end of the build
summary.
