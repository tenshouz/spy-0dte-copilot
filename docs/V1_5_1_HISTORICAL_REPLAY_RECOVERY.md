# V1.5.1 Historical Replay Recovery Methodology

## Source hierarchy

V1.5.1 does not pretend all historical dates have the same data quality. Each boundary receives one explicit source mode.

### Exact Market State recomputation

V1.5+ captures store the Market State that existed at the source boundary. The current deterministic bias, trade plan, risk, contract, and Assembly are recomputed from that stored state and the point-in-time chain when available.

### Legacy frozen Assembly

Pre-V1.5 captures often contain the final deterministic Assembly but not the complete Market State. The engine preserves that exact plan. It does not recalculate missing inputs. Later captured prices are grouped into five-minute OHLC bars to grade target and invalidation order.

### Historical underlying only

When a requested trading date has no local captures, the server requests bounded SPY five-minute history from Schwab. At each completed five-minute boundary after 9:45 a.m. ET, it rebuilds:

- Session Data Foundation.
- RTH VWAP.
- Premarket and previous-session levels.
- Gap context.
- 15-minute opening range.
- Deterministic Market State.
- Bias and trigger confirmation.
- Objective/risk framework.
- Underlying Trade Plan Assembly.

Option-dependent Market State features are explicitly `NOT_APPLICABLE`. A research-only contract adapter produces `NO_QUALIFIED_CONTRACT`, never a synthetic contract. This allows the underlying thesis to be graded while contract and option-P&L fields remain null.

## No-look-ahead rules

- A candle is visible only after its five-minute interval is complete.
- The replay boundary is the completed-candle end time.
- The latest historical quote proxy is the close of the latest completed candle.
- Opening-range rules are not evaluated before 9:45 a.m. ET.
- Later candles are used only by the outcome grader.
- Exact and legacy timestamps are audited before use.

## Outcome grading

The first qualified plan per unique market-date, direction, setup, trigger, invalidation, objective, and contract signature creates an episode.

- Calls: objective is touched by high; invalidation is touched by low.
- Puts: objective is touched by low; invalidation is touched by high.
- Both in one candle: `AMBIGUOUS_SAME_CANDLE`.
- Hold boundary reached: `TIMEOUT`.
- Official close reached first: `SESSION_END`.
- Incomplete later data: `INSUFFICIENT_FUTURE_DATA`.

Historical-underlying episodes report underlying points, R multiple, MFE, and MAE. They do not report contract or option-premium performance.

## Limitations

- Historical-underlying requests require an active Schwab connection.
- Each request is limited to 31 calendar days.
- Provider five-minute history is not a tick-level order book.
- Legacy OHLC reconstructed from captured quote samples may miss intrabucket extremes.
- Legacy frozen plans test the rules that produced the stored plan; they are not current-rule recomputations.
- Historical options, GEX, DEX, IV, spreads, contract liquidity, and premium returns require a future historical options adapter.
