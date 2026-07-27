/**
 * Pure input-boundary and static safety tests for the Schwab-assisted sizing UI.
 * Run: npx --no-install tsx apps/web/src/lib/schwab-assisted-sizing-view.spec.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildSchwabAssistedSizingRequest,
  EMPTY_SCHWAB_ASSISTED_SIZING_FORM,
  getSchwabAssistedSizingStateView,
  type SchwabAssistedSizingFormValues,
} from "./schwab-assisted-sizing-view";

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

const VALID_FORM: SchwabAssistedSizingFormValues = {
  accountEquityDollars: "25000",
  remainingDailyLossBudgetDollars: "1000",
  remainingPortfolioRiskBudgetDollars: "1500",
  maximumRiskPerTradeDollars: "800",
  maximumCapitalAllocationDollars: "3000",
  maximumContracts: "10",
};

test("valid form builds the exact SCHWAB_ASSISTED_SIZING_V2 request shape", () => {
  const result = buildSchwabAssistedSizingRequest(VALID_FORM);
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.deepEqual(result.request, {
    callerRiskInputs: {
      accountEquityDollars: 25000,
      remainingDailyLossBudgetDollars: 1000,
      remainingPortfolioRiskBudgetDollars: 1500,
    },
    riskPolicy: {
      maximumRiskPerTradeDollars: 800,
      maximumCapitalAllocationDollars: 3000,
      maximumContracts: 10,
    },
  });
});

test("blank form does not produce a request", () => {
  const result = buildSchwabAssistedSizingRequest({
    ...EMPTY_SCHWAB_ASSISTED_SIZING_FORM,
  });
  assert.equal(result.success, false);
  if (result.success) return;
  assert.equal(Object.keys(result.errors).length, 6);
});

test("account equity must be positive", () => {
  const result = buildSchwabAssistedSizingRequest({
    ...VALID_FORM,
    accountEquityDollars: "0",
  });
  assert.equal(result.success, false);
  if (result.success) return;
  assert.match(result.errors.accountEquityDollars ?? "", /greater than zero/i);
});

test("risk budgets and policy limits may be zero", () => {
  const result = buildSchwabAssistedSizingRequest({
    ...VALID_FORM,
    remainingDailyLossBudgetDollars: "0",
    remainingPortfolioRiskBudgetDollars: "0",
    maximumRiskPerTradeDollars: "0",
    maximumCapitalAllocationDollars: "0",
    maximumContracts: "0",
  });
  assert.equal(result.success, true);
});

test("negative risk values are rejected", () => {
  const result = buildSchwabAssistedSizingRequest({
    ...VALID_FORM,
    maximumRiskPerTradeDollars: "-1",
  });
  assert.equal(result.success, false);
  if (result.success) return;
  assert.match(result.errors.maximumRiskPerTradeDollars ?? "", /zero or greater/i);
});

test("maximum contracts must be a safe whole number", () => {
  const decimal = buildSchwabAssistedSizingRequest({
    ...VALID_FORM,
    maximumContracts: "1.5",
  });
  assert.equal(decimal.success, false);
  if (!decimal.success) {
    assert.match(decimal.errors.maximumContracts ?? "", /whole number/i);
  }

  const unsafe = buildSchwabAssistedSizingRequest({
    ...VALID_FORM,
    maximumContracts: String(Number.MAX_SAFE_INTEGER + 1),
  });
  assert.equal(unsafe.success, false);
});

test("every sizing state has fixed deterministic display copy", () => {
  for (const state of [
    "SIZED",
    "NO_CAPACITY",
    "BLOCKED",
    "NOT_APPLICABLE",
    "UNAVAILABLE",
  ] as const) {
    const view = getSchwabAssistedSizingStateView(state);
    assert.ok(view.title.length > 0);
    assert.ok(view.description.length > 0);
  }
});

test("sizing hook is an explicit mutation with no polling", () => {
  const hook = readFileSync(
    resolve(
      process.cwd(),
      "apps/web/src/hooks/use-spy-schwab-assisted-position-sizing.ts",
    ),
    "utf8",
  );
  assert.equal(hook.includes("useMutation"), true);
  assert.equal(hook.includes("useQuery"), false);
  assert.equal(hook.includes("refetchInterval"), false);
  assert.equal(hook.includes("retry: false"), true);
});

test("panel does not fetch account data directly or persist risk inputs", () => {
  const panel = readFileSync(
    resolve(
      process.cwd(),
      "apps/web/src/components/trade-plan/schwab-assisted-sizing-panel.tsx",
    ),
    "utf8",
  );
  for (const forbidden of [
    "getSchwabReadOnlyAccountRiskSnapshot",
    "useSchwabReadOnlyAccountRiskSnapshot",
    "localStorage",
    "sessionStorage",
    "indexedDB",
  ]) {
    assert.equal(panel.includes(forbidden), false, `${forbidden} must not appear`);
  }
});

test("panel requires a READY Assembly and explicit button submission", () => {
  const panel = readFileSync(
    resolve(
      process.cwd(),
      "apps/web/src/components/trade-plan/schwab-assisted-sizing-panel.tsx",
    ),
    "utf8",
  );
  assert.equal(panel.includes('const planReady = planState === "READY"'), true);
  assert.equal(panel.includes("disabled={!planReady || mutation.isPending}"), true);
  assert.equal(panel.includes("onSubmit={submitSizing}"), true);
  assert.equal(panel.includes("mutation.mutate(parsed.request)"), true);
  assert.equal(
    panel.includes("mutation.data && planReady ? <SizingResult result={mutation.data} /> : null"),
    true,
  );
});

test("panel contains no order creation or execution control", () => {
  const panel = readFileSync(
    resolve(
      process.cwd(),
      "apps/web/src/components/trade-plan/schwab-assisted-sizing-panel.tsx",
    ),
    "utf8",
  );
  for (const forbidden of [
    "Submit Order",
    "Preview Order",
    "Place Order",
    "Buy Calls",
    "Buy Puts",
    "Enter Now",
    "orderQuantity",
  ]) {
    assert.equal(panel.includes(forbidden), false, `${forbidden} must not appear`);
  }
  assert.equal(panel.includes("Calculate reference size"), true);
  assert.equal(panel.includes("no positions, orders, or transactions are requested"), true);
});

test("Trade Plan page composes the sizing panel without a second Assembly hook", () => {
  const page = readFileSync(
    resolve(process.cwd(), "apps/web/src/app/trade-plan/page.tsx"),
    "utf8",
  );
  assert.equal(page.includes("<SchwabAssistedSizingPanel planState={plan.planState} />"), true);
  assert.equal(page.includes("useSpyZeroDteSchwabAssistedPositionSizing"), false);
});

console.log(`\nSchwab-assisted sizing view tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
