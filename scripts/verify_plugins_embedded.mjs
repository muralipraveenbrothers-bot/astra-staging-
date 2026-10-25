/**
 * Live UI verification: FreeLLMAPI & OmniRoute plugins open ONLY inside Astra AI.
 * - Logs in as CEO (pin 1234)
 * - Navigates to #/plugins/freellm and #/plugins/omniroute
 * - Asserts each page renders its embedded console / offline state
 * - Asserts ZERO popups / external windows are opened
 * - Saves screenshots to scripts/artifacts/
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ART = path.join(__dirname, "artifacts");
mkdirSync(ART, { recursive: true });

const BASE = process.env.ASTRA_URL || "http://localhost:5173";
let failures = 0;
const ok = (cond, label) => {
  console.log(`${cond ? "✅ PASS" : "❌ FAIL"} — ${label}`);
  if (!cond) failures++;
};

async function launch() {
  for (const channel of ["msedge", "chrome"]) {
    try {
      return await chromium.launch({ channel, headless: true });
    } catch (e) {
      console.log(`(channel ${channel} unavailable: ${e.message.split("\n")[0]})`);
    }
  }
  return chromium.launch({ headless: true });
}

const browser = await launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

// Track ANY popup/new page/window opened from the app
let popupCount = 0;
context.on("page", (p) => {
  if (p !== context.pages()[0]) {
    popupCount++;
    console.log(`   ⚠️ popup detected: ${p.url()}`);
  }
});

const page = await context.newPage();
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });

// ── Login ──────────────────────────────────────────────────────────────
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);

const landingVisible = await page.getByText("Staff modules run fully offline").isVisible().catch(() => false);
if (landingVisible) {
  await page.getByRole("button", { name: /Dr\. Admin/i }).click();
  const pinInput = page.locator('input[type="password"]');
  await pinInput.waitFor({ timeout: 5000 });
  await pinInput.pressSequentially("1234", { delay: 80 });
}
await page.waitForTimeout(2000);
ok(!(await page.locator('input[type="password"]').first().isVisible().catch(() => false)), "CEO login succeeded (PIN gate gone)");

// Suppress Toaster welcome toast overlay from blocking clicks
await page.evaluate(() => document.querySelectorAll("[data-sonner-toast]").forEach((t) => t.remove()));

// ── Plugin 1: FreeLLMAPI ───────────────────────────────────────────────
await page.evaluate(() => { window.location.hash = "#/plugins/freellm"; });
await page.waitForTimeout(3500);

const freellmHeader = await page.getByText("Unified LLM Router").first().isVisible().catch(() => false);
ok(freellmHeader, "FreeLLM plugin renders inside Astra (#/plugins/freellm)");

const freellmOfflinePanel = await page.getByText("FreeLLMAPI is Offline").isVisible().catch(() => false);
const freellmOnlineIframe = await page.locator('iframe[title="FreeLLMAPI"]').count();
ok(freellmOfflinePanel || freellmOnlineIframe > 0,
  `FreeLLM shows embedded-only experience (${freellmOfflinePanel ? "offline panel — desktop app not running" : "embedded iframe"})`);

const freellmDirectIframe = await page.locator('iframe[src*="127.0.0.1"], iframe[src*="localhost"]').count();
ok(freellmDirectIframe === 0, "FreeLLM iframe uses same-origin proxy, never a raw external URL");

await page.screenshot({ path: path.join(ART, "freellm-plugin.png"), fullPage: false });

// ── Plugin 2: OmniRoute ────────────────────────────────────────────────
await page.evaluate(() => { window.location.hash = "#/plugins/omniroute"; });
await page.waitForTimeout(3500);

const omniHeader = await page.getByText("AI Gateway").first().isVisible().catch(() => false);
ok(omniHeader, "OmniRoute plugin renders inside Astra (#/plugins/omniroute)");

const omniOfflinePanel = await page.getByText("OmniRoute is Offline").isVisible().catch(() => false);
const omniOnlineIframe = await page.locator('iframe[title="OmniRoute"]').count();
ok(omniOfflinePanel || omniOnlineIframe > 0,
  `OmniRoute shows embedded-only experience (${omniOfflinePanel ? "offline panel — gateway not running" : "embedded iframe"})`);

await page.screenshot({ path: path.join(ART, "omniroute-plugin.png"), fullPage: false });

// ── Clinical Co-Pilot ──────────────────────────────────────────────────
await page.evaluate(() => { window.location.hash = "#/copilot"; });
await page.waitForTimeout(2500);

const copilotHeader = await page.getByText("Astra Clinical Co-Pilot").first().isVisible().catch(() => false);
ok(copilotHeader, "Clinical Co-Pilot renders inside Astra (#/copilot)");

// Keys modal opens + saves key to localStorage
await page.getByRole("button", { name: /keys/i }).first().click();
await page.waitForTimeout(600);
const modalVisible = await page.getByText("FreeLLMAPI unified / premium key").isVisible().catch(() => false);
ok(modalVisible, "Router Keys modal opens inside the app");
if (modalVisible) {
  await page.locator('input[placeholder="freellmapi-…"]').fill("freellmapi-test-key-123");
  await page.getByRole("button", { name: /save inside astra/i }).click();
  await page.waitForTimeout(400);
  const stored = await page.evaluate(() => localStorage.getItem("astra_freellm_key"));
  ok(stored === "freellmapi-test-key-123", `Key persisted via saveAstraKeys → localStorage ("${stored}")`);
}
// close modal (Esc)
await page.keyboard.press("Escape");
await page.waitForTimeout(400);

// Send a message — routers offline now, expect graceful in-app router error bubble
const copilotInput = page.locator('input[placeholder="Ask diagnosis, labs, guidelines…"]');
await copilotInput.fill("Test triage question");
await copilotInput.press("Enter");
await page.waitForTimeout(9000);
const errorBubble = await page
  .getByText(/Router error|Both routers|premium key is missing/i)
  .first()
  .isVisible()
  .catch(() => false);
ok(errorBubble, "Offline routers produce a graceful in-app error bubble (never an external window)");
// cleanup test key so real usage isn't polluted
await page.evaluate(() => localStorage.removeItem("astra_freellm_key"));

await page.screenshot({ path: path.join(ART, "copilot-plugin.png"), fullPage: false });

// ── Global assertions ──────────────────────────────────────────────────
ok(popupCount === 0, `No external windows/popups opened at any point (found ${popupCount})`);

const relevantErrors = consoleErrors.filter((e) =>
  !/favicon|20128|proxy|Failed to load resource/i.test(e)
);
ok(relevantErrors.length === 0, `No unexpected console errors (filtered: ${consoleErrors.length - relevantErrors.length})`);
if (relevantErrors.length) console.log(relevantErrors.slice(0, 5).join("\n"));

await browser.close();

console.log(failures === 0 ? "\n🎉 ALL CHECKS PASSED" : `\n💥 ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
