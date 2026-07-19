/**
 * Deterministic tests for ACCOUNT_RISK_SNAPSHOT_V1.
 * Run: npx --no-install tsx apps/server/src/services/schwab-account-risk.spec.ts
 */
import assert from "node:assert/strict";
import http from "node:http";
import {
  SchwabReadOnlyAccountRiskSnapshotResponseSchema,
  type SchwabReadOnlyAccountRiskSnapshotResponse,
} from "@spy-copilot/shared";
import cors from "cors";
import express from "express";
import {
  createAccountRiskRouter,
  isAllowedAccountRiskOrigin,
} from "../routes/account-risk.routes";
import { SchwabAuthError } from "./schwab-auth.service";
import {
  SCHWAB_ACCOUNT_REQUEST_TIMEOUT_MS,
  buildSchwabAccountNumbersUrl,
  buildSchwabSelectedAccountUrl,
} from "./schwab-account.client";
import {
  ACCOUNT_RISK_SNAPSHOT_METHODOLOGY_VERSION,
  buildAccountSelectionRequiredSnapshot,
  buildNoLinkedAccountSnapshot,
  buildUnavailableAccountRiskSnapshot,
  normalizeSchwabAccountDiscovery,
  normalizeSchwabSelectedAccount,
} from "./schwab-account-risk.logic";
import {
  getSchwabReadOnlyAccountRiskSnapshotWithDependencies,
  type SchwabAccountRiskDependencies,
} from "./schwab-account-risk.service";

const DISCOVERY_AT = Date.parse("2026-07-18T20:00:00.000Z");
const BALANCES_AT = Date.parse("2026-07-18T20:00:00.100Z");
const CALCULATED_AT = Date.parse("2026-07-18T20:00:00.200Z");
const PRIVATE_HASH = "private-encrypted-account-hash";
const PRIVATE_ACCOUNT = "123456789";
const ACCESS_TOKEN = "private-access-token";
const REFRESH_TOKEN = "private-refresh-token";

function discoveryItem(overrides: Record<string, unknown> = {}) {
  return {
    accountNumber: PRIVATE_ACCOUNT,
    hashValue: PRIVATE_HASH,
    ...overrides,
  };
}

function selectedAccount(
  type: unknown,
  currentBalances: Record<string, unknown>,
  extras: Record<string, unknown> = {},
) {
  return {
    securitiesAccount: {
      type,
      currentBalances,
      initialBalances: { accountValue: 999_999 },
      projectedBalances: { cashAvailableForTrading: 888_888 },
      positions: [{ symbol: "SECRET" }],
      ...extras,
    },
    providerExtra: true,
  };
}

function responseJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function nonJsonResponse(status = 200): Response {
  return new Response("not-json", { status });
}

function cashSnapshot(value = 0.5): SchwabReadOnlyAccountRiskSnapshotResponse {
  return normalizeSchwabSelectedAccount(
    selectedAccount("CASH", { cashAvailableForTrading: value }),
    CALCULATED_AT,
    {
      accountDiscoveryFetchedAtMs: DISCOVERY_AT,
      accountBalancesFetchedAtMs: BALANCES_AT,
    },
  );
}

interface DependencyHarness {
  deps: SchwabAccountRiskDependencies;
  calls: {
    getToken: number;
    refresh: number;
    deleteTokens: number;
    discovery: number;
    balances: number;
  };
  logs: string[];
  selectedHashes: string[];
}

function harness(options: {
  discovery?: Array<Response | Error>;
  balances?: Array<Response | Error>;
  token?: Array<string | Error>;
  refresh?: Array<unknown | Error>;
  deleteResult?: boolean;
} = {}): DependencyHarness {
  const discovery = [...(options.discovery ?? [responseJson([discoveryItem()])])];
  const balances = [
    ...(options.balances ?? [
      responseJson(selectedAccount("CASH", { cashAvailableForTrading: 0.5 })),
    ]),
  ];
  const tokens = [...(options.token ?? [ACCESS_TOKEN])];
  const refresh = [...(options.refresh ?? [undefined])];
  const calls = {
    getToken: 0,
    refresh: 0,
    deleteTokens: 0,
    discovery: 0,
    balances: 0,
  };
  const logs: string[] = [];
  const selectedHashes: string[] = [];
  let now = DISCOVERY_AT - 1;

  const take = <T>(queue: T[], fallback: T): T =>
    queue.length > 0 ? queue.shift()! : fallback;
  const resolveOrThrow = async <T>(value: T | Error): Promise<T> => {
    if (value instanceof Error) throw value;
    return value;
  };

  return {
    calls,
    logs,
    selectedHashes,
    deps: {
      getValidAccessToken: async () => {
        calls.getToken += 1;
        return resolveOrThrow(take(tokens, ACCESS_TOKEN));
      },
      refreshTokens: async () => {
        calls.refresh += 1;
        return resolveOrThrow(take(refresh, undefined));
      },
      deleteStoredTokens: async () => {
        calls.deleteTokens += 1;
        return options.deleteResult ?? true;
      },
      fetchAccountNumbers: async () => {
        calls.discovery += 1;
        return resolveOrThrow(
          take(discovery, responseJson([discoveryItem()])),
        );
      },
      fetchSelectedAccount: async (_token, hash) => {
        calls.balances += 1;
        selectedHashes.push(hash);
        return resolveOrThrow(
          take(
            balances,
            responseJson(
              selectedAccount("CASH", { cashAvailableForTrading: 0.5 }),
            ),
          ),
        );
      },
      now: () => {
        now += 1;
        return now;
      },
      log: (category) => logs.push(category),
    },
  };
}

let passed = 0;
type TestFunction = () => void | Promise<void>;
const tests: Array<[string, TestFunction]> = [];
function test(name: string, fn: TestFunction): void {
  tests.push([name, fn]);
}

function assertNoPrivateData(value: unknown): void {
  const serialized = JSON.stringify(value);
  if (
    typeof value === "object" &&
    value !== null &&
    "source" in value &&
    typeof (value as { source?: unknown }).source === "object" &&
    (value as { source: Record<string, unknown> }).source !== null
  ) {
    const source = (value as { source: Record<string, unknown> }).source;
    assert.equal(source.positionsRequested, false);
    assert.equal(source.ordersRequested, false);
    assert.equal(source.transactionsRequested, false);
  }
  for (const prohibited of [
    PRIVATE_ACCOUNT,
    PRIVATE_HASH,
    ACCESS_TOKEN,
    REFRESH_TOKEN,
    "accountNumber",
    "hashValue",
    "accountHash",
    "buyingPower",
    "dayTradingBuyingPower",
    "optionBuyingPower",
    "orderQuantity",
    "maximumContracts",
    "premiumTarget",
    "premiumStop",
  ]) {
    assert.equal(serialized.includes(prohibited), false, prohibited);
  }
}

// Product and provider discovery.
test("account discovery URL is the verified Schwab Trader endpoint", () => {
  assert.equal(
    buildSchwabAccountNumbersUrl(),
    "https://api.schwabapi.com/trader/v1/accounts/accountNumbers",
  );
});

test("selected-account URL uses the encrypted hash and omits fields", () => {
  const url = buildSchwabSelectedAccountUrl("hash/with+reserved");
  assert.equal(
    url,
    "https://api.schwabapi.com/trader/v1/accounts/hash%2Fwith%2Breserved",
  );
  assert.equal(url.includes("?"), false);
  assert.equal(url.includes("positions"), false);
});

test("account provider timeout is exactly ten seconds", () => {
  assert.equal(SCHWAB_ACCOUNT_REQUEST_TIMEOUT_MS, 10_000);
});

test("methodology version is ACCOUNT_RISK_SNAPSHOT_V1", () => {
  assert.equal(
    ACCOUNT_RISK_SNAPSHOT_METHODOLOGY_VERSION,
    "ACCOUNT_RISK_SNAPSHOT_V1",
  );
});

test("discovery strips raw account numbers immediately", () => {
  const normalized = normalizeSchwabAccountDiscovery([discoveryItem()]);
  assert.deepEqual(normalized, [{ hashValue: PRIVATE_HASH }]);
  assert.equal("accountNumber" in normalized[0]!, false);
});

test("discovery tolerates additive provider fields", () => {
  const normalized = normalizeSchwabAccountDiscovery([
    discoveryItem({ providerNewField: { anything: true } }),
  ]);
  assert.equal(normalized.length, 1);
});

for (const [name, payload] of [
  ["missing account number", [{ hashValue: PRIVATE_HASH }]],
  ["missing hash", [{ accountNumber: PRIVATE_ACCOUNT }]],
  ["empty account number", [discoveryItem({ accountNumber: "" })]],
  ["empty hash", [discoveryItem({ hashValue: "" })]],
  ["malformed discovery object", { accountNumber: PRIVATE_ACCOUNT }],
  ["null discovery payload", null],
] as const) {
  test(`discovery rejects ${name}`, () => {
    assert.throws(() => normalizeSchwabAccountDiscovery(payload));
  });
}

// Pure current-balance normalization.
for (const [label, value] of [
  ["positive", 100.25],
  ["zero", 0],
  ["negative", -12.5],
] as const) {
  test(`CASH preserves ${label} cashAvailableForTrading`, () => {
    const result = normalizeSchwabSelectedAccount(
      selectedAccount("CASH", { cashAvailableForTrading: value }),
      CALCULATED_AT,
      {
        accountDiscoveryFetchedAtMs: DISCOVERY_AT,
        accountBalancesFetchedAtMs: BALANCES_AT,
      },
    );
    assert.equal(result.snapshotState, "PARTIAL");
    assert.equal(result.balances.availableCashDollars, value);
    assert.equal(result.balances.accountEquityDollars, null);
    assert.equal(
      result.warningCode,
      value < 0
        ? "NEGATIVE_BROKER_BALANCE_REPORTED"
        : "ACCOUNT_EQUITY_UNAVAILABLE",
    );
  });
}

for (const [label, value] of [
  ["missing", undefined],
  ["null", null],
  ["string", "100"],
  ["NaN", Number.NaN],
  ["Infinity", Number.POSITIVE_INFINITY],
] as const) {
  test(`CASH rejects ${label} approved cash field`, () => {
    const balances: Record<string, unknown> = {};
    if (label !== "missing") balances.cashAvailableForTrading = value;
    const result = normalizeSchwabSelectedAccount(
      selectedAccount("CASH", balances),
      CALCULATED_AT,
      {
        accountDiscoveryFetchedAtMs: DISCOVERY_AT,
        accountBalancesFetchedAtMs: BALANCES_AT,
      },
    );
    assert.equal(result.snapshotState, "UNAVAILABLE");
    assert.equal(result.primaryReasonCode, "AVAILABLE_CASH_FIELD_UNAVAILABLE");
    assert.equal(result.balances.availableCashDollars, null);
  });
}

for (const fallback of [
  "totalCash",
  "cashAvailableForWithdrawal",
  "longNonMarginableMarketValue",
  "unsettledCash",
] as const) {
  test(`CASH does not substitute ${fallback}`, () => {
    const result = normalizeSchwabSelectedAccount(
      selectedAccount("CASH", { [fallback]: 50 }),
      CALCULATED_AT,
      {
        accountDiscoveryFetchedAtMs: DISCOVERY_AT,
        accountBalancesFetchedAtMs: BALANCES_AT,
      },
    );
    assert.equal(result.snapshotState, "UNAVAILABLE");
    assert.equal(result.balances.availableCashDollars, null);
  });
}

test("CASH does not use initial accountValue", () => {
  const result = normalizeSchwabSelectedAccount(
    selectedAccount("CASH", {}, { initialBalances: { accountValue: 55_000 } }),
    CALCULATED_AT,
    {
      accountDiscoveryFetchedAtMs: DISCOVERY_AT,
      accountBalancesFetchedAtMs: BALANCES_AT,
    },
  );
  assert.equal(result.balances.accountEquityDollars, null);
  assert.equal(result.snapshotState, "UNAVAILABLE");
});

for (const [label, value] of [
  ["positive", 25_000.5],
  ["zero", 0],
  ["negative", -125],
] as const) {
  test(`MARGIN preserves ${label} equity`, () => {
    const result = normalizeSchwabSelectedAccount(
      selectedAccount("MARGIN", { equity: value }),
      CALCULATED_AT,
      {
        accountDiscoveryFetchedAtMs: DISCOVERY_AT,
        accountBalancesFetchedAtMs: BALANCES_AT,
      },
    );
    assert.equal(result.snapshotState, "PARTIAL");
    assert.equal(result.balances.accountEquityDollars, value);
    assert.equal(result.balances.availableCashDollars, null);
    assert.equal(
      result.warningCode,
      value < 0
        ? "NEGATIVE_BROKER_BALANCE_REPORTED"
        : "AVAILABLE_CASH_UNAVAILABLE",
    );
  });
}

for (const [label, value] of [
  ["missing", undefined],
  ["null", null],
  ["string", "25000"],
  ["NaN", Number.NaN],
  ["Infinity", Number.NEGATIVE_INFINITY],
] as const) {
  test(`MARGIN rejects ${label} approved equity field`, () => {
    const balances: Record<string, unknown> = {};
    if (label !== "missing") balances.equity = value;
    const result = normalizeSchwabSelectedAccount(
      selectedAccount("MARGIN", balances),
      CALCULATED_AT,
      {
        accountDiscoveryFetchedAtMs: DISCOVERY_AT,
        accountBalancesFetchedAtMs: BALANCES_AT,
      },
    );
    assert.equal(result.snapshotState, "UNAVAILABLE");
    assert.equal(result.primaryReasonCode, "ACCOUNT_EQUITY_FIELD_UNAVAILABLE");
  });
}

for (const fallback of [
  "availableFunds",
  "availableFundsNonMarginableTrade",
  "buyingPower",
  "buyingPowerNonMarginableTrade",
  "optionBuyingPower",
  "stockBuyingPower",
  "dayTradingBuyingPower",
] as const) {
  test(`MARGIN does not normalize ${fallback}`, () => {
    const result = normalizeSchwabSelectedAccount(
      selectedAccount("MARGIN", { equity: 25_000, [fallback]: 10_000 }),
      CALCULATED_AT,
      {
        accountDiscoveryFetchedAtMs: DISCOVERY_AT,
        accountBalancesFetchedAtMs: BALANCES_AT,
      },
    );
    assert.equal(result.balances.availableCashDollars, null);
    assertNoPrivateData(result);
  });
}

test("MARGIN does not use initial liquidationValue", () => {
  const result = normalizeSchwabSelectedAccount(
    selectedAccount("MARGIN", {}, { initialBalances: { liquidationValue: 25_000 } }),
    CALCULATED_AT,
    {
      accountDiscoveryFetchedAtMs: DISCOVERY_AT,
      accountBalancesFetchedAtMs: BALANCES_AT,
    },
  );
  assert.equal(result.snapshotState, "UNAVAILABLE");
  assert.equal(result.balances.accountEquityDollars, null);
});

test("unknown string account type becomes UNSUPPORTED_ACCOUNT", () => {
  const result = normalizeSchwabSelectedAccount(
    selectedAccount("IRA_UNKNOWN", {}),
    CALCULATED_AT,
    {
      accountDiscoveryFetchedAtMs: DISCOVERY_AT,
      accountBalancesFetchedAtMs: BALANCES_AT,
    },
  );
  assert.equal(result.snapshotState, "UNSUPPORTED_ACCOUNT");
  assert.equal(result.accountSelection.accountType, "UNSUPPORTED");
});

test("missing account type is schema-invalid", () => {
  assert.throws(() =>
    normalizeSchwabSelectedAccount(
      { securitiesAccount: { currentBalances: {} } },
      CALCULATED_AT,
      {
        accountDiscoveryFetchedAtMs: DISCOVERY_AT,
        accountBalancesFetchedAtMs: BALANCES_AT,
      },
    ),
  );
});

test("wrong-type account type is schema-invalid", () => {
  assert.throws(() =>
    normalizeSchwabSelectedAccount(
      selectedAccount(123, {}),
      CALCULATED_AT,
      {
        accountDiscoveryFetchedAtMs: DISCOVERY_AT,
        accountBalancesFetchedAtMs: BALANCES_AT,
      },
    ),
  );
});

test("V1 normalizers never emit READY", () => {
  for (const result of [
    cashSnapshot(),
    normalizeSchwabSelectedAccount(
      selectedAccount("MARGIN", { equity: 25_000 }),
      CALCULATED_AT,
      {
        accountDiscoveryFetchedAtMs: DISCOVERY_AT,
        accountBalancesFetchedAtMs: BALANCES_AT,
      },
    ),
    normalizeSchwabSelectedAccount(
      selectedAccount("UNKNOWN", {}),
      CALCULATED_AT,
      {
        accountDiscoveryFetchedAtMs: DISCOVERY_AT,
        accountBalancesFetchedAtMs: BALANCES_AT,
      },
    ),
  ]) {
    assert.notEqual(result.snapshotState, "READY");
  }
});

// Strict public schema/refinement checks.
for (const [name, mutate] of [
  ["unknown public field", (v: any) => (v.accountNumber = PRIVATE_ACCOUNT)],
  ["CASH PARTIAL without cash", (v: any) => (v.balances.availableCashDollars = null)],
  ["CASH PARTIAL with equity", (v: any) => (v.balances.accountEquityDollars = 0.5)],
  ["wrong CASH source field", (v: any) => (v.balances.availableCashSourceField = null)],
  ["PARTIAL with linked count two", (v: any) => (v.accountSelection.linkedAccountCount = 2)],
  ["PARTIAL with AVAILABLE engine", (v: any) => (v.engineState = "AVAILABLE")],
  ["retained stale true", (v: any) => (v.source.retainedStaleDataUsed = true)],
  ["positions requested true", (v: any) => (v.source.positionsRequested = true)],
  ["missing disclosure", (v: any) => delete v.disclosures.noPersistence],
  ["invalid calculated timestamp", (v: any) => (v.calculatedAt = "yesterday")],
  ["READY state", (v: any) => (v.snapshotState = "READY")],
] as const) {
  test(`public schema rejects ${name}`, () => {
    const value = structuredClone(cashSnapshot()) as any;
    mutate(value);
    assert.equal(
      SchwabReadOnlyAccountRiskSnapshotResponseSchema.safeParse(value).success,
      false,
    );
  });
}

test("NO_ACCOUNT schema requires linked count zero", () => {
  const value = structuredClone(
    buildNoLinkedAccountSnapshot(CALCULATED_AT, DISCOVERY_AT),
  ) as any;
  value.accountSelection.linkedAccountCount = 1;
  assert.equal(
    SchwabReadOnlyAccountRiskSnapshotResponseSchema.safeParse(value).success,
    false,
  );
});

test("ACCOUNT_SELECTION_REQUIRED schema requires count above one", () => {
  const value = structuredClone(
    buildAccountSelectionRequiredSnapshot(2, CALCULATED_AT, DISCOVERY_AT),
  ) as any;
  value.accountSelection.linkedAccountCount = 1;
  assert.equal(
    SchwabReadOnlyAccountRiskSnapshotResponseSchema.safeParse(value).success,
    false,
  );
});

test("public schema rejects fractional linked-account count", () => {
  const value = structuredClone(cashSnapshot()) as any;
  value.accountSelection.linkedAccountCount = 1.5;
  assert.equal(
    SchwabReadOnlyAccountRiskSnapshotResponseSchema.safeParse(value).success,
    false,
  );
});

// Service selection and call-count behavior.
test("zero linked accounts returns NO_ACCOUNT and skips balance call", async () => {
  const h = harness({ discovery: [responseJson([])] });
  const result = await getSchwabReadOnlyAccountRiskSnapshotWithDependencies(h.deps);
  assert.equal(result.snapshotState, "NO_ACCOUNT");
  assert.equal(h.calls.discovery, 1);
  assert.equal(h.calls.balances, 0);
});

test("one linked account performs exactly one balance call", async () => {
  const h = harness();
  const result = await getSchwabReadOnlyAccountRiskSnapshotWithDependencies(h.deps);
  assert.equal(result.snapshotState, "PARTIAL");
  assert.equal(h.calls.discovery, 1);
  assert.equal(h.calls.balances, 1);
  assert.deepEqual(h.selectedHashes, [PRIVATE_HASH]);
  assertNoPrivateData(result);
});

test("multiple accounts require selection and skip all balance calls", async () => {
  const h = harness({
    discovery: [
      responseJson([
        discoveryItem(),
        discoveryItem({ accountNumber: "987654321", hashValue: "second-hash" }),
      ]),
    ],
  });
  const result = await getSchwabReadOnlyAccountRiskSnapshotWithDependencies(h.deps);
  assert.equal(result.snapshotState, "ACCOUNT_SELECTION_REQUIRED");
  assert.equal(result.accountSelection.linkedAccountCount, 2);
  assert.equal(h.calls.balances, 0);
});

test("service tolerates additive discovery and balance fields", async () => {
  const h = harness({
    discovery: [responseJson([discoveryItem({ newDiscoveryField: 1 })])],
    balances: [
      responseJson(
        selectedAccount(
          "CASH",
          { cashAvailableForTrading: 0.5, newBalanceField: 100 },
          { newAccountField: true },
        ),
      ),
    ],
  });
  const result = await getSchwabReadOnlyAccountRiskSnapshotWithDependencies(h.deps);
  assert.equal(result.snapshotState, "PARTIAL");
});

test("malformed discovery response becomes sanitized UNAVAILABLE", async () => {
  const h = harness({ discovery: [responseJson([{ hashValue: PRIVATE_HASH }])] });
  const result = await getSchwabReadOnlyAccountRiskSnapshotWithDependencies(h.deps);
  assert.equal(result.primaryReasonCode, "ACCOUNT_DISCOVERY_RESPONSE_INVALID");
  assert.equal(h.calls.balances, 0);
  assertNoPrivateData(result);
  assertNoPrivateData(h.logs);
});

test("malformed balance response becomes sanitized UNAVAILABLE", async () => {
  const h = harness({ balances: [responseJson({ nope: true })] });
  const result = await getSchwabReadOnlyAccountRiskSnapshotWithDependencies(h.deps);
  assert.equal(result.primaryReasonCode, "ACCOUNT_BALANCE_RESPONSE_INVALID");
  assertNoPrivateData(result);
});

// Authentication and transport mapping.
test("discovery 401 refreshes and retries exactly once", async () => {
  const h = harness({
    discovery: [responseJson({}, 401), responseJson([discoveryItem()])],
    token: [ACCESS_TOKEN, "new-access-token"],
  });
  const result = await getSchwabReadOnlyAccountRiskSnapshotWithDependencies(h.deps);
  assert.equal(result.snapshotState, "PARTIAL");
  assert.equal(h.calls.refresh, 1);
  assert.equal(h.calls.discovery, 2);
});

test("balance 401 refreshes and retries exactly once", async () => {
  const h = harness({
    balances: [
      responseJson({}, 401),
      responseJson(selectedAccount("CASH", { cashAvailableForTrading: 0.5 })),
    ],
    token: [ACCESS_TOKEN, "new-access-token"],
  });
  const result = await getSchwabReadOnlyAccountRiskSnapshotWithDependencies(h.deps);
  assert.equal(result.snapshotState, "PARTIAL");
  assert.equal(h.calls.refresh, 1);
  assert.equal(h.calls.balances, 2);
});

test("persistent provider 401 becomes UNAUTHORIZED and invalidates tokens", async () => {
  const h = harness({
    discovery: [responseJson({}, 401), responseJson({}, 401)],
    token: [ACCESS_TOKEN, "new-access-token"],
  });
  const result = await getSchwabReadOnlyAccountRiskSnapshotWithDependencies(h.deps);
  assert.equal(result.snapshotState, "UNAUTHORIZED");
  assert.equal(h.calls.refresh, 1);
  assert.equal(h.calls.deleteTokens, 1);
});

test("a second phase cannot create a second refresh loop", async () => {
  const h = harness({
    discovery: [responseJson({}, 401), responseJson([discoveryItem()])],
    balances: [responseJson({}, 401)],
    token: [ACCESS_TOKEN, "new-access-token"],
  });
  const result = await getSchwabReadOnlyAccountRiskSnapshotWithDependencies(h.deps);
  assert.equal(result.snapshotState, "UNAUTHORIZED");
  assert.equal(h.calls.refresh, 1);
  assert.equal(h.calls.balances, 1);
});

for (const category of [
  "NOT_CONNECTED",
  "CONFIG_MISSING_OR_INVALID",
  "DECRYPTION_ERROR",
  "REFRESH_REJECTED",
] as const) {
  test(`${category} auth failure becomes UNAUTHORIZED`, async () => {
    const h = harness({ token: [new SchwabAuthError(category)] });
    const result = await getSchwabReadOnlyAccountRiskSnapshotWithDependencies(h.deps);
    assert.equal(result.snapshotState, "UNAUTHORIZED");
    assert.equal(h.calls.discovery, 0);
    assert.equal(
      h.calls.deleteTokens,
      ["DECRYPTION_ERROR", "REFRESH_REJECTED"].includes(category) ? 1 : 0,
    );
  });
}

for (const [category, reason] of [
  ["DATABASE_ERROR", "SCHWAB_ACCOUNT_DISCOVERY_UNAVAILABLE"],
  ["REFRESH_TIMEOUT", "SCHWAB_ACCOUNT_DISCOVERY_TIMEOUT"],
  ["REFRESH_NETWORK_ERROR", "SCHWAB_ACCOUNT_DISCOVERY_NETWORK_ERROR"],
  ["REFRESH_UPSTREAM_ERROR", "SCHWAB_ACCOUNT_DISCOVERY_UNAVAILABLE"],
  ["AUTH_UNEXPECTED", "SCHWAB_ACCOUNT_DISCOVERY_UNAVAILABLE"],
] as const) {
  test(`${category} auth failure maps to ${reason}`, async () => {
    const h = harness({ token: [new SchwabAuthError(category)] });
    const result = await getSchwabReadOnlyAccountRiskSnapshotWithDependencies(h.deps);
    assert.equal(result.snapshotState, "UNAVAILABLE");
    assert.equal(result.primaryReasonCode, reason);
  });
}

for (const [status, reason] of [
  [403, "SCHWAB_ACCOUNT_DISCOVERY_UNAVAILABLE"],
  [429, "SCHWAB_ACCOUNT_DISCOVERY_RATE_LIMITED"],
  [500, "SCHWAB_ACCOUNT_DISCOVERY_UNAVAILABLE"],
  [503, "SCHWAB_ACCOUNT_DISCOVERY_UNAVAILABLE"],
] as const) {
  test(`discovery HTTP ${status} maps to ${reason}`, async () => {
    const h = harness({ discovery: [responseJson({}, status)] });
    const result = await getSchwabReadOnlyAccountRiskSnapshotWithDependencies(h.deps);
    assert.equal(result.primaryReasonCode, reason);
    assert.equal(h.calls.balances, 0);
  });
}

for (const [status, reason] of [
  [403, "SCHWAB_ACCOUNT_BALANCES_UNAVAILABLE"],
  [429, "SCHWAB_ACCOUNT_BALANCES_RATE_LIMITED"],
  [500, "SCHWAB_ACCOUNT_BALANCES_UNAVAILABLE"],
  [503, "SCHWAB_ACCOUNT_BALANCES_UNAVAILABLE"],
] as const) {
  test(`balances HTTP ${status} maps to ${reason}`, async () => {
    const h = harness({ balances: [responseJson({}, status)] });
    const result = await getSchwabReadOnlyAccountRiskSnapshotWithDependencies(h.deps);
    assert.equal(result.primaryReasonCode, reason);
  });
}

test("discovery timeout maps without stale fallback", async () => {
  const error = new Error("private detail");
  error.name = "AbortError";
  const h = harness({ discovery: [error] });
  const result = await getSchwabReadOnlyAccountRiskSnapshotWithDependencies(h.deps);
  assert.equal(result.primaryReasonCode, "SCHWAB_ACCOUNT_DISCOVERY_TIMEOUT");
  assert.equal(result.source.retainedStaleDataUsed, false);
});

test("balance timeout maps without stale fallback", async () => {
  const error = new Error("private detail");
  error.name = "AbortError";
  const h = harness({ balances: [error] });
  const result = await getSchwabReadOnlyAccountRiskSnapshotWithDependencies(h.deps);
  assert.equal(result.primaryReasonCode, "SCHWAB_ACCOUNT_BALANCES_TIMEOUT");
  assert.equal(result.source.retainedStaleDataUsed, false);
});

test("discovery network error is sanitized", async () => {
  const h = harness({ discovery: [new Error(`network ${PRIVATE_HASH}`)] });
  const result = await getSchwabReadOnlyAccountRiskSnapshotWithDependencies(h.deps);
  assert.equal(result.primaryReasonCode, "SCHWAB_ACCOUNT_DISCOVERY_NETWORK_ERROR");
  assertNoPrivateData(result);
  assertNoPrivateData(h.logs);
});

test("balance network error is sanitized", async () => {
  const h = harness({ balances: [new Error(`network ${PRIVATE_HASH}`)] });
  const result = await getSchwabReadOnlyAccountRiskSnapshotWithDependencies(h.deps);
  assert.equal(result.primaryReasonCode, "SCHWAB_ACCOUNT_BALANCES_NETWORK_ERROR");
  assertNoPrivateData(result);
});

test("discovery non-JSON response is invalid", async () => {
  const h = harness({ discovery: [nonJsonResponse()] });
  const result = await getSchwabReadOnlyAccountRiskSnapshotWithDependencies(h.deps);
  assert.equal(result.primaryReasonCode, "ACCOUNT_DISCOVERY_RESPONSE_INVALID");
});

test("balance non-JSON response is invalid", async () => {
  const h = harness({ balances: [nonJsonResponse()] });
  const result = await getSchwabReadOnlyAccountRiskSnapshotWithDependencies(h.deps);
  assert.equal(result.primaryReasonCode, "ACCOUNT_BALANCE_RESPONSE_INVALID");
});

// Origin helper and actual HTTP middleware behavior.
test("origin helper allows no Origin", () => {
  assert.equal(
    isAllowedAccountRiskOrigin(undefined, "http://localhost:3000/path"),
    true,
  );
});

test("origin helper allows exact configured frontend origin", () => {
  assert.equal(
    isAllowedAccountRiskOrigin(
      "http://localhost:3000",
      "http://localhost:3000/dashboard",
    ),
    true,
  );
});

test("origin helper rejects another browser origin", () => {
  assert.equal(
    isAllowedAccountRiskOrigin(
      "https://evil.example",
      "http://localhost:3000",
    ),
    false,
  );
});

async function withRouteServer(
  getSnapshot: () => Promise<SchwabReadOnlyAccountRiskSnapshotResponse>,
  fn: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const app = express();
  app.use(cors());
  app.use(
    "/api/account-risk",
    createAccountRiskRouter({
      getSnapshot,
      frontendUrl: () => "http://localhost:3000/dashboard",
      log: () => undefined,
    }),
  );
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

test("HTTP no-Origin request succeeds with all private headers", async () => {
  let calls = 0;
  await withRouteServer(
    async () => {
      calls += 1;
      return cashSnapshot();
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/account-risk/schwab`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(response.headers.get("pragma"), "no-cache");
      assert.equal(
        response.headers.get("cross-origin-resource-policy"),
        "same-site",
      );
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      assert.equal(response.headers.get("access-control-allow-origin"), null);
      assert.equal(calls, 1);
    },
  );
});

test("HTTP configured Origin succeeds and is echoed narrowly", async () => {
  let calls = 0;
  await withRouteServer(
    async () => {
      calls += 1;
      return cashSnapshot();
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/account-risk/schwab`, {
        headers: { Origin: "http://localhost:3000" },
      });
      assert.equal(response.status, 200);
      assert.equal(
        response.headers.get("access-control-allow-origin"),
        "http://localhost:3000",
      );
      assert.equal(calls, 1);
    },
  );
});

test("HTTP disallowed Origin returns 403 before service activity", async () => {
  let calls = 0;
  await withRouteServer(
    async () => {
      calls += 1;
      return cashSnapshot();
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/account-risk/schwab`, {
        headers: { Origin: "https://evil.example" },
      });
      assert.equal(response.status, 403);
      assert.equal(response.headers.get("access-control-allow-origin"), null);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(calls, 0);
      const text = await response.text();
      assert.equal(text.includes("stack"), false);
      assert.equal(text.includes("evil.example"), false);
    },
  );
});

test("HTTP query parameter returns sanitized 400 before service activity", async () => {
  let calls = 0;
  await withRouteServer(
    async () => {
      calls += 1;
      return cashSnapshot();
    },
    async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/account-risk/schwab?accountNumber=secret`,
      );
      assert.equal(response.status, 400);
      assert.equal(calls, 0);
      assert.deepEqual(await response.json(), {
        error: "INVALID_ACCOUNT_RISK_SNAPSHOT_REQUEST",
        issues: [{ path: "query", code: "QUERY_PARAMETERS_NOT_SUPPORTED" }],
      });
    },
  );
});

test("last-resort unavailable response remains strict and private", () => {
  const result = buildUnavailableAccountRiskSnapshot(
    "ACCOUNT_NORMALIZATION_UNAVAILABLE",
    CALCULATED_AT,
    {
      linkedAccountCount: null,
      selectionState: "UNAVAILABLE",
      accountType: "UNAVAILABLE",
      accountDiscoveryFetchedAtMs: null,
      accountBalancesFetchedAtMs: null,
    },
    "ACCOUNT_NORMALIZATION_VALIDATION_FAILED",
  );
  assert.equal(
    SchwabReadOnlyAccountRiskSnapshotResponseSchema.safeParse(result).success,
    true,
  );
  assertNoPrivateData(result);
});

async function run(): Promise<void> {
  for (const [name, fn] of tests) {
    try {
      await fn();
      passed += 1;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`FAIL: ${name}`);
      throw error;
    }
  }
  // eslint-disable-next-line no-console
  console.log(`Schwab account-risk snapshot tests: ${passed}/${tests.length} passed`);
}

void run();
