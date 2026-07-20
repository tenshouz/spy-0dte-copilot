import type {
  SessionOpeningRangeWindow,
  SpyDeterministicSessionStructureResponse,
  TraditionalPivotSet,
} from "@spy-copilot/shared";

export interface SessionStructureReferenceLine {
  price: number;
  title: string;
  color: string;
  lineStyle?: number;
}

export function formatSessionStructureState(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatStructurePrice(value: number | null): string {
  return value === null ? "—" : `$${value.toFixed(2)}`;
}

export function formatPivotSourceRange(pivots: TraditionalPivotSet): string {
  if (pivots.sourceMarketDateStart === null) return "Source unavailable";
  if (pivots.sourceMarketDateStart === pivots.sourceMarketDateEnd) {
    return pivots.sourceMarketDateStart;
  }
  return `${pivots.sourceMarketDateStart} – ${pivots.sourceMarketDateEnd}`;
}

export function openingRangeTitle(range: SessionOpeningRangeWindow): string {
  return `${range.durationMinutes}-Minute Opening Range`;
}

export function openingRangeDetail(range: SessionOpeningRangeWindow): string {
  if (range.phase === "PRE_OPEN") return "Not started";
  if (range.phase === "UNAVAILABLE") return "Source unavailable";
  const lifecycle = range.isComplete ? "Complete" : "Forming";
  return `${lifecycle} · ${formatSessionStructureState(range.interactionState)}`;
}

export function getEasternMarketDate(timestamp: string | null): string | null {
  if (timestamp === null) return null;
  const parsed = new Date(timestamp);
  if (!Number.isFinite(parsed.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(parsed);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : null;
}

export function getSessionStructureReferenceLines(
  response: SpyDeterministicSessionStructureResponse,
): SessionStructureReferenceLine[] {
  const lines: SessionStructureReferenceLine[] = [];
  if (response.dailyPivots.pivot !== null) {
    lines.push({
      price: response.dailyPivots.pivot,
      title: "Daily P",
      color: "#FACC15",
      lineStyle: 2,
    });
  }
  if (response.weeklyPivots.pivot !== null) {
    lines.push({
      price: response.weeklyPivots.pivot,
      title: "Weekly P",
      color: "#E879F9",
      lineStyle: 2,
    });
  }
  for (const [key, title, color] of [
    ["fiveMinute", "OR5", "#22D3EE"],
    ["thirtyMinute", "OR30", "#FB7185"],
  ] as const) {
    const range = response.openingRanges[key];
    if (range.high !== null) {
      lines.push({ price: range.high, title: `${title} H`, color, lineStyle: 3 });
    }
    if (range.low !== null) {
      lines.push({ price: range.low, title: `${title} L`, color, lineStyle: 3 });
    }
  }
  return lines;
}
