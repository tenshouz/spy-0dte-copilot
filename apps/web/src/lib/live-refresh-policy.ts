/**
 * Deterministic frontend refresh policy for live SPY market data.
 *
 * The fast window intentionally matches the provider-aligned premarket start
 * through a short post-close buffer. Outside that window the dashboard remains
 * current without creating unnecessary provider traffic.
 */
export const LIVE_REFRESH_POLICY_VERSION = "LIVE_REFRESH_POLICY_V1" as const;

export const ACTIVE_MARKET_REFRESH_START_MINUTE_ET = 7 * 60;
export const ACTIVE_MARKET_REFRESH_END_MINUTE_ET = 16 * 60 + 15;

export const SPY_QUOTE_ACTIVE_POLL_INTERVAL_MS = 5_000;
export const SPY_QUOTE_INACTIVE_POLL_INTERVAL_MS = 30_000;
export const SPY_CANDLE_ACTIVE_POLL_INTERVAL_MS = 10_000;
export const SPY_CANDLE_INACTIVE_POLL_INTERVAL_MS = 60_000;
export const SPY_DERIVED_ACTIVE_POLL_INTERVAL_MS = 15_000;
export const SPY_DERIVED_INACTIVE_POLL_INTERVAL_MS = 60_000;

interface EasternClockParts {
  weekday: string;
  minuteOfDay: number;
}

const EASTERN_CLOCK_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function getEasternClockParts(nowMs: number): EasternClockParts | null {
  if (!Number.isFinite(nowMs)) return null;

  const parts = EASTERN_CLOCK_FORMATTER.formatToParts(new Date(nowMs));
  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);

  if (!weekday || !Number.isInteger(hour) || !Number.isInteger(minute)) {
    return null;
  }

  return {
    weekday,
    minuteOfDay: hour * 60 + minute,
  };
}

export function isActiveMarketRefreshWindow(nowMs = Date.now()): boolean {
  const parts = getEasternClockParts(nowMs);
  if (!parts || parts.weekday === "Sat" || parts.weekday === "Sun") {
    return false;
  }

  return (
    parts.minuteOfDay >= ACTIVE_MARKET_REFRESH_START_MINUTE_ET &&
    parts.minuteOfDay <= ACTIVE_MARKET_REFRESH_END_MINUTE_ET
  );
}

export function getSpyQuotePollIntervalMs(nowMs = Date.now()): number {
  return isActiveMarketRefreshWindow(nowMs)
    ? SPY_QUOTE_ACTIVE_POLL_INTERVAL_MS
    : SPY_QUOTE_INACTIVE_POLL_INTERVAL_MS;
}

export function getSpyCandlePollIntervalMs(nowMs = Date.now()): number {
  return isActiveMarketRefreshWindow(nowMs)
    ? SPY_CANDLE_ACTIVE_POLL_INTERVAL_MS
    : SPY_CANDLE_INACTIVE_POLL_INTERVAL_MS;
}

export function getSpyDerivedPollIntervalMs(nowMs = Date.now()): number {
  return isActiveMarketRefreshWindow(nowMs)
    ? SPY_DERIVED_ACTIVE_POLL_INTERVAL_MS
    : SPY_DERIVED_INACTIVE_POLL_INTERVAL_MS;
}

export const LIVE_QUERY_RESPONSIVENESS_OPTIONS = {
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: "always" as const,
  refetchOnReconnect: "always" as const,
  staleTime: 0,
};
