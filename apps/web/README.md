# SPY 0DTE Copilot Web Application — V1.1.1

The frontend is a Next.js 15 / React 19 / TypeScript dashboard. It consumes the Express API only through `src/lib/api-client.ts`, validates every response with the shared Zod contracts, and uses TanStack Query for bounded refresh behavior.

## Run

From the monorepo root:

```powershell
npm install
npm run dev:web
```

Visit `http://localhost:3000`. The backend must also be running on the configured `NEXT_PUBLIC_API_URL` or the default `http://localhost:4000`.

## Primary pages

- Dashboard
- Market Data
- Options Chain
- GEX / DEX
- Trade Plan
- Alerts
- Trade Journal
- Historical Replay
- System Readiness
- Settings

## Architecture

```text
src/
├── app/          App Router pages
├── components/   Layout, panels, UI primitives, and feature components
├── hooks/        TanStack Query and mutation boundaries
├── lib/          Validated API client and deterministic presentation helpers
└── stores/       Client-only UI state
```

The primary V1.1.1 pages use deterministic backend products. The Trade Plan page displays structural confidence separately from a versioned GEX/DEX soft-confirmation adjustment; exposure context cannot create a direction, pass or fail eligibility, or alter trigger, risk, objective, or contract rules. Premarket labels explicitly disclose the provider-aligned 07:00–09:30 ET methodology; missing 04:00–07:00 data does not reduce coverage completeness. Legacy mock compatibility hooks remain isolated and are not used by the main decision-support panels.

## Safety boundary

The frontend contains no order-entry or execution flow. The System Readiness probe is explicit and may request market data, but it cannot deliver Discord messages, mutate the Journal, access private account balances, calculate sizing, or create orders.
