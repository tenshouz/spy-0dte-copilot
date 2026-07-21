# SPY 0DTE Copilot Web — V1.5.0

Next.js frontend for the local SPY 0DTE deterministic decision-support platform.

## Point-in-Time Backtesting

The `/backtest` page creates and reviews saved `POINT_IN_TIME_BACKTEST_V1` runs. It displays the frozen recomputed plan separately from the subsequent outcome, including target/stop ordering, MFE, MAE, R multiple, option estimates, Gamma context, and source-audit issues.

The page does not calculate trading logic locally. It validates backend responses using shared Zod schemas and exposes no order controls.

## Run

```powershell
npm run dev:web
```

The backend defaults to `http://localhost:4000` unless `NEXT_PUBLIC_API_URL` is configured.
