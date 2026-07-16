import { OPTIONS_CHAIN_REQUESTED_STRIKE_COUNT } from "./schwab-options-chain.logic";

const SCHWAB_OPTIONS_CHAIN_URL = "https://api.schwabapi.com/marketdata/v1/chains";
export const OPTIONS_CHAIN_REQUEST_TIMEOUT_MS = 10_000;

export interface SpyZeroDteOptionsChainRequest {
  expirationDate: string;
}

export function buildSpyZeroDteOptionsChainUrl(
  request: SpyZeroDteOptionsChainRequest,
): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(request.expirationDate)) {
    throw new Error("Invalid SPY 0DTE expiration date.");
  }

  const params = new URLSearchParams({
    symbol: "SPY",
    contractType: "ALL",
    strikeCount: String(OPTIONS_CHAIN_REQUESTED_STRIKE_COUNT),
    includeUnderlyingQuote: "true",
    strategy: "SINGLE",
    fromDate: request.expirationDate,
    toDate: request.expirationDate,
  });

  return `${SCHWAB_OPTIONS_CHAIN_URL}?${params.toString()}`;
}

export async function fetchSpyZeroDteOptionsChain(
  accessToken: string,
  request: SpyZeroDteOptionsChainRequest,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPTIONS_CHAIN_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(buildSpyZeroDteOptionsChainUrl(request), {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}
