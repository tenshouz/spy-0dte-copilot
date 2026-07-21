import assert from "node:assert/strict";
import { getSpyZeroDteTradePlanAssemblyBundleWithDependencies } from "./trade-plan-assembly.service";
import {
  makeV140MarketState,
  makeV140OptionsChain,
} from "./trade-engine-v140.test-fixtures";
import { getLastResortSpyZeroDteOptionsChain } from "./schwab-options-chain.service";

let passed = 0;
async function test(name: string, fn: () => Promise<void>) {
  await fn();
  passed += 1;
  console.log(`✓ ${name}`);
}

async function main() {
await test("service captures the exact Market State and Options Chain bundle", async () => {
  const state = makeV140MarketState("CALLS");
  const chain = makeV140OptionsChain("CALLS");
  let captureCount = 0;
  const bundle = await getSpyZeroDteTradePlanAssemblyBundleWithDependencies({
    getMarketState: async () => state,
    getOptionsChain: async () => chain,
    getLastResortOptionsChain: getLastResortSpyZeroDteOptionsChain,
    captureDecisionCycle: async (captured) => {
      captureCount += 1;
      assert.equal(captured.marketState, state);
      assert.equal(captured.optionsChain, chain);
      assert.equal(captured.assembly.planState, "READY");
    },
    now: () => Date.parse("2026-07-17T14:00:10.000Z"),
  });
  assert.equal(bundle.marketState, state);
  assert.equal(bundle.optionsChain, chain);
  assert.equal(captureCount, 1);
});

await test("Options Chain is fetched at most once", async () => {
  let chainCount = 0;
  await getSpyZeroDteTradePlanAssemblyBundleWithDependencies({
    getMarketState: async () => makeV140MarketState("CALLS"),
    getOptionsChain: async () => {
      chainCount += 1;
      return makeV140OptionsChain("CALLS");
    },
    getLastResortOptionsChain: getLastResortSpyZeroDteOptionsChain,
    captureDecisionCycle: async () => undefined,
    now: () => Date.parse("2026-07-17T14:00:10.000Z"),
  });
  assert.equal(chainCount, 1);
});

await test("capture failure never changes the deterministic Assembly", async () => {
  const bundle = await getSpyZeroDteTradePlanAssemblyBundleWithDependencies({
    getMarketState: async () => makeV140MarketState("CALLS"),
    getOptionsChain: async () => makeV140OptionsChain("CALLS"),
    getLastResortOptionsChain: getLastResortSpyZeroDteOptionsChain,
    captureDecisionCycle: async () => {
      throw new Error("database unavailable");
    },
    now: () => Date.parse("2026-07-17T14:00:10.000Z"),
  });
  assert.equal(bundle.assembly.planState, "READY");
});

console.log(`Trade Plan Assembly service: ${passed} tests passed.`);
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
