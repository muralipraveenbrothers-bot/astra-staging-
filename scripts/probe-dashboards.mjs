import { chromium } from "playwright-core";
import fs from "fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registry = JSON.parse(fs.readFileSync(path.join(root, "config/ports.json"), "utf8"));
const free = registry.services.freellmapi;

const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const pages = [
  "http://localhost:5173/#/hospital",
  "http://localhost:5173/#/plugins",
  "http://localhost:5173/#/settings",
  "http://localhost:5173/#/command",
  "http://localhost:5173/#/ceo",
  "http://localhost:5173/#/doctor",
  "http://localhost:5173/#/dashboards",
  "http://localhost:5173/#/reception",
  `http://${free.host}:${free.port}/models/chat`,
  `http://${free.host}:${free.port}/keys`,
  "http://localhost:5171/home",
];

const browser = await chromium.launch({ executablePath: chrome, headless: true });
const results = [];
for (const url of pages) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 180)));
  try {
    await page.goto(url, { waitUntil: "load", timeout: 20000 });
    await page.waitForTimeout(2500);
    const info = await page.evaluate(() => ({
      url: location.href,
      title: document.title,
      text: (document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 220),
      children: document.getElementById("root")?.childElementCount ?? document.body?.childElementCount ?? -1,
    }));
    results.push({ ok: info.children > 0 && info.text.length > 10, ...info, errors });
  } catch (e) {
    results.push({ ok: false, url, title: "", text: String(e.message || e).slice(0, 200), children: 0, errors });
  }
  await page.close();
}
await browser.close();
console.log(JSON.stringify(results, null, 2));
fs.writeFileSync("D:/astra PM/scripts/dashboard-probe.json", JSON.stringify(results, null, 2));
