/** Static safety-contract checks for the empirical Gamma research route. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(process.cwd(), "apps/server/src/routes/gamma-research.routes.ts"),
  "utf8",
);

assert.ok(source.includes('router.get("/spy"'));
assert.equal(source.includes("router.post("), false);
assert.equal(source.includes("router.put("), false);
assert.equal(source.includes("router.delete("), false);
assert.ok(source.includes('res.setHeader("Cache-Control", "no-store")'));
assert.ok(source.includes('res.setHeader("Cross-Origin-Resource-Policy", "same-site")'));
assert.ok(source.includes("isAllowedAccountRiskOrigin"));
assert.ok(source.includes("Object.keys(req.query).length > 0"));
assert.ok(source.includes("EMPIRICAL_GAMMA_RESEARCH_UNEXPECTED_FAILURE"));
assert.equal(source.toLowerCase().includes("realizedpnldollars"), false);

console.log("✓ empirical Gamma research route is read-only, private, and no-store");
