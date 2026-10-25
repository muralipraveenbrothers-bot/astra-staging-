import fs from "fs";
import path from "path";
import { astraDataRoot } from "../services/env";

export type ScheduleLevel = "L0" | "L1" | "L2" | "L3" | "L4" | "L5" | "L6" | "L7";
export type ScheduleKind = "READ_ONLY" | "PREPARE_DRAFT" | "WRITE";

export interface ScheduleJob {
  id: string;
  title: string;
  hhmm?: string;
  everyMin?: number;
  enabled: boolean;
  tool: string;
  level: ScheduleLevel;
  kind: ScheduleKind;
  lastFiredKey?: string;
}

export const DEFAULT_SCHEDULES: ScheduleJob[] = [
  { id: "night-shift-summary", title: "Night-shift summary (draft)", hhmm: "06:30", enabled: false, tool: "queue_lookup", level: "L0", kind: "READ_ONLY" },
  { id: "pending-labs-radiology", title: "Pending labs and radiology list", hhmm: "07:00", enabled: false, tool: "report_status", level: "L0", kind: "READ_ONLY" },
  { id: "discharge-candidates", title: "Discharge candidates (list only)", hhmm: "07:30", enabled: false, tool: "bed_search", level: "L0", kind: "READ_ONLY" },
  { id: "morning-command-brief", title: "Morning Command Brief", hhmm: "08:00", enabled: false, tool: "document_lookup", level: "L0", kind: "READ_ONLY" },
  { id: "integration-health", title: "Hourly integration health", everyMin: 60, enabled: false, tool: "hospital_policy_search", level: "L0", kind: "READ_ONLY" },
  { id: "unbilled-inpatient-audit", title: "Unbilled inpatient charges audit (report only)", hhmm: "09:00", enabled: false, tool: "document_lookup", level: "L1", kind: "PREPARE_DRAFT" },
];

// n8n adapter later. n8n is stopped and must not be started from here.

let jobs: ScheduleJob[] = DEFAULT_SCHEDULES.map((job) => ({ ...job }));
let dirOverride: string | null = null;
let loaded = false;

function file(): string {
  return path.join(dirOverride ?? astraDataRoot(), "agentops", "schedules.json");
}

function rank(level: ScheduleLevel): number {
  return Number(level.slice(1));
}

function assertSchedulable(job: Pick<ScheduleJob, "level" | "kind">): void {
  if (rank(job.level) >= 2 || (job.kind !== "READ_ONLY" && job.kind !== "PREPARE_DRAFT")) {
    throw new Error("schedule_rejected_not_read_or_draft");
  }
}

function persist(): void {
  const target = file();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify({ jobs }, null, 2), "utf8");
}

export function loadSchedules(): ScheduleJob[] {
  if (loaded) return jobs.map((job) => ({ ...job }));
  loaded = true;
  try {
    const parsed = JSON.parse(fs.readFileSync(file(), "utf8")) as { jobs?: ScheduleJob[] };
    if (Array.isArray(parsed.jobs) && parsed.jobs.length) jobs = parsed.jobs.map((job) => ({ ...job }));
  } catch { /* defaults stay disabled until an admin saves */ }
  return jobs.map((job) => ({ ...job }));
}

export function listSchedules(): ScheduleJob[] {
  return loadSchedules();
}

export function saveSchedule(job: ScheduleJob): ScheduleJob {
  assertSchedulable(job);
  loadSchedules();
  const index = jobs.findIndex((item) => item.id === job.id);
  if (index >= 0) jobs[index] = { ...job };
  else jobs.push({ ...job });
  persist();
  return { ...job };
}

export function tickSchedules(now: Date): string[] {
  loadSchedules();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const hhmm = `${hh}:${mm}`;
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const hourKey = `${day}T${hh}`;
  const fired: string[] = [];
  for (const job of jobs) {
    if (!job.enabled) continue;
    const key = job.hhmm ? `${day}T${job.hhmm}` : job.everyMin ? hourKey : "";
    if (!key || job.lastFiredKey === key) continue;
    if (job.hhmm && job.hhmm !== hhmm) continue;
    if (job.everyMin && now.getMinutes() !== 0) continue;
    job.lastFiredKey = key;
    fired.push(job.id);
  }
  if (fired.length) persist();
  return fired;
}

export function _resetSchedulerForTest(dir: string): void {
  dirOverride = dir;
  jobs = DEFAULT_SCHEDULES.map((job) => ({ ...job }));
  loaded = false;
  fs.mkdirSync(path.join(dir, "agentops"), { recursive: true });
}

export function _reloadSchedulerForTest(): void {
  loaded = false;
  jobs = DEFAULT_SCHEDULES.map((job) => ({ ...job }));
}
