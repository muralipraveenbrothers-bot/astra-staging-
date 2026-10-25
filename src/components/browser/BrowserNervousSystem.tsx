/**
 * Visual nervous system for the Internal Browser. The existing service grid stays.
 */
import React, { useState } from "react";
import { BROWSER_BAR, CLINICAL_WORKSPACE, HOSPITAL_PLACES, SERVICE_CARDS, contextFor, parseBrowserCommand, patientChange, type PatientLock } from "@/astra/brain/part4/browser";
import { getService } from "@/services/astraServices";
import { contactAction } from "@/astra/brain/part4/contacts";

export function BrowserNervousSystem({ onOpenService, onOpenHash }: {
  onOpenService: (serviceId: string) => void;
  onOpenHash: (hash: string) => void;
}) {
  const [group, setGroup] = useState<keyof typeof BROWSER_BAR>("AI Brain");
  const [command, setCommand] = useState("/browser open voicebox");
  const [patient, setPatient] = useState<PatientLock | null>(null);
  const [pendingMrn, setPendingMrn] = useState("");
  const [notice, setNotice] = useState("");
  const parsed = parseBrowserCommand(command);
  const context = contextFor(parsed, patient);
  const card = SERVICE_CARDS.find((item) => item.serviceId === parsed?.serviceId);

  return (
    <section className="ab-card mb-6 rounded-2xl p-4">
      <p className="text-[11px] font-bold tracking-wider text-cyan-300">VISUAL NERVOUS SYSTEM</p>
      <h2 className="text-lg font-black">Internal Browser</h2>
      <p className="text-sm font-bold text-white">PRIMARY — OPEN AND CONTROL ASTRA WORKSPACES</p>
      <p className="mt-1 text-xs text-slate-400">Reasoning stays in Astra Brain. This surface only opens the registered service. Technical detail sits below the primary line.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {(Object.keys(BROWSER_BAR) as Array<keyof typeof BROWSER_BAR>).map((item) => (
          <button key={item} type="button" onClick={() => setGroup(item)} data-on={group === item ? "1" : "0"} className="ab-btn rounded-full px-3 py-1 text-xs">{item}</button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {BROWSER_BAR[group].map((item) => (
          <button
            key={item}
            type="button"
            className="ab-btn rounded-lg px-2 py-1 text-xs"
            onClick={() => {
              if (item === "evolution") onOpenHash("/command-center/evolution");
              else if (item === "patient") setNotice("Patient context is the lock below.");
              else if (getService(item)) onOpenService(item);
              else setNotice(`${item} is a workspace label. Its page opens from the department list when a route exists.`);
            }}
          >
            {item}
          </button>
        ))}
      </div>
      <form className="mt-3 flex flex-col gap-2 md:flex-row" onSubmit={(event) => {
        event.preventDefault();
        if (parsed?.serviceId && !parsed.needsApproval) onOpenService(parsed.serviceId);
        else if (parsed?.place && HOSPITAL_PLACES[parsed.place]) onOpenHash(HOSPITAL_PLACES[parsed.place]);
        setNotice(parsed?.explanation ?? "Unrecognized browser command.");
      }}>
        <input value={command} onChange={(event) => setCommand(event.target.value)} aria-label="Browser command" className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm" />
        <button type="submit" className="ab-btn rounded-lg px-3 py-2 text-sm">Run</button>
      </form>
      {notice && <p className="mt-2 text-sm text-cyan-100">{notice}</p>}
      {card && (
        <article className="ab-card mt-3 rounded-xl p-3">
          <h3 className="text-base font-black">{card.title}</h3>
          <p className="text-sm font-bold">PRIMARY — {card.primary}</p>
          <p className="text-xs text-slate-400">Technical engine: {card.technicalEngine}</p>
          <p className="text-xs text-slate-300">{card.secondary.join(" · ")} · {card.buttons.join(" | ")}</p>
          {card.externalAi && <p className="mt-1 text-xs font-bold text-amber-300">EXTERNAL AI · UNVERIFIED EXTERNAL AI OUTPUT until reviewed. Patient data is not sent silently.</p>}
        </article>
      )}
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <article className="ab-card rounded-xl p-3 text-sm min-w-0">
          <h3 className="font-black">PATIENT</h3>
          <p className="font-bold">PRIMARY — KEEP THE BROWSER ON THE CORRECT PATIENT</p>
          <p>{patient ? `${patient.name} · ${patient.mrn} · ${patient.ageSex} · ${patient.wardBed} · ${patient.doctor}` : "No patient locked."}</p>
          <label className="mt-2 block text-xs">Change MRN
            <input value={pendingMrn} onChange={(event) => setPendingMrn(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1" />
          </label>
          <button
            type="button"
            className="ab-btn mt-2 rounded-lg px-2 py-1 text-xs"
            onClick={() => {
              const next = pendingMrn.trim();
              if (!next) return;
              const change = patientChange(patient, next);
              if (change.needsConfirm && !window.confirm(`Confirm patient context change from ${patient?.mrn} to ${next}.`)) return;
              setPatient({ name: "Recorded patient", mrn: next, ageSex: "unknown", encounter: "current", wardBed: "unknown", doctor: "unknown" });
            }}
          >
            Confirm patient context change
          </button>
          {patient && <ul className="mt-2 list-disc pl-4 text-xs text-slate-300">{CLINICAL_WORKSPACE.map((item) => <li key={item}>{item}</li>)}</ul>}
        </article>
        <article className="ab-card rounded-xl p-3 text-sm min-w-0">
          <h3 className="font-black">CURRENT CONTEXT</h3>
          <p className="font-bold">PRIMARY — SHOW WHY THE CURRENT PAGE IS OPEN</p>
          <p>Patient: {context.patient}</p>
          <p>Department: {context.department}</p>
          <p>Workflow: {context.workflow}</p>
          <p>Opened by: {context.openedBy}</p>
          <p>Reason: {context.reason}</p>
          <p>Mode: {parsed?.mode ?? "READ"} · Method: {context.activeFunction}</p>
          <p className="text-xs text-slate-400">External web is untrusted until verified. An external page cannot modify a hospital record.</p>
        </article>
      </div>
      <p className="mt-3 text-xs text-slate-400">{contactAction({ text: "find pharmacy", role: "doctor", who: "doctor" }).reason}</p>
    </section>
  );
}
