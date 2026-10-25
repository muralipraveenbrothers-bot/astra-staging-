import React from "react";
import { Activity, Clock, GitBranch, ListChecks, Map, Pill, Route, Stethoscope } from "lucide-react";
import { confirmBadge, documentedAxes, visibleOrganEdges, type AxisView, type OrganEdgeView, type TreatmentView } from "./hypercubeView";

export const HYPERCUBE_TABS = [
  { id: "map360", label: "360 map", icon: Map },
  { id: "vectors", label: "7D vectors", icon: Activity },
  { id: "ddx", label: "DDx graph", icon: GitBranch },
  { id: "organs", label: "Organ-system graph", icon: Route },
  { id: "investigations", label: "Investigation matrix", icon: ListChecks },
  { id: "treatments", label: "Treatment matrix", icon: Pill },
  { id: "trajectory", label: "Trajectory / response", icon: Stethoscope },
  { id: "timeline", label: "Timeline", icon: Clock },
] as const;

export type HypercubeTabId = (typeof HYPERCUBE_TABS)[number]["id"];

export interface HypercubeViewModel {
  axes?: AxisView[];
  organEdges?: OrganEdgeView[];
  ddx?: string[];
  investigations?: string[];
  treatments?: TreatmentView[];
  trajectory?: string[];
  timeline?: string[];
  map360?: string[];
}

export function HypercubeTabs({
  tab,
  view,
  onTab,
  onApproveTreatment,
  chartStatus,
}: {
  tab: HypercubeTabId;
  view: HypercubeViewModel | null;
  onTab: (tab: HypercubeTabId) => void;
  onApproveTreatment: (option: string) => void;
  /** When the R5-02 snapshot was not loaded, hide chart tables instead of inventing them. */
  chartStatus?: "not_loaded" | "loaded";
}) {
  const edges = visibleOrganEdges(view?.organEdges ?? []);
  const facts = documentedAxes(view?.axes ?? []);
  const drafts = (view?.axes ?? []).filter((axis) => confirmBadge(axis.status));
  const empty = !view || (!facts.length && !edges.length && !(view.ddx?.length) && !(view.treatments?.length) && !(view.timeline?.length));
  return (
    <div>
      <div role="tablist" aria-label="Clinical hypercube" className="flex flex-wrap gap-1">
        {HYPERCUBE_TABS.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} data-astra-control={item.id} data-astra-name={item.label} data-astra-kind="tab" onClick={() => onTab(item.id)} className="flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-[10px] focus:outline-none focus:ring-2 focus:ring-cyan-400">
              <Icon size={12} aria-hidden />{item.label}
            </button>
          );
        })}
      </div>
      {chartStatus === "not_loaded" && <p>not loaded</p>}
      {chartStatus !== "not_loaded" && empty && <p>No documented data</p>}
      {chartStatus !== "not_loaded" && tab === "vectors" && drafts.map((axis) => (
        <p key={axis.axis}>{axis.axis}: draft: confirm</p>
      ))}
      {chartStatus !== "not_loaded" && tab === "vectors" && facts.map((axis) => (
        <p key={axis.axis}>{axis.axis}: {axis.value}</p>
      ))}
      {chartStatus !== "not_loaded" && tab === "organs" && edges.map((edge) => (
        <p key={edge.id}>{edge.from} to {edge.to} stage {edge.stage}</p>
      ))}
      {chartStatus !== "not_loaded" && tab === "treatments" && (view?.treatments ?? []).map((row) => (
        <div key={row.option}>
          <p>{row.option}</p>
          {row.avoidBecause.map((item) => <p key={item}>{item}</p>)}
          <button type="button" data-astra-control={`treatment-${row.option}`} data-astra-name="Approve" data-astra-kind="button" data-astra-sensitive="approval" onClick={() => onApproveTreatment(row.option)}>Approve</button>
        </div>
      ))}
      {chartStatus !== "not_loaded" && tab === "timeline" && (view?.timeline ?? []).map((item) => <p key={item}>{item}</p>)}
    </div>
  );
}
