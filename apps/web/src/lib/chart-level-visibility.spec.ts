import assert from "node:assert/strict";
import {
  CHART_LEVEL_KEYS,
  countSelectedChartLevels,
  DEFAULT_CHART_LEVEL_VISIBILITY,
  filterChartReferenceLines,
  getChartLevelPreset,
} from "./chart-level-visibility";

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}: ${(error as Error).message}`);
  }
}

test("core preset keeps only live price and VWAP selected", () => {
  const core = getChartLevelPreset("CORE");

  assert.deepEqual(core, DEFAULT_CHART_LEVEL_VISIBILITY);
  assert.equal(core.livePrice, true);
  assert.equal(core.vwap, true);
  assert.equal(countSelectedChartLevels(core), 2);
});

test("all and none presets cover every chart-level key", () => {
  const all = getChartLevelPreset("ALL");
  const none = getChartLevelPreset("NONE");

  assert.equal(countSelectedChartLevels(all), CHART_LEVEL_KEYS.length);
  assert.equal(countSelectedChartLevels(none), 0);
  for (const key of CHART_LEVEL_KEYS) {
    assert.equal(all[key], true);
    assert.equal(none[key], false);
  }
});

test("additional reference lines are filtered at individual-line granularity", () => {
  const visibility = getChartLevelPreset("NONE");
  visibility.openingRange5High = true;
  visibility.weeklyPivot = true;
  visibility.putWall = true;

  const lines = [
    { title: "OR5 H", price: 750 },
    { title: "OR5 L", price: 745 },
    { title: "Weekly P", price: 747 },
    { title: "Daily P", price: 746 },
    { title: "Put Wall", price: 742 },
    { title: "Call Wall", price: 752 },
  ];

  assert.deepEqual(
    filterChartReferenceLines(lines, visibility).map((line) => line.title),
    ["OR5 H", "Weekly P", "Put Wall"],
  );
});

test("unmapped future overlays remain hidden until a toggle is defined", () => {
  const visibility = getChartLevelPreset("ALL");
  const lines = [{ title: "Future Experimental Level", price: 751 }];

  assert.deepEqual(filterChartReferenceLines(lines, visibility), []);
});

console.log(`\n${passed} passed, ${failed} failed (${passed + failed} total)`);
if (failed > 0) process.exit(1);
