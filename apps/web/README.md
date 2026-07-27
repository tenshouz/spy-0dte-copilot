# SPY 0DTE Copilot Web — V1.9.1

Next.js frontend for the local SPY 0DTE deterministic decision-support and paper-equivalent lifecycle platform.

The frontend validates backend responses with shared Zod schemas and does not calculate authoritative trading logic locally.

## Current feature surfaces

- Dashboard and Market Data for live structure and source quality.
- Trade Plan for the deterministic source thesis, bounded `CONTRACT_V3` candidates, planned-risk references, and per-candidate rejection diagnostics.
- Trading Workspace for `TRADING_POLICY_V1`, risk ledger, setup registry, READY lifecycle, event restrictions, the manual $50 Bid-side premium-loss backstop, and manual paper-equivalent entry/exit recording.
- System Readiness for V1.9.1 framework checks and the explicit quote/candles/options/Assembly/Workspace probe.
- Guide for current policy, workflow, page descriptions, alert behavior, and glossary.
- Journal, Replay, and Backtest for captured evidence and research.

The web application exposes no broker-order controls.

## Run

```powershell
npm run dev:web
```

The backend defaults to `http://localhost:4000` unless `NEXT_PUBLIC_API_URL` is configured.
