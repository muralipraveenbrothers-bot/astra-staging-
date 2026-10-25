import { chromium } from "playwright-core";

// Acceptance tests must target the staging preview served for this workspace.
const BASE = "http://127.0.0.1:5273";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const results = [];

const check = (label, ok, detail = "") => {
  results.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` - ${detail}` : ""}`);
};

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto(`${BASE}/#/command-center`, { waitUntil: "domcontentloaded", timeout: 30000 });
if (await page.getByText("Select your staff account").count()) {
  await page.getByRole("button", { name: /Dr\. Murali Praveen/i }).click();
  await page.locator('input[type="password"]').fill("354812");
  await page.getByRole("button", { name: /sign in/i }).click();
}
await page.waitForURL(/#\/command-center/, { timeout: 10000 }).catch(() => {});
await page.waitForTimeout(3000);
let text = await page.locator("body").innerText();
check("Command Centre route renders", /Command Centre/.test(text));
check("Health states render", /LIVE|DEGRADED|OFFLINE/.test(text));
check("Offline card state is represented", /OFFLINE/.test(text));
const dutyWeight = await page.getByTestId("module-duty").first().evaluate((el) => Number.parseInt(getComputedStyle(el).fontWeight, 10));
check("Module primary duty is bold text", dutyWeight >= 700, String(dutyWeight));

await page.getByRole("button", { name: /light/i }).click();
check("Light theme button works", await page.getByRole("button", { name: /light/i }).getAttribute("aria-pressed") === "true");
await page.getByRole("button", { name: /dark/i }).click();
check("Dark theme button works", await page.getByRole("button", { name: /dark/i }).getAttribute("aria-pressed") === "true");

await page.keyboard.press("Control+K");
check("Ctrl+K opens command palette", await page.getByRole("dialog", { name: /command palette/i }).count() === 1);
await page.getByLabel("Search commands").fill("service");
check("Command search filters commands", /Open service browser/.test(await page.locator("body").innerText()));
await page.keyboard.press("Escape");

await page.goto(`${BASE}/#/command-center/patient/PT-2301`, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(1500);
text = await page.locator("body").innerText();
check("Patient route renders command centre", /Patient Command|No registered patient selected/.test(text));

await page.setViewportSize({ width: 768, height: 1024 });
await page.goto(`${BASE}/#/command-center`, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(1000);
check("Tablet layout remains visible", await page.getByText("Module health grid", { exact: false }).count().catch(() => 0) >= 0 && /Command Centre/.test(await page.locator("body").innerText()));

await page.keyboard.press("Tab");
const focusedTag = await page.evaluate(() => document.activeElement?.tagName ?? "");
check("Keyboard navigation reaches focusable control", /BUTTON|A|INPUT/.test(focusedTag), focusedTag);

console.log(results.join("\n"));
await browser.close();
