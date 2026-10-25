import crypto from "crypto";
import type { Page } from "playwright-core";
import { beginTraceFor, endTraceFor, recordApproval, recordBrowserAction } from "../../../src/astra/brain/part5/trace";
import { authorize } from "../actionAuthority";
import { decide, type FabricDecisionResult } from "../decisionFabric";
import { verifyEffect } from "../verifier";
import { createReflexBrowserSession, isAllowedBrowserUrl, type ReflexBrowserSession } from "./session";
import { observePage, type BrowserObservation, type ObservedElement } from "./observe";
import "../hermes/schemas";

export type BrowserRunStatus = "running" | "done" | "blocked" | "pending_confirmation" | "ask_human" | "failed";

export interface BrowserRunStep {
  tick: number;
  action: string;
  status: string;
  observation?: string;
}

export interface BrowserRun {
  runId: string;
  status: BrowserRunStatus;
  goal: string;
  steps: BrowserRunStep[];
  pendingConfirmation?: { id: string; action: string; element?: ObservedElement };
  channel?: string;
  reason?: string;
}

export interface BrowserLoopOptions {
  goal: string;
  startUrl?: string;
  typedText?: string;
  role?: string;
  page?: Page;
  session?: ReflexBrowserSession;
  decide?: (schemaId: string, text: string, options: string[]) => Promise<Pick<FabricDecisionResult, "answer" | "abstained" | "confidence" | "margin">>;
  maxTicks?: number;
}

const runs = new Map<string, BrowserRun>();
const SENSITIVE_ACTION = /submit|save|pay|delete|remove|send|sign|approve|confirm|order|prescribe|discharge|password|otp|pin/i;

function lexicalScore(goal: string, element: ObservedElement): number {
  const words = new Set(goal.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2));
  const hay = `${element.name} ${element.text} ${element.id ?? ""} ${element.role}`.toLowerCase();
  let score = 0;
  for (const word of words) if (hay.includes(word)) score += 1;
  return score;
}

function optionsFor(goal: string, observation: BrowserObservation): string[] {
  const elements = observation.elements
    .map((element) => ({ element, score: lexicalScore(goal, element) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, 34));
  const actions = elements.flatMap(({ element }) => {
    const i = element.index;
    if (element.role === "textbox" || element.tag === "textarea") return [`TYPE[${i}]`];
    if (element.role === "combobox" || element.tag === "select") return [`SELECT[${i}]`];
    return [`CLICK[${i}]`];
  });
  return [...actions, "SCROLL_DOWN", "SCROLL_UP", "WAIT", "BACK", "DONE", "BLOCKED", "ASK_HUMAN"].slice(0, 40);
}

function observationText(observation: BrowserObservation, options: string[]): string {
  const lines = [
    `url: ${observation.url}`,
    `title: ${observation.title}`,
    observation.heading ? `heading: ${observation.heading}` : "",
    "elements:",
    ...observation.elements.map((el) => `[${el.index}] ${el.role} ${el.name || el.text || el.id || ""}`),
    `options: ${options.join(", ")}`,
  ];
  return lines.filter(Boolean).join("\n");
}

async function chooseAction(opts: BrowserLoopOptions, observation: BrowserObservation, options: string[]) {
  const text = `${opts.goal}\n${observationText(observation, options)}`;
  const choice = opts.decide
    ? await opts.decide("browser.next_action", text, options)
    : await decide({ schemaId: "browser.next_action", input: text, context: { options } });
  if (choice.abstained || (choice.confidence ?? 1) < 0.65 || (choice.margin ?? 1) < 0.25) return "ASK_HUMAN";
  return options.includes(choice.answer) ? choice.answer : "ASK_HUMAN";
}

async function elementHandle(page: Page, observation: BrowserObservation, index: number) {
  const el = observation.elements.find((item) => item.index === index);
  if (!el) return null;
  const selector = [
    "a[href]",
    "button",
    "input",
    "select",
    "textarea",
    "[role=button]",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");
  return { element: el, locator: page.locator(selector).nth(index) };
}

function needsConfirmation(action: string, element?: ObservedElement): boolean {
  return SENSITIVE_ACTION.test(`${action} ${element?.name ?? ""} ${element?.text ?? ""} ${element?.id ?? ""}`);
}

async function act(page: Page, action: string, observation: BrowserObservation, opts: BrowserLoopOptions): Promise<{ status: BrowserRunStatus | "acted"; reason?: string; element?: ObservedElement }> {
  if (action === "DONE") return { status: "done" };
  if (action === "BLOCKED") return { status: "blocked" };
  if (action === "ASK_HUMAN") return { status: "ask_human" };
  if (action === "WAIT") {
    await page.waitForTimeout(100);
    return { status: "acted" };
  }
  if (action === "BACK") {
    await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => null);
    return { status: "acted" };
  }
  if (action === "SCROLL_DOWN" || action === "SCROLL_UP") {
    await page.mouse.wheel(0, action === "SCROLL_DOWN" ? 600 : -600);
    return { status: "acted" };
  }
  const match = action.match(/^(CLICK|TYPE|SELECT)\[(\d+)\]$/);
  if (!match) return { status: "ask_human", reason: "unknown_action" };
  const target = await elementHandle(page, observation, Number(match[2]));
  if (!target) return { status: "blocked", reason: "target_missing" };
  if (needsConfirmation(action, target.element)) return { status: "pending_confirmation", element: target.element };
  if (match[1] === "CLICK") await target.locator.click({ timeout: 1500 });
  if (match[1] === "TYPE") {
    if (!opts.typedText) return { status: "ask_human", reason: "typed_text_missing" };
    await target.locator.fill(opts.typedText, { timeout: 1500 });
  }
  if (match[1] === "SELECT") {
    if (!opts.typedText) return { status: "ask_human", reason: "select_value_missing" };
    await target.locator.selectOption(opts.typedText, { timeout: 1500 });
  }
  return { status: "acted", element: target.element };
}

export async function runBrowserLoop(opts: BrowserLoopOptions): Promise<BrowserRun> {
  const runId = `browser-${crypto.randomUUID?.() ?? crypto.randomBytes(8).toString("hex")}`;
  const run: BrowserRun = { runId, status: "running", goal: opts.goal, steps: [] };
  runs.set(runId, run);
  beginTraceFor(runId);

  let ownedSession: ReflexBrowserSession | null = null;
  const page = opts.page ?? opts.session?.page ?? (ownedSession = await createReflexBrowserSession(opts.startUrl)).page;
  run.channel = opts.session?.channel ?? ownedSession?.channel;
  const maxTicks = opts.maxTicks ?? 25;

  try {
    for (let tick = 0; tick < maxTicks; tick++) {
      if (!isAllowedBrowserUrl(page.url()) && page.url() !== "about:blank") {
        run.status = "blocked";
        run.reason = "url_not_allowlisted";
        break;
      }
      const before = await observePage(page);
      const options = optionsFor(opts.goal, before);
      const action = await chooseAction(opts, before, options);
      const auth = authorize({ action: "browser_control", role: opts.role ?? "staff", dataClass: "INTERNAL", mode: "SHADOW" });
      if (auth.level !== "AUTO_ALLOWED" && auth.level !== "CONFIRM_USER") {
        run.status = "blocked";
        run.reason = auth.level;
        break;
      }
      const started = Date.now();
      const result = await act(page, action, before, opts);
      if (result.status === "pending_confirmation") {
        const id = `confirm-${crypto.randomBytes(6).toString("hex")}`;
        run.status = "pending_confirmation";
        run.pendingConfirmation = { id, action, element: result.element };
        run.steps.push({ tick, action, status: "pending_confirmation" });
        recordApproval({ name: "browser sensitive action", approved: false, correlationId: runId });
        break;
      }
      const after = await observePage(page);
      const verified = verifyEffect(
        action === "DONE" ? {} : { url: after.url },
        action === "DONE" ? {} : { url: after.url },
      );
      run.steps.push({ tick, action, status: result.status, observation: after.heading ?? after.title ?? after.url });
      recordBrowserAction({ action, latencyMs: Date.now() - started, ok: verified.ok && result.status !== "blocked", correlationId: runId });
      if (result.status !== "acted") {
        run.status = result.status;
        run.reason = result.reason;
        break;
      }
    }
    if (run.status === "running") {
      run.status = "blocked";
      run.reason = "tick_cap";
    }
  } catch (error) {
    run.status = "failed";
    run.reason = error instanceof Error ? error.message : "browser_loop_failed";
  } finally {
    endTraceFor(runId);
    await ownedSession?.close();
  }
  return run;
}

export async function confirmBrowserRun(runId: string, confirmationId: string, opts: { page?: Page; session?: ReflexBrowserSession }): Promise<BrowserRun | null> {
  const run = runs.get(runId) ?? null;
  if (!run?.pendingConfirmation || run.pendingConfirmation.id !== confirmationId) return run;
  const page = opts.page ?? opts.session?.page;
  if (!page) return run;
  const observation = await observePage(page);
  const match = run.pendingConfirmation.action.match(/^(CLICK|TYPE|SELECT)\[(\d+)\]$/);
  if (!match) return run;
  const target = await elementHandle(page, observation, Number(match[2]));
  if (!target) return run;
  if (match[1] === "CLICK") await target.locator.click({ timeout: 1500 });
  run.status = "running";
  run.steps.push({ tick: run.steps.length, action: run.pendingConfirmation.action, status: "confirmed" });
  recordApproval({ name: "browser sensitive action", approved: true, correlationId: runId });
  delete run.pendingConfirmation;
  return run;
}

export function getBrowserRun(runId: string): BrowserRun | null {
  return runs.get(runId) ?? null;
}

export function resetBrowserRunsForTests(): void {
  runs.clear();
}
