import React from "react";
import type { CauseFinderPayload, SkillListItem, VaultListItem } from "./suggestionModel";
import { suggestionLabel } from "./suggestionModel";

/** Suggestions beside the shadow questions. Approval is a button. Nothing here places an order. */
export function CockpitSuggestionsView({
  role,
  knowledge,
  skills,
  causeFinder,
  onApprove,
}: {
  role: "doctor" | "ward";
  knowledge: VaultListItem[] | "not_loaded";
  skills: SkillListItem[] | "not_loaded";
  causeFinder: CauseFinderPayload | null;
  onApprove: (text: string) => void;
}) {
  if (role === "ward") return <p>Red flags only</p>;
  return (
    <section aria-label="Cockpit suggestions" className="space-y-2 rounded border border-slate-800 p-2">
      <h3 className="font-bold text-slate-200">Suggestions</h3>
      <p>Doctor must approve. No auto-orders. These are suggestions, not a diagnosis.</p>
      <h4 className="font-semibold text-slate-300">Knowledge vault</h4>
      {knowledge === "not_loaded" && <p>not loaded</p>}
      {knowledge !== "not_loaded" && knowledge.length === 0 && <p>No validated knowledge items</p>}
      {knowledge !== "not_loaded" && knowledge.map((item) => (
        <article key={item.id}>
          <p>{suggestionLabel(String(item.title))}</p>
          <button type="button" data-astra-control={`vault-${item.id}`} data-astra-name={`Approve ${item.title}`} data-astra-kind="button" data-astra-sensitive="approval" onClick={() => onApprove(suggestionLabel(String(item.title)))}>Approve suggestion</button>
        </article>
      ))}
      <h4 className="font-semibold text-slate-300">Book skills</h4>
      {skills === "not_loaded" && <p>not loaded</p>}
      {skills !== "not_loaded" && skills.length === 0 && <p>No validated book skills</p>}
      {skills !== "not_loaded" && skills.map((skill) => (
        <article key={skill.id}>
          <p>{suggestionLabel(String(skill.name))}</p>
          {skill.purpose && <p>{suggestionLabel(String(skill.purpose))}</p>}
          <button type="button" data-astra-control={`skill-${skill.id}`} data-astra-name={`Approve ${skill.name}`} data-astra-kind="button" data-astra-sensitive="approval" onClick={() => onApprove(suggestionLabel(String(skill.name)))}>Approve suggestion</button>
        </article>
      ))}
      <h4 className="font-semibold text-slate-300">Cause-finder</h4>
      {!causeFinder && <p>not loaded</p>}
      {causeFinder && (
        <div>
          <p>{suggestionLabel(causeFinder.causeChain || "Cause chain not loaded")}</p>
          {(causeFinder.items ?? []).map((item) => (
            <article key={item.id}>
              <p>{suggestionLabel(item.text)}</p>
              <button type="button" data-astra-control={item.id} data-astra-name={`Approve ${item.id}`} data-astra-kind="button" data-astra-sensitive="approval" onClick={() => onApprove(suggestionLabel(item.text))}>Approve suggestion</button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
