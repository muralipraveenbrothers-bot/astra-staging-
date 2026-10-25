import { useCallback, useEffect, useState } from "react";
import { mcpManager, type McpServer } from "@/services/mcpManager";

/**
 * ASTRA AI — MCP ADMIN PANEL
 * ============================================================================
 * Manages the configured medical MCP servers: status, capabilities (tools /
 * resources / prompts), connect / disconnect / enable / disable, and guarded
 * tool execution. Shows REAL status only — a server is CONNECTED only when the
 * backend health probe succeeds; otherwise it honestly shows CONFIGURED /
 * ERROR / DISABLED. Secrets never appear here.
 */

interface ToolCallUI {
  serverId: string;
  tool: string;
  args: string;
  output: string;
  requiresApproval: boolean;
}

export function McpPanel() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toolCall, setToolCall] = useState<ToolCallUI | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await mcpManager.listServers();
      setServers(list);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const statusTone = (s: string) =>
    s === "CONNECTED" ? "text-emerald-300 bg-emerald-500/20 border-emerald-500/40"
    : s === "READY" ? "text-emerald-300 bg-emerald-500/20 border-emerald-500/40"
    : s === "CAPABILITIES_DISCOVERED" ? "text-cyan-300 bg-cyan-500/20 border-cyan-500/40"
    : s === "CONNECTING" ? "text-sky-300 bg-sky-500/20 border-sky-500/40"
    : s === "CONFIGURED" || s === "CONFIG_REQUIRED" || s === "DEGRADED" ? "text-amber-300 bg-amber-500/20 border-amber-500/40"
    : s === "ERROR" || s === "OFFLINE" ? "text-rose-300 bg-rose-500/20 border-rose-500/40"
    : "text-slate-300 bg-slate-700/30 border-slate-600/40";

  async function connect(id: string) {
    setBusy(id);
    try {
      await mcpManager.connect(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function toggle(id: string, enabled: boolean) {
    setBusy(id);
    try {
      await mcpManager.setEnabled(id, enabled);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function runTool() {
    if (!toolCall) return;
    try {
      const res = await mcpManager.callTool(toolCall.serverId, toolCall.tool, safeJson(toolCall.args));
      if (res.requiresApproval) {
        setToolCall({ ...toolCall, requiresApproval: true, output: `${res.reason ?? "Approval required"}\nRisk: ${res.risk ?? "?"}` });
        return;
      }
      setToolCall({ ...toolCall, requiresApproval: false, output: res.ok ? "✓ " + JSON.stringify(res.result) : `✗ ${res.error ?? "error"}` });
    } catch (e) {
      setToolCall({ ...toolCall, requiresApproval: false, output: `✗ ${e instanceof Error ? e.message : String(e)}` });
    }
  }

  function safeJson(s: string): Record<string, unknown> {
    try {
      const v = JSON.parse(s || "{}");
      return v && typeof v === "object" ? v : {};
    } catch {
      return {};
    }
  }
return (
    <div className="mt-6 rounded-xl border border-indigo-800/60 bg-slate-950/60 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <div>
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-white flex items-center gap-2">
            MCP Servers <span className="text-[10px] text-slate-500 font-normal normal-case">Model Context Protocol · capability layer</span>
          </h2>
          <p className="text-[11px] text-slate-500">Medical MCP servers — managed via Astra's permission + approval gate. Inference stays on FreeLLMAPI → OmniRoute.</p>
        </div>
        <button onClick={() => void load()} className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-[11px] text-slate-200 hover:bg-slate-700">
          Refresh
        </button>
      </div>

      {error && <div className="px-4 py-2 text-[11px] text-rose-300 bg-rose-500/10">{error}</div>}

      <div className="divide-y divide-slate-800/70">
        {servers.map((s) => (
          <div key={s.id} className="px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`px-2 py-0.5 rounded-full text-[10px] border font-semibold ${statusTone(s.status)}`}>{s.displayStatus || s.status}</span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-100 truncate">{s.name}</div>
                  <div className="text-[10px] text-slate-500 font-mono truncate">{s.endpoint}</div>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {s.status === "DISABLED" ? (
                  <button onClick={() => void toggle(s.id, true)} className="px-2 py-1 rounded bg-emerald-700/40 border border-emerald-600/40 text-[11px] text-emerald-200">Enable</button>
                ) : (
                  <>
                    <button onClick={() => void connect(s.id)} disabled={busy === s.id} className="px-2 py-1 rounded bg-cyan-700/40 border border-cyan-600/40 text-[11px] text-cyan-200 disabled:opacity-40">Connect</button>
                    <button onClick={() => void toggle(s.id, false)} className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-[11px] text-slate-300">Disable</button>
                  </>
                )}
                <button onClick={() => setExpanded(expanded === s.id ? null : s.id)} className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-[11px] text-slate-200">Details</button>
              </div>
            </div>

            {expanded === s.id && (
              <div className="mt-3 grid gap-2 text-[11px] text-slate-400">
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  <span>Tools: <span className="text-slate-200">{s.tools.length}</span></span>
                  <span>Resources: <span className="text-slate-200">{s.resources.length}</span></span>
                  <span>Prompts: <span className="text-slate-200">{s.prompts.length}</span></span>
                  {s.lastError && <span className="text-rose-300">Last error: {s.lastError}</span>}
                  {s.lastSeen && <span className="text-slate-500">Last seen: {new Date(s.lastSeen).toLocaleTimeString()}</span>}
                </div>
                <p className="text-slate-500">{s.description}</p>
              </div>
            )}
          </div>
        ))}
        {servers.length === 0 && !error && <div className="px-4 py-6 text-[11px] text-slate-500">No MCP servers configured.</div>}
      </div>
    </div>
  );
}
