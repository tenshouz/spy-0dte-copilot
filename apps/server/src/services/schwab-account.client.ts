/**
 * Minimal Schwab Trader API transport for the read-only account-risk snapshot.
 * This module returns untrusted Response objects and never logs URLs, tokens,
 * encrypted account identifiers, headers, or provider bodies.
 */

export const SCHWAB_TRADER_API_BASE_URL = "https://api.schwabapi.com/trader/v1";
export const SCHWAB_ACCOUNT_REQUEST_TIMEOUT_MS = 10_000;

async function fetchWithTimeout(url: string, accessToken: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    SCHWAB_ACCOUNT_REQUEST_TIMEOUT_MS,
  );
  try {
    return await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export function buildSchwabAccountNumbersUrl(): string {
  return `${SCHWAB_TRADER_API_BASE_URL}/accounts/accountNumbers`;
}

export function buildSchwabSelectedAccountUrl(accountHash: string): string {
  if (!accountHash) throw new Error("Encrypted Schwab account identifier is required.");
  return `${SCHWAB_TRADER_API_BASE_URL}/accounts/${encodeURIComponent(accountHash)}`;
}

export function fetchSchwabAccountNumbers(accessToken: string): Promise<Response> {
  return fetchWithTimeout(buildSchwabAccountNumbersUrl(), accessToken);
}

export function fetchSchwabSelectedAccount(
  accessToken: string,
  accountHash: string,
): Promise<Response> {
  // No fields query parameter is intentionally present. Positions are not requested.
  return fetchWithTimeout(buildSchwabSelectedAccountUrl(accountHash), accessToken);
}
