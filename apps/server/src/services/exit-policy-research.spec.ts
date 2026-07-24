import assert from "node:assert/strict";
import { buildExitPolicyResearch } from "./exit-policy-research.logic";

let passed = 0;
function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`✓ ${name}`);
}

test("all five approved comparison policies are always present", () => {
  const research = buildExitPolicyResearch([]);
  assert.deepEqual(research.rows.map((row) => row.policy), ["TARGET_1_EARLY", "TARGET_2_PRIMARY", "TARGET_3_EXTENSION", "TIME_STOP_15M", "ACTUAL_USER_EXIT"]);
  assert.ok(research.rows.every((row) => row.sampleSize === 0 && row.insufficientSample));
  assert.equal(research.primaryLivePolicy, "TARGET_2_PRIMARY");
});

test("expectancy, win rate, and total use only finite policy-matched marks", () => {
  const research = buildExitPolicyResearch([
    { policy: "TARGET_2_PRIMARY", pnl: 50 },
    { policy: "TARGET_2_PRIMARY", pnl: -20 },
    { policy: "TARGET_2_PRIMARY", pnl: 0 },
    { policy: "TARGET_2_PRIMARY", pnl: null },
    { policy: "TARGET_1_EARLY", pnl: 5 },
  ]);
  const target2 = research.rows.find((row) => row.policy === "TARGET_2_PRIMARY")!;
  assert.equal(target2.sampleSize, 3);
  assert.equal(target2.totalNetPnlDollars, 30);
  assert.equal(target2.averageNetPnlDollars, 10);
  assert.equal(target2.netExpectancyDollars, 10);
  assert.ok(Math.abs((target2.winRatePercent ?? 0) - 100 / 3) < 1e-9);
});

test("twenty samples clears the interpretation warning without changing live policy", () => {
  const research = buildExitPolicyResearch(Array.from({ length: 20 }, () => ({ policy: "TARGET_3_EXTENSION", pnl: 10 })));
  const target3 = research.rows.find((row) => row.policy === "TARGET_3_EXTENSION")!;
  assert.equal(target3.insufficientSample, false);
  assert.equal(research.primaryLivePolicy, "TARGET_2_PRIMARY");
  assert.equal(research.disclosures.target3IsResearchOnly, true);
  assert.equal(research.disclosures.researchDoesNotChangeLivePolicy, true);
});

console.log(`\n${passed} exit-policy research tests passed.`);
