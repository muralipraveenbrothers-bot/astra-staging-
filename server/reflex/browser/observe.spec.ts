import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { detectBrowserChannel } from "./session";
import { observePage } from "./observe";

const channel = await detectBrowserChannel();
const maybeDescribe = channel ? describe : describe.skip;

maybeDescribe("observePage", () => {
  it("caps elements and masks password values", async () => {
    const browser = await chromium.launch({ channel: channel!, headless: true });
    const page = await browser.newPage();
    const fixture = fs.readFileSync(path.join(process.cwd(), "tests/fixtures/reflex-browser/login.html"), "utf8");
    await page.setContent(fixture + Array.from({ length: 80 }, (_, i) => `<button>Extra ${i}</button>`).join(""));
    const observation = await observePage(page);
    await browser.close();
    expect(observation.elements.length).toBeLessThanOrEqual(60);
    expect(JSON.stringify(observation)).not.toContain("synthetic-secret");
    expect(JSON.stringify(observation)).toContain("[masked]");
  });
});
