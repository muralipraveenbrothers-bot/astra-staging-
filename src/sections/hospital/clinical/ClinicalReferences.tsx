import { useState } from "react";
import { BookOpen, ExternalLink, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { GlassCard, SectionTitle, Badge, Modal } from "@/components/ui";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { cn, uid, nowTime } from "@/lib/utils";
import type { ClinicalReference } from "@/lib/types";

export default function ClinicalReferences({ patientId, patientName }: { patientId: string; patientName: string }) {
  const { account } = useAuth();
  const { clinicalReferences, setClinicalReferences, logAudit } = useStore();
  const doctorName = account?.name ?? "Dr. Admin";
  const [refs, setRefs] = useState<ClinicalReference[]>(clinicalReferences);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [source, setSource] = useState("");
  const [url, setUrl] = useState("");
  const [summary, setSummary] = useState("");
  const [tags, setTags] = useState("");

  const sync = (d: ClinicalReference[]) => { setRefs(d); setClinicalReferences(d); };

  const filtered = refs.filter((r) =>
    !search || r.title.toLowerCase().includes(search.toLowerCase()) ||
    r.specialty.toLowerCase().includes(search.toLowerCase()) ||
    r.tags.some((t) => t.includes(search.toLowerCase()))
  );

  const addRef = () => {
    if (!title.trim()) { toast.error("Enter title"); return; }
    const r: ClinicalReference = {
      id: uid("cref"), title: title.trim(), specialty, source, url,
      summary, tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      addedBy: doctorName, addedAt: nowTime(),
    };
    sync([r, ...refs]);
    logAudit("Clinical reference added", `${r.title}`, doctorName);
    setAddOpen(false); setTitle(""); setSpecialty(""); setSource(""); setUrl(""); setSummary(""); setTags("");
    toast.success("Reference added");
  };

  const removeRef = (id: string) => {
    sync(refs.filter((r) => r.id !== id));
    logAudit("Reference removed", `${refs.find((r) => r.id === id)?.title}`, doctorName);
    toast.success("Reference removed");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionTitle title="Clinical References" subtitle="Guidelines, protocols, and evidence-based resources" />
        <button className="btn-neon" onClick={() => setAddOpen(true)}><Plus size={14} /> Add Reference</button>
      </div>

      <GlassCard className="!p-3">
        <div className="flex items-center gap-2">
          <Search size={14} className="text-slate-500" />
          <input className="input-dark !border-0 !bg-transparent !px-0 flex-1" placeholder="Search references by title, specialty, tags…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </GlassCard>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filtered.map((r) => (
          <GlassCard key={r.id} className="!p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <BookOpen size={14} className="text-amber-400 shrink-0" />
                  <span className="text-sm font-semibold text-white truncate">{r.title}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <Badge tone="violet" className="!text-[8px]">{r.specialty}</Badge>
                  <Badge tone="neutral" className="!text-[8px]">{r.source}</Badge>
                </div>
                <p className="text-xs text-slate-400 mt-1">{r.summary}</p>
                {r.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {r.tags.map((t, i) => <Badge key={i} tone="cyan" className="!text-[7px]">{t}</Badge>)}
                  </div>
                )}
                <p className="text-[10px] text-slate-500 mt-1">Added by {r.addedBy} · {r.addedAt}</p>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                {r.url && (
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="btn-ghost !text-xs !py-1">
                    <ExternalLink size={12} /> Open
                  </a>
                )}
                <button className="btn-ghost !text-xs !py-1 hover:!border-red-400/50 hover:!text-red-300" onClick={() => removeRef(r.id)}>
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          </GlassCard>
        ))}
        {filtered.length === 0 && (
          <div className="md:col-span-2">
            <GlassCard>
              <p className="text-sm text-slate-500 text-center py-4">No references found.</p>
            </GlassCard>
          </div>
        )}
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Clinical Reference">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-400 mb-1 block">Title</label>
            <input className="input-dark" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-400 mb-1 block">Specialty</label>
              <input className="input-dark" placeholder="e.g. Cardiology" value={specialty} onChange={(e) => setSpecialty(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400 mb-1 block">Source</label>
              <input className="input-dark" placeholder="e.g. UpToDate" value={source} onChange={(e) => setSource(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 mb-1 block">URL</label>
            <input className="input-dark" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 mb-1 block">Summary</label>
            <textarea className="input-dark resize-none" rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 mb-1 block">Tags (comma separated)</label>
            <input className="input-dark" placeholder="e.g. hypertension, guidelines" value={tags} onChange={(e) => setTags(e.target.value)} />
          </div>
          <div className="flex gap-2 justify-end">
            <button className="btn-ghost" onClick={() => setAddOpen(false)}>Cancel</button>
            <button className="btn-neon" onClick={addRef}><Plus size={14} /> Add</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
