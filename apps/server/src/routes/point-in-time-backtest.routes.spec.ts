import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const route = readFileSync(
  resolve(root, "apps/server/src/routes/point-in-time-backtest.routes.ts"),
  "utf8",
);
const index = readFileSync(resolve(root, "apps/server/src/index.ts"), "utf8");

assert.match(route, /router\.get\("\/spy\/runs"/);
assert.match(route, /router\.get\("\/spy\/runs\/:runId"/);
assert.match(route, /router\.post\("\/spy\/runs"/);
assert.match(route, /safeParse\(req\.body/);
assert.match(route, /Cross-Origin-Resource-Policy/);
assert.match(index, /app\.use\("\/api\/backtest", pointInTimeBacktestRouter\)/);
assert.doesNotMatch(route, /placeOrder|cancelOrder|executeOrder/i);
console.log("Point-in-time backtest route: 7 checks passed.");
