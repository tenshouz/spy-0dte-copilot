import {
  ExitPolicyResearchSchema,
  type ExitPolicyComparisonRow,
  type ExitPolicyResearch,
} from "@spy-copilot/shared";

const POLICIES: ExitPolicyComparisonRow["policy"][] = [
  "TARGET_1_EARLY",
  "TARGET_2_PRIMARY",
  "TARGET_3_EXTENSION",
  "TIME_STOP_15M",
  "ACTUAL_USER_EXIT",
];

export function buildExitPolicyResearch(
  marks: Array<{ policy: string; pnl: number | null }>,
): ExitPolicyResearch {
  const rows = POLICIES.map((policy) => {
    const values = marks
      .filter((mark) => mark.policy === policy)
      .map((mark) => mark.pnl)
      .filter((value): value is number => value !== null && Number.isFinite(value));
    const sampleSize = values.length;
    const totalNetPnlDollars = values.reduce((sum, value) => sum + value, 0);
    const wins = values.filter((value) => value > 0).length;
    const average = sampleSize > 0 ? totalNetPnlDollars / sampleSize : null;
    return {
      policy,
      sampleSize,
      winRatePercent: sampleSize > 0 ? (wins / sampleSize) * 100 : null,
      averageNetPnlDollars: average,
      netExpectancyDollars: average,
      totalNetPnlDollars,
      insufficientSample: sampleSize < 20,
    } satisfies ExitPolicyComparisonRow;
  });
  return ExitPolicyResearchSchema.parse({
    methodologyVersion: "EXIT_POLICY_RESEARCH_V1",
    primaryLivePolicy: "TARGET_2_PRIMARY",
    rows,
    disclosures: {
      target1IsManagementOnly: true,
      target3IsResearchOnly: true,
      researchDoesNotChangeLivePolicy: true,
      minimumSampleForInterpretation: 20,
    },
  });
}
