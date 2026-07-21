/**
 * Deterministic presentation tests for the complete Dashboard Guide.
 * Run: npx --no-install tsx apps/web/src/lib/dashboard-guide-view.spec.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  GUIDE_GLOSSARY,
  GUIDE_PAGES,
  GUIDE_PLAN_STATES,
  GUIDE_SECTION_LINKS,
  GUIDE_SOURCE_STATES,
  GUIDE_TRADE_PLAN_STEPS,
} from "./dashboard-guide-content";
import {
  filterGuideGlossary,
  filterGuidePages,
  guideGlossaryMatchesSearch,
  guidePageMatchesSearch,
  guideToneClass,
  normalizeGuideSearch,
} from "./dashboard-guide-view";

const tests: Array<[string, () => void]> = [];
function test(name: string, fn: () => void): void {
  tests.push([name, fn]);
}

test("guide search normalization is deterministic", () => {
  assert.equal(normalizeGuideSearch("  GEX   DEX  "), "gex dex");
  assert.equal(normalizeGuideSearch("WAITING FOR TRIGGER"), "waiting for trigger");
});

test("guide contains every user-facing page exactly once", () => {
  const expected = [
    "/dashboard",
    "/market-data",
    "/options",
    "/gamma",
    "/trade-plan",
    "/alerts",
    "/journal",
    "/replay",
    "/backtest",
    "/system",
    "/settings",
    "/guide",
  ].sort();
  const actual = GUIDE_PAGES.map((page) => page.href).sort();
  assert.deepEqual(actual, expected);
  assert.equal(new Set(actual).size, actual.length);
});

test("page search covers titles features and plain-language aliases", () => {
  const alerts = GUIDE_PAGES.find((page) => page.href === "/alerts");
  const gamma = GUIDE_PAGES.find((page) => page.href === "/gamma");
  assert.ok(alerts);
  assert.ok(gamma);
  assert.equal(guidePageMatchesSearch(alerts, "webhook"), true);
  assert.equal(guidePageMatchesSearch(gamma, "dealer"), true);
  assert.equal(guidePageMatchesSearch(gamma, "journal outcome"), false);
  assert.ok(filterGuidePages(GUIDE_PAGES, "replay").some((page) => page.href === "/replay"));
});

test("glossary search covers definitions and aliases", () => {
  const gex = GUIDE_GLOSSARY.find((item) => item.term === "GEX");
  assert.ok(gex);
  assert.equal(guideGlossaryMatchesSearch(gex, "gamma exposure"), true);
  assert.ok(filterGuideGlossary(GUIDE_GLOSSARY, "2:1").some((item) => item.term === "Reward-to-risk"));
});

test("guide defines complete plan and source state dictionaries", () => {
  assert.deepEqual(
    GUIDE_PLAN_STATES.map((item) => item.label),
    [
      "NOT APPLICABLE",
      "NO SETUP",
      "WAITING FOR TRIGGER",
      "NOT QUALIFIED",
      "NO QUALIFIED CONTRACT",
      "READY",
    ],
  );
  assert.ok(GUIDE_SOURCE_STATES.some((item) => item.label.includes("PARTIAL")));
  assert.ok(GUIDE_SOURCE_STATES.some((item) => item.label.includes("MOCK")));
});

test("trade plan guide preserves fixed safety boundaries", () => {
  const copy = GUIDE_TRADE_PLAN_STEPS.map((item) => `${item.title} ${item.detail}`).join(" ");
  assert.match(copy, /7:00–9:30 AM/);
  assert.match(copy, /at least 2:1/);
  assert.match(copy, /GEX\/DEX adjusts confidence only/);
  assert.match(copy, /cannot create the direction/);
  assert.match(copy, /review—not automatic execution/);
});

test("guide has all major onboarding sections", () => {
  assert.deepEqual(
    GUIDE_SECTION_LINKS.map((item) => item.id),
    [
      "start-here",
      "daily-workflow",
      "pages",
      "trade-plan",
      "statuses",
      "alerts",
      "journal-replay",
      "sharing",
      "glossary",
    ],
  );
});

test("guide tone styling remains explicit", () => {
  assert.match(guideToneClass("bull"), /bull/);
  assert.match(guideToneClass("wait"), /wait/);
  assert.match(guideToneClass("bear"), /bear/);
  assert.match(guideToneClass("accent"), /accent/);
  assert.match(guideToneClass("default"), /muted/);
});

test("guide page renders the complete client guide", () => {
  const source = readFileSync(resolve(process.cwd(), "apps/web/src/app/guide/page.tsx"), "utf8");
  assert.match(source, /DashboardGuide/);
  assert.match(source, /plain-English walkthrough/);
});

test("guide component includes search, navigation, sharing, and safety copy", () => {
  const source = readFileSync(
    resolve(process.cwd(), "apps/web/src/components/guide/dashboard-guide.tsx"),
    "utf8",
  );
  assert.match(source, /Find a feature or term/);
  assert.match(source, /How a Trade Plan becomes READY/);
  assert.match(source, /How automatic Discord alerts work/);
  assert.match(source, /How to share or publish it safely/);
  assert.match(source, /Do not publish the existing local backend as-is/);
  assert.match(source, /never places.*brokerage order/is);
});

test("desktop and mobile navigation expose the guide", () => {
  const sidebar = readFileSync(
    resolve(process.cwd(), "apps/web/src/components/layout/sidebar.tsx"),
    "utf8",
  );
  const mobile = readFileSync(
    resolve(process.cwd(), "apps/web/src/components/layout/mobile-nav.tsx"),
    "utf8",
  );
  assert.match(sidebar, /href: "\/guide"/);
  assert.match(sidebar, /Dashboard Guide/);
  assert.match(mobile, /href: "\/guide"/);
  assert.match(mobile, /label: "Guide"/);
});

test("guide has no trade execution control language", () => {
  const source = readFileSync(
    resolve(process.cwd(), "apps/web/src/components/guide/dashboard-guide.tsx"),
    "utf8",
  );
  assert.doesNotMatch(source, /buy to open/i);
  assert.doesNotMatch(source, /sell to close/i);
  assert.doesNotMatch(source, /submit order/i);
  assert.doesNotMatch(source, /place order/i);
});

let passed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    passed += 1;
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}
console.log(`\nDashboard guide view tests: ${passed} passed, 0 failed`);
