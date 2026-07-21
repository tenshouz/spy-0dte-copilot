import {
  SpyZeroDteContractSelectionResponseSchema,
  type SpyZeroDteContractSelectionResponse,
  type SpyZeroDteObjectiveRiskResponse,
} from "@spy-copilot/shared";
import { buildSpyZeroDteContractSelection } from "./trade-contract.logic";

/**
 * Historical underlying replay deliberately has no point-in-time option chain.
 * Keep the live Contract engine fail-closed, then adapt that result only inside
 * the research-only replay path so a qualified underlying plan can be graded.
 * This never invents a contract, premium, Greeks, GEX, or DEX.
 */
export function buildHistoricalUnderlyingOnlyContractSelection(
  risk: SpyZeroDteObjectiveRiskResponse,
  calculationTimeMs: number,
): SpyZeroDteContractSelectionResponse {
  const unavailable = buildSpyZeroDteContractSelection(
    risk,
    null,
    calculationTimeMs,
  );

  if (
    risk.frameworkState !== "READY" ||
    risk.riskQualification !== "QUALIFIED" ||
    !["CALLS", "PUTS"].includes(risk.direction)
  ) {
    return unavailable;
  }

  return SpyZeroDteContractSelectionResponseSchema.parse({
    ...unavailable,
    sourceCompatibilityState: "PARTIAL",
    engineState: "PARTIAL",
    selectionState: "NO_QUALIFIED_CONTRACT",
    preflightState: "NO_QUALIFIED_CONTRACT",
    contractDirection: risk.direction === "CALLS" ? "CALL" : "PUT",
    primaryReasonCode: "SOURCE_COMPATIBILITY_PARTIAL",
    warningCode: "SOURCE_COMPATIBILITY_PARTIAL",
  });
}
