/**
 * Pure tests for best-effort deterministic decision-cycle persistence.
 * Run: npx --no-install tsx apps/server/src/services/decision-cycle-audit.spec.ts
 */
import assert from "node:assert/strict";
import type { SpyZeroDteTradePlanAssemblyResponse } from "@spy-copilot/shared";
import { buildSpyZeroDteContractSelection } from "./trade-contract.logic";
import { buildSpyZeroDteTradePlanAssembly } from "./trade-plan-assembly.logic";
import {
  captureDeterministicDecisionCycleWithDependencies,
  deterministicDecisionCycleKey,
  pointInTimeOptionsChainKey,
  type DecisionCycleAuditDependencies,
} from "./decision-cycle-audit.service";
import {
  V140_CONTRACT_EVAL_MS,
  makeV140BiasPlanRisk,
  makeV140MarketState,
  makeV140OptionsChain,
} from "./trade-engine-v140.test-fixtures";

const ASSEMBLY_AT_MS = Date.parse("2026-07-17T14:00:11.000Z");

let passed = 0;
let failed = 0;
async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`✗ ${name}`);
    console.error(error);
  }
}

function makeAssembly(): SpyZeroDteTradePlanAssemblyResponse {
  const { marketState, bias, tradePlan, risk } = makeV140BiasPlanRisk("CALLS");
  const contract = buildSpyZeroDteContractSelection(
    risk,
    makeV140OptionsChain("CALLS"),
    V140_CONTRACT_EVAL_MS,
  );
  return buildSpyZeroDteTradePlanAssembly(
    marketState,
    bias,
    tradePlan,
    risk,
    contract,
    ASSEMBLY_AT_MS,
  );
}

function dependencies(
  overrides: Partial<DecisionCycleAuditDependencies> = {},
): DecisionCycleAuditDependencies {
  return {
    databaseConfigured: () => true,
    getUserId: async () => "user-v140",
    insert: async () => undefined,
    now: () => new Date("2026-07-17T14:00:12.000Z"),
    createId: () => "decision-cycle-v140",
    log: () => undefined,
    ...overrides,
  };
}

async function main(): Promise<void> {
await test("decision-cycle key is stable for the same immutable assembly", () => {
  const assembly = makeAssembly();
  assert.equal(
    deterministicDecisionCycleKey(assembly),
    deterministicDecisionCycleKey(structuredClone(assembly)),
  );
  assert.equal(
    deterministicDecisionCycleKey(assembly),
    `ASSEMBLY_DECISION_CYCLE_V2|${assembly.currentMarketDate}|${assembly.calculatedAt}`,
  );
});

await test("options-chain snapshot key is stable and timestamp-specific", () => {
  const chain = makeV140OptionsChain("CALLS");
  assert.equal(
    pointInTimeOptionsChainKey(chain),
    `POINT_IN_TIME_OPTIONS_CHAIN_V1|${chain.currentMarketDate}|${chain.fetchedAt}`,
  );
});

await test("available decision cycles are inserted with a deterministic key", async () => {
  const assembly = makeAssembly();
  let insertCount = 0;
  let capturedKey: string | null = null;
  const marketState = makeV140MarketState("CALLS");
  const optionsChain = makeV140OptionsChain("CALLS");
  const result = await captureDeterministicDecisionCycleWithDependencies(
    assembly,
    dependencies({
      insert: async (
        _userId,
        _id,
        sourceReferenceKey,
        _capturedAt,
        sourceAssembly,
        capturedMarketState,
        capturedOptionsChain,
      ) => {
        insertCount += 1;
        capturedKey = sourceReferenceKey;
        assert.equal(sourceAssembly.calculatedAt, assembly.calculatedAt);
        assert.equal(capturedMarketState?.calculatedAt, marketState.calculatedAt);
        assert.equal(capturedOptionsChain?.fetchedAt, optionsChain.fetchedAt);
      },
    }),
    marketState,
    optionsChain,
  );
  assert.equal(result, "CAPTURED_OR_DUPLICATE");
  assert.equal(insertCount, 1);
  assert.equal(capturedKey, deterministicDecisionCycleKey(assembly));
});

await test("database-unconfigured environments skip without importing Prisma", async () => {
  let userLookupCount = 0;
  const result = await captureDeterministicDecisionCycleWithDependencies(
    makeAssembly(),
    dependencies({
      databaseConfigured: () => false,
      getUserId: async () => {
        userLookupCount += 1;
        return "unexpected";
      },
    }),
  );
  assert.equal(result, "SKIPPED");
  assert.equal(userLookupCount, 0);
});

await test("last-resort unavailable assemblies are not persisted", async () => {
  const assembly = {
    ...makeAssembly(),
    engineState: "UNAVAILABLE",
    planState: "UNAVAILABLE",
  } as SpyZeroDteTradePlanAssemblyResponse;
  let insertCount = 0;
  const result = await captureDeterministicDecisionCycleWithDependencies(
    assembly,
    dependencies({ insert: async () => { insertCount += 1; } }),
  );
  assert.equal(result, "SKIPPED");
  assert.equal(insertCount, 0);
});

await test("persistence failures are contained and logged with a fixed category", async () => {
  const logCategories: string[] = [];
  const result = await captureDeterministicDecisionCycleWithDependencies(
    makeAssembly(),
    dependencies({
      insert: async () => { throw new Error("database detail must not escape"); },
      log: (category) => logCategories.push(category),
    }),
  );
  assert.equal(result, "FAILED");
  assert.deepEqual(logCategories, ["capture failed"]);
});

  console.log(`\nDecision-cycle audit tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
