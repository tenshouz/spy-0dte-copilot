import {
  selectAtmCenteredStrikeWindow,
  type GexStrikeRow,
} from "@spy-copilot/shared";

export const DEFAULT_GEX_CHART_VISIBLE_STRIKE_COUNT = 15;

export interface GexChartStrikeWindow {
  atmStrike: number | null;
  rows: GexStrikeRow[];
  calculationStrikeCount: number;
  displayedStrikeCount: number;
  isSubset: boolean;
}

/**
 * Presentation-only strike selection for the GEX chart.
 * The backend totals and complete table continue using every returned strike.
 */
export function selectGexChartStrikeWindow(
  strikes: readonly GexStrikeRow[],
  underlyingPrice: number | null,
  visibleStrikeCount = DEFAULT_GEX_CHART_VISIBLE_STRIKE_COUNT,
): GexChartStrikeWindow {
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
