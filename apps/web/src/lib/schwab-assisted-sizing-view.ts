import {
  SpyZeroDteSchwabAssistedPositionSizingRequestSchema,
  type PositionSizingState,
  type SpyZeroDteSchwabAssistedPositionSizingRequest,
} from "@spy-copilot/shared";

export type SchwabAssistedSizingViewTone = "default" | "bull" | "bear" | "wait";

export const SCHWAB_ASSISTED_SIZING_FIELD_ORDER = [
  "accountEquityDollars",
  "remainingDailyLossBudgetDollars",
  "remainingPortfolioRiskBudgetDollars",
  "maximumRiskPerTradeDollars",
  "maximumCapitalAllocationDollars",
  "maximumContracts",
] as const;

export type SchwabAssistedSizingField =
  (typeof SCHWAB_ASSISTED_SIZING_FIELD_ORDER)[number];

export type SchwabAssistedSizingFormValues = Record<
  SchwabAssistedSizingField,
  string
>;

export type SchwabAssistedSizingFormErrors = Partial<
  Record<SchwabAssistedSizingField, string>
>;

export const EMPTY_SCHWAB_ASSISTED_SIZING_FORM: SchwabAssistedSizingFormValues = {
  accountEquityDollars: "",
  remainingDailyLossBudgetDollars: "",
  remainingPortfolioRiskBudgetDollars: "",
  maximumRiskPerTradeDollars: "",
  maximumCapitalAllocationDollars: "",
  maximumContracts: "",
};

const FIELD_LABELS: Record<SchwabAssistedSizingField, string> = {
  accountEquityDollars: "Account equity",
  remainingDailyLossBudgetDollars: "Remaining daily-loss budget",
  remainingPortfolioRiskBudgetDollars: "Remaining portfolio-risk budget",
  maximumRiskPerTradeDollars: "Maximum risk per trade",
  maximumCapitalAllocationDollars: "Maximum capital allocation",
  maximumContracts: "Maximum contracts",
};

const STATE_COPY: Record<
  PositionSizingState,
  {
    title: string;
    description: string;
    tone: SchwabAssistedSizingViewTone;
  }
> = {
  SIZED: {
    title: "Reference size calculated",
    description:
      "The current contract ask and explicit risk controls permit a positive reference quantity.",
    tone: "bull",
  },
  NO_CAPACITY: {
    title: "No capacity for one contract",
    description:
      "The active risk and capital limits do not permit one contract at the current ask.",
    tone: "wait",
  },
  BLOCKED: {
    title: "Sizing blocked by an explicit control",
    description:
      "At least one caller-supplied risk control or available-cash control is zero.",
    tone: "bear",
  },
  NOT_APPLICABLE: {
    title: "Sizing not applicable",
    description:
      "The source Trade Plan Assembly is not READY, so no Schwab account snapshot was requested.",
    tone: "default",
  },
  UNAVAILABLE: {
    title: "Sizing unavailable",
    description:
      "A required source, broker snapshot, or validation step is currently unavailable.",
    tone: "bear",
  },
};

export function getSchwabAssistedSizingStateView(state: PositionSizingState) {
  return STATE_COPY[state];
}

function numberFromInput(value: string): number {
  if (value.trim() === "") return Number.NaN;
  return Number(value);
}

function requestPathToField(path: PropertyKey[]): SchwabAssistedSizingField | null {
  const candidate = path.at(-1);
  if (
    typeof candidate === "string" &&
    SCHWAB_ASSISTED_SIZING_FIELD_ORDER.includes(
      candidate as SchwabAssistedSizingField,
    )
  ) {
    return candidate as SchwabAssistedSizingField;
  }
  return null;
}

function issueMessage(
  field: SchwabAssistedSizingField,
  code: string,
  rawValue: string,
): string {
  const label = FIELD_LABELS[field];
  if (code === "invalid_type") {
    if (rawValue.trim() === "") return `${label} is required.`;
    if (field === "maximumContracts") return `${label} must be a whole number.`;
    return `${label} must be a finite number.`;
  }
  if (code === "too_small") {
    return field === "accountEquityDollars"
      ? `${label} must be greater than zero.`
      : `${label} must be zero or greater.`;
  }
  if (code === "too_big") return `${label} is too large.`;
  return `${label} is invalid.`;
}

export type BuildSchwabAssistedSizingRequestResult =
  | {
      success: true;
      request: SpyZeroDteSchwabAssistedPositionSizingRequest;
      errors: SchwabAssistedSizingFormErrors;
    }
  | {
      success: false;
      request: null;
      errors: SchwabAssistedSizingFormErrors;
    };

export function buildSchwabAssistedSizingRequest(
  values: SchwabAssistedSizingFormValues,
): BuildSchwabAssistedSizingRequestResult {
  const candidate = {
    callerRiskInputs: {
      accountEquityDollars: numberFromInput(values.accountEquityDollars),
      remainingDailyLossBudgetDollars: numberFromInput(
        values.remainingDailyLossBudgetDollars,
      ),
      remainingPortfolioRiskBudgetDollars: numberFromInput(
        values.remainingPortfolioRiskBudgetDollars,
      ),
    },
    riskPolicy: {
      maximumRiskPerTradeDollars: numberFromInput(
        values.maximumRiskPerTradeDollars,
      ),
      maximumCapitalAllocationDollars: numberFromInput(
        values.maximumCapitalAllocationDollars,
      ),
      maximumContracts: numberFromInput(values.maximumContracts),
    },
  };

  const parsed = SpyZeroDteSchwabAssistedPositionSizingRequestSchema.safeParse(
    candidate,
  );
  if (parsed.success) {
    return { success: true, request: parsed.data, errors: {} };
  }

  const errors: SchwabAssistedSizingFormErrors = {};
  for (const issue of parsed.error.issues) {
    const field = requestPathToField(issue.path);
    if (field && !errors[field]) {
      errors[field] = issueMessage(field, issue.code, values[field]);
    }
  }

  return { success: false, request: null, errors };
}

export function formatControlLabel(value: string): string {
  return value.replaceAll("_", " ");
}
