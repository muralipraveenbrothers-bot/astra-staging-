import React, { useEffect, useMemo, useRef, useState } from "react";
import { Shield, ShieldAlert } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { canAuthorizeClinicalAction } from "../../saarathi/command/clinicalAuthority";
import { checkMedication, defaultMedicationRules, findingsForItems } from "./checkMedication";
import { MEDICATION_DRAFT_SAFETY_ENABLED } from "./featureFlag";
import {
  confirmMedicationDraft,
  flushOverrideAuditQueue,
  getOverrideAudit,
  listDrafts,
  loadOrCreateDraft,
  publishMedicationDraftConfirmed,
  recordOverrideWithServerAudit,
  saveDraft,
  unresolvedRedFindings,
} from "./medicationDraft";
import { SHIELD_AUDIO, shieldCue } from "./shield";
import { audienceFields, sortMedicationSuggestions } from "./sortSuggestions";
import { checkStock, getBuyAlerts, reviewOutOfStock } from "./stockCheck";
import { applyPrefill, loadMedicationPrefill, prefillFromSnapshot, type MedicationPrefill, type MedicationSnapshotSource } from "./patientSnapshot";
import type { ApprovalLink, DraftMedicationItem, MedicationAudience, MedicationDraft, RankedSuggestion, StockItem } from "./types";

function splitList(value: string): string[] {
  return value.split(/[,;\n]/).map((part) => part.trim()).filter(Boolean);
}

function optionalNumber(value: string): number | null {
  const text = value.trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function newItem(source: DraftMedicationItem["source"], drug = ""): DraftMedicationItem {
  return {
    id: `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    drug,
    dose: "",
    route: source === "typed" ? "PO" : "",
    frequency: source === "typed" ? "TID" : "",
    duration: source === "typed" ? "5 days" : "",
    source,
    selected: source === "typed",
  };
}

async function linkDoctorApproval(draft: MedicationDraft): Promise<ApprovalLink | { error: string }> {
  const token = localStorage.getItem("astra.serverToken") ?? "";
  if (!token) return { error: "Sign in as a doctor so this confirmation can be linked to the approval gate. Nothing was sent." };
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  const selected = draft.items.filter((item) => item.selected && item.drug.trim());
  try {
    const suggestionResponse = await fetch("/api/clinical/approval/suggestion", {
      method: "POST",
      headers,
      body: JSON.stringify({
        patientId: draft.patientId,
        kind: "medication",
        source: "medication-draft",
        payload: {
          draftId: draft.id,
          items: selected.map((item) => ({
            drug: item.drug,
            dose: item.dose,
            route: item.route,
            frequency: item.frequency,
            duration: item.duration,
          })),
        },
      }),
    });
    const suggestionBody = await suggestionResponse.json() as { suggestion?: { suggestionId?: string } };
    const suggestionId = suggestionBody.suggestion?.suggestionId;
    if (!suggestionResponse.ok || !suggestionId) return { error: "The approval gate did not accept this draft. Nothing was sent." };
    const decisionResponse = await fetch("/api/clinical/approval/decision", {
      method: "POST",
      headers,
      body: JSON.stringify({
        suggestionId,
        decision: "APPROVE_CASE_ONLY",
        reason: "Doctor confirmed the medication draft.",
      }),
    });
    const decisionBody = await decisionResponse.json() as { decision?: { decisionId?: string; status?: string; kind?: string } };
    if (!decisionResponse.ok || decisionBody.decision?.status !== "APPROVED" || !decisionBody.decision.decisionId) {
      return { error: "Doctor approval was not recorded. Nothing was sent." };
    }
    return {
      decisionId: decisionBody.decision.decisionId,
      approved: true,
      patientId: draft.patientId,
      kind: decisionBody.decision.kind || "medication",
    };
  } catch {
    return { error: "The local approval gate could not be reached. Nothing was sent." };
  }
}

export function MedicationDraftPanel({
  audience,
  patientId,
  patientName = "",
  inventory = [],
  patientSnapshot,
}: {
  audience: MedicationAudience;
  patientId: string;
  patientName?: string;
  inventory?: StockItem[];
  /** R5-02 patient snapshot (allergies, labs). When absent the panel reads the patient record from the local server. */
  patientSnapshot?: MedicationSnapshotSource | null;
}) {
  const { account } = useAuth();
  const writing = useRef(false);
  const [patientOverride, setPatientOverride] = useState("");
  const activePatientId = patientOverride.trim() || patientId;
  const [draft, setDraft] = useState<MedicationDraft>(() => loadOrCreateDraft(patientId, patientName));
  const [openShield, setOpenShield] = useState<string | null>(null);
  const [overrideText, setOverrideText] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const doctor = !!account && canAuthorizeClinicalAction(account.role);
  const showMargin = audienceFields(audience).includes("hospitalMargin");

  useEffect(() => {
    setDraft(loadOrCreateDraft(activePatientId, activePatientId === patientId ? patientName : ""));
  }, [activePatientId, patientId, patientName]);

  // Pre-fill allergies / eGFR / creatinine / ALT / AST once per patient. Fields stay editable.
  const prefilledFor = useRef("");
  const [prefillNote, setPrefillNote] = useState("");
  useEffect(() => {
    if (!activePatientId || prefilledFor.current === activePatientId) return;
    prefilledFor.current = activePatientId;
    setPrefillNote("");
    let cancelled = false;
    const apply = (prefill: MedicationPrefill | null) => {
      if (cancelled || !prefill) return;
      const current = loadOrCreateDraft(activePatientId, activePatientId === patientId ? patientName : "");
      if (current.status === "confirmed") return;
      const next = applyPrefill(current, prefill);
      if (next === current) return;
      commit(next);
      setPrefillNote("Allergies and organ-function values were pre-filled from the patient snapshot. Check them; you can edit any field.");
    };
    if (patientSnapshot && activePatientId === patientId) apply(prefillFromSnapshot(patientSnapshot));
    void loadMedicationPrefill(activePatientId).then(apply);
    return () => {
      cancelled = true;
    };
  }, [activePatientId, patientId, patientName, patientSnapshot]);

  // Retry override audits that could not reach the server decision log.
  useEffect(() => {
    const flush = () => void flushOverrideAuditQueue();
    flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, []);

  useEffect(() => {
    const refresh = () => {
      if (writing.current) return;
      setDraft(loadOrCreateDraft(activePatientId, activePatientId === patientId ? patientName : ""));
    };
    window.addEventListener("astra-medication-draft", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("astra-medication-draft", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [activePatientId, patientId, patientName]);

  const stockKey = inventory.map((row) => `${row.id}:${row.stock}`).join("|");
  const drugKey = draft.items.map((item) => item.drug).join("|");
  useEffect(() => {
    if (!inventory.length) return;
    for (const item of draft.items) {
      if (item.drug.trim()) reviewOutOfStock(item.drug, inventory);
    }
  }, [stockKey, drugKey]);

  const context = useMemo(() => ({
    patientId: draft.patientId,
    allergies: splitList(draft.allergiesText),
    currentMedications: splitList(draft.currentMedicationsText),
    egfr: optionalNumber(draft.egfrText),
    creatinineMgDl: optionalNumber(draft.creatinineText),
    alt: optionalNumber(draft.altText),
    ast: optionalNumber(draft.astText),
  }), [draft]);

  const findings = useMemo(() => findingsForItems(draft.items, context), [draft.items, context]);
  const confirmed = listDrafts().filter((item) => item.patientId === activePatientId && item.status === "confirmed").at(-1) ?? null;
  const alerts = getBuyAlerts().filter((alert) => alert.status === "open");

  if (!MEDICATION_DRAFT_SAFETY_ENABLED) return null;

  function commit(next: MedicationDraft) {
    writing.current = true;
    setDraft(saveDraft(next));
    window.dispatchEvent(new CustomEvent("astra-medication-draft"));
    writing.current = false;
  }

  function updateItem(itemId: string, patch: Partial<DraftMedicationItem>) {
    commit({
      ...draft,
      items: draft.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
    });
  }

  function suggestionRows(item: DraftMedicationItem): RankedSuggestion[] {
    const rows: RankedSuggestion[] = [];
    for (const finding of findings[item.id] ?? []) {
      if (!finding.suggestionOnly) continue;
      const stock = inventory.find((row) => row.name.toLowerCase().includes(finding.suggestionOnly!.toLowerCase()) || row.salt.toLowerCase().includes(finding.suggestionOnly!.toLowerCase()));
      const suggestedFindings = checkMedication({ drug: finding.suggestionOnly, dose: "", frequency: "" }, context);
      rows.push({
        id: `${item.id}:${finding.suggestionOnly}`,
        label: finding.suggestionOnly,
        findings: suggestedFindings,
        inStock: !!stock && stock.stock > 0,
        patientPrice: stock?.unitPrice ?? Number.POSITIVE_INFINITY,
        hospitalMargin: stock?.hospitalMargin,
      });
    }
    const stockNotice = inventory.length ? checkStock(item.drug, inventory) : null;
    if (stockNotice?.suggestion) {
      rows.push({
        id: stockNotice.suggestion.id,
        label: stockNotice.suggestion.drug,
        findings: checkMedication({ drug: stockNotice.suggestion.drug, dose: item.dose, frequency: item.frequency }, context),
        inStock: true,
        patientPrice: stockNotice.suggestion.patientPrice,
      });
    }
    return sortMedicationSuggestions(rows, audience);
  }

  function acceptSuggestion(drug: string) {
    if (!doctor || draft.items.some((item) => item.selected && item.drug === drug)) return;
    commit({ ...draft, items: [...draft.items, newItem("typed", drug)] });
  }

  async function onConfirm() {
    if (!doctor || !account) {
      setNotice("A doctor confirms medication drafts.");
      return;
    }
    const blocking = draft.items.filter((item) => item.selected).flatMap((item) => unresolvedRedFindings(item, findings[item.id] ?? [], getOverrideAudit()));
    if (blocking.length) {
      setNotice(blocking[0].message);
      return;
    }
    setBusy(true);
    const linked = await linkDoctorApproval(draft);
    if ("error" in linked) {
      setNotice(linked.error);
      setBusy(false);
      return;
    }
    const result = confirmMedicationDraft({
      draft,
      actorId: account.id,
      actorRole: account.role,
      findingsByItemId: findings,
      overrides: getOverrideAudit(),
      approval: linked,
    });
    if (!result.ok) {
      setNotice(result.reason);
      setBusy(false);
      return;
    }
    try {
      await publishMedicationDraftConfirmed(result.draft, account.id, account.role);
      setNotice("Draft confirmed and linked to the doctor approval gate.");
    } catch {
      setNotice("Draft confirmed, but the in-app event did not publish.");
    }
    setDraft(loadOrCreateDraft(activePatientId, activePatientId === patientId ? patientName : ""));
    setBusy(false);
  }

  const confirmBlocked = draft.items
    .filter((item) => item.selected)
    .some((item) => unresolvedRedFindings(item, findings[item.id] ?? [], getOverrideAudit()).length > 0);

  return (
    <section data-testid="medication-draft-panel" className="rounded-2xl border border-orange-400/30 bg-slate-950/80 p-4 text-slate-100 shadow-xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.18em] text-orange-300">Medication draft</p>
          <h2 className="text-sm font-black text-white">Safety check before confirm</h2>
          <p className="mt-1 max-w-3xl text-[11px] text-amber-200">{defaultMedicationRules.banner}</p>
        </div>
        <p className="text-[10px] text-slate-400">{(activePatientId === patientId ? patientName : "") || "Patient"} · {activePatientId}</p>
      </div>
      {audience === "pharmacy" && (
        <label className="mt-3 block max-w-xs text-[10px] text-slate-400">Open patient UHID
          <input value={patientOverride} onChange={(event) => setPatientOverride(event.target.value)} placeholder={patientId} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white" />
        </label>
      )}

      {prefillNote && <p data-testid="medication-prefill-note" className="mt-3 text-[10px] text-cyan-200">{prefillNote}</p>}
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <label className="text-[10px] text-slate-400">Recorded allergies
          <input disabled={!doctor} value={draft.allergiesText} onChange={(event) => commit({ ...draft, allergiesText: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white" placeholder="penicillin" />
        </label>
        <label className="text-[10px] text-slate-400">Current medications
          <input disabled={!doctor} value={draft.currentMedicationsText} onChange={(event) => commit({ ...draft, currentMedicationsText: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white" placeholder="warfarin" />
        </label>
        <label className="text-[10px] text-slate-400">eGFR
          <input disabled={!doctor} value={draft.egfrText} onChange={(event) => commit({ ...draft, egfrText: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white" />
        </label>
        <label className="text-[10px] text-slate-400">Creatinine mg/dL
          <input disabled={!doctor} value={draft.creatinineText} onChange={(event) => commit({ ...draft, creatinineText: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white" />
        </label>
        <label className="text-[10px] text-slate-400">ALT (SGPT) U/L
          <input disabled={!doctor} value={draft.altText} onChange={(event) => commit({ ...draft, altText: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white" />
        </label>
        <label className="text-[10px] text-slate-400">AST (SGOT) U/L
          <input disabled={!doctor} value={draft.astText} onChange={(event) => commit({ ...draft, astText: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white" />
        </label>
      </div>

      <div className="mt-3 space-y-3">
        {draft.items.map((item) => {
          const itemFindings = findings[item.id] ?? [];
          const cue = shieldCue(itemFindings);
          const stockNotice = inventory.length ? checkStock(item.drug, inventory) : null;
          const reds = itemFindings.filter((finding) => finding.severity === "red");
          const rows = suggestionRows(item);
          return (
            <article key={item.id} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
              <div className="grid gap-2 md:grid-cols-6">
                <label className="text-[10px] text-slate-400 md:col-span-2">Drug
                  <input disabled={!doctor} value={item.drug} onChange={(event) => updateItem(item.id, { drug: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white" />
                </label>
                <label className="text-[10px] text-slate-400">Dose
                  <input disabled={!doctor} value={item.dose} onChange={(event) => updateItem(item.id, { dose: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white" placeholder="500 mg" />
                </label>
                <label className="text-[10px] text-slate-400">Route
                  <input disabled={!doctor} value={item.route} onChange={(event) => updateItem(item.id, { route: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white" />
                </label>
                <label className="text-[10px] text-slate-400">Frequency
                  <input disabled={!doctor} value={item.frequency} onChange={(event) => updateItem(item.id, { frequency: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white" />
                </label>
                <label className="text-[10px] text-slate-400">Duration
                  <input disabled={!doctor} value={item.duration} onChange={(event) => updateItem(item.id, { duration: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white" />
                </label>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px]">
                <label className="flex items-center gap-2 text-slate-300">
                  <input type="checkbox" disabled={!doctor} checked={item.selected} onChange={(event) => updateItem(item.id, { selected: event.target.checked })} />
                  {item.source === "ai-suggested" ? "AI suggestion — tick to include" : "Include in confirmed draft"}
                </label>
                {cue.tone === "orange" && (
                  <button
                    type="button"
                    data-shield="orange"
                    data-audio={SHIELD_AUDIO}
                    aria-expanded={openShield === item.id}
                    onClick={() => setOpenShield(openShield === item.id ? null : item.id)}
                    className="animate-pulse rounded-full border border-orange-400/50 p-1.5 text-orange-400"
                  >
                    <Shield className="h-4 w-4" aria-hidden="true" />
                    <span className="sr-only">Orange safety note</span>
                  </button>
                )}
                {cue.tone === "red" && (
                  <span data-shield="red" data-audio={SHIELD_AUDIO} className="inline-flex items-center gap-1 text-red-400">
                    <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                    Confirm blocked
                  </span>
                )}
                {doctor && (
                  <button type="button" onClick={() => commit({ ...draft, items: draft.items.filter((row) => row.id !== item.id) })} className="text-slate-500 underline">
                    Remove
                  </button>
                )}
              </div>
              {cue.tone === "orange" && openShield === item.id && (
                <p role="note" className="mt-2 rounded-lg border border-orange-400/40 bg-orange-950/40 p-2 text-xs text-orange-100">{cue.bubbleText}</p>
              )}
              {cue.tone === "red" && <p className="mt-2 text-xs text-red-300">{cue.bubbleText}</p>}
              {stockNotice?.outOfStock && <p className="mt-2 text-xs font-bold text-red-400">Out of stock</p>}
              {doctor && reds.filter((finding) => finding.overrideAllowed).map((finding) => (
                <div key={finding.ruleId} className="mt-2 flex flex-wrap gap-2">
                  <input
                    value={overrideText[`${item.id}:${finding.ruleId}`] ?? ""}
                    onChange={(event) => setOverrideText({ ...overrideText, [`${item.id}:${finding.ruleId}`]: event.target.value })}
                    placeholder="Override reason"
                    className="rounded-lg border border-red-400/40 bg-slate-950 px-2 py-1 text-xs text-white"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      void recordOverrideWithServerAudit({
                        patientId: draft.patientId,
                        itemId: item.id,
                        ruleId: finding.ruleId,
                        doctorId: account?.id ?? "",
                        reason: overrideText[`${item.id}:${finding.ruleId}`] ?? "",
                        drug: item.drug,
                        dose: item.dose,
                        overrideAllowed: finding.overrideAllowed,
                        finding,
                      }).then((result) => {
                        if (!result.ok) setNotice(result.reason);
                        else setNotice(result.serverLogged
                          ? "Override recorded in the server AI decision log."
                          : "Server not reachable. Override saved on this computer and will be sent to the decision log when the server is back.");
                      });
                    }}
                    className="rounded-lg border border-red-400/40 px-2 py-1 text-[11px] text-red-200"
                  >
                    Record override
                  </button>
                </div>
              ))}
              {rows.map((row) => {
                const ticked = draft.items.some((existing) => existing.selected && existing.drug === row.label);
                return (
                  <label key={row.id} className="mt-2 flex items-center gap-2 text-[11px] text-slate-300">
                    <input type="checkbox" disabled={!doctor} checked={ticked} onChange={(event) => { if (event.target.checked) acceptSuggestion(row.label); }} />
                    Suggestion only: {row.label}
                    {Number.isFinite(row.patientPrice) ? ` · patient price ${row.patientPrice}` : ""}
                    {showMargin && typeof row.hospitalMargin === "number" ? ` · margin ${row.hospitalMargin}` : ""}
                  </label>
                );
              })}
            </article>
          );
        })}
      </div>

      {doctor && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => commit({ ...draft, items: [...draft.items, newItem("typed")] })} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-bold">
            Add medication
          </button>
          <button type="button" onClick={() => commit({ ...draft, items: [...draft.items, newItem("ai-suggested")] })} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs">
            Add unticked AI suggestion
          </button>
          <button
            type="button"
            data-testid="medication-draft-confirm"
            disabled={busy || confirmBlocked || !draft.items.some((item) => item.selected)}
            onClick={() => void onConfirm()}
            className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-700"
          >
            Confirm draft
          </button>
        </div>
      )}
      {notice && <p className="mt-2 text-xs text-amber-200">{notice}</p>}

      {confirmed && (
        <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3 text-xs">
          <p className="font-bold text-emerald-300">Confirmed {confirmed.confirmedAt} by {confirmed.confirmedBy}</p>
          <ul className="mt-1 space-y-1 text-slate-200">
            {confirmed.items.map((item) => (
              <li key={item.id}>{item.drug} · {item.dose} · {item.route} · {item.frequency} · {item.duration}</li>
            ))}
          </ul>
        </div>
      )}

      {(audience === "pharmacy" || audience === "admin") && alerts.length > 0 && (
        <div className="mt-4 rounded-xl border border-red-500/30 p-3 text-xs">
          <p className="font-bold text-red-300">Buy alerts for the pharmacist</p>
          <ul className="mt-1 space-y-1">
            {alerts.map((alert) => <li key={alert.id}>{alert.drug} · {alert.molecule} · {alert.createdAt}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}
