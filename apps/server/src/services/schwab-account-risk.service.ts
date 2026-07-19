import type {
  AccountRiskSnapshotPrimaryReasonCode,
  SchwabReadOnlyAccountRiskSnapshotResponse,
} from "@spy-copilot/shared";
import { z } from "zod";
import {
  SchwabAuthError,
  deleteStoredTokens,
  getValidAccessToken,
  refreshTokens,
} from "./schwab-auth.service";
import {
  fetchSchwabAccountNumbers,
  fetchSchwabSelectedAccount,
} from "./schwab-account.client";
import {
  buildAccountSelectionRequiredSnapshot,
  buildNoLinkedAccountSnapshot,
  buildUnauthorizedAccountRiskSnapshot,
  buildUnavailableAccountRiskSnapshot,
  normalizeSchwabAccountDiscovery,
  normalizeSchwabSelectedAccount,
  type AccountRiskSourceTimes,
  type AccountRiskUnavailableContext,
} from "./schwab-account-risk.logic";

export interface SchwabAccountRiskDependencies {
  getValidAccessToken: () => Promise<string>;
  refreshTokens: () => Promise<unknown>;
  deleteStoredTokens: () => Promise<boolean>;
  fetchAccountNumbers: (accessToken: string) => Promise<Response>;
  fetchSelectedAccount: (
    accessToken: string,
    accountHash: string,
  ) => Promise<Response>;
  now: () => number;
  log: (category: string) => void;
}

const DEFAULT_DEPENDENCIES: SchwabAccountRiskDependencies = {
  getValidAccessToken,
  refreshTokens,
  deleteStoredTokens,
  fetchAccountNumbers: fetchSchwabAccountNumbers,
  fetchSelectedAccount: fetchSchwabSelectedAccount,
  now: Date.now,
  log: (category) => {
    // Fixed, sanitized categories only. No provider bodies, URLs, tokens,
    // account numbers, hashes, origins, or error messages are included.
    // eslint-disable-next-line no-console
    console.warn(`[account-risk] ${category}`);
  },
};

type ProviderPhase = "discovery" | "balances";
type FailureKind =
  | "UNAUTHORIZED"
  | "TIMEOUT"
  | "NETWORK"
  | "RATE_LIMITED"
  | "UPSTREAM_UNAVAILABLE"
  | "RESPONSE_INVALID";

class AccountRiskFlowFailure extends Error {
  constructor(
    public readonly phase: ProviderPhase,
    public readonly kind: FailureKind,
    public readonly receiptAtMs: number | null = null,
  ) {
    super(`Account-risk flow failure: ${phase}/${kind}`);
    this.name = "AccountRiskFlowFailure";
  }
}

interface RequestState {
  accessToken: string;
  refreshUsed: boolean;
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

async function safeDeleteStoredTokens(
  deps: SchwabAccountRiskDependencies,
): Promise<void> {
  try {
    await deps.deleteStoredTokens();
  } catch {
    deps.log("token invalidation failed");
  }
}

async function authFailureToFlowFailure(
  error: unknown,
  phase: ProviderPhase,
  deps: SchwabAccountRiskDependencies,
): Promise<AccountRiskFlowFailure> {
  if (!(error instanceof SchwabAuthError)) {
    return new AccountRiskFlowFailure(phase, "UPSTREAM_UNAVAILABLE");
  }

  switch (error.category) {
    case "NOT_CONNECTED":
    case "CONFIG_MISSING_OR_INVALID":
      return new AccountRiskFlowFailure(phase, "UNAUTHORIZED");
    case "DECRYPTION_ERROR":
    case "REFRESH_REJECTED":
      await safeDeleteStoredTokens(deps);
      return new AccountRiskFlowFailure(phase, "UNAUTHORIZED");
    case "REFRESH_TIMEOUT":
      return new AccountRiskFlowFailure(phase, "TIMEOUT");
    case "REFRESH_NETWORK_ERROR":
      return new AccountRiskFlowFailure(phase, "NETWORK");
    case "DATABASE_ERROR":
    case "REFRESH_UPSTREAM_ERROR":
    case "AUTH_UNEXPECTED":
    default:
      return new AccountRiskFlowFailure(phase, "UPSTREAM_UNAVAILABLE");
  }
}

async function requestProvider(
  phase: ProviderPhase,
  state: RequestState,
  request: (accessToken: string) => Promise<Response>,
  deps: SchwabAccountRiskDependencies,
): Promise<{ response: Response; receiptAtMs: number }> {
  let response: Response;
  try {
    response = await request(state.accessToken);
  } catch (error) {
    throw new AccountRiskFlowFailure(
      phase,
      isTimeout(error) ? "TIMEOUT" : "NETWORK",
    );
  }
  let receiptAtMs = deps.now();

  if (response.status === 401) {
    if (state.refreshUsed) {
      await safeDeleteStoredTokens(deps);
      throw new AccountRiskFlowFailure(phase, "UNAUTHORIZED", receiptAtMs);
    }
    state.refreshUsed = true;
    try {
      await deps.refreshTokens();
      state.accessToken = await deps.getValidAccessToken();
    } catch (error) {
      throw await authFailureToFlowFailure(error, phase, deps);
    }

    try {
      response = await request(state.accessToken);
    } catch (error) {
      throw new AccountRiskFlowFailure(
        phase,
        isTimeout(error) ? "TIMEOUT" : "NETWORK",
      );
    }
    receiptAtMs = deps.now();
    if (response.status === 401) {
      await safeDeleteStoredTokens(deps);
      throw new AccountRiskFlowFailure(phase, "UNAUTHORIZED", receiptAtMs);
    }
  }

  if (response.status === 429) {
    throw new AccountRiskFlowFailure(phase, "RATE_LIMITED", receiptAtMs);
  }
  if (!response.ok) {
    throw new AccountRiskFlowFailure(
      phase,
      "UPSTREAM_UNAVAILABLE",
      receiptAtMs,
    );
  }

  return { response, receiptAtMs };
}

function reasonForFailure(
  phase: ProviderPhase,
  kind: Exclude<FailureKind, "UNAUTHORIZED">,
): AccountRiskSnapshotPrimaryReasonCode {
  if (kind === "RESPONSE_INVALID") {
    return phase === "discovery"
      ? "ACCOUNT_DISCOVERY_RESPONSE_INVALID"
      : "ACCOUNT_BALANCE_RESPONSE_INVALID";
  }
  if (phase === "discovery") {
    if (kind === "TIMEOUT") return "SCHWAB_ACCOUNT_DISCOVERY_TIMEOUT";
    if (kind === "NETWORK") return "SCHWAB_ACCOUNT_DISCOVERY_NETWORK_ERROR";
    if (kind === "RATE_LIMITED") {
      return "SCHWAB_ACCOUNT_DISCOVERY_RATE_LIMITED";
    }
    return "SCHWAB_ACCOUNT_DISCOVERY_UNAVAILABLE";
  }
  if (kind === "TIMEOUT") return "SCHWAB_ACCOUNT_BALANCES_TIMEOUT";
  if (kind === "NETWORK") return "SCHWAB_ACCOUNT_BALANCES_NETWORK_ERROR";
  if (kind === "RATE_LIMITED") return "SCHWAB_ACCOUNT_BALANCES_RATE_LIMITED";
  return "SCHWAB_ACCOUNT_BALANCES_UNAVAILABLE";
}

function discoveryContext(
  times: AccountRiskSourceTimes,
): AccountRiskUnavailableContext {
  return {
    ...times,
    linkedAccountCount: null,
    selectionState: "UNAVAILABLE",
    accountType: "UNAVAILABLE",
  };
}

function balancesContext(
  times: AccountRiskSourceTimes,
): AccountRiskUnavailableContext {
  return {
    ...times,
    linkedAccountCount: 1,
    selectionState: "SELECTED",
    accountType: "UNAVAILABLE",
  };
}

function buildFailureResponse(
  failure: AccountRiskFlowFailure,
  calculatedAtMs: number,
  knownTimes: AccountRiskSourceTimes,
): SchwabReadOnlyAccountRiskSnapshotResponse {
  const times: AccountRiskSourceTimes = {
    accountDiscoveryFetchedAtMs:
      failure.phase === "discovery" && failure.receiptAtMs !== null
        ? failure.receiptAtMs
        : knownTimes.accountDiscoveryFetchedAtMs,
    accountBalancesFetchedAtMs:
      failure.phase === "balances" && failure.receiptAtMs !== null
        ? failure.receiptAtMs
        : knownTimes.accountBalancesFetchedAtMs,
  };
  const context =
    failure.phase === "discovery"
      ? discoveryContext(times)
      : balancesContext(times);

  if (failure.kind === "UNAUTHORIZED") {
    return buildUnauthorizedAccountRiskSnapshot(calculatedAtMs, context);
  }

  return buildUnavailableAccountRiskSnapshot(
    reasonForFailure(failure.phase, failure.kind),
    calculatedAtMs,
    context,
  );
}

export async function getSchwabReadOnlyAccountRiskSnapshotWithDependencies(
  deps: SchwabAccountRiskDependencies,
): Promise<SchwabReadOnlyAccountRiskSnapshotResponse> {
  const knownTimes: AccountRiskSourceTimes = {
    accountDiscoveryFetchedAtMs: null,
    accountBalancesFetchedAtMs: null,
  };

  let accessToken: string;
  try {
    accessToken = await deps.getValidAccessToken();
  } catch (error) {
    const failure = await authFailureToFlowFailure(error, "discovery", deps);
    return buildFailureResponse(failure, deps.now(), knownTimes);
  }

  const requestState: RequestState = { accessToken, refreshUsed: false };

  let discoveryResponse: Response;
  try {
    const result = await requestProvider(
      "discovery",
      requestState,
      deps.fetchAccountNumbers,
      deps,
    );
    discoveryResponse = result.response;
    knownTimes.accountDiscoveryFetchedAtMs = result.receiptAtMs;
  } catch (error) {
    const failure =
      error instanceof AccountRiskFlowFailure
        ? error
        : new AccountRiskFlowFailure("discovery", "UPSTREAM_UNAVAILABLE");
    deps.log(`discovery ${failure.kind.toLowerCase()}`);
    return buildFailureResponse(failure, deps.now(), knownTimes);
  }

  let discoveryJson: unknown;
  try {
    discoveryJson = await discoveryResponse.json();
  } catch {
    const failure = new AccountRiskFlowFailure(
      "discovery",
      "RESPONSE_INVALID",
      knownTimes.accountDiscoveryFetchedAtMs,
    );
    deps.log("discovery response invalid");
    return buildFailureResponse(failure, deps.now(), knownTimes);
  }

  let accountReferences;
  try {
    accountReferences = normalizeSchwabAccountDiscovery(discoveryJson);
    // Drop the raw discovery payload immediately after extracting hash-only
    // internal references so plain account numbers are not retained.
    discoveryJson = null;
  } catch {
    const failure = new AccountRiskFlowFailure(
      "discovery",
      "RESPONSE_INVALID",
      knownTimes.accountDiscoveryFetchedAtMs,
    );
    deps.log("discovery schema invalid");
    return buildFailureResponse(failure, deps.now(), knownTimes);
  }

  if (accountReferences.length === 0) {
    return buildNoLinkedAccountSnapshot(
      deps.now(),
      knownTimes.accountDiscoveryFetchedAtMs,
    );
  }
  if (accountReferences.length > 1) {
    return buildAccountSelectionRequiredSnapshot(
      accountReferences.length,
      deps.now(),
      knownTimes.accountDiscoveryFetchedAtMs,
    );
  }

  // Exactly one hash is retained only long enough for exactly one balance call.
  const selectedHash = accountReferences[0]!.hashValue;
  let balancesResponse: Response;
  try {
    const result = await requestProvider(
      "balances",
      requestState,
      (token) => deps.fetchSelectedAccount(token, selectedHash),
      deps,
    );
    balancesResponse = result.response;
    knownTimes.accountBalancesFetchedAtMs = result.receiptAtMs;
  } catch (error) {
    const failure =
      error instanceof AccountRiskFlowFailure
        ? error
        : new AccountRiskFlowFailure("balances", "UPSTREAM_UNAVAILABLE");
    deps.log(`balances ${failure.kind.toLowerCase()}`);
    return buildFailureResponse(failure, deps.now(), knownTimes);
  }

  let balancesJson: unknown;
  try {
    balancesJson = await balancesResponse.json();
  } catch {
    const failure = new AccountRiskFlowFailure(
      "balances",
      "RESPONSE_INVALID",
      knownTimes.accountBalancesFetchedAtMs,
    );
    deps.log("balances response invalid");
    return buildFailureResponse(failure, deps.now(), knownTimes);
  }

  try {
    return normalizeSchwabSelectedAccount(balancesJson, deps.now(), {
      accountDiscoveryFetchedAtMs: knownTimes.accountDiscoveryFetchedAtMs,
      accountBalancesFetchedAtMs: knownTimes.accountBalancesFetchedAtMs,
    });
  } catch (error) {
    const reason =
      error instanceof z.ZodError
        ? "ACCOUNT_BALANCE_RESPONSE_INVALID"
        : "ACCOUNT_NORMALIZATION_UNAVAILABLE";
    deps.log(
      error instanceof z.ZodError
        ? "balances schema invalid"
        : "normalization unavailable",
    );
    return buildUnavailableAccountRiskSnapshot(
      reason,
      deps.now(),
      balancesContext(knownTimes),
      "ACCOUNT_NORMALIZATION_VALIDATION_FAILED",
    );
  }
}

export function getLastResortSchwabReadOnlyAccountRiskSnapshot(
  nowMs = Date.now(),
): SchwabReadOnlyAccountRiskSnapshotResponse {
  return buildUnavailableAccountRiskSnapshot(
    "ACCOUNT_NORMALIZATION_UNAVAILABLE",
    nowMs,
    discoveryContext({
      accountDiscoveryFetchedAtMs: null,
      accountBalancesFetchedAtMs: null,
    }),
    "ACCOUNT_NORMALIZATION_VALIDATION_FAILED",
  );
}

export async function getSchwabReadOnlyAccountRiskSnapshot(): Promise<SchwabReadOnlyAccountRiskSnapshotResponse> {
  try {
    return await getSchwabReadOnlyAccountRiskSnapshotWithDependencies(
      DEFAULT_DEPENDENCIES,
    );
  } catch {
    DEFAULT_DEPENDENCIES.log("unexpected service failure");
    return getLastResortSchwabReadOnlyAccountRiskSnapshot();
  }
}
