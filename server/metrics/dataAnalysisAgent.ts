import fs from "node:fs";
import path from "node:path";
import { medicalKnowledgeFabric } from "../knowledge";

const KNOWLEDGE_TARGET_CAPACITY = 40_000_000_000_000;
const DEFAULT_LOCAL_MODEL_PARAMETERS = "17.2B";
const DATA_DIR = path.join(process.cwd(), "knowledge-data");
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

interface IngestionJob {
  pointsCreated?: number;
  specialty?: string;
  updatedAt?: string;
  createdAt?: string;
}

export interface DataAnalysisDashboard {
  generatedAt: string;
  localModelParameters: string;
  verifiedKnowledgePoints: number;
  clinicalReferences: number;
  knowledgeTargetCapacity: number;
  utilizationPercent: number;
  clinicalSpecialtiesMapped: number;
  growth: {
    pointsAddedThisWeek: number;
    pointsAddedPreviousWeek: number;
    weeklyChange: number;
    trend: "UP" | "DOWN" | "FLAT" | "NO_DATA";
  };
  sources: {
    knowledgeStore: string;
    ingestionLog: string;
  };
}

function readIngestionJobs(): IngestionJob[] {
  const file = path.join(DATA_DIR, "jobs.json");
  if (!fs.existsSync(file)) return [];
  const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
  return Array.isArray(parsed) ? parsed : [];
}

function pointsCreatedBetween(jobs: IngestionJob[], from: number, to: number): number {
  return jobs.reduce((total, job) => {
    const timestamp = Date.parse(job.updatedAt ?? job.createdAt ?? "");
    return timestamp >= from && timestamp < to ? total + (job.pointsCreated ?? 0) : total;
  }, 0);
}

export class DataAnalysisAgent {
  public run(now = Date.now()): DataAnalysisDashboard {
    const stats = medicalKnowledgeFabric.getStats();
    const jobs = readIngestionJobs();
    const thisWeekStart = now - WEEK_MS;
    const previousWeekStart = now - 2 * WEEK_MS;
    const pointsAddedThisWeek = pointsCreatedBetween(jobs, thisWeekStart, now + 1);
    const pointsAddedPreviousWeek = pointsCreatedBetween(jobs, previousWeekStart, thisWeekStart);
    const weeklyChange = pointsAddedThisWeek - pointsAddedPreviousWeek;
    const clinicalSpecialtiesMapped = new Set(
      jobs.map((job) => job.specialty?.trim()).filter((specialty): specialty is string => Boolean(specialty)),
    ).size;

    return {
      generatedAt: new Date(now).toISOString(),
      localModelParameters: process.env.ASTRA_LOCAL_MODEL_PARAMETERS ?? DEFAULT_LOCAL_MODEL_PARAMETERS,
      verifiedKnowledgePoints: stats.verifiedPointsCount,
      clinicalReferences: stats.documentsCount,
      knowledgeTargetCapacity: KNOWLEDGE_TARGET_CAPACITY,
      utilizationPercent: (stats.verifiedPointsCount / KNOWLEDGE_TARGET_CAPACITY) * 100,
      clinicalSpecialtiesMapped,
      growth: {
        pointsAddedThisWeek,
        pointsAddedPreviousWeek,
        weeklyChange,
        trend: pointsAddedThisWeek === 0 && pointsAddedPreviousWeek === 0
          ? "NO_DATA"
          : weeklyChange > 0
            ? "UP"
            : weeklyChange < 0
              ? "DOWN"
              : "FLAT",
      },
      sources: {
        knowledgeStore: path.join(DATA_DIR, "points.json"),
        ingestionLog: path.join(DATA_DIR, "jobs.json"),
      },
    };
  }
}

export const dataAnalysisAgent = new DataAnalysisAgent();
