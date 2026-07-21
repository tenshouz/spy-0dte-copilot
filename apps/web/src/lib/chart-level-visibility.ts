export const CHART_LEVEL_KEYS = [
  "livePrice",
  "vwap",
  "premarketHigh",
  "premarketLow",
  "previousHigh",
  "previousLow",
  "previousClose",
  "openingRange5High",
  "openingRange5Low",
  "openingRange15High",
  "openingRange15Low",
  "openingRange30High",
  "openingRange30Low",
  "dailyPivot",
  "weeklyPivot",
  "callWall",
  "putWall",
  "gammaBalance",
] as const;

export type ChartLevelKey = (typeof CHART_LEVEL_KEYS)[number];
export type ChartLevelVisibility = Record<ChartLevelKey, boolean>;
export type ChartLevelPreset = "CORE" | "ALL" | "NONE";

/**
 * A clean chart is the default: only the live quote marker and VWAP render.
 * Every structural level remains one click away in the shared Levels menu.
 */
export const DEFAULT_CHART_LEVEL_VISIBILITY: ChartLevelVisibility = {
  livePrice: true,
  vwap: true,
  premarketHigh: false,
  premarketLow: false,
  previousHigh: false,
  previousLow: false,
  previousClose: false,
  openingRange5High: false,
  openingRange5Low: false,
  openingRange15High: false,
  openingRange15Low: false,
  openingRange30High: false,
  openingRange30Low: false,
  dailyPivot: false,
  weeklyPivot: false,
  callWall: false,
  putWall: false,
  gammaBalance: false,
};

const REFERENCE_LINE_LEVEL_KEY: Readonly<Record<string, ChartLevelKey>> = {
  "Daily P": "dailyPivot",
  "Weekly P": "weeklyPivot",
  "OR5 H": "openingRange5High",
  "OR5 L": "openingRange5Low",
  "OR30 H": "openingRange30High",
  "OR30 L": "openingRange30Low",
  "Call Wall": "callWall",
  "Put Wall": "putWall",
  "Gamma Balance": "gammaBalance",
};

export function getChartLevelPreset(preset: ChartLevelPreset): ChartLevelVisibility {
  if (preset === "ALL") {
    return Object.fromEntries(CHART_LEVEL_KEYS.map((key) => [key, true])) as ChartLevelVisibility;
  }
  if (preset === "NONE") {
    return Object.fromEntries(CHART_LEVEL_KEYS.map((key) => [key, false])) as ChartLevelVisibility;
  }
  return { ...DEFAULT_CHART_LEVEL_VISIBILITY };
}

export function countSelectedChartLevels(visibility: ChartLevelVisibility): number {
  return CHART_LEVEL_KEYS.reduce((count, key) => count + Number(visibility[key]), 0);
}

/**
 * Filters deterministic additional lines without changing their calculation or
 * source data. Unknown future line titles stay hidden until they receive an
 * explicit user-facing toggle, preventing new overlays from silently adding
 * chart clutter.
 */
export function filterChartReferenceLines<T extends { title: string }>(
  lines: readonly T[],
  visibility: ChartLevelVisibility,
): T[] {
  return lines.filter((line) => {
    const levelKey = REFERENCE_LINE_LEVEL_KEY[line.title];
    return levelKey ? visibility[levelKey] : false;
  });
}
