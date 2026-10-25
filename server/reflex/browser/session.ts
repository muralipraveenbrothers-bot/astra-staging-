import { chromium, type Browser, type BrowserContext, type Page, type Route } from "playwright-core";

export const BROWSER_ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

export interface ReflexBrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  channel: "msedge" | "chrome";
  close(): Promise<void>;
}

function allowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return BROWSER_ALLOWED_ORIGINS.has(parsed.origin);
  } catch {
    return false;
  }
}

export function isAllowedBrowserUrl(url: string): boolean {
  return allowedUrl(url);
}

async function routeGuard(route: Route): Promise<void> {
  const url = route.request().url();
  if (url === "about:blank" || allowedUrl(url)) return route.continue();
  return route.abort();
}

export async function installBrowserAllowList(context: BrowserContext): Promise<void> {
  await context.route("**/*", routeGuard);
}

export async function detectBrowserChannel(): Promise<"msedge" | "chrome" | null> {
  for (const channel of ["msedge", "chrome"] as const) {
    let browser: Browser | null = null;
    try {
      browser = await chromium.launch({ channel, headless: true });
      return channel;
    } catch {
      // Try the next system channel. Do not download browsers.
    } finally {
      await browser?.close().catch(() => undefined);
    }
  }
  return null;
}

export async function createReflexBrowserSession(startUrl = "http://localhost:5173"): Promise<ReflexBrowserSession> {
  if (!allowedUrl(startUrl)) throw new Error("start_url_not_allowlisted");
  const channel = await detectBrowserChannel();
  if (!channel) throw new Error("browser_channel_not_found");
  const browser = await chromium.launch({ channel, headless: true });
  const context = await browser.newContext({ storageState: undefined });
  await installBrowserAllowList(context);
  const page = await context.newPage();
  await page.goto(startUrl, { waitUntil: "domcontentloaded" });
  return {
    browser,
    context,
    page,
    channel,
    close: async () => {
      await context.close().catch(() => undefined);
      await browser.close().catch(() => undefined);
    },
  };
}
