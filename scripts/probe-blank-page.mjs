import { chromium } from "playwright-core";
import fs from "fs";

const candidates = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  process.env.LOCALAPPDATA + "\\Google\\Chrome\\Application\\chrome.exe",
];
const chrome = candidates.find((p) => p && fs.existsSync(p));
if (!chrome) {
  console.error("NO_CHROME");
  process.exit(2);
}

const browser = await chromium.launch({ executablePath: chrome, headless: true });
const page = await browser.newPage();
const logs = [];
page.on("console", (m) => logs.push({ kind: "console", type: m.type(), text: m.text() }));
page.on("pageerror", (e) => logs.push({ kind: "pageerror", text: e.message, stack: String(e.stack || "") }));
page.on("requestfailed", (r) =>
  logs.push({ kind: "failed", url: r.url(), error: r.failure()?.errorText })
);
page.on("response", (r) => {
  if (r.status() >= 400) logs.push({ kind: "http", status: r.status(), url: r.url() });
});
page.on("framenavigated", (f) => {
  if (f === page.mainFrame()) logs.push({ kind: "nav", url: f.url() });
});

const url = process.argv[2] || "http://localhost:5173/";
try {
  await page.goto(url, { waitUntil: "load", timeout: 20000 });
} catch (e) {
  logs.push({ kind: "goto", text: String(e.message || e) });
}
await page.waitForTimeout(5000);
let html = null;
try {
  html = await page.evaluate(() => ({
    url: location.href,
    title: document.title,
    ready: document.readyState,
    rootHTML: (document.getElementById("root")?.innerHTML || "").slice(0, 800),
    childCount: document.getElementById("root")?.childElementCount ?? -1,
    bodyText: (document.body?.innerText || "").slice(0, 600),
    scripts: [...document.scripts].map((s) => s.src).slice(0, 20),
    viteError: document.querySelector("vite-error-overlay")?.shadowRoot?.textContent?.slice(0, 800) || null,
  }));
} catch (e) {
  logs.push({ kind: "evaluate", text: String(e.message || e) });
}

const out = { chrome, url, html, logs };
console.log(JSON.stringify(out, null, 2));
await browser.close();
