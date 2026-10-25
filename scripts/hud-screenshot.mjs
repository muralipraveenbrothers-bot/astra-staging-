/**
 * HUD Screenshot Script — captures Command Centre screenshots using playwright-core
 * and the locally installed Google Chrome.
 *
 * Usage:  node scripts/hud-screenshot.mjs
 *
 * Produces:
 *   docs/design-refs/hud/result-1.png  (default view)
 *   docs/design-refs/hud/result-2.png  (Nervous layer selected)
 *   docs/design-refs/hud/result-3.png  (Organs layer selected)
 */

import { chromium } from "playwright-core";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "docs", "design-refs", "hud");
mkdirSync(outDir, { recursive: true });

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE_URL = "http://localhost:5173";

async function main() {
  console.log("Launching Chrome via playwright-core...");
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
  });

  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  try {
    await page.goto(`${BASE_URL}/#/command-center`, { waitUntil: "networkidle", timeout: 30_000 });
    // Wait for the HUD root to appear
    await page.waitForSelector(".hud-root", { timeout: 10_000 });
    // Small pause for animations to settle
    await page.waitForTimeout(1500);

    // Screenshot 1: default view
    await page.screenshot({ path: join(outDir, "result-1.png"), fullPage: false });
    console.log("result-1.png: default view captured");

    // Screenshot 2: Nervous layer
    const nervousBtn = page.locator('button[role="tab"]:has-text("Nervous")');
    if (await nervousBtn.count()) {
      await nervousBtn.click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: join(outDir, "result-2.png"), fullPage: false });
      console.log("result-2.png: Nervous layer captured");
    }

    // Screenshot 3: Organs layer
    const organsBtn = page.locator('button[role="tab"]:has-text("Organs")');
    if (await organsBtn.count()) {
      await organsBtn.click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: join(outDir, "result-3.png"), fullPage: false });
      console.log("result-3.png: Organs layer captured");
    }

    console.log("All screenshots saved to docs/design-refs/hud/");
  } catch (err) {
    console.error("Screenshot capture failed:", err.message);
    console.error("The script can be re-run outside the sandbox if browser launch is blocked.");
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
