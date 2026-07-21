/** Focused UI-view tests for empirical Gamma research presentation. */
import assert from "node:assert/strict";
import type { EmpiricalGammaResearchFinding } from "@spy-copilot/shared";
import {
  formatGammaResearchDelta,
  formatGammaResearchMoney,
  formatGammaResearchPercent,
  gammaResearchEvidenceLabel,
  gammaResearchEvidenceTone,
  gammaResearchFeatureLabel,
  gammaResearchReasonCopy,
  gammaResearchSetupLabel,
  visibleGammaResearchFindings,
} from "./empirical-gamma-research-view";

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`✗ ${name}`);
    console.error(error);
  }
}

function finding(
  state: EmpiricalGammaResearchFinding["evidenceState"],
  count: number,
  bucketKey: string,
): EmpiricalGammaResearchFinding {
  const metrics = {
    tradeCount: count,
    wins: count,
    losses: 0,
    breakevens: 0,
    winRatePercent: count === 0 ? null : 100,
    winRateWilsonLowerPercent: count === 0 ? null : 80,
    winRateWilsonUpperPercent: count === 0 ? null : 100,
    totalPnlDollars: count === 0 ? null : count * 10,
    averagePnlDollars: count === 0 ? null : 10,
    expectancyDollars: count === 0 ? null : 10,
  };
  return {
    setupType: "OPENING_RANGE_BREAKOUT",
    direction: "CALLS",
    featureType: "GAMMA_REGIME",
    bucketKey,
    bucketLabel: bucketKey,
    bucketMetrics: metrics,
    comparatorMetrics: metrics,
    winRateDeltaPercentagePoints: 10,
    expectancyDeltaDollars: 20,
    evidenceState: state,
    fullContextObservationCount: count,
    legacyContextObservationCount: 0,
    eligibleForDirectionalWeight: false,
    weightingBlockers: [
      "HOLDOUT_VALIDATION_MISSING",
      "OBSERVATIONAL_USER_ENTERED_OUTCOMES_ONLY",
    ],
  };
}

test("labels explain the research dimensions without directional certainty", () => {
  assert.equal(gammaResearchFeatureLabel("NEAREST_GAMMA_CLIFF"), "Nearest cliff");
  assert.equal(gammaResearchSetupLabel("OPENING_RANGE_BREAKOUT"), "Opening-range breakout");
  assert.equal(gammaResearchEvidenceLabel("POSITIVE_CANDIDATE"), "Positive candidate");
  assert.equal(gammaResearchEvidenceTone("NEGATIVE_CANDIDATE"), "bear");
  assert.ok(gammaResearchReasonCopy("GAMMA_RESEARCH_AVAILABLE").includes("cannot alter"));
});

test("formatters are explicit about missing values and signs", () => {
  assert.equal(formatGammaResearchPercent(null), "—");
  assert.equal(formatGammaResearchPercent(62.34), "62.3%");
  assert.equal(formatGammaResearchMoney(25), "+$25.00");
  assert.equal(formatGammaResearchMoney(-25), "-$25.00");
  assert.equal(formatGammaResearchDelta(4.44), "+4.4 pp");
});

test("candidate findings sort ahead of descriptive and insufficient findings", () => {
  const visible = visibleGammaResearchFindings([
    finding("INSUFFICIENT_SAMPLE", 100, "insufficient"),
    finding("NO_CLEAR_SEPARATION", 200, "neutral"),
    finding("NEGATIVE_CANDIDATE", 30, "negative"),
    finding("POSITIVE_CANDIDATE", 30, "positive"),
  ]);
  assert.deepEqual(
    visible.map((item) => item.evidenceState),
    [
      "POSITIVE_CANDIDATE",
      "NEGATIVE_CANDIDATE",
      "NO_CLEAR_SEPARATION",
      "INSUFFICIENT_SAMPLE",
    ],
  );
});

test("visible findings respect the display limit", () => {
  const visible = visibleGammaResearchFindings(
    [finding("POSITIVE_CANDIDATE", 30, "a"), finding("NEGATIVE_CANDIDATE", 30, "b")],
    1,
  );
  assert.equal(visible.length, 1);
  assert.equal(visible[0]?.bucketKey, "a");
});

console.log(`\nEmpirical Gamma research view tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
