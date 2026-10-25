// OP Scan sub-page: drag & drop patient intake documents (referral letter,
// previous prescription, lab report), simulate OCR extraction, and hand the
// extracted fields to Voice Registration via the store prefill slot.
// ---------------------------------------------------------------------------
// Where a real vision/OCR call plugs in:
//   const res = await fetch(`${FREELLM_API_BASE}/v1/chat/completions`, { ...
//     messages: [{ role: "user", content: [
//       { type: "text", text: "Extract patient name, age, gender, phone, complaint, department as JSON." },
//       { type: "image_url", image_url: { url: <dataURL of the scan> } }] }] });
// A commented-out stub of that call lives in runExtraction() below.

import { useCallback, useRef, useState } from "react";
import {
  FileText,
  Image as ImageIcon,
  Loader2,
  Mic,
  ScanLine,
  Send,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { GlassCard, SectionTitle } from "@/components/ui";
import { useStore } from "@/lib/store";
import { useSpeechRecognition } from "@/lib/speech";
import { emptyRegistration, parseTranscriptLocal } from "@/lib/registration";
import { cn } from "@/lib/utils";

type Props = { onNavigate: (sub: string) => void };

interface ExtractedFields {
  name: string;
  age: string;
  gender: string;
  phone: string;
  complaint: string;
  department: string;
  mode: string;
}

const SCAN_MS = 2400;

export default function OPScan({ onNavigate }: Props) {
  const { setPrefillReg } = useStore();
  const speech = useSpeechRecognition();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [fields, setFields] = useState<ExtractedFields | null>(null);
  const [notes, setNotes] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const accept = useCallback(
    (f: File) => {
      const ok =
        /^image\/(png|jpe?g|webp|gif)$/i.test(f.type) || /pdf$/i.test(f.type) || /\.(png|jpe?g|webp|gif|pdf)$/i.test(f.name);
      if (!ok) {
        toast.error("Unsupported file — drop an image or PDF");
        return;
      }
      if (preview) URL.revokeObjectURL(preview);
      setFile(f);
      setIsPdf(/pdf$/i.test(f.type) || /\.pdf$/i.test(f.name));
      setPreview(URL.createObjectURL(f));
      setFields(null);
      toast.success(`Loaded ${f.name} — ready to scan`);
    },
    [preview]
  );

  // --------------------------------------------------------------
  // Real extraction call (FreeLLMAPI vision) — kept as a stub:
  //
  // async function callAIExtraction(imageDataUrl: string) {
  //   const res = await fetch(`${FREELLM_API_BASE}/v1/chat/completions`, {
  //     method: "POST",
  //     headers: { "Content-Type": "application/json" },
  //     body: JSON.stringify({
  //       model: "auto",
  //       messages: [{ role: "user", content: [
  //         { type: "text", text: "Return JSON: {name, age, gender, phone, complaint, department, payment_mode}." },
  //         { type: "image_url", image_url: { url: imageDataUrl } },
  //       ] }],
  //     }),
  //   });
  //   const json = await res.json();
  //   return JSON.parse(json.choices?.[0]?.message?.content ?? "{}");
  // }
  // --------------------------------------------------------------

  const runExtraction = async () => {
    if (!file || scanning) return;
    setScanning(true);
    setFields(null);
    await new Promise((r) => setTimeout(r, SCAN_MS));
    // Simulated OCR result — clearly labeled placeholder values.
    const local = parseTranscriptLocal(notes);
    setFields({
      name: local.name || "Suresh Patil (placeholder OCR)",
      age: local.age || "38",
      gender: local.gender || "Male",
      phone: local.phone || "9812345670",
      complaint: local.complaint || notes.trim() || "fever and body ache since 3 days",
      department: local.department || "General Medicine",
      mode: local.mode || "Cash",
    });
    setScanning(false);
    toast.success("Scan complete — review the extracted fields");
  };

  const sendToRegistration = () => {
    if (!fields) return;
    setPrefillReg({
      ...emptyRegistration,
      name: fields.name.replace(" (placeholder OCR)", ""),
      age: fields.age,
      gender: fields.gender,
      phone: fields.phone,
      complaint: fields.complaint,
      department: fields.department,
      mode: (fields.mode === "Card" || fields.mode === "Cash" ? fields.mode : "UPI") as "UPI" | "Card" | "Cash",
    });
    toast.success("Prefilled Voice Registration from scan");
    onNavigate("voice-reg");
  };

  const clearFile = () => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    setFields(null);
    setScanning(false);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* ---------------- drop zone + preview ---------------- */}
        <GlassCard>
          <SectionTitle title="Document Intake" subtitle="Referral letter · old prescription · lab report — PNG / JPG / WEBP / PDF" />
          {!preview ? (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f) accept(f);
              }}
              className={cn(
                "flex h-64 w-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed transition-colors",
                dragOver ? "border-cyan-400/70 bg-cyan-400/10" : "border-white/15 bg-white/[0.02] hover:border-cyan-400/40"
              )}
            >
              <UploadCloud size={40} className={dragOver ? "text-cyan-300" : "text-slate-500"} />
              <div className="text-center">
                <p className="text-sm font-medium text-slate-200">Drop the scanned document here</p>
                <p className="mt-1 text-xs text-slate-500">or click to browse</p>
              </div>
            </button>
          ) : (
            <div className="relative overflow-hidden rounded-lg border border-white/10 bg-white/[0.02]">
              <button
                type="button"
                onClick={clearFile}
                className="absolute right-2 top-2 z-10 rounded-md border border-white/15 bg-black/70 p-1.5 text-slate-400 hover:text-white"
                title="Remove document"
              >
                <X size={15} />
              </button>
              <div className="relative flex h-72 items-center justify-center overflow-hidden bg-black/40">
                {isPdf ? (
                  <div className="flex flex-col items-center gap-2 text-slate-400">
                    <FileText size={52} />
                    <p className="text-xs font-medium text-slate-300">{file?.name}</p>
                    <p className="text-[11px]">PDF loaded — preview not rendered</p>
                  </div>
                ) : (
                  <img src={preview} alt="Scanned document" className="max-h-72 w-auto object-contain" />
                )}
                {scanning && <div className="scanline" />}
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-white/10 px-3 py-2">
                <p className="truncate text-xs text-slate-500">{file?.name}</p>
                <button className="btn-neon !text-xs !py-1.5 shrink-0" onClick={() => void runExtraction()} disabled={scanning}>
                  {scanning ? (
                    <>
                      <Loader2 size={13} className="animate-spin" /> Scanning…
                    </>
                  ) : (
                    <>
                      <Sparkles size={13} /> Extract details
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) accept(f);
              e.target.value = "";
            }}
          />

          {/* optional notes to guide extraction */}
          <div className="mt-4">
            <label className="text-[11px] text-slate-500">Optional: dictate / type notes about this scan</label>
            <div className="flex gap-2 mt-1 items-start">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder='e.g. "referral from Dr. Mehta, suspected typhoid, patient prefers cash"'
                className="input-dark resize-none flex-1"
              />
              <button
                className={cn("btn-ghost !p-2.5", speech.listening && "!border-red-400/60 !text-red-300")}
                disabled={!speech.supported}
                title={speech.supported ? (speech.listening ? "Stop dictation" : "Dictate notes") : "Mic not supported in this browser"}
                onClick={() => {
                  if (speech.listening) {
                    speech.stop();
                    setNotes((prev) => (prev + " " + speech.transcript).trim());
                    speech.reset();
                  } else {
                    speech.reset();
                    speech.start();
                  }
                }}
              >
                <Mic size={15} className={speech.listening ? "animate-pulse" : ""} />
              </button>
            </div>
            {speech.listening && (
              <p className="mt-1.5 text-[11px] text-red-300">
                Listening… {speech.transcript} <span className="text-red-300/60">{speech.interim}</span>
              </p>
            )}
          </div>
        </GlassCard>

        {/* ---------------- extraction result ---------------- */}
        <GlassCard>
          <SectionTitle title="Extraction Result" subtitle="Review before pushing into registration" />
          {!fields ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
              {scanning ? (
                <Loader2 size={34} className="text-cyan-300 animate-spin" />
              ) : (
                <ImageIcon size={34} className="text-slate-600" />
              )}
              <p className="text-xs text-slate-400">{scanning ? "Reading the document…" : "Load a document and run Extract details."}</p>
              <p className="max-w-[300px] text-[11px] text-slate-600 leading-snug">
                Extraction is simulated with placeholder values in this build — a FreeLLMAPI vision call plugs in where marked in
                the code.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-300">
                Simulated OCR output (placeholder values) — verify every field before registering the patient.
              </div>
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    ["Patient name", fields.name],
                    ["Age", fields.age],
                    ["Gender", fields.gender],
                    ["Phone", fields.phone],
                    ["Department", fields.department],
                    ["Payment mode", fields.mode],
                  ] as [string, string][]
                ).map(([k, v]) => (
                  <div key={k}>
                    <p className="text-[11px] text-slate-500">{k}</p>
                    <p className="text-sm font-medium text-white">{v || "—"}</p>
                  </div>
                ))}
                <div className="col-span-2">
                  <p className="text-[11px] text-slate-500">Complaint</p>
                  <p className="text-sm font-medium text-white">{fields.complaint}</p>
                </div>
              </div>
              <button className="btn-neon w-full" onClick={sendToRegistration}>
                <Send size={14} /> Open in Voice Registration
              </button>
              <p className="text-center text-[11px] text-slate-600">
                Fields are prefilled into the Voice Registration form — review and confirm there.
              </p>
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
