// ASTRA AI — UNIFIED INPUT
// Command bar that discovers plugin slash-commands, routes them to the ASTRA
// command engine, and falls back to natural language queries.

import React, { useEffect, useRef, useState } from "react";
import { Send, Command, CornerDownLeft, Sparkles } from "lucide-react";
import { PluginCommands, type CommandCandidate } from "./PluginCommandDiscovery";
import { commandEngine } from "../../command/CommandEngine";
import { toast } from "sonner";

export interface UnifiedInputProps {
  placeholder?: string;
  onResult?: (text: string, source: "command" | "plugin" | "query") => void;
}

export function UnifiedInput({ placeholder = "Type a command or ask ASTRA…", onResult }: UnifiedInputProps) {
  const [value, setValue] = useState("");
  const [suggestions, setSuggestions] = useState<CommandCandidate[]>([]);
  const [open, setOpen] = useState(false);
  const [executing, setExecuting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!value.trim().startsWith("/")) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const found = PluginCommands.discover(value);
    setSuggestions(found);
    setOpen(found.length > 0);
  }, [value]);

  const run = async (raw: string) => {
    if (!raw.trim() || executing) return;
    setExecuting(true);
    setOpen(false);
    try {
      const isCommand = raw.trim().startsWith("/");
      if (isCommand) {
        const parts = raw.trim().slice(1).split(/\s+/);
        const cmd = parts[0].toLowerCase();
        const response = await commandEngine.execute({
          query: raw.trim().slice(1),
          user: {
            userId: "system",
            name: "System",
            role: "SYSTEM",
            department: "command",
            sessionId: "unified-input",
          },
        });
        const text = response.success
          ? response.message ?? JSON.stringify(response.data ?? {})
          : response.message ?? `Command '${cmd}' failed`;
        onResult?.(text, "command");
        toast.success(text.length > 140 ? text.slice(0, 140) + "…" : text);
      } else {
        onResult?.(raw.trim(), "query");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message);
    } finally {
      setExecuting(false);
      setValue("");
    }
  };

  const selectSuggestion = (s: CommandCandidate) => {
    setValue(s.command + " ");
    setOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 focus-within:border-teal-500 transition-all shadow-lg shadow-black/10">
        <Command className="w-4 h-4 text-slate-500 shrink-0" />
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") run(value);
            if (e.key === "Escape") setOpen(false);
          }}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
        />
        {executing ? (
          <Sparkles className="w-4 h-4 text-teal-400 animate-pulse" />
        ) : (
          <button
            onClick={() => run(value)}
            disabled={!value.trim()}
            className="p-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white disabled:opacity-40 transition-all"
            title="Run (Ctrl+Enter)"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {open && suggestions.length > 0 && (
        <div className="absolute z-40 mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/40 overflow-hidden">
          <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-slate-500 font-semibold border-b border-slate-800">
            Plugin Commands
          </p>
          {suggestions.map((s) => (
            <button
              key={s.command}
              onClick={() => selectSuggestion(s)}
              className="w-full text-left px-3 py-2 hover:bg-slate-800 transition-colors flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="text-xs font-mono text-teal-300">{s.command}</p>
                <p className="text-[11px] text-slate-400 truncate">
                  {s.description}
                  {s.plugin ? ` · ${s.plugin}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {s.toolId && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-violet-500/10 text-violet-300 border border-violet-500/30">
                    MCP
                  </span>
                )}
                <span className="text-[10px] font-mono text-slate-500">
                  {Math.round((s.confidence ?? 0) * 100)}%
                </span>
                <CornerDownLeft className="w-3 h-3 text-slate-600" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}