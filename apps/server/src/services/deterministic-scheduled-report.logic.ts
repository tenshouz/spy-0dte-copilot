import {
  SpyZeroDteDeterministicScheduledReportResponseSchema,
  type DeterministicScheduledReportChecklistItem,
  type DeterministicScheduledReportPrimaryReasonCode,
  type DeterministicScheduledReportRequest,
  type DeterministicScheduledReportState,
  type DeterministicScheduledReportType,
  type SpyZeroDteDeterministicScheduledReportResponse,
  type SpyZeroDteTradePlanAssemblyResponse,
} from "@spy-copilot/shared";

export const DETERMINISTIC_SCHEDULED_REPORT_METHODOLOGY_VERSION =
  "SCHEDULED_REPORT_V2" as const;

const SCHEDULE_REFERENCE: Record<
  DeterministicScheduledReportType,
  "09:25" | "09:35" | "09:45" | "10:00"
> = {
  PREMARKET_0925: "09:25",
  OPENING_0935: "09:35",
  OPENING_0945: "09:45",
  UPDATE_1000: "10:00",
};

const REPORT_LABEL: Record<DeterministicScheduledReportType, string> = {
  PREMARKET_0925: "9:25 AM premarket report",
  OPENING_0935: "9:35 AM opening report",
  OPENING_0945: "9:45 AM opening-structure report",
  UPDATE_1000: "10:00 AM market update",
};

const DISCLOSURES = {
  deterministicOnly: true as const,
  currentSnapshotOnly: true as const,
  noFutureData: true as const,
  noHistoricalReconstruction: true as const,
  noLlmGeneration: true as const,
  noPersistence: true as const,
  noNotificationDelivery: true as const,
  noPrivateAccountData: true as const,
  noPositionSizing: true as const,
  noOrderExecution: true as const,
};

const METHODOLOGY = {
  sourceProduct: "SPY_ZERO_DTE_DETERMINISTIC_TRADE_PLAN_ASSEMBLY" as const,
  sourceMethodology: "ASSEMBLY_V2" as const,
  reportMethod: "FIXED_COPY_FROM_CURRENT_ASSEMBLY_SNAPSHOT" as const,
  scheduleMethod: "CALLER_SELECTED_REPORT_TYPE_REFERENCE_ONLY" as const,
  persistenceMethod: "NONE" as const,
  deliveryMethod: "NONE" as const,
  languageModelMethod: "NONE" as const,
};

function sourceAssemblySummary(assembly: SpyZeroDteTradePlanAssemblyResponse) {
  return {
    product: assembly.product,
    methodologyVersion: assembly.methodologyVersion,
    currentMarketDate: assembly.currentMarketDate,
    calculatedAt: assembly.calculatedAt,
    engineState: assembly.engineState,
    planState: assembly.planState,
    direction: assembly.direction,
    primaryReasonCode: assembly.primaryReasonCode,
    warningCode: assembly.warningCode,
    currentPrice: assembly.currentPrice,
    sessionPhase: assembly.sessionPhase,
    biasState: assembly.bias.biasState,
    confidenceScore:
      assembly.planConfidence?.adjustedConfidenceScore ?? assembly.bias.confidenceScore,
    confidenceUnit: assembly.bias.confidenceUnit,
    sourceQualityState: assembly.bias.sourceQualityState,
  };
}

function planSnapshot(assembly: SpyZeroDteTradePlanAssemblyResponse) {
  return {
    entryCondition: assembly.entryCondition,
    structuralInvalidation: assembly.structuralInvalidation,
    primaryObjective: assembly.primaryObjective,
    underlyingRiskReward: assembly.underlyingRiskReward,
    selectedContract: assembly.selectedContract,
    premiumReference: assembly.premiumReference,
    planConfidence: assembly.planConfidence,
    exposureConfirmation: assembly.exposureConfirmation,
  };
}

function sourceChecklistStatus(
  assembly: SpyZeroDteTradePlanAssemblyResponse,
): DeterministicScheduledReportChecklistItem {
  if (assembly.engineState === "AVAILABLE") {
    return {
      code: "SOURCE_ASSEMBLY",
      status: "PASS",
      message: "The current Trade Plan Assembly snapshot is available.",
    };
  }
  if (assembly.engineState === "PARTIAL") {
    return {
      code: "SOURCE_ASSEMBLY",
      status: "WAIT",
      message: "The current Trade Plan Assembly snapshot is partial.",
    };
  }
  return {
    code: "SOURCE_ASSEMBLY",
    status: "UNAVAILABLE",
    message: "The current Trade Plan Assembly snapshot is unavailable.",
  };
}

function biasChecklistStatus(
  assembly: SpyZeroDteTradePlanAssemblyResponse,
): DeterministicScheduledReportChecklistItem {
  if (
    assembly.bias.confidenceScore !== null &&
    assembly.bias.sourceQualityState === "COMPLETE"
  ) {
    return {
      code: "BIAS_EVIDENCE",
      status: "PASS",
      message: assembly.planConfidence?.adjustedConfidenceScore === null ||
        assembly.planConfidence === undefined
        ? `Structural bias evidence is complete at ${assembly.bias.confidenceScore.toFixed(0)} percent confidence.`
        : `Structural bias evidence is complete at ${assembly.bias.confidenceScore.toFixed(0)} percent; soft GEX/DEX confirmation is ${assembly.exposureConfirmation?.state.toLowerCase() ?? "unavailable"}, producing ${assembly.planConfidence.adjustedConfidenceScore.toFixed(0)} percent adjusted plan confidence.`,
    };
  }
  if (assembly.bias.sourceQualityState === "PARTIAL") {
    return {
      code: "BIAS_EVIDENCE",
      status: "WAIT",
      message: "Structural bias evidence is partial and should be treated cautiously.",
    };
  }
  return {
    code: "BIAS_EVIDENCE",
    status: "UNAVAILABLE",
    message: "Structural bias evidence is unavailable.",
  };
}

function entryChecklistStatus(
  assembly: SpyZeroDteTradePlanAssemblyResponse,
): DeterministicScheduledReportChecklistItem {
  switch (assembly.entryCondition.state) {
    case "SATISFIED":
      return {
        code: "ENTRY_CONDITION",
        status: "PASS",
        message: "The deterministic entry condition is satisfied in the current snapshot.",
      };
    case "WAITING":
      return {
        code: "ENTRY_CONDITION",
        status: "WAIT",
        message: "The deterministic setup remains conditional and is waiting for its trigger.",
      };
    case "NOT_APPLICABLE":
      return {
        code: "ENTRY_CONDITION",
        status: "INFO",
        message: "No entry condition applies to the current plan state.",
      };
    default:
      return {
        code: "ENTRY_CONDITION",
        status: "UNAVAILABLE",
        message: "The deterministic entry condition is unavailable.",
      };
  }
}

function riskChecklistStatus(
  assembly: SpyZeroDteTradePlanAssemblyResponse,
): DeterministicScheduledReportChecklistItem {
  const qualification = assembly.sourceSummary.risk.riskQualification;
  if (qualification === "QUALIFIED") {
    return {
      code: "RISK_FRAMEWORK",
      status: "PASS",
      message: "The structural objective and risk framework is qualified.",
    };
  }
  if (qualification === "NOT_QUALIFIED") {
    return {
      code: "RISK_FRAMEWORK",
      status: "BLOCKED",
      message: "The structural objective and risk framework is not qualified.",
    };
  }
  if (qualification === "UNAVAILABLE") {
    return {
      code: "RISK_FRAMEWORK",
      status: "UNAVAILABLE",
      message: "The structural objective and risk framework is unavailable.",
    };
  }
  return {
    code: "RISK_FRAMEWORK",
    status: "INFO",
    message: "The structural objective and risk framework is not currently applicable.",
  };
}

function contractChecklistStatus(
  assembly: SpyZeroDteTradePlanAssemblyResponse,
): DeterministicScheduledReportChecklistItem {
  switch (assembly.sourceSummary.contract.selectionState) {
    case "SELECTED":
      return {
        code: "CONTRACT_SELECTION",
        status: "PASS",
        message: "A fresh eligible option contract is selected for reference.",
      };
    case "DEFERRED":
      return {
        code: "CONTRACT_SELECTION",
        status: "WAIT",
        message: "Contract selection is deferred until the trigger is satisfied.",
      };
    case "NO_QUALIFIED_CONTRACT":
      return {
        code: "CONTRACT_SELECTION",
        status: "BLOCKED",
        message: "No fresh eligible option contract passed the current selection rules.",
      };
    case "NOT_APPLICABLE":
      return {
        code: "CONTRACT_SELECTION",
        status: "INFO",
        message: "Contract selection does not apply to the current plan state.",
      };
    default:
      return {
        code: "CONTRACT_SELECTION",
        status: "UNAVAILABLE",
        message: "Contract selection is unavailable.",
      };
  }
}

function checklist(
  assembly: SpyZeroDteTradePlanAssemblyResponse,
): DeterministicScheduledReportChecklistItem[] {
  return [
    sourceChecklistStatus(assembly),
    biasChecklistStatus(assembly),
    entryChecklistStatus(assembly),
    riskChecklistStatus(assembly),
    contractChecklistStatus(assembly),
  ];
}

function warningItems(assembly: SpyZeroDteTradePlanAssemblyResponse) {
  if (assembly.warningCode === null) return [];
  return [
    {
      code: assembly.warningCode,
      message: `The source Trade Plan Assembly reported ${assembly.warningCode.replaceAll("_", " ").toLowerCase()}.`,
    },
  ];
}

function stateDetails(assembly: SpyZeroDteTradePlanAssemblyResponse): {
  reportState: DeterministicScheduledReportState;
  primaryReasonCode: DeterministicScheduledReportPrimaryReasonCode;
  headline: string;
} {
  switch (assembly.planState) {
    case "READY":
      return {
        reportState: "READY",
        primaryReasonCode: "READY_PLAN_SUMMARY",
        headline: `A qualified ${assembly.direction} Trade Plan is ready for independent review.`,
      };
    case "WAITING_FOR_TRIGGER":
      return {
        reportState: "INFORMATIONAL",
        primaryReasonCode: "WAITING_FOR_TRIGGER_SUMMARY",
        headline: `The ${assembly.direction} setup remains conditional and is waiting for confirmation.`,
      };
    case "NO_QUALIFIED_CONTRACT":
      return {
        reportState: "INFORMATIONAL",
        primaryReasonCode: "NO_QUALIFIED_CONTRACT_SUMMARY",
        headline: `The ${assembly.direction} underlying structure is qualified, but no eligible contract is available.`,
      };
    case "NOT_QUALIFIED":
      return {
        reportState: "INFORMATIONAL",
        primaryReasonCode: "NOT_QUALIFIED_SUMMARY",
        headline: `The ${assembly.direction} setup did not pass the deterministic objective and risk requirement.`,
      };
    case "NO_SETUP":
      return {
        reportState: "INFORMATIONAL",
        primaryReasonCode: "NO_SETUP_SUMMARY",
        headline: "No directional setup is present in the current deterministic snapshot.",
      };
    case "NOT_APPLICABLE":
      return {
        reportState: "INFORMATIONAL",
        primaryReasonCode: "NOT_APPLICABLE_SUMMARY",
        headline: "The SPY 0DTE methodology is not applicable to the current session state.",
      };
    case "UNAVAILABLE":
      return {
        reportState: "UNAVAILABLE",
        primaryReasonCode: "SOURCE_ASSEMBLY_UNAVAILABLE",
        headline: "The deterministic report is unavailable because the source Assembly is unavailable.",
      };
    default:
      return {
        reportState: "UNAVAILABLE",
        primaryReasonCode: "SOURCE_ASSEMBLY_INCONSISTENT",
        headline: "The deterministic report is unavailable because the source Assembly is inconsistent.",
      };
  }
}

export function buildSpyZeroDteDeterministicScheduledReport(
  request: DeterministicScheduledReportRequest,
  assembly: SpyZeroDteTradePlanAssemblyResponse,
  generatedAtMs: number,
): SpyZeroDteDeterministicScheduledReportResponse {
  const details = stateDetails(assembly);
  return SpyZeroDteDeterministicScheduledReportResponseSchema.parse({
    symbol: "SPY",
    product: "SPY_ZERO_DTE_DETERMINISTIC_SCHEDULED_REPORT",
    methodologyVersion: DETERMINISTIC_SCHEDULED_REPORT_METHODOLOGY_VERSION,
    reportType: request.reportType,
    scheduleReferenceEasternTime: SCHEDULE_REFERENCE[request.reportType],
    currentMarketDate: assembly.currentMarketDate,
    generatedAt: new Date(generatedAtMs).toISOString(),
    engineState: assembly.engineState,
    reportState: details.reportState,
    primaryReasonCode: details.primaryReasonCode,
    warningCode: assembly.warningCode,
    sourceAssembly: sourceAssemblySummary(assembly),
    title: `${REPORT_LABEL[request.reportType]} — ${assembly.direction}`,
    headline: details.headline,
    plan: planSnapshot(assembly),
    checklist: checklist(assembly),
    warnings: warningItems(assembly),
    disclosures: DISCLOSURES,
    methodology: METHODOLOGY,
  });
}
