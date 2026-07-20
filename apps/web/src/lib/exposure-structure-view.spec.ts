/**
 * Presentation and architecture tests for deterministic Exposure Structure.
 * Run: npx --no-install tsx apps/web/src/lib/exposure-structure-view.spec.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SpyZeroDteExposureStructureResponse } from "@spy-copilot/shared";
import {
  exposureStructureTone,
  exposureStructureWarningMessage,
  formatExposureState,
  getExposureStructureReferenceLines,
} from "./exposure-structure-view";

const response = {
  engineState: "AVAILABLE",
  currentMarketDate: "2026-07-20",
  callWalls: [{ strikePrice: 605 }],
  putWalls: [{ strikePrice: 595 }],
  gammaFlipProxy: { estimatedStrike: 600 },
} as unknown as SpyZeroDteExposureStructureResponse;

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

test("state formatting is deterministic", () => {
  assert.equal(formatExposureState("CALL_DOMINANT"), "CALL DOMINANT");
  assert.equal(formatExposureState("NO_CROSS"), "NO CROSS");
});

test("engine states map to fixed badge tones", () => {
  assert.equal(exposureStructureTone("AVAILABLE"), "bull");
  assert.equal(exposureStructureTone("PARTIAL"), "wait");
  assert.equal(exposureStructureTone("UNAVAILABLE"), "bear");
});

test("every warning has fixed user-facing copy", () => {
  for (const warning of [
    "GEX_UNAVAILABLE",
    "DEX_UNAVAILABLE",
    "PARTIAL_GEX_COVERAGE",
    "PARTIAL_DEX_COVERAGE",
    "RETAINED_STALE_CHAIN",
    "GAMMA_BALANCE_CROSS_NOT_FOUND",
    "INSUFFICIENT_STRIKES_FOR_CLIFFS",
  ] as const) {
    assert.ok(exposureStructureWarningMessage(warning).length > 20);
  }
});

test("chart lines include primary Call Wall Put Wall and Gamma balance", () => {
  assert.deepEqual(
    getExposureStructureReferenceLines(response).map((line) => [line.title, line.price]),
    [
      ["Call Wall", 605],
      ["Put Wall", 595],
      ["Gamma Balance", 600],
    ],
  );
});

test("unavailable structure produces no chart overlays", () => {
  assert.deepEqual(
    getExposureStructureReferenceLines({ ...response, engineState: "UNAVAILABLE" }),
    [],
  );
});

test("API client validates the dedicated no-store endpoint", () => {
  const source = readFileSync(
    resolve(process.cwd(), "apps/web/src/lib/api-client.ts"),
    "utf8",
  );
  assert.ok(source.includes("SpyZeroDteExposureStructureResponseSchema"));
  assert.ok(source.includes('"/api/exposure-structure/spy"'));
  assert.ok(source.includes("getPrivateNoStoreJson"));
});

test("hook polls the dedicated product and preserves validated previous data", () => {
  const source = readFileSync(
    resolve(process.cwd(), "apps/web/src/hooks/use-spy-exposure-structure.ts"),
    "utf8",
  );
  assert.ok(source.includes("apiClient.getSpyZeroDteExposureStructure"));
  assert.ok(source.includes("SPY_OPTIONS_CHAIN_POLL_INTERVAL_MS"));
  assert.ok(source.includes("placeholderData"));
});

test("Gamma page renders complete structure before raw proxy detail", () => {
  const source = readFileSync(
    resolve(process.cwd(), "apps/web/src/app/gamma/page.tsx"),
    "utf8",
  );
  assert.ok(source.includes("<ExposureStructurePanel"));
  assert.ok(source.indexOf("<ExposureStructurePanel") < source.indexOf("Returned-Window Call GEX"));
});

test("Dashboard replaces the approximation card with the shared structure panel", () => {
  const source = readFileSync(
    resolve(process.cwd(), "apps/web/src/app/dashboard/page.tsx"),
    "utf8",
  );
  assert.ok(source.includes("<ExposureStructurePanel compact"));
  assert.equal(source.includes('title="GEX Concentrations"'), false);
});

test("Market Data composes full Exposure Structure", () => {
  const source = readFileSync(
    resolve(process.cwd(), "apps/web/src/app/market-data/page.tsx"),
    "utf8",
  );
  assert.ok(source.includes('<ExposureStructurePanel className="lg:col-span-4"'));
});

test("live charts scope exposure overlays to matching market date", () => {
  const dashboard = readFileSync(
    resolve(process.cwd(), "apps/web/src/components/dashboard/live-chart.tsx"),
    "utf8",
  );
  const marketData = readFileSync(
    resolve(process.cwd(), "apps/web/src/app/market-data/page.tsx"),
    "utf8",
  );
  for (const source of [dashboard, marketData]) {
    assert.ok(source.includes("getExposureStructureReferenceLines"));
    assert.ok(source.includes("chartMarketDate === exposureStructure.currentMarketDate"));
  }
});

test("panel labels the balance point as a proxy and disclaims dealer inventory", () => {
  const source = readFileSync(
    resolve(
      process.cwd(),
      "apps/web/src/components/dashboard/exposure-structure-panel.tsx",
    ),
    "utf8",
  );
  assert.ok(source.includes("Gamma Balance Proxy"));
  assert.ok(source.includes("not a dealer flip"));
  assert.ok(source.includes("do not reveal observed dealer inventory"));
});

test("Exposure Structure UI contains no order action", () => {
  const files = [
    "apps/web/src/components/dashboard/exposure-structure-panel.tsx",
    "apps/web/src/lib/exposure-structure-view.ts",
    "apps/web/src/hooks/use-spy-exposure-structure.ts",
  ];
  const source = files
    .map((file) => readFileSync(resolve(process.cwd(), file), "utf8"))
    .join("\n");
  for (const forbidden of ["Submit Order", "Place Order", "Buy Calls", "Buy Puts"]) {
    assert.equal(source.includes(forbidden), false);
  }
});

console.log(`\nExposure Structure UI tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
