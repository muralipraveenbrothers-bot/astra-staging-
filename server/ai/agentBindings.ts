/**
 * Agent → Astra Central AI Adapter bindings.
 *
 * Hermes / LangGraph / OpenClaw / Paperclip / n8n speak OpenAI-compat at Astra /v1.
 */
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { adapterApiKey, adapterPublicUrl } from "./config";
import { loadModelCatalog, type CatalogModel, HERMES_MIN_CONTEXT } from "./modelCatalog";
import { hermesConfig, hermesHomeDir, type HermesModelConfig } from "../agents/hermesAdapter";

export interface AgentBinding {
  id: "hermes" | "langgraph" | "openclaw" | "paperclip" | "n8n";
  role: string;
  throughAdapter: boolean;
  freeLlmApi: string;
  target: string;
  status: "READY" | "NEEDS_MODEL" | "CLOUD" | "IN_PROCESS" | "CONFIG_WRITTEN";
  detail: string;
  snippet?: unknown;
}

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function adapterDir(): string {
  const dir = path.join(repoRoot(), "config", "agent-adapters");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function hermesSnippet(model: CatalogModel, baseUrl: string): string {
  return [
    "model:",
    `  default: ${model.id}`,
    "  provider: custom:astra",
    `  base_url: ${baseUrl}`,
    `  context_length: ${model.contextLength}`,
    "custom_providers:",
    "  - name: astra",
    `    base_url: ${baseUrl}`,
    "    key_env: ASTRA_ADAPTER_API_KEY",
    "    api_mode: chat_completions",
    `    model: ${model.id}`,
    "    models:",
    `      ${model.id}:`,
    `        context_length: ${model.contextLength}`,
  ].join("\n");
}

export function openclawProvider(model: CatalogModel, baseUrl: string) {
  return {
    models: {
      mode: "merge",
      providers: {
        astra: {
          api: "openai-completions",
          baseUrl,
          apiKey: "${ASTRA_ADAPTER_API_KEY}",
          models: [
            {
              id: model.id,
              name: `Astra Central Adapter (${model.source})`,
              reasoning: false,
              input: ["text"],
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
              contextWindow: model.contextLength,
              maxTokens: 8192,
            },
          ],
        },
      },
    },
    agents: {
      defaults: {
        model: { primary: `astra/${model.id}` },
      },
    },
  };
}

export function paperclipEnv(model: CatalogModel, baseUrl: string): string {
  return [
    "# Paperclip → Astra Central AI Adapter (OpenAI-compatible)",
    `OPENAI_BASE_URL=${baseUrl}`,
    "OPENAI_API_KEY=${ASTRA_ADAPTER_API_KEY}",
    `OPENAI_MODEL=${model.id}`,
    "",
  ].join("\n");
}

export function n8nWorkflow(model: CatalogModel, baseUrl: string) {
  return {
    name: "Astra Central Adapter Chat",
    nodes: [
      {
        parameters: {},
        id: "start",
        name: "Start",
        type: "n8n-nodes-base.manualTrigger",
        typeVersion: 1,
        position: [0, 0],
      },
      {
        parameters: {
          method: "POST",
          url: `${baseUrl}/chat/completions`,
          authentication: "genericCredentialType",
          genericAuthType: "httpHeaderAuth",
          sendHeaders: true,
          headerParameters: {
            parameters: [{ name: "Content-Type", value: "application/json" }],
          },
          sendBody: true,
          specifyBody: "json",
          jsonBody: JSON.stringify({
            model: model.id,
            messages: [{ role: "user", content: "={{ $json.prompt || 'Reply with ASTRA_AI_OK' }}" }],
            max_tokens: 256,
          }),
        },
        id: "astra-adapter",
        name: "Astra Adapter",
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4,
        position: [240, 0],
      },
    ],
    connections: {
      Start: { main: [[{ node: "Astra Adapter", type: "main", index: 0 }]] },
    },
    meta: { note: "n8n calls Astra /v1 — it does not host its own model." },
  };
}

function writeSidecars(model: CatalogModel, baseUrl: string): string[] {
  const dir = adapterDir();
  const written: string[] = [];
  const files: Array<[string, string]> = [
    ["hermes-astra-provider.yaml", hermesSnippet(model, baseUrl) + "\n"],
    ["openclaw-astra-provider.json", JSON.stringify(openclawProvider(model, baseUrl), null, 2) + "\n"],
    ["paperclip-astra.env", paperclipEnv(model, baseUrl)],
    ["n8n-astra-http.json", JSON.stringify(n8nWorkflow(model, baseUrl), null, 2) + "\n"],
    [
      "langgraph-astra.json",
      JSON.stringify(
        {
          runtime: "in-process",
          llm: { via: "server/ai/centralCore.ts", agent: "langgraph", endpoint: baseUrl, model: model.id },
        },
        null,
        2,
      ) + "\n",
    ],
  ];
  for (const [name, body] of files) {
    const p = path.join(dir, name);
    fs.writeFileSync(p, body, "utf8");
    written.push(p);
  }
  return written;
}

function upsertHermesEnv(key: string): string | null {
  const envPath = path.join(hermesHomeDir(), ".env");
  let existing = "";
  try {
    existing = fs.readFileSync(envPath, "utf8");
  } catch {
    existing = "";
  }
  const line = `ASTRA_ADAPTER_API_KEY=${key}`;
  const next = existing.includes("ASTRA_ADAPTER_API_KEY=")
    ? existing.replace(/^ASTRA_ADAPTER_API_KEY=.*$/m, line)
    : `${existing.trim()}${existing.trim() ? "\n" : ""}${line}\n`;
  fs.writeFileSync(envPath, next.endsWith("\n") ? next : `${next}\n`, "utf8");
  return envPath;
}

function applyHermesYaml(model: CatalogModel, baseUrl: string): { backup: string; path: string } {
  const cfgPath = path.join(hermesHomeDir(), "config.yaml");
  const raw = fs.readFileSync(cfgPath, "utf8");
  const backup = `${cfgPath}.bak.astra-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  fs.writeFileSync(backup, raw, "utf8");

  let next = raw.replace(/^(\s*default:\s*).+$/m, `$1${model.id}`);
  next = next.replace(/^(\s*provider:\s*).+$/m, "$1custom:astra");
  next = next.replace(/^([ \t]*base_url:\s*).*$/m, `$1${baseUrl}`);
  next = next.replace(/^[ \t]*api_key:\s*.+\r?\n/m, "");
  if (/^\s*context_length:/m.test(next)) {
    next = next.replace(/^(\s*context_length:\s*).+$/m, `$1${model.contextLength}`);
  } else {
    next = next.replace(/^(model:\r?\n(?:[ \t].+\r?\n)+)/m, `$1  context_length: ${model.contextLength}\n`);
  }

  const astraBlock = [
    "  - name: astra",
    `    base_url: ${baseUrl}`,
    "    key_env: ASTRA_ADAPTER_API_KEY",
    "    api_mode: chat_completions",
    `    model: ${model.id}`,
    "    models:",
    `      ${model.id}:`,
    `        context_length: ${model.contextLength}`,
  ].join("\n");

  if (/^\s*- name:\s*astra\s*$/m.test(next)) {
    /* already present — leave existing astra block; model.* is the live switch */
  } else if (/^custom_providers:\s*$/m.test(next)) {
    next = next.replace(/^custom_providers:\s*$/m, `custom_providers:\n${astraBlock}`);
  } else {
    next += `\ncustom_providers:\n${astraBlock}\n`;
  }

  fs.writeFileSync(cfgPath, next, "utf8");
  return { backup, path: cfgPath };
}

function applyOpenClawJson(model: CatalogModel, baseUrl: string): { backup?: string; path: string; merged: boolean } {
  const cfgPath = path.join(os.homedir(), ".openclaw", "openclaw.json");
  if (!fs.existsSync(cfgPath)) {
    const generated = path.join(adapterDir(), "openclaw-astra-provider.json");
    return { path: generated, merged: false };
  }
  const raw = fs.readFileSync(cfgPath, "utf8");
  const backup = `${cfgPath}.bak.astra-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  fs.writeFileSync(backup, raw, "utf8");
  const json = JSON.parse(raw) as Record<string, unknown>;
  const snippet = openclawProvider(model, baseUrl);
  const models = (json.models as Record<string, unknown>) ?? {};
  const providers = ((models.providers as Record<string, unknown>) ?? {}) as Record<string, unknown>;
  json.models = {
    ...models,
    mode: "merge",
    providers: { ...providers, astra: snippet.models.providers.astra },
  };
  const agents = (json.agents as Record<string, unknown>) ?? {};
  const defaults = ((agents.defaults as Record<string, unknown>) ?? {}) as Record<string, unknown>;
  json.agents = {
    ...agents,
    defaults: {
      ...defaults,
      model: { primary: `astra/${model.id}` },
    },
  };
  fs.writeFileSync(cfgPath, JSON.stringify(json, null, 2) + "\n", "utf8");
  return { backup, path: cfgPath, merged: true };
}

export async function describeBindings(): Promise<{
  adapterUrl: string;
  recommended: CatalogModel | null;
  hermesCurrent: HermesModelConfig;
  agents: AgentBinding[];
  catalogNote: string;
}> {
  const catalog = await loadModelCatalog();
  const baseUrl = adapterPublicUrl();
  const rec = catalog.hermes.recommended;
  const current = hermesConfig();
  const hermesReady =
    rec != null &&
    current.provider?.includes("astra") &&
    current.model === rec.id &&
    (current.contextLength == null || current.contextLength >= HERMES_MIN_CONTEXT);

  const agents: AgentBinding[] = [
    {
      id: "hermes",
      role: "Planning / reasoning / tool agent",
      throughAdapter: true,
      freeLlmApi: "Yes — OpenAI-compatible via Astra /v1",
      target: rec ? `${baseUrl} model=${rec.id} context=${rec.contextLength}` : "blocked — no ≥64K model discovered",
      status: !rec ? "NEEDS_MODEL" : hermesReady ? "READY" : "NEEDS_MODEL",
      detail: rec
        ? `Current Hermes model ${current.model ?? "unset"} @ ${current.provider ?? "unset"} context=${current.contextLength ?? "unknown"}. Recommended: ${rec.id} (${rec.contextLength}).`
        : catalog.hermes.note,
      snippet: rec ? hermesSnippet(rec, baseUrl) : undefined,
    },
    {
      id: "langgraph",
      role: "Clinical / workflow orchestration (in-process)",
      throughAdapter: true,
      freeLlmApi: "Yes",
      target: "server/ai/centralCore.ts agent=langgraph",
      status: "IN_PROCESS",
      detail: "LangGraph.js runs inside Astra. LLM nodes call the central adapter; they do not host a model.",
    },
    {
      id: "paperclip",
      role: "Agent / task execution",
      throughAdapter: true,
      freeLlmApi: "Use Astra gateway where supported",
      target: rec ? `OPENAI_BASE_URL=${baseUrl}` : "pending catalog",
      status: rec ? "READY" : "NEEDS_MODEL",
      detail: "Point Paperclip's OpenAI-compatible client at Astra /v1. Do not give Paperclip its own model.",
      snippet: rec ? paperclipEnv(rec, baseUrl) : undefined,
    },
    {
      id: "openclaw",
      role: "Tool / agent execution",
      throughAdapter: true,
      freeLlmApi: "Yes; custom provider openai-completions",
      target: rec ? `astra/${rec.id}` : "pending catalog",
      status: rec ? "READY" : "NEEDS_MODEL",
      detail: "OpenClaw models.providers.astra { baseUrl, apiKey, api: openai-completions }.",
      snippet: rec ? openclawProvider(rec, baseUrl) : undefined,
    },
    {
      id: "n8n",
      role: "Automation / workflow bus",
      throughAdapter: true,
      freeLlmApi: "Workflows call Astra /v1",
      target: rec ? `${baseUrl}/chat/completions` : "pending catalog",
      status: rec ? "READY" : "NEEDS_MODEL",
      detail: "n8n is not a brain. HTTP Request nodes call the adapter.",
      snippet: rec ? n8nWorkflow(rec, baseUrl) : undefined,
    },
  ];

  return {
    adapterUrl: baseUrl,
    recommended: rec,
    hermesCurrent: current,
    agents,
    catalogNote: catalog.hermes.note,
  };
}

export async function applyAdapterBindings(opts: {
  confirm: boolean;
  targets?: Array<"hermes" | "openclaw" | "sidecars">;
}): Promise<{
  ok: boolean;
  error?: string;
  recommended?: CatalogModel | null;
  written: string[];
  hermes?: { backup: string; path: string } | { skipped: string };
  openclaw?: { backup?: string; path: string; merged: boolean } | { skipped: string };
}> {
  if (!opts.confirm) return { ok: false, error: "confirm=true is required — refusing to rewrite agent configs", written: [] };
  const catalog = await loadModelCatalog(true);
  const rec = catalog.hermes.recommended;
  if (!rec || rec.contextLength == null || rec.contextLength < HERMES_MIN_CONTEXT) {
    return {
      ok: false,
      error: catalog.hermes.note,
      recommended: rec,
      written: [],
    };
  }
  const baseUrl = adapterPublicUrl();
  const targets = opts.targets ?? ["sidecars", "hermes", "openclaw"];
  const written = writeSidecars(rec, baseUrl);
  const key = adapterApiKey();
  if (key) upsertHermesEnv(key);

  let hermes: { backup: string; path: string } | { skipped: string } | undefined;
  if (targets.includes("hermes")) {
    try {
      hermes = applyHermesYaml(rec, baseUrl);
    } catch (e) {
      hermes = { skipped: e instanceof Error ? e.message : String(e) };
    }
  } else {
    hermes = { skipped: "not requested" };
  }

  let openclaw: { backup?: string; path: string; merged: boolean } | { skipped: string } | undefined;
  if (targets.includes("openclaw")) {
    try {
      openclaw = applyOpenClawJson(rec, baseUrl);
    } catch (e) {
      openclaw = { skipped: e instanceof Error ? e.message : String(e) };
    }
  } else {
    openclaw = { skipped: "not requested" };
  }

  return { ok: true, recommended: rec, written, hermes, openclaw };
}
