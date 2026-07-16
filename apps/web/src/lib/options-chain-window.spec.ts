import assert from "node:assert/strict";
import test from "node:test";
import {
  selectAtmCenteredStrikeWindow,
  selectAtmStrike,
  sortUniqueStrikes,
} from "./options-chain-window";

const strikes = [751, 752, 753, 754, 755, 756, 757, 758, 759, 760, 761];

test("selectAtmStrike selects an exact returned strike", () => {
  assert.equal(selectAtmStrike(strikes, 755), 755);
});

test("selectAtmStrike selects the nearer strike between two values", () => {
  assert.equal(selectAtmStrike([754, 755], 754.81), 755);
});

test("selectAtmStrike selects the lower strike on an equal-distance tie", () => {
  assert.equal(selectAtmStrike([755, 754], 754.5), 754);
});

test("selectAtmStrike safely handles unsorted duplicate input", () => {
  assert.equal(selectAtmStrike([756, 754, 755, 754], 754.8), 755);
});

test("selectAtmStrike returns null without an underlying price", () => {
  assert.equal(selectAtmStrike([754, 755], null), null);
});

test("selectAtmStrike returns null for an empty strike list", () => {
  assert.equal(selectAtmStrike([], 755), null);
});

test("selectAtmStrike returns the only strike when underlying exists", () => {
  assert.equal(selectAtmStrike([755], 754.8), 755);
});

test("window centers ATM with four strikes below and above", () => {
  assert.deepEqual(selectAtmCenteredStrikeWindow(strikes, 756), {
    atmStrike: 756,
    visibleStrikes: [752, 753, 754, 755, 756, 757, 758, 759, 760],
  });
});

test("window shifts upward when ATM is the first strike", () => {
  assert.deepEqual(selectAtmCenteredStrikeWindow(strikes, 751).visibleStrikes, strikes.slice(0, 9));
});

test("window shifts downward when ATM is the last strike", () => {
  assert.deepEqual(selectAtmCenteredStrikeWindow(strikes, 761).visibleStrikes, strikes.slice(-9));
});

test("window near lower boundary still returns nine strikes", () => {
  const result = selectAtmCenteredStrikeWindow(strikes, 752);
  assert.equal(result.visibleStrikes.length, 9);
  assert.deepEqual(result.visibleStrikes, strikes.slice(0, 9));
});

test("window near upper boundary still returns nine strikes", () => {
  const result = selectAtmCenteredStrikeWindow(strikes, 760);
  assert.equal(result.visibleStrikes.length, 9);
  assert.deepEqual(result.visibleStrikes, strikes.slice(-9));
});

test("fewer than nine strikes returns every returned strike", () => {
  assert.deepEqual(selectAtmCenteredStrikeWindow([753, 751, 752], 752).visibleStrikes, [751, 752, 753]);
});

test("exactly nine strikes returns all nine", () => {
  const exactlyNine = strikes.slice(0, 9);
  assert.deepEqual(selectAtmCenteredStrikeWindow(exactlyNine, 755).visibleStrikes, exactlyNine);
});

test("more than nine strikes returns exactly nine", () => {
  assert.equal(selectAtmCenteredStrikeWindow(strikes, 756).visibleStrikes.length, 9);
});

test("window contains only returned strikes and fabricates none", () => {
  const input = [750, 752, 755, 760, 770, 780, 790, 800, 810, 820];
  const result = selectAtmCenteredStrikeWindow(input, 756);
  assert.ok(result.visibleStrikes.every((strike) => input.includes(strike)));
});

test("window output is deterministic", () => {
  const input = [759, 755, 751, 758, 752, 757, 753, 756, 754, 760, 761];
  assert.deepEqual(
    selectAtmCenteredStrikeWindow(input, 755.4),
    selectAtmCenteredStrikeWindow([...input].reverse(), 755.4),
  );
});

test("missing underlying uses the first nine sorted unique strikes with no ATM", () => {
  assert.deepEqual(selectAtmCenteredStrikeWindow([...strikes].reverse(), null), {
    atmStrike: null,
    visibleStrikes: strikes.slice(0, 9),
  });
});

test("sortUniqueStrikes keeps unique finite strikes in ascending order", () => {
  assert.deepEqual(sortUniqueStrikes([755, Number.NaN, 754, 755, Number.POSITIVE_INFINITY]), [754, 755]);
});
