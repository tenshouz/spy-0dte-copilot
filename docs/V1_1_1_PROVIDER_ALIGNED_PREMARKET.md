# V1.1.1 Provider-Aligned Premarket Methodology

## Purpose

Schwab's normalized five-minute SPY history available to this local dashboard begins reliably at 07:00 ET. Earlier 04:00–06:55 ET candles are not consistently returned. V1.1.1 therefore defines the deterministic premarket window as **07:00 ET inclusive through 09:30 ET exclusive**.

## Fixed policy

- Methodology version: `PREMARKET_WINDOW_V2`
- Time zone: `America/New_York`
- Required first five-minute bucket: `07:00`
- Required final five-minute bucket: `09:25`
- Calculation window: `07:00–09:30 ET`
- Candles before 07:00 ET are outside the calculation and coverage audit.
- Missing 04:00–07:00 ET data does not produce `PARTIAL` coverage.
- No missing candle is fabricated or inferred.

## Coverage behavior

A completed premarket session is `COMPLETE` when the provider-aligned window begins at 07:00 ET, reaches 09:25 ET, and contains no factual five-minute timestamp gap. A 07:05 or later first candle remains `PARTIAL`. Factual internal gaps remain conservatively `UNKNOWN`.

During the active premarket session, completeness is measured only through the latest fully elapsed five-minute bucket. Future buckets are never required.

## Downstream effect

When the provider-aligned window is complete, Premarket High and Premarket Low are available to Market Context, Market State, bias, objective selection, Trade Plan assembly, and alerts. This removes the false blocking condition caused solely by absent 04:00–07:00 ET data.

All other quality gates remain unchanged. Stale quotes, incomplete RTH data, missing opening-range data, invalid options data, insufficient reward-to-risk, or an unqualified contract can still prevent a `READY` plan.

## Safety boundary

This policy does not weaken other source-quality checks and does not guarantee a Trade Plan. It changes only the owned definition of the premarket observation window to match the provider data the application can actually validate.
