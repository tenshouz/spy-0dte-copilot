import assert from "node:assert/strict";
import { resolveWorkspaceAssemblyTimeMs } from "./trading-workspace-time.logic";

type TimingInput = Parameters<typeof resolveWorkspaceAssemblyTimeMs>[1];

let passed = 0;
function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`✓ ${name}`);
}

function timingInput(overrides: Partial<TimingInput> = {}): TimingInput {
  return {
    sourceContextAssembledAt: "2026-07-23T17:00:00.100Z",
    calculatedAt: "2026-07-23T17:00:00.200Z",
    exposureStructure: null,
    ...overrides,
  };
}

test("keeps the captured workspace clock when it is already newest", () => {
  assert.equal(
    resolveWorkspaceAssemblyTimeMs(
      Date.parse("2026-07-23T17:00:00.300Z"),
      timingInput(),
    ),
    Date.parse("2026-07-23T17:00:00.300Z"),
  );
});

test("advances to the completed market-state timestamp after an awaited fetch", () => {
  assert.equal(
    resolveWorkspaceAssemblyTimeMs(
      Date.parse("2026-07-23T17:00:00.000Z"),
      timingInput(),
    ),
    Date.parse("2026-07-23T17:00:00.200Z"),
  );
});

test("never places Assembly before embedded gamma research context", () => {
  assert.equal(
    resolveWorkspaceAssemblyTimeMs(
      Date.parse("2026-07-23T17:00:00.000Z"),
      timingInput({
        exposureStructure: {
          calculatedAt: "2026-07-23T17:00:00.250Z",
        },
      }),
    ),
    Date.parse("2026-07-23T17:00:00.250Z"),
  );
});

test("uses the context assembly time when it is the newest valid source", () => {
  assert.equal(
    resolveWorkspaceAssemblyTimeMs(
      Date.parse("2026-07-23T17:00:00.000Z"),
      timingInput({
        sourceContextAssembledAt: "2026-07-23T17:00:00.400Z",
      }),
    ),
    Date.parse("2026-07-23T17:00:00.400Z"),
  );
});

test("ignores an invalid optional source timestamp instead of producing NaN", () => {
  assert.equal(
    resolveWorkspaceAssemblyTimeMs(
      Date.parse("2026-07-23T17:00:00.300Z"),
      timingInput({
        sourceContextAssembledAt: "invalid",
        calculatedAt: "invalid",
        exposureStructure: {
          calculatedAt: "invalid",
        },
      }),
    ),
    Date.parse("2026-07-23T17:00:00.300Z"),
  );
});

test("rejects a non-finite captured clock", () => {
  assert.throws(
    () => resolveWorkspaceAssemblyTimeMs(Number.NaN, timingInput()),
    /finite timestamp/,
  );
});

console.log(`\n${passed} trading workspace timestamp tests passed.`);
