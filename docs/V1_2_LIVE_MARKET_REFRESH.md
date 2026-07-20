# V1.2.0 Live Market Refresh Policy

## Purpose

V1.2.0 reduces visible market-data latency without converting the dashboard into an unbounded tick-data client or increasing the Options Chain request cadence.

## Active refresh window

The fast frontend schedule applies on weekdays from **07:00 ET through 16:15 ET**. This covers the provider-aligned premarket window, the full regular session, and a short post-close buffer. Outside that window the dashboard continues polling at a slower cadence.

| Product | Active window | Outside active window |
|---|---:|---:|
| SPY quote | 5 seconds | 30 seconds |
| Official five-minute candles and candle-derived products | 10 seconds | 60 seconds |
| Market Context, Market State, Bias, Trade Plan, Risk, Contract, Assembly, and Session Structure | 15 seconds | 60 seconds |
| Options Chain, expected move, GEX, DEX, and Exposure Structure | 30 seconds | 30 seconds |
| Persistent Discord scheduler | Existing configured cadence | Existing configured cadence |

Browser polling remains disabled in background tabs. Returning to the tab or reconnecting the network triggers an immediate refetch for live products.

## Backend cache policy

- Quote short cache: **2 seconds**
- Candle short cache: **5 seconds**
- Options Chain short cache: unchanged
- Existing in-flight request deduplication, bounded timeouts, rate-limit backoff, and validated fallback behavior remain active

The frontend can therefore update quickly without every component independently calling Schwab.

## Chart behavior

The Dashboard and Market Data charts include an independent **Live SPY** quote marker. It follows the normalized quote feed and can move between official candle refreshes.

The marker does not modify, synthesize, or extend candle OHLC values. Official five-minute candles continue to come only from the normalized Schwab Price History response. The chart object and series remain mounted and are updated in place, so quote refreshes do not reset zoom or recreate the chart.

## Data-age visibility

The Current Price card displays the age of the latest normalized quote. Chart surfaces display both quote and candle update ages so latency is visible instead of implied.

## Safety boundaries

This release does not change:

- Trade Plan eligibility rules
- GEX/DEX soft-confirmation weights
- Reward-to-risk requirements
- Contract-selection requirements
- Discord deduplication behavior
- Private account access boundaries
- Position sizing behavior
- Order creation or execution capabilities
