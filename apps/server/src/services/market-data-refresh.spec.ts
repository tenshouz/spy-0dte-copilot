import assert from "node:assert/strict";
import { CANDLE_SHORT_CACHE_MS } from "./schwab-candles.logic";
import { QUOTE_SHORT_CACHE_MS } from "./schwab-market-data.logic";

assert.equal(QUOTE_SHORT_CACHE_MS, 2_000);
assert.equal(CANDLE_SHORT_CACHE_MS, 5_000);
assert.ok(QUOTE_SHORT_CACHE_MS < CANDLE_SHORT_CACHE_MS);
assert.ok(CANDLE_SHORT_CACHE_MS <= 5_000);

console.log("Market data refresh tests: 4 passed, 0 failed");
