import { useState } from "react";
import { Camera, CheckCircle2, Upload } from "lucide-react";
import { toast } from "sonner";
import type { WardBed, VitalRecord } from "./types";

export function WardVitalsCapture({ beds, onApprove }: { beds: WardBed[]; onApprove: (bedId: string, vital: VitalRecord) => void }) {
  const occupied = beds.filter((bed) => bed.status === "Occupied" && bed.patientName);
  const [bedId, setBedId] = useState(occupied[0]?.bedId ?? "");
  const [result, setResult] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [parsed, setParsed] = useState<Partial<VitalRecord> | null>(null);

  async function scan(next: File) {
    setFile(next); setBusy(true); setParsed(null); setResult("");
    try {
      const bytes = new Uint8Array(await next.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      const response = await fetch("/api/ward/vitals-ocr", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mimeType: next.type, dataBase64: btoa(binary) }) });
      const body = await response.json() as { text?: string; error?: string };
      if (!response.ok) throw new Error(body.error || "OCR failed");
      setResult(body.text || "");
      try { setParsed(JSON.parse(body.text || "{}") as Partial<VitalRecord>); } catch { setParsed(null); }
    } catch (error) { toast.error("Monitor photo scan failed", { description: error instanceof Error ? error.message : String(error) }); }
    finally { setBusy(false); }
  }

  function approve() {
    if (!bedId || !parsed || ![parsed.hr, parsed.bpSystolic, parsed.bpDiastolic, parsed.temp, parsed.rr, parsed.spo2].every((value) => typeof value === "number")) {
      toast.error("Doctor review required", { description: "OCR must return complete numeric vitals before approval." }); return;
    }
    onApprove(bedId, { id: `ocr-${Date.now()}`, timestamp: new Date().toLocaleTimeString("en-IN"), date: new Date().toISOString().slice(0, 10), hr: parsed.hr!, bpSystolic: parsed.bpSystolic!, bpDiastolic: parsed.bpDiastolic!, temp: parsed.temp!, rr: parsed.rr!, spo2: parsed.spo2!, recordedBy: "Ward monitor review", role: "Monitor OCR" });
    toast.success("Vitals approved", { description: "The reviewed monitor reading was added to the selected bed." });
    setParsed(null); setResult(""); setFile(null);
  }

  return <section className="rounded-2xl border border-violet-400/20 bg-slate-900 p-4">
    <div className="flex items-center gap-2"><Camera className="h-4 w-4 text-violet-300" /><h2 className="text-sm font-black text-white">Monitor photo → vitals</h2></div>
    <p className="mt-1 text-[10px] text-slate-400">OCR is a draft only. A doctor must review and approve before it enters the ward record.</p>
    <div className="mt-3 flex flex-wrap gap-2">
      <select value={bedId} onChange={(event) => setBedId(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-xs text-white"><option value="">Select occupied bed</option>{occupied.map((bed) => <option key={bed.bedId} value={bed.bedId}>{bed.bedId} · {bed.patientName}</option>)}</select>
      <label className="cursor-pointer rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold text-white"><Upload className="mr-1 inline h-3 w-3" />{busy ? "Scanning…" : "Upload monitor photo"}<input className="sr-only" type="file" accept="image/*" disabled={busy} onChange={(event) => { const next = event.target.files?.[0]; if (next) void scan(next); event.currentTarget.value = ""; }} /></label>
    </div>
    {file && <p className="mt-2 text-[10px] text-violet-200">{file.name}</p>}
    {result && <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-2 text-[10px] text-slate-300">{result}</pre>}
    {parsed && <button onClick={approve} className="mt-3 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white"><CheckCircle2 className="mr-1 inline h-3 w-3" />Approve and add to bed record</button>}
  </section>;
}
