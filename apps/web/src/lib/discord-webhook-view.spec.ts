/**
 * Static safety tests for the Discord webhook Settings foundation.
 * Run: npx --no-install tsx apps/web/src/lib/discord-webhook-view.spec.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`✗ ${name}`);
    console.error(error);
  }
}

const settings = readFileSync(resolve(process.cwd(), "apps/web/src/app/settings/page.tsx"), "utf8");
const hook = readFileSync(resolve(process.cwd(), "apps/web/src/hooks/use-discord-webhook.ts"), "utf8");

test("Settings reads sanitized backend Discord status", () => {
  assert.equal(settings.includes("useDiscordWebhookStatus"), true);
  assert.equal(settings.includes("DiscordWebhookStatusBadge"), true);
});

test("test delivery requires an explicit button click", () => {
  assert.equal(settings.includes("Send test message"), true);
  assert.equal(settings.includes("onClick={() => discordTest.mutate()}"), true);
  assert.equal(hook.includes("useMutation"), true);
});

test("test button is disabled unless backend says it is ready", () => {
  assert.equal(settings.includes("!discordStatus?.canSendTest"), true);
});

test("webhook secret is never collected in the browser", () => {
  assert.equal(settings.includes('placeholder="https://discord.com/api/webhooks/…"'), false);
  assert.equal(settings.includes("Save webhook"), false);
  assert.equal(settings.includes("type=\"password\""), false);
});

test("Settings directs secret configuration to ignored backend env", () => {
  assert.equal(settings.includes("apps/server/.env"), true);
  assert.equal(settings.includes("DISCORD_WEBHOOK_URL"), true);
});

test("no browser persistence is used", () => {
  for (const forbidden of ["localStorage", "sessionStorage", "indexedDB"]) {
    assert.equal(settings.includes(forbidden), false);
    assert.equal(hook.includes(forbidden), false);
  }
});

test("status polling does not send a test", () => {
  assert.equal(hook.includes("queryFn: apiClient.getDiscordWebhookStatus"), true);
  assert.equal(hook.includes("mutationFn: apiClient.sendDiscordWebhookTest"), true);
});

test("UI describes persistent backend delivery from the Alerts tab", () => {
  assert.equal(settings.includes("Persistent Trade Plan alerts"), true);
  assert.equal(settings.includes("Alerts tab"), true);
  assert.equal(settings.includes("without requiring an open browser tab"), true);
  assert.equal(settings.includes("browser session remains open"), false);
});

test("Settings contains no order action", () => {
  for (const forbidden of ["Place Order", "Submit Order", "Execute Trade", "Buy Calls", "Buy Puts"]) {
    assert.equal(settings.includes(forbidden), false);
  }
});

console.log(`\nDiscord webhook Settings tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
