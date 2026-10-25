import { db } from "../../db";
import { selectContext, type CaseSlice } from "../context/contextSelector";
import { bandAge, scrubIdentifiers } from "../../clinical/scientistAgent";
import type { HospitalOrder, Patient } from "../../db";
import type { ClinicalStateInput } from "./types";

const TOKEN_BUDGET = 1024;

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function arr(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

function latestVitals(patient: Partial<Patient> & Record<string, unknown>): string {
  const raw = Array.isArray(patient.vitals) ? patient.vitals[patient.vitals.length - 1] : (patient.vitals as Record<string, unknown> | undefined);
  if (!raw || typeof raw !== "object") return "not recorded";
  const v = raw as Record<string, unknown>;
  const parts = [
    v.bp ? `BP ${v.bp}` : v.bpSys && v.bpDia ? `BP ${v.bpSys}/${v.bpDia}` : null,
    v.heartRate || v.pulse ? `HR ${v.heartRate ?? v.pulse}` : null,
    v.spo2 ? `SpO2 ${v.spo2}%` : null,
    v.respRate ? `RR ${v.respRate}` : null,
    v.tempF || v.temp ? `Temp ${v.tempF ?? v.temp}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "not recorded";
}

function orderFlags(orders: Array<Partial<HospitalOrder> & Record<string, unknown>>): string {
  const recent = orders.slice(-8);
  if (!recent.length) return "none recorded";
  return recent.map((o) => {
    const critical = o.isCritical ? "critical " : "";
    const status = o.status ? ` ${o.status}` : "";
    const result = o.result ? ` result ${String(o.result).slice(0, 100)}` : "";
    return `${critical}${o.category ?? "order"} ${o.item ?? ""}${status}${result}`.trim();
  }).join("; ");
}

export function buildClinicalState(inputOrPatientId: string | ClinicalStateInput): { text: string; patient?: Patient | Record<string, unknown>; orders: Array<Record<string, unknown>> } {
  const input: ClinicalStateInput = typeof inputOrPatientId === "string" ? { patientId: inputOrPatientId } : inputOrPatientId;
  const patient = input.patient ?? (input.patientId ? db.getPatientById(input.patientId) : undefined);
  const patientKey = str((patient as Record<string, unknown> | undefined)?.uhid) ?? str((patient as Record<string, unknown> | undefined)?.id) ?? input.patientId ?? "";
  const orders = input.orders ?? (patientKey ? db.getOrders(undefined, patientKey) : []);
  const p = (patient ?? {}) as Record<string, unknown>;
  const ageBand = bandAge(typeof p.age === "number" ? p.age : undefined);
  const sex = str(p.sex) ?? str(p.gender) ?? "sex not recorded";
  const allergies = arr(p.allergies);
  const activeMeds = arr(p.activeMeds).concat(arr(p.activeMedications));
  const medicationOrders = orders.filter((o) => o.category === "pharmacy").map((o) => String(o.item ?? "")).filter(Boolean);
  const complaint = str(input.mitraHandoff?.chiefComplaint) ?? str(input.mitraHandoff?.complaint) ?? str(p.chiefComplaint) ?? str(p.chiefComplaints) ?? "not recorded";
  const onset = str(input.mitraHandoff?.onset);
  const duration = str(input.mitraHandoff?.duration);

  const slices: CaseSlice[] = [
    { key: "demographics", text: `Age band ${ageBand}; sex ${sex}.` },
    { key: "complaint", text: `${complaint}${onset ? `; onset ${onset}` : ""}${duration ? `; duration ${duration}` : ""}.` },
    { key: "mitra_handoff", text: input.mitraHandoff ? `Structured reception handoff: chief complaint ${complaint}; language ${str(input.mitraHandoff.language) ?? "not recorded"}; consent ${String(input.mitraHandoff.consentFlag ?? "not recorded")}.` : "No structured reception handoff recorded." },
    { key: "latest_vitals", text: latestVitals(p), pinned: true },
    { key: "allergies", text: allergies.length ? allergies.join(", ") : "none recorded", pinned: true },
    { key: "active_medications", text: [...activeMeds, ...medicationOrders].length ? [...activeMeds, ...medicationOrders].join(", ") : "none recorded", pinned: true },
    { key: "recent_results", text: orderFlags(orders), pinned: true },
    { key: "diagnostic_context", text: str(p.diagnosis) ?? "working diagnosis not recorded" },
    ...(input.extraSlices ?? []),
  ];

  const selected = selectContext(slices, TOKEN_BUDGET);
  const text = scrubIdentifiers(selected.text).replace(/\b(?:name|phone|uhid|address)\s*[:#-]?\s*[^\n;]+/gi, "[redacted identifier]");
  return { text: text.slice(0, TOKEN_BUDGET * 4), patient, orders };
}

export function buildClinicalStateText(patientId: string): string {
  return buildClinicalState(patientId).text;
}
