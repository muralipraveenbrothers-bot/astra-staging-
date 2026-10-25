/**
 * Astra AI — Internal Service Manager :: Shared Plugin Console
 * ============================================================
 * Native ASTRA console for ASTRA-managed services (freellmapi / omniroute).
 * Every value displayed comes from the real Internal Service Manager API —
 * process facts, live probes, captured logs. No fabricated status.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  Activity, CheckCircle2, AlertTriangle, XCircle, RefreshCw, Play, Square,
  RotateCcw, Download, Terminal, Boxes, Stethoscope, ScrollText, Monitor,
} from "lucide-react";
import { Badge } from "@/components/ui";

export interface ServiceSnapshotDto {
  id: string;
  displayName: string;
  state: string;
  requestedVersion: string;
  installedVersion?: string;
  verifiedCommit?: string;
  endpoint?: string;
  host: string;
  port?: number;
  upstreamRepo: string;
  upstreamRef: string;
  upstreamLicense: string;
  managed: boolean;
  process?: {
    pid?: number;
    startedAt?: string;
    uptimeMs: number;
    restartCount: number;
    exitCode?: number | null;
    crashLoopDetected: boolean;
    restartPending: boolean;
  };
  health?: { latencyMs?: number; consecutiveFailures: number; detail?: string };
  metrics: { requests: number; errors: number };
  runtime: {
    nodeRequired: string;
    nodeCompatible: boolean;
    nodeVersionUsed?: string;
    diskFreeMB?: number;
  };
  installProgress?: {
    running: boolean;
    error?: string;
    steps: Array<{ step: string; status: string; detail?: string }>;
  };
  lastError?: string;
  disabledReason?: string;
}

const STATE_TONE: Record<string, "green" | "amber" | "red" | "slate"> = {
  HEALTHY: "green", STARTING: "amber", INSTALLING: "amber", UPDATING: "amber",
  DEGRADED: "amber", UNHEALTHY: "red", CRASHED: "red", STOPPED: "slate",
  DISABLED: "red", NOT_INSTALLED: "slate",
};

function fmtUptime(ms: number): string {
  if (!ms) return "—";
  const m = Math.floor(ms / 60000);
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  return data as T;
}
