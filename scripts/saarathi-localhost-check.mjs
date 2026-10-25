import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const root = 'd:/astra PM';
const out = path.join(root, 'logs/saarathi-localhost-check');
fs.mkdirSync(out, { recursive: true });
const report = { startedAt: new Date().toISOString(), checks: [], pageErrors: [] };
const save = () => fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(report, null, 2));
save();
let browser;
try {
  for (const url of ['http://127.0.0.1:3000/api/live', 'http://localhost:5173/', 'http://127.0.0.1:3000/api/saarathi/health']) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      report.checks.push({ url, status: response.status, contentType: response.headers.get('content-type'), preview: (await response.text()).slice(0, 300) });
    } catch (error) { report.checks.push({ url, error: error.message }); }
    save();
  }
  browser = await chromium.launch({ executablePath: process.env.ASTRA_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: false, timeout: 15000 });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', error => { report.pageErrors.push(error.message); save(); });
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(3000);
  report.title = await page.title();
  report.visibleText = (await page.locator('body').innerText()).slice(0, 1500);
  report.rendered = report.visibleText.trim().length > 0;
  await page.screenshot({ path: path.join(out, 'localhost.png'), fullPage: true });
  report.screenshot = path.join(out, 'localhost.png');
  report.authentication = 'No credentials entered; authenticated greeting, patient workflows and audible voice not tested.';
} catch (error) { report.error = error.message; }
finally {
  report.finishedAt = new Date().toISOString();
  save();
  if (browser) await browser.close();
}
