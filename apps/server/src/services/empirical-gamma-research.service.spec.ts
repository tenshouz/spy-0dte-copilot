/** Dependency-injected service tests for empirical Gamma research. */
import assert from "node:assert/strict";
import {
  getEmpiricalGammaResearchWithDependencies,
  type EmpiricalGammaResearchServiceDependencies,
} from "./empirical-gamma-research.service";

let passed = 0;
let failed = 0;
const NOW = new Date("2026-07-21T02:00:00.000Z");
function dependencies(
  overrides: Partial<EmpiricalGammaResearchServiceDependencies> = {},
): EmpiricalGammaResearchServiceDependencies {
  return {
    databaseConfigured: () => true,
    getUserId: async () => "user-1",
    repository: {
      loadReviewedOutcomes: async () => ({
        totalPersistedSnapshots: 0,
        rows: [],
      }),
    },
    now: () => NOW,
    log: () => undefined,
    ...overrides,
  };
}

async function run(): Promise<void> {
  const tests: Array<[string, () => Promise<void>]> = [
    [
      "database-not-configured fails closed without touching the repository",
      async () => {
        let repositoryCalled = false;
        const result = await getEmpiricalGammaResearchWithDependencies(
          dependencies({
            databaseConfigured: () => false,
            repository: {
              loadReviewedOutcomes: async () => {
                repositoryCalled = true;
                return { totalPersistedSnapshots: 0, rows: [] };
              },
            },
          }),
        );
        assert.equal(result.engineState, "UNAVAILABLE");
        assert.equal(result.primaryReasonCode, "DATABASE_NOT_CONFIGURED");
        assert.equal(repositoryCalled, false);
      },
    ],
    [
      "configured empty database returns an available empty research payload",
      async () => {
        const result = await getEmpiricalGammaResearchWithDependencies(dependencies());
        assert.equal(result.engineState, "AVAILABLE");
        assert.equal(result.primaryReasonCode, "GAMMA_RESEARCH_EMPTY");
        assert.equal(result.research?.counts.totalPersistedSnapshots, 0);
      },
    ],
    [
      "repository total snapshot count is retained without loading unreviewed rows",
      async () => {
        const result = await getEmpiricalGammaResearchWithDependencies(
          dependencies({
            repository: {
              loadReviewedOutcomes: async () => ({
                totalPersistedSnapshots: 12,
                rows: [],
              }),
            },
          }),
        );
        assert.equal(result.engineState, "AVAILABLE");
        assert.equal(result.research?.counts.totalPersistedSnapshots, 12);
        assert.equal(result.research?.counts.reviewedTradeOutcomeSnapshots, 0);
      },
    ],
    [
      "repository failure returns a payload-free unavailable response and fixed log category",
      async () => {
        const logs: string[] = [];
        const result = await getEmpiricalGammaResearchWithDependencies(
          dependencies({
            repository: {
              loadReviewedOutcomes: async () => {
                throw new Error("private database detail");
              },
            },
            log: (category) => logs.push(category),
          }),
        );
        assert.equal(result.engineState, "UNAVAILABLE");
        assert.equal(result.primaryReasonCode, "DATABASE_UNAVAILABLE");
        assert.equal(result.research, null);
        assert.deepEqual(logs, ["research failed"]);
        assert.equal(JSON.stringify(logs).includes("private database detail"), false);
      },
    ],
  ];

  for (const [name, fn] of tests) {
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

  console.log(`\nEmpirical Gamma research service tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

void run();
