import {
  SchwabReadOnlyAccountRiskSnapshotResponseSchema,
  type AccountRiskAccountType,
  type AccountRiskSnapshotPrimaryReasonCode,
  type AccountRiskSnapshotWarningCode,
  type SchwabReadOnlyAccountRiskSnapshotResponse,
} from "@spy-copilot/shared";
import { z } from "zod";

export const ACCOUNT_RISK_SNAPSHOT_METHODOLOGY_VERSION =
  "ACCOUNT_RISK_SNAPSHOT_V1" as const;

const ACCOUNT_EQUITY_SOURCE =
  "securitiesAccount.currentBalances.equity" as const;
const AVAILABLE_CASH_SOURCE =
  "securitiesAccount.currentBalances.cashAvailableForTrading" as const;

const DISCLOSURES = {
  readOnlyBrokerSnapshot: true as const,
  brokerReportedValues: true as const,
  accountIdentifiersRedacted: true as const,
  availableCashIsNotBuyingPower: true as const,
  marginCapacityExcluded: true as const,
  snapshotMayBePartial: true as const,
  noPositionRiskCalculation: true as const,
  noDailyLossCalculation: true as const,
  noPortfolioRiskCalculation: true as const,
  noSizingCalculation: true as const,
  noOrderExecution: true as const,
  noPersistence: true as const,
};

const METHODOLOGY = {
  accountSelectionMethod: "EXACTLY_ONE_LINKED_ACCOUNT" as const,
  cashAccountAvailableCashMethod: AVAILABLE_CASH_SOURCE,
  cashAccountEquityMethod: "UNAVAILABLE_IN_CURRENT_BALANCES" as const,
  marginAccountEquityMethod: ACCOUNT_EQUITY_SOURCE,
  marginAccountAvailableCashMethod:
    "UNVERIFIED_IN_ACCOUNT_RISK_SNAPSHOT_V1" as const,
  currency: "USD" as const,
  retainedStaleFallback: false as const,
};

const ProviderDiscoveryItemSchema = z
  .object({
    accountNumber: z.string().min(1),
    hashValue: z.string().min(1),
  })
  .passthrough();

const ProviderDiscoveryResponseSchema = z.array(ProviderDiscoveryItemSchema);

const ProviderSelectedAccountResponseSchema = z
  .object({
    securitiesAccount: z
      .object({
        type: z.string().min(1),
        currentBalances: z.record(z.unknown()),
      })
      .passthrough(),
  })
  .passthrough();

export interface InternalSchwabAccountReference {
  /** Private internal transport value. Never include this object in public output. */
  hashValue: string;
}

export interface AccountRiskSourceTimes {
  accountDiscoveryFetchedAtMs: number | null;
  accountBalancesFetchedAtMs: number | null;
}

export interface AccountRiskUnavailableContext extends AccountRiskSourceTimes {
  linkedAccountCount: number | null;
  selectionState: "SELECTED" | "UNAVAILABLE";
  accountType: AccountRiskAccountType;
}

function timestamp(ms: number | null): string | null {
  return ms === null ? null : new Date(ms).toISOString();
}

function emptyBalances() {
  return {
    accountEquityDollars: null,
    availableCashDollars: null,
    currency: "USD" as const,
    equitySourceField: null,
    availableCashSourceField: null,
  };
}

function source(times: AccountRiskSourceTimes) {
  return {
    provider: "SCHWAB_TRADER_API" as const,
    accountDiscoveryFetchedAt: timestamp(times.accountDiscoveryFetchedAtMs),
    accountBalancesFetchedAt: timestamp(times.accountBalancesFetchedAtMs),
    timestampSource: "APPLICATION_RECEIPT_TIME" as const,
    retainedStaleDataUsed: false as const,
    positionsRequested: false as const,
    ordersRequested: false as const,
    transactionsRequested: false as const,
  };
}

function validate(
  response: SchwabReadOnlyAccountRiskSnapshotResponse,
): SchwabReadOnlyAccountRiskSnapshotResponse {
  return SchwabReadOnlyAccountRiskSnapshotResponseSchema.parse(response);
}

function common(calculatedAtMs: number, times: AccountRiskSourceTimes) {
  return {
    product: "SCHWAB_READ_ONLY_ACCOUNT_RISK_SNAPSHOT" as const,
    methodologyVersion: ACCOUNT_RISK_SNAPSHOT_METHODOLOGY_VERSION,
    calculatedAt: new Date(calculatedAtMs).toISOString(),
    source: source(times),
    disclosures: DISCLOSURES,
    methodology: METHODOLOGY,
  };
}

/**
 * Validates Schwab discovery items, then immediately drops raw accountNumber.
 * Only encrypted hashes remain in the short-lived internal result.
 */
export function normalizeSchwabAccountDiscovery(
  raw: unknown,
): InternalSchwabAccountReference[] {
  return ProviderDiscoveryResponseSchema.parse(raw).map(({ hashValue }) => ({
    hashValue,
  }));
}

export function buildNoLinkedAccountSnapshot(
  calculatedAtMs: number,
  accountDiscoveryFetchedAtMs: number,
): SchwabReadOnlyAccountRiskSnapshotResponse {
  return validate({
    ...common(calculatedAtMs, {
      accountDiscoveryFetchedAtMs,
      accountBalancesFetchedAtMs: null,
    }),
    engineState: "AVAILABLE",
    snapshotState: "NO_ACCOUNT",
    primaryReasonCode: "NO_LINKED_ACCOUNT",
    warningCode: null,
    accountSelection: {
      linkedAccountCount: 0,
      selectionState: "NO_ACCOUNT",
      accountType: null,
    },
    balances: emptyBalances(),
  });
}

export function buildAccountSelectionRequiredSnapshot(
  linkedAccountCount: number,
  calculatedAtMs: number,
  accountDiscoveryFetchedAtMs: number,
): SchwabReadOnlyAccountRiskSnapshotResponse {
  return validate({
    ...common(calculatedAtMs, {
      accountDiscoveryFetchedAtMs,
      accountBalancesFetchedAtMs: null,
    }),
    engineState: "AVAILABLE",
    snapshotState: "ACCOUNT_SELECTION_REQUIRED",
    primaryReasonCode: "MULTIPLE_LINKED_ACCOUNTS_REQUIRE_SELECTION",
    warningCode: null,
    accountSelection: {
      linkedAccountCount,
      selectionState: "ACCOUNT_SELECTION_REQUIRED",
      accountType: null,
    },
    balances: emptyBalances(),
  });
}

function finiteProviderNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function buildApprovedFieldUnavailableSnapshot(
  accountType: "CASH" | "MARGIN",
  calculatedAtMs: number,
  times: AccountRiskSourceTimes,
): SchwabReadOnlyAccountRiskSnapshotResponse {
  return validate({
    ...common(calculatedAtMs, times),
    engineState: "UNAVAILABLE",
    snapshotState: "UNAVAILABLE",
    primaryReasonCode:
      accountType === "CASH"
        ? "AVAILABLE_CASH_FIELD_UNAVAILABLE"
        : "ACCOUNT_EQUITY_FIELD_UNAVAILABLE",
    warningCode: "ACCOUNT_NORMALIZATION_VALIDATION_FAILED",
    accountSelection: {
      linkedAccountCount: 1,
      selectionState: "SELECTED",
      accountType,
    },
    balances: emptyBalances(),
  });
}

/** Normalizes only the explicitly approved field for the provider account type. */
export function normalizeSchwabSelectedAccount(
  raw: unknown,
  calculatedAtMs: number,
  times: Required<AccountRiskSourceTimes>,
): SchwabReadOnlyAccountRiskSnapshotResponse {
  const parsed = ProviderSelectedAccountResponseSchema.parse(raw);
  const { type, currentBalances } = parsed.securitiesAccount;

  if (type === "CASH") {
    const availableCash = finiteProviderNumber(
      currentBalances.cashAvailableForTrading,
    );
    if (availableCash === null) {
      return buildApprovedFieldUnavailableSnapshot("CASH", calculatedAtMs, times);
    }
    return validate({
      ...common(calculatedAtMs, times),
      engineState: "PARTIAL",
      snapshotState: "PARTIAL",
      primaryReasonCode: "ACCOUNT_RISK_SNAPSHOT_PARTIAL",
      warningCode:
        availableCash < 0
          ? "NEGATIVE_BROKER_BALANCE_REPORTED"
          : "ACCOUNT_EQUITY_UNAVAILABLE",
      accountSelection: {
        linkedAccountCount: 1,
        selectionState: "SELECTED",
        accountType: "CASH",
      },
      balances: {
        accountEquityDollars: null,
        availableCashDollars: availableCash,
        currency: "USD",
        equitySourceField: null,
        availableCashSourceField: AVAILABLE_CASH_SOURCE,
      },
    });
  }

  if (type === "MARGIN") {
    const accountEquity = finiteProviderNumber(currentBalances.equity);
    if (accountEquity === null) {
      return buildApprovedFieldUnavailableSnapshot("MARGIN", calculatedAtMs, times);
    }
    return validate({
      ...common(calculatedAtMs, times),
      engineState: "PARTIAL",
      snapshotState: "PARTIAL",
      primaryReasonCode: "ACCOUNT_RISK_SNAPSHOT_PARTIAL",
      warningCode:
        accountEquity < 0
          ? "NEGATIVE_BROKER_BALANCE_REPORTED"
          : "AVAILABLE_CASH_UNAVAILABLE",
      accountSelection: {
        linkedAccountCount: 1,
        selectionState: "SELECTED",
        accountType: "MARGIN",
      },
      balances: {
        accountEquityDollars: accountEquity,
        availableCashDollars: null,
        currency: "USD",
        equitySourceField: ACCOUNT_EQUITY_SOURCE,
        availableCashSourceField: null,
      },
    });
  }

  return validate({
    ...common(calculatedAtMs, times),
    engineState: "AVAILABLE",
    snapshotState: "UNSUPPORTED_ACCOUNT",
    primaryReasonCode: "SELECTED_ACCOUNT_TYPE_UNSUPPORTED",
    warningCode: null,
    accountSelection: {
      linkedAccountCount: 1,
      selectionState: "SELECTED",
      accountType: "UNSUPPORTED",
    },
    balances: emptyBalances(),
  });
}

export function buildUnauthorizedAccountRiskSnapshot(
  calculatedAtMs: number,
  context: AccountRiskUnavailableContext,
): SchwabReadOnlyAccountRiskSnapshotResponse {
  return validate({
    ...common(calculatedAtMs, context),
    engineState: "UNAVAILABLE",
    snapshotState: "UNAUTHORIZED",
    primaryReasonCode: "SCHWAB_ACCOUNT_ACCESS_UNAUTHORIZED",
    warningCode: null,
    accountSelection: {
      linkedAccountCount: context.linkedAccountCount,
      selectionState: context.selectionState,
      accountType: "UNAVAILABLE",
    },
    balances: emptyBalances(),
  });
}

export function buildUnavailableAccountRiskSnapshot(
  primaryReasonCode: AccountRiskSnapshotPrimaryReasonCode,
  calculatedAtMs: number,
  context: AccountRiskUnavailableContext,
  warningCode: AccountRiskSnapshotWarningCode | null = null,
): SchwabReadOnlyAccountRiskSnapshotResponse {
  return validate({
    ...common(calculatedAtMs, context),
    engineState: "UNAVAILABLE",
    snapshotState: "UNAVAILABLE",
    primaryReasonCode,
    warningCode,
    accountSelection: {
      linkedAccountCount: context.linkedAccountCount,
      selectionState: context.selectionState,
      accountType: context.accountType,
    },
    balances: emptyBalances(),
  });
}
