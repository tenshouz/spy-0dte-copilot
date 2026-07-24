import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("apps/server/src/routes/trading-workspace.routes.ts", "utf8");
const index = readFileSync("apps/server/src/index.ts", "utf8");

assert.match(source, /tradingWorkspaceRouter\.get\("\/spy"/);
assert.match(source, /tradingWorkspaceRouter\.post\("\/spy\/confirm-entry"/);
assert.match(source, /tradingWorkspaceRouter\.post\("\/spy\/positions\/:positionId\/close"/);
assert.match(source, /tradingWorkspaceRouter\.post\("\/spy\/override"/);
assert.match(source, /tradingWorkspaceRouter\.post\("\/events"/);
assert.match(source, /tradingWorkspaceRouter\.put\("\/events\/:eventId"/);
assert.match(source, /tradingWorkspaceRouter\.delete\("\/events\/:eventId"/);
assert.match(source, /Cache-Control", "no-store"/);
assert.match(source, /isAllowedAccountRiskOrigin/);
assert.match(source, /ConfirmTradingEntryRequestSchema\.safeParse/);
assert.match(source, /CloseTradingPositionRequestSchema\.safeParse/);
assert.match(source, /RecordTradingOverrideRequestSchema\.safeParse/);
assert.match(source, /UpsertTradingRestrictedEventRequestSchema\.safeParse/);
assert.doesNotMatch(source, /order|execute-order|broker-order/i);
assert.match(index, /app\.use\("\/api\/trading-workspace", tradingWorkspaceRouter\)/);
assert.match(index, /startTradingWorkspaceScheduler/);
assert.match(index, /tradingWorkspaceScheduler\.stop\(\)/);

console.log("✓ trading workspace route and lifecycle wiring passed");
