import { User, Scan, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Patient } from "@/types";

interface Props {
  patient: Patient | null;
  mods: string[];
  headCt: string | null;
  legCt: string | null;
  donorLeg: "Left" | "Right";
  setDonorLeg: (l: "Left" | "Right") => void;
  onOpenRadio: () => void;
}

export function LeftPanel({ patient, mods, headCt, legCt, donorLeg, setDonorLeg, onOpenRadio }: Props) {
  return (
    <aside className="col-span-3 min-h-0 overflow-y-auto border-r border-slate-700/40 bg-slate-900/30">
      <div className="p-3 space-y-3">
        <div className="rounded-lg border border-slate-700/40 bg-slate-900/60 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase text-slate-400"><User size={11} /> Patient</div>
          {patient ? (
            <div className="space-y-1 text-[11px]">
              <div className="font-semibold text-white">{patient.name}</div>
              <div className="text-slate-400">{patient.uhid} · {patient.age}y · {patient.gender}</div>
              {patient.primaryDiagnosis && <div className="mt-1 rounded bg-rose-500/10 px-2 py-0.5 text-rose-300">Dx: {patient.primaryDiagnosis}</div>}
            </div>
          ) : <div className="text-[11px] text-slate-500">No patient</div>}
        </div>

        {/* CTs */}
        <div className="rounded-lg border border-slate-700/40 bg-slate-900/60 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase text-slate-400"><Scan size={11} /> CTs</div>
          <div className="flex items-center justify-between gap-1 text-[10px]">
            <span className="text-slate-400">Mandible CT</span>
            <span className={headCt ? "text-emerald-300" : "text-slate-600"}>{headCt || "Not selected"}</span>
          </div>
          <div className="flex items-center justify-between gap-1 text-[10px]">
            <span className="text-slate-400">Leg/s CT</span>
            <span className={legCt ? "text-emerald-300" : "text-slate-600"}>{legCt || "Not selected"}</span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-1 text-[10px]">
            <span className="text-slate-400">Donor leg</span>
            <div className="flex gap-1">
              {(["Left", "Right"] as const).map((s) => (
                <button key={s} onClick={() => setDonorLeg(s)} className={cn(s === donorLeg ? "bg-purple-500/20 text-purple-300 border border-purple-500/40" : "bg-slate-800 text-slate-400 border border-slate-700 hover:text-slate-200")}>{s}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Imaging */}
        <div className="rounded-lg border border-slate-700/40 bg-slate-900/60 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase text-slate-400"><Scan size={11} /> Imaging</div>
          {mods.length > 0 ? <div className="flex flex-wrap gap-1">{mods.map((m) => <span key={m} className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] text-cyan-300">{m}</span>)}</div> : <div className="text-[10px] text-slate-500">None</div>}
          <button onClick={onOpenRadio} className="mt-2 flex items-center gap-1 rounded border border-slate-600/40 bg-slate-800 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-700"><FileText size={10} /> Open Radiology</button>
        </div>

        {/* Safety banner */}
        <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3">
          <div className="text-[9px] font-bold text-amber-300">CLINICAL SAFETY</div>
          <div className="mt-1 text-[9px] text-amber-200/70">Advanced reconstruction planning tool. Clinician review required. Verify imaging, segmentation, measurements and surgical guide accuracy before clinical use. Not FDA approved.</div>
        </div>
      </div>
    </aside>
  );
}