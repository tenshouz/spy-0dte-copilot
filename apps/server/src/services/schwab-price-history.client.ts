/**
 * Shared Schwab Price History request boundary.
 *
 * This module deliberately owns only provider request construction + transport.
 * OAuth/token lifecycle remains in schwab-auth.service.ts, while raw response
 * validation and candle normalization remain in schwab-candles.logic.ts.
 * Both the live chart service and the Session Data Foundation reuse this one
 * provider request path so there is no second candle pipeline.
 */

const SCHWAB_PRICE_HISTORY_URL = "https://api.schwabapi.com/marketdata/v1/pricehistory";
export const PRICE_HISTORY_REQUEST_TIMEOUT_MS = 10_000;

export type SpyPriceHistoryRequest =
  | { kind: "chart" }
  | { kind: "bounded"; startDateMs: number; endDateMs: number };

export function buildSpyPriceHistoryUrl(request: SpyPriceHistoryRequest): string {
  const params = new URLSearchParams({
    symbol: "SPY",
    frequencyType: "minute",
    frequency: "5",
    needExtendedHoursData: "true",
  });

  if (request.kind === "chart") {
    params.set("periodType", "day");
    params.set("period", "1");
  } else {
    if (!Number.isSafeInteger(request.startDateMs) || request.startDateMs <= 0) {
      throw new Error("Invalid bounded price-history startDateMs.");
    }
    if (!Number.isSafeInteger(request.endDateMs) || request.endDateMs <= request.startDateMs) {
      throw new Error("Invalid bounded price-history endDateMs.");
    }
    params.set("startDate", String(request.startDateMs));
    params.set("endDate", String(request.endDateMs));
  }

  return `${SCHWAB_PRICE_HISTORY_URL}?${params.toString()}`;
}

export async function fetchSpyPriceHistory(
  accessToken: string,
  request: SpyPriceHistoryRequest,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PRICE_HISTORY_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(buildSpyPriceHistoryUrl(request), {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}
