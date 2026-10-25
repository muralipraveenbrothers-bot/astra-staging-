import React, { useState, useEffect, useCallback } from 'react';
import { usePatient, specialtyInstruments } from '../../context/PatientContext';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Video,
  FileSignature,
  Printer,
  Sparkles,
  ShieldCheck,
  Stethoscope,
  Scissors,
  Check,
  Play,
  ArrowRight,
  ChevronDown,
  Volume2
} from 'lucide-react';
import { toast } from 'sonner';

const specialties = [
  { key: 'ortho', label: 'Orthopaedics' },
  { key: 'general', label: 'General Surgery' },
  { key: 'gastro', label: 'Gastro' },
  { key: 'obg', label: 'OBG' },
  { key: 'ent', label: 'ENT' },
  { key: 'uro', label: 'Urology' },
  { key: 'onco', label: 'Oncology' },
];

interface LayerConfig {
  id: number;
  title: string;
  items: { key: string; label: string }[];
}

const layers: LayerConfig[] = [
  {
    id: 1,
    title: 'Date & OT Prep',
    items: [
      { key: 'l1-1', label: 'Fumigation logs completed and signed (OT-02)' },
      { key: 'l1-2', label: 'Medical gas / O₂ pipeline pressure check — within safe green bounds (50–60 psi)' },
      { key: 'l1-3', label: 'Utility backups verified: UPS, generator, suction, compressed air' },
    ],
  },
  {
    id: 2,
    title: 'Billing Pre-Op Pipeline',
    items: [
      { key: 'l2-1', label: 'UHID sync verified — patient data linked to billing + OT dashboard' },
      { key: 'l2-2', label: 'PAC clearance uploaded and digitally signed by anesthesiologist' },
      { key: 'l2-3', label: 'Blood bank cross-match status confirmed (2 units PRBC reserved)' },
      { key: 'l2-4', label: 'Financial clearance tag applied — insurance / cash / corporate verified' },
    ],
  },
  {
    id: 3,
    title: 'Universal Instruments',
    items: [
      { key: 'l3-1', label: 'Surgical drapes, gowns, sterile gloves — counted and sealed' },
      { key: 'l3-2', label: 'Suction lines tested — Yankauer suction tip, tubing, canister' },
      { key: 'l3-3', label: 'Crash cart readiness — defibrillator, ambu bag, emergency airway kit' },
      { key: 'l3-4', label: 'Advanced intubation gear — video laryngoscope, bougie, stylet, oral airways' },
    ],
  },
  {
    id: 4,
    title: 'Surgery-Specific Sets',
    items: [{ key: 'l4-1', label: 'Specialty selected and instrument checklist loaded' }],
  },
  {
    id: 5,
    title: 'Pre-Anesthesia & Emergency Drugs Tray',
    items: [
      { key: 'l5-1', label: 'Bupivacaine Heavy 0.5% — 4 mL ampoule (spinal dose prepared)' },
      { key: 'l5-2', label: 'Ephedrine 30 mg / mL — vasopressor backup (3 ampoules)' },
      { key: 'l5-3', label: 'Mephentermine 15 mg / mL — alternative vasopressor (2 ampoules)' },
      { key: 'l5-4', label: 'Spinal needles — 25G Quincke / 27G Pencil point (2 each)' },
      { key: 'l5-5', label: 'Propofol 1% — 20 mL vial (induction dose calculated per kg)' },
      { key: 'l5-6', label: 'Succinylcholine 50 mg / mL — rapid sequence intubation (RSI) ready' },
      { key: 'l5-7', label: 'Rocuronium 10 mg / mL — neuromuscular blocker (alternative to SCh)' },
      { key: 'l5-8', label: 'Endotracheal tubes (ETT) — sizes 6.0, 7.0, 7.5, 8.0 mm (cuffed)' },
      { key: 'l5-9', label: 'Laryngoscope blades — Macintosh #3, #4 + Miller #2, #3 (checked + bulbs OK)' },
      { key: 'l5-10', label: 'Ventilator readiness — circuit connected, tidal volume preset, PEEP set' },
      { key: 'l5-11', label: 'Neostigmine 2.5 mg + Atropine 1.2 mg — reversal combo (drawn and labeled)' },
      { key: 'l5-12', label: 'Naloxone 0.4 mg / mL + Flumazenil 0.5 mg / 5 mL — opioid / benzodiazepine antidotes' },
    ],
  },
  {
    id: 6,
    title: 'Patient Consent & Docs',
    items: [
      { key: 'l6-1', label: 'Digital signature tracker — patient + witness + surgeon signed on tablet' },
      { key: 'l6-2', label: '20-second bilingual video consent uploaded (Telugu + English)' },
      { key: 'l6-3', label: 'Anesthesia consent form signed separately and archived' },
    ],
  },
  {
    id: 7,
    title: 'OT camera (demo, not live)',
    items: [
      { key: 'l7-1', label: 'Demo label only. No camera. Not a live feed.' },
      { key: 'l7-2', label: 'Demo label. Nobody was contacted.' },
    ],
  },
  {
    id: 8,
    title: 'Post-OT Handover',
    items: [
      { key: 'l8-1', label: 'Turnover metrics logged — patient out, cleanup start, next case ready time' },
      { key: 'l8-2', label: 'Sterilization timer running — autoclave cycle confirmed for instrument set' },
      { key: 'l8-3', label: 'Pharmacy return logs — unused drugs returned, narcotics double-witnessed' },
      { key: 'l8-4', label: 'Automated clinical notes generated — dictation-enabled, surgeon review pending' },
    ],
  },
];

export const OTDashboard: React.FC = () => {
  const {
    patient,
    toggleCheck,
    setSpecialty,
    toggleSpecCheck,
    getReadinessPercent,
    getMissingItems,
  } = usePatient();

  const [openLayers, setOpenLayers] = useState<Set<number>>(new Set([1, 2, 4, 5]));
  const [timers, setTimers] = useState({ turnover: 0, steril: 0, running: false });
  const [feedStatus, setFeedStatus] = useState('Standby');
  const [notesStatus, setNotesStatus] = useState('Generate clinical notes');
  const [consentUploads, setConsentUploads] = useState({ telugu: true, english: true });

  const toggleLayer = useCallback((id: number) => {
    setOpenLayers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const readiness = getReadinessPercent();
  const missing = getMissingItems();

  useEffect(() => {
    let interval: any;
    if (timers.running) {
      interval = setInterval(() => {
        setTimers((prev) => ({ ...prev, turnover: prev.turnover + 1, steril: prev.steril + 1 }));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timers.running]);

  const fmtTime = (sec: number) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const getLayerScore = (layer: LayerConfig) => {
    const checked = layer.items.filter((item) => patient.checklist[item.key]).length;
    const total = layer.items.length;
    return { checked, total, pct: total > 0 ? (checked / total) * 100 : 0 };
  };

  const getLayerStatus = (layer: LayerConfig) => {
    const { checked, total } = getLayerScore(layer);
    if (checked === total && total > 0) return 'done';
    if (checked > 0) return 'warn';
    return 'alert';
  };

  const renderSpecialtySection = () => (
    <div className="mt-3 pl-2 sm:pl-7 space-y-3">
      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
        Select Specialty
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {specialties.map((s) => (
          <button
            key={s.key}
            onClick={() => setSpecialty(s.key)}
            className={`py-2 px-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer truncate ${
              patient.specialty === s.key
                ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-sm'
                : 'bg-white/[0.03] border-white/10 text-slate-400 hover:text-white hover:bg-white/[0.06]'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      {patient.specialty && (
        <div className="space-y-2 pt-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-cyan-400">
            {patient.specialty.toUpperCase()} Instruments Checklist (10 Items)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(specialtyInstruments[patient.specialty] || []).map((inst, idx) => (
              <div
                key={idx}
                onClick={() => toggleSpecCheck(`spec-${idx}`)}
                className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                  patient.specialtyChecks[`spec-${idx}`]
                    ? 'bg-cyan-950/20 border-cyan-500/30 text-slate-200'
                    : 'bg-white/[0.02] border-white/5 text-slate-400'
                }`}
              >
                <input
                  type="checkbox"
                  checked={!!patient.specialtyChecks[`spec-${idx}`]}
                  onChange={() => {}}
                  className="w-4 h-4 rounded accent-cyan-400 cursor-pointer shrink-0"
                />
                <span className="truncate">{inst}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderLayerBody = (layer: LayerConfig) => {
    if (layer.id === 4) return renderSpecialtySection();

    if (layer.id === 5) {
      return (
        <div className="mt-2 space-y-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-purple-400 mb-2 pl-2 sm:pl-7">
              Spinal Anesthesia Kit
            </div>
            <div className="space-y-1.5 pl-2 sm:pl-7">
              {layer.items.slice(0, 4).map((item) => (
                <CheckRow
                  key={item.key}
                  item={item}
                  checked={!!patient.checklist[item.key]}
                  onToggle={() => toggleCheck(item.key)}
                />
              ))}
            </div>
          </div>

          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-cyan-400 mb-2 pl-2 sm:pl-7">
              General Anesthesia Kit
            </div>
            <div className="space-y-1.5 pl-2 sm:pl-7">
              {layer.items.slice(4, 10).map((item) => (
                <CheckRow
                  key={item.key}
                  item={item}
                  checked={!!patient.checklist[item.key]}
                  onToggle={() => toggleCheck(item.key)}
                />
              ))}
            </div>
          </div>

          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-rose-400 mb-2 pl-2 sm:pl-7">
              Emergency Reversal Drugs (Always Present)
            </div>
            <div className="space-y-1.5 pl-2 sm:pl-7">
              {layer.items.slice(10).map((item) => (
                <CheckRow
                  key={item.key}
                  item={item}
                  checked={!!patient.checklist[item.key]}
                  onToggle={() => toggleCheck(item.key)}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 pl-2 sm:pl-7 pt-2">
            <button
              onClick={() => toast.info(`Shown name stays ${patient.anesthesiologist}. Nobody new was assigned.`)}
              className="bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-bold px-3.5 py-1.5 rounded-xl transition-all cursor-pointer"
            >
              Auto-fill anesthesiologist
            </button>
            <span className="text-xs font-mono text-slate-300">
              Assigned: <strong className="text-white">{patient.anesthesiologist}</strong> (Attending Anesthetist)
            </span>
          </div>
        </div>
      );
    }

    if (layer.id === 6) {
      return (
        <div className="mt-2 space-y-3">
          <div className="space-y-1.5 pl-2 sm:pl-7">
            {layer.items.map((item) => (
              <CheckRow
                key={item.key}
                item={item}
                checked={!!patient.checklist[item.key]}
                onToggle={() => toggleCheck(item.key)}
              />
            ))}
          </div>
          <div className="flex gap-3 pl-2 sm:pl-7 pt-1">
            {(['telugu', 'english'] as const).map((lang) => (
              <div
                key={lang}
                onClick={() => {
                  setConsentUploads((prev) => ({ ...prev, [lang]: !prev[lang] }));
                  toast.info(`${lang.toUpperCase()} consent video status toggled.`);
                }}
                className={`flex-1 p-3.5 rounded-xl border text-center cursor-pointer transition-all ${
                  consentUploads[lang]
                    ? 'bg-emerald-950/30 border-emerald-500/50 text-emerald-300'
                    : 'bg-white/[0.02] border-white/10 text-slate-400'
                }`}
              >
                <div className="text-[10px] font-mono uppercase">{lang === 'telugu' ? 'Telugu Video (20s)' : 'English Video (20s)'}</div>
                <div className="text-xs font-bold mt-1 flex items-center justify-center gap-1">
                  {consentUploads[lang] ? <><CheckCircle2 size={13} /> Marked on this screen only</> : 'Upload / Verify Clip'}
                </div>
              </div>
            ))}
          </div>
          <div className="pl-2 sm:pl-7 pt-1">
            <a
              href="#/consent"
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-bold transition-all cursor-pointer"
            >
              <Sparkles size={13} /> Open Auto-Consent &amp; Procedure Notes Generator
            </a>
          </div>
        </div>
      );
    }

    if (layer.id === 7) {
      return (
        <div className="mt-2 space-y-3 pl-2 sm:pl-7">
          <div className="space-y-1.5">
            {layer.items.map((item) => (
              <CheckRow
                key={item.key}
                item={item}
                checked={!!patient.checklist[item.key]}
                onToggle={() => toggleCheck(item.key)}
              />
            ))}
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={() => {
                setFeedStatus('Testing feed...');
                setTimeout(() => {
                  setFeedStatus('Demo label only — no camera — 1080p @ 30fps, latency 120ms');
                  toast.info('No camera was contacted. This is not a live OT feed.');
                }, 800);
              }}
              className="bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-bold px-3.5 py-1.5 rounded-xl transition-all cursor-pointer"
            >
              Test feed connectivity
            </button>
            <span className={`text-xs font-mono ${feedStatus.includes('active') ? 'text-emerald-400' : 'text-slate-400'}`}>
              {feedStatus}
            </span>
          </div>
        </div>
      );
    }

    if (layer.id === 8) {
      const nextCaseTime = new Date();
      nextCaseTime.setMinutes(nextCaseTime.getMinutes() + 45);
      return (
        <div className="mt-2 space-y-3 pl-2 sm:pl-7">
          <div className="space-y-1.5">
            {layer.items.map((item) => (
              <CheckRow
                key={item.key}
                item={item}
                checked={!!patient.checklist[item.key]}
                onToggle={() => toggleCheck(item.key)}
              />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2.5 pt-2">
            <TurnoverCard label="Turnover timer" value={fmtTime(timers.turnover)} />
            <TurnoverCard label="Sterilization" value={fmtTime(timers.steril)} />
            <TurnoverCard
              label="Next case ETA"
              value={`${nextCaseTime.getHours().toString().padStart(2, '0')}:${nextCaseTime.getMinutes().toString().padStart(2, '0')}`}
            />
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={() => {
                setTimers((prev) => ({ ...prev, running: true }));
                toast.success('Turnover & Sterilization timers started.');
              }}
              disabled={timers.running}
              className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-xs font-bold px-3.5 py-1.5 rounded-xl transition-all cursor-pointer"
            >
              Start timers
            </button>
            <button
              onClick={() => {
                setNotesStatus('Generating notes...');
                setTimeout(() => {
                  setNotesStatus('No note written — awaiting surgeon review');
                  toast.info('No clinical note was written. This button does not generate a note.');
                }, 1000);
              }}
              className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold px-3.5 py-1.5 rounded-xl transition-all cursor-pointer"
            >
              {notesStatus}
            </button>
            <a
              href="#/consent"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 text-xs font-bold transition-all cursor-pointer"
            >
              <Sparkles size={13} /> Open Notes Editor
            </a>
          </div>
        </div>
      );
    }

    return (
      <div className="mt-2 space-y-1.5 pl-2 sm:pl-7">
        {layer.items.map((item) => (
          <CheckRow
            key={item.key}
            item={item}
            checked={!!patient.checklist[item.key]}
            onToggle={() => toggleCheck(item.key)}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5 font-sans">
      {/* Top Bar Header */}
      <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-cyan-950 rounded-2xl p-5 border border-cyan-500/30 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-cyan-400" />
            <h1 className="text-lg font-black text-white">ASTRA AI — OT &amp; Billing Command Center</h1>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono mt-1.5 flex-wrap text-slate-300">
            <div><span className="text-slate-500">UHID:</span> <strong className="text-cyan-300">{patient.uhid}</strong></div>
            <div><span className="text-slate-500">Patient:</span> <strong className="text-white">{patient.name}</strong></div>
            <div><span className="text-slate-500">Surgery:</span> <strong className="text-white">{patient.surgery}</strong></div>
            <div><span className="text-slate-500">Theatre:</span> <strong className="text-purple-300">{patient.otNumber}</strong></div>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-center">
          <div className="text-right">
            <div className="text-[10px] uppercase font-mono text-slate-400">Readiness</div>
            <div className="text-xs font-mono text-slate-500">8 Layers Combined</div>
          </div>
          <div
            className={`w-14 h-14 rounded-2xl border-2 flex items-center justify-center text-lg font-bold font-mono shadow-inner ${
              readiness >= 90
                ? 'border-emerald-500 text-emerald-400 bg-emerald-950/30 shadow-emerald-500/20'
                : readiness >= 50
                ? 'border-amber-500 text-amber-400 bg-amber-950/30 shadow-amber-500/20'
                : 'border-rose-500 text-rose-400 bg-rose-950/30 shadow-rose-500/20'
            }`}
          >
            {readiness}%
          </div>
        </div>
      </div>

      {/* Authority Alert Banner */}
      {missing.length > 0 && readiness < 100 && (
        <div className="p-3.5 rounded-2xl bg-rose-950/40 border border-rose-500/50 flex items-start gap-3 text-rose-200 text-xs shadow-lg animate-in fade-in duration-200">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5 animate-pulse" />
          <div>
            <strong className="text-rose-300">Authority Alert:</strong> Missing mandatory checkpoints — {missing.join(', ')}.
            <p className="text-[11px] text-rose-300/80 mt-0.5">
              Escalated in real-time to Hospital Authority + OT Command Center + Billing Dispatch.
            </p>
          </div>
        </div>
      )}

      {/* 8 Accordion Layers */}
      <div className="space-y-3">
        {layers.map((layer) => {
          const status = getLayerStatus(layer);
          const { checked, total } = getLayerScore(layer);
          const isOpen = openLayers.has(layer.id);

          return (
            <div
              key={layer.id}
              className="rounded-2xl border border-white/10 bg-slate-900/90 overflow-hidden shadow-sm transition-all"
            >
              <div
                onClick={() => toggleLayer(layer.id)}
                className="flex items-center justify-between p-4 cursor-pointer select-none bg-white/[0.02] hover:bg-white/[0.05] transition-all"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold font-mono ${
                      status === 'done'
                        ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/30'
                        : status === 'warn'
                        ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30'
                        : 'bg-white/10 text-slate-300'
                    }`}
                  >
                    {layer.id}
                  </div>
                  <h3 className="text-sm font-bold text-white">{layer.title}</h3>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`text-xs font-mono font-bold px-2.5 py-0.5 rounded-lg border ${
                      status === 'done'
                        ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                        : status === 'warn'
                        ? 'bg-amber-950/40 border-amber-500/40 text-amber-300'
                        : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                    }`}
                  >
                    {checked}/{total}
                  </span>
                  <ChevronDown
                    size={16}
                    className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                  />
                </div>
              </div>

              {isOpen && (
                <div className="p-4 pt-1 border-t border-white/5">
                  {renderLayerBody(layer)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const CheckRow: React.FC<{ item: { key: string; label: string }; checked: boolean; onToggle: () => void }> = ({
  item,
  checked,
  onToggle,
}) => (
  <div
    onClick={onToggle}
    className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
      checked
        ? 'bg-cyan-950/20 border-cyan-500/30 text-slate-200'
        : 'bg-white/[0.02] border-white/5 text-slate-400 hover:bg-white/[0.04]'
    }`}
  >
    <input
      type="checkbox"
      checked={checked}
      onChange={() => {}}
      className="w-4 h-4 rounded accent-cyan-400 cursor-pointer shrink-0"
    />
    <label className="cursor-pointer flex-1 select-none">{item.label}</label>
  </div>
);

const TurnoverCard: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="p-3 rounded-xl border border-white/10 bg-white/[0.02] text-center">
    <div className="text-lg font-bold font-mono text-cyan-300">{value}</div>
    <div className="text-[10px] text-slate-400 mt-0.5">{label}</div>
  </div>
);

export default OTDashboard;
