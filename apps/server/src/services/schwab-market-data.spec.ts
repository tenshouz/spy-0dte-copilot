/**
 * Deterministic tests for the PURE quote logic — sanitized fixtures only.
 * Imports ONLY schwab-market-data.logic.ts: no Prisma, no database client,
 * no OAuth service, no infrastructure initialization.
 *
 * Run locally (tsx is already a dev dependency; no test framework added):
 *
 *   npx --no-install tsx apps/server/src/services/schwab-market-data.spec.ts
 *
 * Exits non-zero on any assertion failure.
 */
import assert from "node:assert/strict";
import {
  QUOTE_FRESHNESS_THRESHOLD_MS,
  RATE_LIMIT_DEFAULT_BACKOFF_MS,
  RATE_LIMIT_MAX_BACKOFF_MS,
  decideCachedState,
  mapSecurityStatus,
  normalizeRawSpyQuote,
  parseRetryAfterMs,
  toSpyQuote,
} from "./schwab-market-data.logic";

const NOW = 1_750_000_000_000;
const FIXTURE_QUOTE_TIME = 1_749_999_000_000;

const validFixture = {
  SPY: {
    assetMainType: "EQUITY",
    symbol: "SPY",
    quote: {
      lastPrice: 612.34,
      bidPrice: 612.33,
      askPrice: 612.35,
      totalVolume: 41_234_567,
      quoteTime: FIXTURE_QUOTE_TIME,
      securityStatus: "Normal",
      unrelatedExtraField: "ignored",
    },
  },
};

function withQuote(overrides: Record<string, unknown>, omit: string[] = []) {
  const quote: Record<string, unknown> = { ...validFixture.SPY.quote, ...overrides };
  for (const key of omit) delete quote[key];
  return { SPY: { quote } };
}

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`PASS ${name}`);
  } catch (err) {
    failed++;
    console.error(`FAIL ${name}: ${(err as Error).message}`);
  }
}

// --- Normalization -----------------------------------------------------------

test("valid raw Schwab quote normalizes", () => {
  const q = normalizeRawSpyQuote(validFixture, NOW);
  assert.equal(q.lastPrice, 612.34);
  assert.equal(q.bidPrice, 612.33);
  assert.equal(q.askPrice, 612.35);
  assert.equal(q.volume, 41_234_567);
  assert.equal(q.quoteTimestamp, new Date(FIXTURE_QUOTE_TIME).toISOString());
  assert.equal(q.marketStatus, "NORMAL");
  assert.equal(q.fetchedAtMs, NOW);
});

test("missing SPY entry rejected", () => {
  assert.throws(() => normalizeRawSpyQuote({ QQQ: { quote: validFixture.SPY.quote } }, NOW));
});

test("missing last price rejected", () => {
  assert.throws(() => normalizeRawSpyQuote(withQuote({}, ["lastPrice"]), NOW));
});

test("negative last price rejected", () => {
  assert.throws(() => normalizeRawSpyQuote(withQuote({ lastPrice: -1 }), NOW));
  assert.throws(() => normalizeRawSpyQuote(withQuote({ lastPrice: 0 }), NOW));
});

test("negative bid/ask rejected", () => {
  assert.throws(() => normalizeRawSpyQuote(withQuote({ bidPrice: -0.01 }), NOW));
  assert.throws(() => normalizeRawSpyQuote(withQuote({ askPrice: -5 }), NOW));
});

test("fractional or negative volume rejected", () => {
  assert.throws(() => normalizeRawSpyQuote(withQuote({ totalVolume: 12.5 }), NOW));
  assert.throws(() => normalizeRawSpyQuote(withQuote({ totalVolume: -100 }), NOW));
});

test("missing optional bid/ask/volume become null, not zero", () => {
  const q = normalizeRawSpyQuote(withQuote({}, ["bidPrice", "askPrice", "totalVolume"]), NOW);
  assert.equal(q.bidPrice, null);
  assert.equal(q.askPrice, null);
  assert.equal(q.volume, null);
});

test("documented zero optional values preserved as zero", () => {
  const q = normalizeRawSpyQuote(withQuote({ bidPrice: 0, askPrice: 0, totalVolume: 0 }), NOW);
  assert.equal(q.bidPrice, 0);
  assert.equal(q.askPrice, 0);
  assert.equal(q.volume, 0);
});

test("malformed timestamp type rejected — never substituted with current time", () => {
  assert.throws(() => normalizeRawSpyQuote(withQuote({ quoteTime: "yesterday" }), NOW));
  assert.throws(() => normalizeRawSpyQuote(withQuote({ quoteTime: 1_749_999_000_000.5 }), NOW));
  assert.throws(() => normalizeRawSpyQuote(withQuote({ quoteTime: -1 }), NOW));
});

test("out-of-range epoch rejected before toISOString", () => {
  assert.throws(() => normalizeRawSpyQuote(withQuote({ quoteTime: 8_640_000_000_000_001 }), NOW));
});

// --- Source state --------------------------------------------------------------

test("LIVE at exactly the freshness boundary", () => {
  assert.equal(decideCachedState(NOW - QUOTE_FRESHNESS_THRESHOLD_MS, NOW), "LIVE");
});

test("STALE just past the freshness boundary", () => {
  assert.equal(decideCachedState(NOW - QUOTE_FRESHNESS_THRESHOLD_MS - 1, NOW), "STALE");
});

test("old quoteTimestamp does NOT force STALE when fetchedAt is fresh (closed market)", () => {
  const q = normalizeRawSpyQuote(validFixture, NOW); // quoteTime ~17 min old
  const out = toSpyQuote(q, NOW + 1_000, null);
  assert.equal(out.sourceState, "LIVE");
});

test("toSpyQuote output passes the shared contract and carries warning + age", () => {
  const q = normalizeRawSpyQuote(validFixture, NOW - 60_000);
  const out = toSpyQuote(q, NOW, "NETWORK_ERROR");
  assert.equal(out.sourceState, "STALE");
  assert.equal(out.warningCode, "NETWORK_ERROR");
  assert.equal(out.dataAgeMs, 60_000);
  assert.equal(out.symbol, "SPY");
});

test("fallback freshness uses response-time clock: 40s cache + 10s timeout → STALE", () => {
  // Cache was 40s old (LIVE) when the request started; a 10s timeout later,
  // the payload must be judged by the CURRENT clock — 50s old → STALE.
  const q = normalizeRawSpyQuote(validFixture, NOW - 40_000);
  assert.equal(decideCachedState(q.fetchedAtMs, NOW), "LIVE"); // at request start
  const out = toSpyQuote(q, NOW + 10_000, "TIMEOUT"); // at fallback creation
  assert.equal(out.sourceState, "STALE");
  assert.equal(out.dataAgeMs, 50_000);
  // fetchedAt stays the ORIGINAL retrieval time, not the fallback time.
  assert.equal(out.fetchedAt, new Date(NOW - 40_000).toISOString());
});

// --- Security status --------------------------------------------------------

test("security-status mapping — unknown values map to UNKNOWN, never invented", () => {
  assert.equal(mapSecurityStatus("Normal"), "NORMAL");
  assert.equal(mapSecurityStatus("Halted"), "HALTED");
  assert.equal(mapSecurityStatus("Closed"), "CLOSED");
  assert.equal(mapSecurityStatus("SomethingNew"), "UNKNOWN");
  assert.equal(mapSecurityStatus(undefined), "UNKNOWN");
});

// --- Retry-After -------------------------------------------------------------

test("Retry-After delta seconds (digits only)", () => {
  assert.equal(parseRetryAfterMs("30", NOW), 30_000);
});

test("decimal Retry-After falls back to default", () => {
  assert.equal(parseRetryAfterMs("1.5", NOW), RATE_LIMIT_DEFAULT_BACKOFF_MS);
});

test("scientific-notation Retry-After falls back to default", () => {
  assert.equal(parseRetryAfterMs("1e2", NOW), RATE_LIMIT_DEFAULT_BACKOFF_MS);
});

test("signed Retry-After falls back to default", () => {
  assert.equal(parseRetryAfterMs("+30", NOW), RATE_LIMIT_DEFAULT_BACKOFF_MS);
  assert.equal(parseRetryAfterMs("-5", NOW), RATE_LIMIT_DEFAULT_BACKOFF_MS);
});

test("Retry-After HTTP-date", () => {
  const future = new Date(NOW + 90_000).toUTCString();
  const result = parseRetryAfterMs(future, NOW);
  // toUTCString has second precision; allow sub-second rounding loss.
  assert.ok(Math.abs(result - 90_000) < 1_000, `expected ~90000, got ${result}`);
});

test("invalid or past Retry-After falls back to the conservative default", () => {
  assert.equal(parseRetryAfterMs("not-a-value", NOW), RATE_LIMIT_DEFAULT_BACKOFF_MS);
  assert.equal(parseRetryAfterMs("-5", NOW), RATE_LIMIT_DEFAULT_BACKOFF_MS);
  assert.equal(parseRetryAfterMs("0", NOW), RATE_LIMIT_DEFAULT_BACKOFF_MS);
  assert.equal(parseRetryAfterMs(new Date(NOW - 60_000).toUTCString(), NOW), RATE_LIMIT_DEFAULT_BACKOFF_MS);
  assert.equal(parseRetryAfterMs(null, NOW), RATE_LIMIT_DEFAULT_BACKOFF_MS);
});

test("backoff is capped at five minutes and never negative", () => {
  assert.equal(parseRetryAfterMs("100000", NOW), RATE_LIMIT_MAX_BACKOFF_MS);
  assert.equal(parseRetryAfterMs(new Date(NOW + 3_600_000).toUTCString(), NOW), RATE_LIMIT_MAX_BACKOFF_MS);
  assert.ok(parseRetryAfterMs("-100000", NOW) > 0);
});

console.log(`\n${passed} passed, ${failed} failed (${passed + failed} total)`);
if (failed > 0) process.exit(1);
