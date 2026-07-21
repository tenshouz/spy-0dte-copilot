import type {
  PointInTimeBacktestEpisode,
  PointInTimeBacktestRunRequest,
} from "@spy-copilot/shared";

export const BACKTEST_OUTCOME_LABEL: Record<
  PointInTimeBacktestEpisode["outcomeState"],
  string
> = {
  TARGET_FIRST: "Target first",
  STOP_FIRST: "Stop first",
  AMBIGUOUS_SAME_CANDLE: "Ambiguous same candle",
  TIMEOUT: "Timed out",
  SESSION_END: "Session ended",
  INSUFFICIENT_FUTURE_DATA: "Insufficient future capture",
};

export function buildPointInTimeBacktestRequest(args: {
  startMarketDate: string;
  endMarketDate: string;
  maximumHoldMinutes: number;
}): PointInTimeBacktestRunRequest {
  return {
    startMarketDate: args.startMarketDate.trim() || null,
    endMarketDate: args.endMarketDate.trim() || null,
    maximumHoldMinutes: args.maximumHoldMinutes,
  };
}

export function formatBacktestPercent(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

export function formatBacktestNumber(
  value: number | null,
  digits = 2,
): string {
  return value === null ? "—" : value.toFixed(digits);
}

export function formatBacktestMoney(value: number | null): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatBacktestEasternTime(value: string | null): string {
  if (value === null) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

export function outcomeIsResolvedDirectional(
  outcome: PointInTimeBacktestEpisode["outcomeState"],
): boolean {
  return outcome === "TARGET_FIRST" || outcome === "STOP_FIRST";
}
