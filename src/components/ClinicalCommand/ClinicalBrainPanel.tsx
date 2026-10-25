/**
 * Doctor-facing Part 2 controls. The existing 7D engine is not rendered here
 * as a replacement. These buttons explain the verified chart.
 */
import React, { useMemo, useState } from "react";
import type { LabOrder, Patient, Prescription } from "@/types";
import { explainCase, type CaseExplanation } from "@/astra/brain/part2/explain";
import type { VerifiedFacts } from "@/astra/brain/part2/facts";
import { watchCaseEvent, whatChanged, type Checkpoint } from "@/astra/brain/part2/follow";
import { PATH_VIEWS, type PathView } from "@/astra/brain/part2/mechanism";

function factsFor(patient: Patient | null | undefined, labOrders: LabOrder[], prescriptions: Prescription[]): VerifiedFacts {
  if (!patient) return {};
  const labs = labOrders
    .filter((order) => order.patientUhid === patient.uhid)
    .map((order) => ({ name: order.testName, value: order.results, at: order.orderedAt }));
  const medications = prescriptions
    .filter((rx) => rx.patientUhid === patient.uhid)
    .flatMap((rx) => rx.medicines.map((medicine) => `${medicine.genericName} ${medicine.dose}`.trim()));
  return {
    presentation: [patient.chiefComplaints, ...(patient.symptoms ?? [])].filter(Boolean).join(". "),
    age: patient.age,
    sex: patient.gender,
    symptoms: patient.symptoms,
    signs: [
      patient.vitals?.bp ? `BP ${patient.vitals.bp}` : "",
      patient.vitals?.pulse ? `pulse ${patient.vitals.pulse}` : "",
    ].filter(Boolean),
    medications,
    labs,
    investigations: labs.map((lab) => lab.name),
    admitted: patient.admissionType === "IP" || Boolean(patient.bedNumber),
    recordedDiagnosis: patient.diagnosis,
  };
}

function checkpointFrom(facts: VerifiedFacts): Checkpoint {
  return {
    at: new Date().toISOString(),
    symptoms: facts.symptoms ?? [],
    signs: facts.signs ?? [],
    investigations: facts.investigations ?? [],
    labs: (facts.labs ?? []).map((lab) => `${lab.name} ${lab.value ?? ""}`.trim()),
    medications: facts.medications ?? [],
    procedures: facts.procedures ?? [],
    complications: [],
    pending: [],
  };
}

export function ClinicalBrainPanel({
  patient,
  labOrders,
  prescriptions,
}: {
  patient?: Patient | null;
  labOrders: LabOrder[];
  prescriptions: Prescription[];
}) {
  const facts = useMemo(() => factsFor(patient, labOrders, prescriptions), [patient, labOrders, prescriptions]);
  const text = facts.presentation || patient?.chiefComplaints || "";
  const [view, setView] = useState<PathView>("Clinical");
  const [open, setOpen] = useState<"graph" | "why" | "changed" | null>("graph");
  const [saved, setSaved] = useState<Checkpoint | null>(null);
  const [eventText, setEventText] = useState("");
  const explained: CaseExplanation = useMemo(
    () => explainCase({ text, facts, view }),
    [text, facts, view],
  );
  const current = checkpointFrom(facts);
  const delta = whatChanged(saved, current);
  const watched = eventText.trim() ? watchCaseEvent(eventText) : null;

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 md:p-6 space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-black text-slate-900">Clinical brain</h2>
          <p className="text-xs text-slate-500">Verified chart only. Unknown fields stay unknown. No order is placed from this panel.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setOpen("graph")} className={`px-3 py-2 rounded-xl text-xs font-bold ${open === "graph" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-800"}`}>PATHOPHYSIOLOGY</button>
          <button type="button" onClick={() => setOpen("why")} className={`px-3 py-2 rounded-xl text-xs font-bold ${open === "why" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-800"}`}>WHY?</button>
          <button type="button" onClick={() => setOpen("changed")} className={`px-3 py-2 rounded-xl text-xs font-bold ${open === "changed" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-800"}`}>WHAT CHANGED?</button>
        </div>
      </div>

      {open === "graph" && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {PATH_VIEWS.map((item) => (
              <button key={item} type="button" onClick={() => setView(item)} className={`px-3 py-1.5 rounded-full text-xs font-bold ${view === item ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}>{item}</button>
            ))}
          </div>
          <ol className="space-y-2">
            {explained.visibleNodes.map((node) => (
              <li key={node.id}>
                <details open className="rounded-xl border border-slate-200 p-3">
                  <summary className="cursor-pointer font-bold text-sm text-slate-900">{node.id}</summary>
                  <ul className="mt-2 list-disc pl-5 text-sm text-slate-700">
                    {node.statements.map((line) => <li key={line}>{line}</li>)}
                  </ul>
                </details>
              </li>
            ))}
          </ol>
          {explained.mechanism.labLimitation && <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">{explained.mechanism.labLimitation}</p>}
          {explained.mechanism.compartmentPressurePrompt && <p className="text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-xl p-3">{explained.mechanism.compartmentPressurePrompt}</p>}
        </div>
      )}

      {open === "why" && (
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div><dt className="font-bold">Facts used</dt><dd>{explained.why.factsUsed.join("; ") || "unknown"}</dd></div>
          <div><dt className="font-bold">Findings supporting</dt><dd>{explained.why.supporting.join("; ")}</dd></div>
          <div><dt className="font-bold">Findings against</dt><dd>{explained.why.against.join("; ")}</dd></div>
          <div><dt className="font-bold">Missing information</dt><dd>{explained.why.missing.join("; ")}</dd></div>
          <div><dt className="font-bold">Evidence source</dt><dd>{explained.why.evidenceSource}</dd></div>
          <div><dt className="font-bold">Uncertainty</dt><dd>{explained.why.uncertainty}</dd></div>
        </dl>
      )}

      {open === "changed" && (
        <div className="space-y-3 text-sm">
          <button type="button" onClick={() => setSaved(checkpointFrom(facts))} className="px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold">Save checkpoint</button>
          <p>{delta.compared ? "Compared with the saved checkpoint." : "No previous checkpoint. Nothing is reported as changed."}</p>
          <ul className="list-disc pl-5">
            <li>New symptom: {delta.newSymptom.join("; ") || "none"}</li>
            <li>New sign: {delta.newSign.join("; ") || "none"}</li>
            <li>New investigation: {delta.newInvestigation.join("; ") || "none"}</li>
            <li>New lab trend: {delta.newLabTrend.join("; ") || "none"}</li>
            <li>Medication change: {delta.medicationChange.join("; ") || "none"}</li>
            <li>Procedure change: {delta.procedureChange.join("; ") || "none"}</li>
            <li>New complication: {delta.newComplication.join("; ") || "none"}</li>
            <li>Improvement: {delta.improvement.join("; ") || "none"}</li>
            <li>Deterioration: {delta.deterioration.join("; ") || "none"}</li>
            <li>New pending issue: {delta.newPendingIssue.join("; ") || "none"}</li>
          </ul>
          <label className="block text-xs font-bold text-slate-600">New event
            <input value={eventText} onChange={(event) => setEventText(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="new creatinine result" />
          </label>
          {watched && (
            <p className="rounded-xl bg-slate-50 border border-slate-200 p-3">
              {watched.material ? `Case updated in the reasoning plan. Rerun: ${watched.rerun.join(", ")}.` : "Record only. The event does not change the case."}
              {watched.notifyClinician ? " The clinician is notified because a threshold was crossed." : ""}
            </p>
          )}
        </div>
      )}

      {explained.disagreements.map((card) => (
        <article key={card.agentB.conclusion} className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm space-y-1">
          <h3 className="font-black">DISAGREEMENT CARD</h3>
          <p><strong>{card.agentA.name}:</strong> {card.agentA.conclusion}</p>
          <p>{card.agentA.supportingFacts.join(" ")}</p>
          <p><strong>{card.agentB.name}:</strong> {card.agentB.conclusion}</p>
          <p>{card.agentB.supportingFacts.join(" ")}</p>
          <p><strong>Would resolve:</strong> {card.wouldResolve}</p>
        </article>
      ))}

      <ol className="space-y-2">
        {explained.sections.map((section) => (
          <li key={section.index} className="text-sm">
            <p className="font-bold text-slate-900">{section.index}. {section.title}</p>
            <p className="text-slate-700">{section.body.join(" ")}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
