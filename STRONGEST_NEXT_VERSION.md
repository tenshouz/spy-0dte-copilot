# Strongest Next Version — V1.6.0 Calibration and Walk-Forward Validation

V1.5.0 creates the evidence pipeline. The strongest next version should use that evidence carefully rather than adding another indicator.

## 1. Version-pinned rule configurations

Persist the exact trading-rule version and configurable thresholds with every source cycle. Allow a run to select a frozen candidate rule set so results remain reproducible after future code changes.

## 2. Chronological research partitions

Create explicit, non-overlapping periods:

- Development.
- Validation.
- Untouched holdout.
- Rolling walk-forward windows.

The holdout must remain locked until a candidate rule set is frozen.

## 3. Rejected-opportunity counterfactuals

Grade not only READY episodes but also ARMED, DETECTED, invalidated, no-contract, and risk-rejected candidates. This reveals whether stricter rules reduce losses or simply remove profitable opportunities.

## 4. Setup-specific calibration

Evaluate Opening Range breakouts, VWAP reclaims/losses, failed breaks, retests, trend pullbacks, and mean-reversion setups separately. Avoid one global threshold when behavior differs by setup and time of day.

## 5. Empirical Gamma promotion protocol

A Gamma feature may become a live rule only when:

1. The hypothesis is declared before the validation test.
2. The bucket has sufficient independent episode count.
3. The effect survives costs and multiple-comparison controls.
4. It persists through chronological validation and untouched holdout periods.
5. Its live impact is bounded, reversible, and monitored for drift.

Until then, Gamma remains context-only.

## 6. Statistical uncertainty

Add confidence intervals, bootstrap distributions by market date, sample-size warnings, drawdown distributions, consecutive-loss analysis, and sensitivity tests around every threshold.

## 7. Execution telemetry

When account scope is explicitly expanded, record read-only actual fill timestamps, prices, spreads, and slippage for user-entered trades. Keep this separate from order placement.

## 8. Historical data adapter

Add a provider-neutral interface for licensed historical quotes, candles, option chains, and Greeks. Imported data must satisfy the same internal schemas and no-look-ahead audit as forward captures.

## 9. Scalable run execution

Move large backtests to paged/background jobs with progress, cancellation, immutable run artifacts, and retention controls. Do not hold thousands of full snapshots in one request.

## Success criterion

V1.6 should answer whether a frozen rule change improves net expectancy, drawdown, and reliability on unseen chronological data—not merely whether it improves in-sample win rate.
