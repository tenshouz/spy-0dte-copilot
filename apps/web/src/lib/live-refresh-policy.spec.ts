import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  LIVE_REFRESH_POLICY_VERSION,
  SPY_CANDLE_ACTIVE_POLL_INTERVAL_MS,
  SPY_CANDLE_INACTIVE_POLL_INTERVAL_MS,
  SPY_DERIVED_ACTIVE_POLL_INTERVAL_MS,
  SPY_DERIVED_INACTIVE_POLL_INTERVAL_MS,
  SPY_QUOTE_ACTIVE_POLL_INTERVAL_MS,
  SPY_QUOTE_INACTIVE_POLL_INTERVAL_MS,
  getSpyCandlePollIntervalMs,
  getSpyDerivedPollIntervalMs,
  getSpyQuotePollIntervalMs,
  isActiveMarketRefreshWindow,
} from "./live-refresh-policy";
import { formatLiveDataAge, getLiveDataAgeMs } from "../hooks/use-live-data-age";

const mondayTenAmEt = Date.parse("2026-07-20T14:00:00.000Z");
const mondayBeforeWindow = Date.parse("2026-07-20T10:59:00.000Z");
const mondayAfterWindow = Date.parse("2026-07-20T20:16:00.000Z");
const sundayNoonEt = Date.parse("2026-07-19T16:00:00.000Z");

assert.equal(LIVE_REFRESH_POLICY_VERSION, "LIVE_REFRESH_POLICY_V1");
assert.equal(isActiveMarketRefreshWindow(mondayTenAmEt), true);
assert.equal(isActiveMarketRefreshWindow(mondayBeforeWindow), false);
assert.equal(isActiveMarketRefreshWindow(mondayAfterWindow), false);
assert.equal(isActiveMarketRefreshWindow(sundayNoonEt), false);

assert.equal(getSpyQuotePollIntervalMs(mondayTenAmEt), SPY_QUOTE_ACTIVE_POLL_INTERVAL_MS);
assert.equal(getSpyQuotePollIntervalMs(sundayNoonEt), SPY_QUOTE_INACTIVE_POLL_INTERVAL_MS);
assert.equal(getSpyCandlePollIntervalMs(mondayTenAmEt), SPY_CANDLE_ACTIVE_POLL_INTERVAL_MS);
assert.equal(getSpyCandlePollIntervalMs(sundayNoonEt), SPY_CANDLE_INACTIVE_POLL_INTERVAL_MS);
assert.equal(getSpyDerivedPollIntervalMs(mondayTenAmEt), SPY_DERIVED_ACTIVE_POLL_INTERVAL_MS);
assert.equal(getSpyDerivedPollIntervalMs(sundayNoonEt), SPY_DERIVED_INACTIVE_POLL_INTERVAL_MS);

assert.equal(getLiveDataAgeMs("2026-07-20T14:00:00.000Z", mondayTenAmEt + 4_500), 4_500);
assert.equal(formatLiveDataAge(400), "Now");
assert.equal(formatLiveDataAge(5_900), "5s ago");
assert.equal(formatLiveDataAge(61_000), "1m ago");

const policySource = readFileSync("apps/web/src/lib/live-refresh-policy.ts", "utf8");
const quoteHook = readFileSync("apps/web/src/hooks/use-spy-quote.ts", "utf8");
const candleHook = readFileSync("apps/web/src/hooks/use-spy-candles.ts", "utf8");
const liveChart = readFileSync("apps/web/src/components/dashboard/live-chart.tsx", "utf8");
const chartContainer = readFileSync("apps/web/src/components/panels/chart-container.tsx", "utf8");
const currentPriceCard = readFileSync(
  "apps/web/src/components/dashboard/current-price-card.tsx",
  "utf8",
);

assert.match(policySource, /refetchOnWindowFocus/);
assert.match(policySource, /refetchOnReconnect/);
assert.match(policySource, /refetchIntervalInBackground/);
assert.match(policySource, /staleTime/);
for (const source of [quoteHook, candleHook]) {
  assert.match(source, /LIVE_QUERY_RESPONSIVENESS_OPTIONS/);
}

assert.match(quoteHook, /getSpyQuotePollIntervalMs/);
assert.match(candleHook, /getSpyCandlePollIntervalMs/);
assert.match(liveChart, /livePrice=/);
assert.match(liveChart, /useDisplaySpyQuote/);
assert.match(chartContainer, /livePriceLineRef/);
assert.match(chartContainer, /applyOptions/);
assert.match(currentPriceCard, /useLiveDataAge/);
assert.match(currentPriceCard, /Updated/);

console.log("Live refresh policy tests: 29 passed, 0 failed");
