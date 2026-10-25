import { describe, expect, it } from "vitest";
import { chromium } from "playwright-core";
import { detectBrowserChannel, installBrowserAllowList } from "./session";
import { runBrowserLoop } from "./browserLoop";

const channel = await detectBrowserChannel();
const maybeDescribe = channel ? describe : describe.skip;

async function withPage(html: string, fn: (page: import("playwright-core").Page) => Promise<void>) {
  const browser = await chromium.launch({ channel: channel!, headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.setContent(html);
  try {
    await fn(page);
  } finally {
    await context.close();
    await browser.close();
  }
}

maybeDescribe("browserLoop", () => {
  it("clicks the queue control and verifies the heading changed", async () => {
    await withPage(`<!doctype html><h1>Home</h1><button onclick="document.body.innerHTML='<h1>Queue</h1>'">Open queue</button>`, async (page) => {
      const run = await runBrowserLoop({
        goal: "open queue",
        page,
        decide: async () => ({ answer: "CLICK[0]", abstained: false, confidence: 0.95, margin: 0.5 }),
        maxTicks: 2,
      });
      expect(run.steps[0].action).toBe("CLICK[0]");
      expect(await page.locator("h1").textContent()).toBe("Queue");
    });
  });

  it("pauses on a Submit order button until confirmed", async () => {
    await withPage(`<!doctype html><h1>Order</h1><button onclick="window.__submitted=true">Submit order</button>`, async (page) => {
      const run = await runBrowserLoop({
        goal: "submit order",
        page,
        decide: async () => ({ answer: "CLICK[0]", abstained: false, confidence: 0.95, margin: 0.5 }),
        maxTicks: 1,
      });
      expect(run.status).toBe("pending_confirmation");
      expect(await page.evaluate(() => (window as any).__submitted === true)).toBe(false);
    });
  });

  it("aborts navigation outside the allow-list", async () => {
    const browser = await chromium.launch({ channel: channel!, headless: true });
    const context = await browser.newContext();
    await installBrowserAllowList(context);
    const page = await context.newPage();
    await page.setContent(`<a href="https://example.com">Outside</a>`);
    await page.locator("a").click().catch(() => undefined);
    expect(page.url()).not.toContain("example.com");
    await context.close();
    await browser.close();
  });

  it("turns fabric abstention into ASK_HUMAN", async () => {
    await withPage(`<!doctype html><h1>Home</h1><button>Open queue</button>`, async (page) => {
      const run = await runBrowserLoop({
        goal: "open queue",
        page,
        decide: async () => ({ answer: "unknown", abstained: true, confidence: 0.1, margin: 0 }),
        maxTicks: 1,
      });
      expect(run.status).toBe("ask_human");
    });
  });

  it("enforces the 25 tick cap", async () => {
    await withPage(`<!doctype html><h1>Home</h1><button>Open queue</button>`, async (page) => {
      const run = await runBrowserLoop({
        goal: "open queue",
        page,
        decide: async () => ({ answer: "WAIT", abstained: false, confidence: 0.95, margin: 0.5 }),
      });
      expect(run.steps).toHaveLength(25);
      expect(run.reason).toBe("tick_cap");
    });
  });
});
