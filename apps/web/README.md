# apps/web — SPY 0DTE Copilot Dashboard (Milestone 1)

Next.js 15 (App Router) + React 19 + TypeScript + Tailwind + shadcn/ui-style components.

## Run

```bash
npm install        # from the monorepo root
npm run dev:web    # or: cd apps/web && npm run dev
```

Visit `http://localhost:3000` — it redirects to `/dashboard`.

## Folder guide

```
src/
├── app/                 Next.js App Router pages (one folder per route)
├── components/
│   ├── layout/          Sidebar, header, mobile nav, app shell, page header
│   ├── ui/               shadcn-style primitives (button, card, badge, table, tabs, tooltip...)
│   ├── panels/           Reusable data-display building blocks (Panel, MetricCard, DataTable,
│   │                     AlertCard, ChartContainer)
│   └── dashboard/        Composed, page-specific widgets (BiasCard, LiveChart, SessionTimeline)
├── hooks/                TanStack Query hooks — the ONLY place that decides "mock vs. real" data
├── mocks/                Typed mock data generators (Milestone 1 only)
├── stores/               Zustand stores for client-only UI state
├── lib/                  cn(), formatters, the QueryClient provider
└── types → re-exported from packages/shared
```

## Swapping mock data for real data (future milestones)

Every hook in `src/hooks` has a one-line `queryFn` that currently calls a mock generator.
Replacing that line with a `fetch()` call to the Express API is the entire migration — no
component changes required, because both sides validate against the same Zod schemas in
`packages/shared`.
