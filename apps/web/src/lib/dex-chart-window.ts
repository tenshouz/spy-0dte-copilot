import {
  selectAtmCenteredStrikeWindow,
  type DexStrikeRow,
} from "@spy-copilot/shared";

export const DEFAULT_DEX_CHART_VISIBLE_STRIKE_COUNT = 15;

export interface DexChartStrikeWindow {
  atmStrike: number | null;
  rows: DexStrikeRow[];
  calculationStrikeCount: number;
  displayedStrikeCount: number;
  isSubset: boolean;
}

/**
 * Presentation-only strike selection for the DEX chart.
 * Backend totals and the complete table continue using every returned strike.
 */
export function selectDexChartStrikeWindow(
  strikes: readonly DexStrikeRow[],
  underlyingPrice: number | null,
  visibleStrikeCount = DEFAULT_DEX_CHART_VISIBLE_STRIKE_COUNT,
): DexChartStrikeWindow {
  const strikeWindow = selectAtmCenteredStrikeWindow(
    strikes.map((row) => row.strikePrice),
    underlyingPrice,
    visibleStrikeCount,
  );
  const visible = new Set(strikeWindow.visibleStrikes);
  const rows = strikes
    .filter((row) => visible.has(row.strikePrice))
    .sort((a, b) => b.strikePrice - a.strikePrice);

  return {
    atmStrike: strikeWindow.atmStrike,
    rows,
    calculationStrikeCount: strikes.length,
    displayedStrikeCount: rows.length,
    isSubset: rows.length < strikes.length,
  };
}
