import React, { useEffect, useState } from "react";
import { apiFetch } from "@/services/apiFetch";
import { loadMedicationPrefill } from "../clinical/medication/patientSnapshot";
import { HypercubeTabs, type HypercubeTabId, type HypercubeViewModel } from "./HypercubeTabs";
import { approveTreatmentOption, type OrganEdgeView, type TreatmentView } from "./hypercubeView";
import { axesFromMedicationPrefill } from "./snapshotHypercube";

/** Axes come only from the local R5-02 snapshot. Server vectors are not copied in. */
export function CockpitHypercube({ patientId, role = "doctor" }: { patientId?: string; role?: "doctor" | "ward" }) {
  const [tab, setTab] = useState<HypercubeTabId>("map360");
  const [chartStatus, setChartStatus] = useState<"not_loaded" | "loaded">("not_loaded");
  const [view, setView] = useState<HypercubeViewModel | null>(null);

  useEffect(() => {
    let alive = true;
    if (!patientId || role === "ward") {
      setChartStatus("not_loaded");
      setView(null);
      return;
    }
    loadMedicationPrefill(patientId).then((prefill) => {
      if (!alive) return;
      if (!prefill) {
        setChartStatus("not_loaded");
        setView(null);
        return;
      }
      const axes = axesFromMedicationPrefill(prefill);
      setChartStatus("loaded");
      setView((current) => ({ ...(current ?? {}), axes }));
    }).catch(() => {
      if (!alive) return;
      setChartStatus("not_loaded");
      setView(null);
    });
    apiFetch("/api/reflex/clinical/hypercube", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId }),
    }).then((response) => response.json()).then((body) => {
      if (!alive || body?.hidden) return;
      const organEdges = ((body.organEdges ?? []) as OrganEdgeView[]).filter((edge) => edge.reviewStatus === "approved");
      setView((current) => ({
        axes: current?.axes ?? [],
        organEdges,
        treatments: (body.treatments ?? []) as TreatmentView[],
        timeline: body.timeline?.flags ?? [],
      }));
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [patientId, role]);

  if (role === "ward") return null;
  return (
    <HypercubeTabs
      tab={tab}
      view={view}
      chartStatus={chartStatus}
      onTab={setTab}
      onApproveTreatment={(option) => { void approveTreatmentOption(patientId ?? "unknown", option); }}
    />
  );
}
