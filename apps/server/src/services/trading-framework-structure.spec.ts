import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let passed = 0;
function test(name: string, fn: () => void): void {
  fn();
  passed += 1;
  console.log(`✓ ${name}`);
}

const schema = readFileSync("apps/server/prisma/schema.prisma", "utf8");
const migration = readFileSync(
  "apps/server/prisma/migrations/20260723133000_add_complete_trading_framework/migration.sql",
  "utf8",
);
const repository = readFileSync(
  "apps/server/src/services/trading-workspace.repository.ts",
  "utf8",
);
const service = readFileSync(
  "apps/server/src/services/trading-workspace.service.ts",
  "utf8",
);
const automation = readFileSync(
  "apps/server/src/services/trading-workspace-automation.service.ts",
  "utf8",
);
const contract = readFileSync(
  "apps/server/src/services/trade-contract.logic.ts",
  "utf8",
);
const shared = readFileSync(
  "packages/shared/src/trading-framework-schemas.ts",
  "utf8",
);

test("database schema includes every V1.6-V1.9 persistent domain", () => {
  for (const model of [
    "TradingDayLedger",
    "TradingPosition",
    "TradingAttempt",
    "TradingReadyAlert",
    "TradingRestrictedEvent",
    "TradingWorkspaceRuntime",
    "TradingWorkspaceEvent",
    "TradingPositionMark",
    "TradingManualOverride",
  ]) {
    assert.match(schema, new RegExp(`model ${model}\\b`));
    assert.match(migration, new RegExp(`CREATE TABLE "${model}"`));
  }
});

test("database-enforced risk and concurrency invariants are present", () => {
  assert.match(migration, /TradingPosition_one_open_per_user_idx/);
  assert.match(migration, /TradingReadyAlert_one_active_per_user_idx/);
  assert.match(migration, /TradingPosition_readyAlertId_key/);
  assert.match(migration, /TradingAttempt_userId_setupEpisodeId_attemptNumber_key/);
  assert.match(migration, /"quantity" = 1/);
  assert.match(migration, /"plannedRiskDollars" > 0 AND "plannedRiskDollars" <= 50/);
  assert.match(migration, /"attemptNumber" BETWEEN 1 AND 2/);
  const constraintNames = [...migration.matchAll(/ADD CONSTRAINT "([^"]+)"/g)].map(
    (match) => match[1],
  );
  assert.equal(new Set(constraintNames).size, constraintNames.length);
});

test("macro event restrictions are fail-closed in schema and database", () => {
  assert.match(shared, /CPI/);
  assert.match(shared, /EMPLOYMENT_SITUATION_NFP/);
  assert.match(shared, /FOMC/);
  assert.match(migration, /TradingRestrictedEvent_full_day_macro_check/);
  assert.match(migration, /"eventType" NOT IN \('CPI','EMPLOYMENT_SITUATION_NFP','FOMC'\) OR "blockMode" = 'FULL_DAY'/);
});

test("manual confirmation and transaction locks protect entry and exit", () => {
  assert.match(repository, /pg_advisory_xact_lock/);
  assert.match(repository, /READY_ALERT_NOT_ACTIVE/);
  assert.match(repository, /READY_ALERT_EXPIRED/);
  assert.match(repository, /CONCURRENT_POSITION_LIMIT_REACHED/);
  assert.match(repository, /TRADE_COUNT_LIMIT_REACHED/);
  assert.match(repository, /DAILY_LOSS_LIMIT_REACHED/);
  assert.match(repository, /CONSECUTIVE_LOSS_LIMIT_REACHED/);
  assert.match(repository, /ATTEMPT_LIMIT_REACHED/);
  assert.match(service, /manualEntryConfirmationRequired: true/);
  assert.match(service, /manualExitConfirmationRequired: true/);
});

test("pure-engine and user-executed performance are separated", () => {
  assert.match(repository, /"modeledEntryPrice"/);
  assert.match(repository, /"actualEntryPrice"/);
  assert.match(repository, /"actualExitPrice"/);
  assert.match(repository, /\- "modeledEntryPrice"/);
  assert.match(repository, /'ACTUAL_USER_EXIT'/);
  assert.match(service, /manualOverridesSeparatedFromPureEnginePerformance: true/);
});

test("Discord delivery is persistent, deduplicated, and actionable-only", () => {
  assert.match(migration, /TradingWorkspaceEvent_userId_dedupeKey_key/);
  assert.match(automation, /event\.payload\.actionable !== true/);
  assert.match(automation, /state: "SUPPRESSED"/);
  assert.match(automation, /actionable: signal === primarySignal/);
  assert.match(automation, /severity: input\.actionable \? metadata\.severity : "INFO"/);
  assert.match(automation, /allowed_mentions: \{ parse: \[\] \}/);
  assert.match(automation, /No order was created or executed/);
});

test("CONTRACT_V3 bounds selection to ATM plus one adjacent strike per side", () => {
  assert.match(contract, /CONTRACT_METHODOLOGY_VERSION = "CONTRACT_V3"/);
  assert.match(contract, /MAXIMUM_CANDIDATE_STRIKES = 3/);
  assert.match(contract, /fartherStrikeFallbackPolicy: "BOUNDED_ADJACENT_ONLY"/);
  assert.match(contract, /selectBoundedContractStrikeWindow/);
  assert.match(contract, /PREMIUM_EXCEEDS_MAXIMUM/);
  assert.match(contract, /PLANNED_STRUCTURAL_LOSS_EXCEEDS_MAXIMUM/);
});

test("no automatic broker order path exists in the framework", () => {
  const combined = [service, repository, automation, shared].join("\n");
  assert.doesNotMatch(combined, /placeOrder|submitOrder|createOrder|marketOrder|limitOrder/);
  assert.match(shared, /automatedOrderExecution: z\.literal\(false\)/);
  assert.match(service, /noAutomatedOrderExecution: true/);
});

console.log(`\n${passed} framework-structure tests passed.`);
