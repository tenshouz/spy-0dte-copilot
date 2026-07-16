/** Deterministic tests for the returned-window DEX chart presentation helper. */
import assert from "node:assert/strict";
import type { DexStrikeRow } from "@spy-copilot/shared";
import {
  DEFAULT_DEX_CHART_VISIBLE_STRIKE_COUNT,
  selectDexChartStrikeWindow,
} from "./dex-chart-window";

function row(strikePrice: number): DexStrikeRow {
  return {
    strikePrice,
    callContractCount: 1,
    putContractCount: 1,
    callOpenInterest: 1,
    putOpenInterest: 1,
    callDeltaExposure: strikePrice,
    putDeltaExposureMagnitude: strikePrice,
    netDeltaExposureProxy: 0,
  };
}

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL ${name}: ${(err as Error).message}`);
  }
}

test("expanded 40-strike calculation window displays nearest 15 chart rows", () => {
  const strikes = Array.from({ length: 40 }, (_, index) => row(735 + index));
  const result = selectDexChartStrikeWindow(strikes, 754.81);
  assert.equal(DEFAULT_DEX_CHART_VISIBLE_STRIKE_COUNT, 15);
  assert.equal(result.calculationStrikeCount, 40);
  assert.equal(result.displayedStrikeCount, 15);
  assert.equal(result.isSubset, true);
  assert.equal(result.atmStrike, 755);
  assert.deepEqual(result.rows.map((item) => item.strikePrice), [
    762, 761, 760, 759, 758, 757, 756, 755, 754, 753, 752, 751, 750, 749, 748,
  ]);
});

test("all returned rows display when the chain contains fifteen or fewer strikes", () => {
  const result = selectDexChartStrikeWindow([751, 752, 753, 754, 755].map(row), 754.8);
  assert.equal(result.isSubset, false);
  assert.deepEqual(result.rows.map((item) => item.strikePrice), [755, 754, 753, 752, 751]);
});

test("chart window shifts safely near the lower returned boundary", () => {
  const strikes = Array.from({ length: 40 }, (_, index) => row(735 + index));
  const result = selectDexChartStrikeWindow(strikes, 735.1);
  assert.equal(result.atmStrike, 735);
  assert.deepEqual(result.rows.map((item) => item.strikePrice), [
    749, 748, 747, 746, 745, 744, 743, 742, 741, 740, 739, 738, 737, 736, 735,
  ]);
});

test("chart window shifts safely near the upper returned boundary", () => {
  const strikes = Array.from({ length: 40 }, (_, index) => row(735 + index));
  const result = selectDexChartStrikeWindow(strikes, 773.9);
  assert.equal(result.atmStrike, 774);
  assert.deepEqual(result.rows.map((item) => item.strikePrice), [
    774, 773, 772, 771, 770, 769, 768, 767, 766, 765, 764, 763, 762, 761, 760,
  ]);
});

test("duplicate-shaped input remains visible rather than being silently merged", () => {
  const result = selectDexChartStrikeWindow([row(755), row(754), row(755), row(756)], 754.8);
  assert.deepEqual(result.rows.map((item) => item.strikePrice), [756, 755, 755, 754]);
});

console.log(`\n${passed} passed, ${failed} failed (${passed + failed} total)`);
if (failed > 0) process.exit(1);
