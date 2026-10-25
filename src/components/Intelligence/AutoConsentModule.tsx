import React, { useState, useCallback, useRef, useEffect } from 'react';
import { surgeryTemplates, surgeryGroups } from '../../data/surgeryTemplates';
import { anesthesiaTemplates, anesthesiaOptions } from '../../data/anesthesiaTemplates';
import {
  generateConsentForm,
  generateSurgeryNotes,
  generateAnesthesiaNotes,
  PatientInfo,
} from '../../utils/documentGenerators';
import { parseSpeechInput } from '../../utils/speechParser';
import {
  FileSignature,
  FileText,
  Mic,
  MicOff,
  Printer,
  Download,
  Send,
  Copy,
  Trash2,
  CheckCircle2,
  Sparkles,
  ChevronDown,
  Activity,
  Stethoscope,
  Volume2
} from 'lucide-react';
import { toast } from 'sonner';

interface DispatchLogEntry {
  id: number;
  time: string;
  type: string;
  action: string;
}

export const AutoConsentModule: React.FC = () => {
  const [patient] = useState<PatientInfo>({
    uhid: 'UHID-2026-08421',
    name: 'R. Venkatesh',
    ageSex: '58 / M',
    otNumber: 'OT-02',
    surgeon: 'Dr. Arjun Rao',
    anesthesiologist: 'Dr. S. Reddy, M.D.',
  });

  const [surgeryKey, setSurgeryKey] = useState<string>('tibia_nailing');
  const [anesthesiaKey, setAnesthesiaKey] = useState<string>('spinal');
  const [consentText, setConsentText] = useState('');
  const [surgeryNotes, setSurgeryNotes] = useState('');
  const [anesthesiaNotes, setAnesthesiaNotes] = useState('');
  const [speechInput, setSpeechInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [dispatchLog, setDispatchLog] = useState<DispatchLogEntry[]>([]);
  const [openSections, setOpenSections] = useState<Set<number>>(new Set([1, 2, 3, 4, 5]));
  const logIdRef = useRef(0);

  const toggleSection = useCallback((id: number) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const addLog = useCallback((type: string, action: string) => {
    logIdRef.current += 1;
    const time = new Date().toLocaleTimeString('en-GB');
    setDispatchLog((prev) => [...prev, { id: logIdRef.current, time, type, action }]);
  }, []);

  const generateAll = useCallback(() => {
    if (!surgeryKey || !anesthesiaKey) {
      toast.error('Missing Selection: Please select both Surgery Type and Anesthesia Type first.');
      return;
    }

    const sData = surgeryTemplates[surgeryKey];
    const aData = anesthesiaTemplates[anesthesiaKey];

    if (!sData || !aData) return;

    setConsentText(generateConsentForm(sData, aData, patient));
    setSurgeryNotes(generateSurgeryNotes(sData, patient));
    setAnesthesiaNotes(generateAnesthesiaNotes(aData, patient));

    setOpenSections(new Set([1, 2, 3, 4, 5]));
    toast.success('Auto-Generated All Clinical Documents', {
      description: `${sData.name} + ${aData.name} synced with patient ${patient.uhid}.`,
    });
  }, [surgeryKey, anesthesiaKey, patient]);

  // Initial auto-generation on load
  useEffect(() => {
    generateAll();
  }, []);

  const processSpeech = useCallback(() => {
    const raw = speechInput.trim();
    if (!raw) return;

    const result = parseSpeechInput(raw);

    if (result.surgeryKey || result.anesthesiaKey) {
      const newSKey = result.surgeryKey || surgeryKey;
      const newAKey = result.anesthesiaKey || anesthesiaKey;

      if (result.surgeryKey) setSurgeryKey(result.surgeryKey);
      if (result.anesthesiaKey) setAnesthesiaKey(result.anesthesiaKey);

      toast.success('Speech Detected & Parsed', {
        description: `Auto-selected: ${result.matchedPhrases.join(' + ')}. Regenerating documents...`,
      });

      setTimeout(() => {
        const sData = surgeryTemplates[newSKey];
        const aData = anesthesiaTemplates[newAKey];
        if (sData && aData) {
          setConsentText(generateConsentForm(sData, aData, patient));
          setSurgeryNotes(generateSurgeryNotes(sData, patient));
          setAnesthesiaNotes(generateAnesthesiaNotes(aData, patient));
          setOpenSections(new Set([1, 2, 3, 4, 5]));
        }
      }, 100);
    } else {
      toast.error('No matching surgery or anesthesia found in phrase.', {
        description: 'Try: "Tibia nailing spinal", "Appendectomy GA", "LSCS epidural", etc.',
      });
    }

    setIsRecording(false);
  }, [speechInput, surgeryKey, anesthesiaKey, patient]);

  const toggleSpeech = useCallback(() => {
    // Check if browser supports Web Speech API
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition && !isRecording) {
      try {
        const recognition = new SpeechRecognition();
        recognition.lang = 'en-US';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
          setIsRecording(true);
          toast.info('Listening for surgery or anesthesia name...');
        };

        recognition.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          setSpeechInput(transcript);
          setIsRecording(false);
          toast.success(`Voice Captured: "${transcript}"`);
          // Trigger parsing
          setTimeout(() => {
            const res = parseSpeechInput(transcript);
            if (res.surgeryKey || res.anesthesiaKey) {
              if (res.surgeryKey) setSurgeryKey(res.surgeryKey);
              if (res.anesthesiaKey) setAnesthesiaKey(res.anesthesiaKey);
              const sData = surgeryTemplates[res.surgeryKey || surgeryKey];
              const aData = anesthesiaTemplates[res.anesthesiaKey || anesthesiaKey];
              if (sData && aData) {
                setConsentText(generateConsentForm(sData, aData, patient));
                setSurgeryNotes(generateSurgeryNotes(sData, patient));
                setAnesthesiaNotes(generateAnesthesiaNotes(aData, patient));
              }
            }
          }, 150);
        };

        recognition.onerror = () => {
          setIsRecording(false);
          toast.info('Switched to speech text simulator. Type below and click Detect.');
        };

        recognition.onend = () => {
          setIsRecording(false);
        };

        recognition.start();
        return;
      } catch (err) {
        // fallback
      }
    }

    setIsRecording((prev) => {
      const next = !prev;
      if (!next && speechInput.trim()) {
        setTimeout(processSpeech, 100);
      }
      return next;
    });
  }, [isRecording, speechInput, processSpeech, surgeryKey, anesthesiaKey, patient]);

  const downloadDoc = useCallback(
    (type: 'consent' | 'surgery' | 'anesthesia') => {
      const content =
        type === 'consent'
          ? consentText
          : type === 'surgery'
          ? surgeryNotes
          : anesthesiaNotes;
      if (!content.trim()) {
        toast.error('Document is empty. Generate first.');
        return;
      }
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ASTRA_AI_${type.toUpperCase()}_${patient.uhid}_${new Date().toISOString().slice(0, 10)}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      addLog(type, 'Downloaded as document');
      toast.success(`${type.toUpperCase()} downloaded successfully.`);
    },
    [consentText, surgeryNotes, anesthesiaNotes, patient.uhid, addLog]
  );

  const printDoc = useCallback(
    (type: 'consent' | 'surgery' | 'anesthesia') => {
      const content =
        type === 'consent'
          ? consentText
          : type === 'surgery'
          ? surgeryNotes
          : anesthesiaNotes;
      if (!content.trim()) {
        toast.error('Document is empty. Generate first.');
        return;
      }
      const w = window.open('', '_blank');
      if (w) {
        w.document.write(
          `<pre style="font-family:monospace;font-size:12px;line-height:1.6;white-space:pre-wrap;padding:24px;background:#fff;color:#000;">${content.replace(/</g, '&lt;')}</pre>`
        );
        w.document.close();
        w.print();
        addLog(type, 'Sent to physical printer');
        toast.success(`${type.toUpperCase()} sent to printer.`);
      }
    },
    [consentText, surgeryNotes, anesthesiaNotes, addLog]
  );

  const dispatchToReception = useCallback(
    (type: 'consent' | 'surgery' | 'anesthesia') => {
      const content =
        type === 'consent'
          ? consentText
          : type === 'surgery'
          ? surgeryNotes
          : anesthesiaNotes;
      if (!content.trim()) {
        toast.error('Document is empty. Generate first.');
        return;
      }
      addLog(type, `Dispatched to Reception — Printer Queue #${patient.otNumber}`);
      toast.success(
        `Dispatched ${type.toUpperCase()} to Reception Print Queue #${patient.otNumber}`
      );
    },
    [consentText, surgeryNotes, anesthesiaNotes, patient.otNumber, addLog]
  );

  const copyToClipboard = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success(`${label} copied to clipboard.`);
    });
  }, []);

  const clearAll = useCallback(() => {
    setSurgeryKey('');
    setAnesthesiaKey('');
    setConsentText('');
    setSurgeryNotes('');
    setAnesthesiaNotes('');
    setSpeechInput('');
    setDispatchLog([]);
    setOpenSections(new Set([1]));
    toast.info('All documents cleared.');
  }, []);

  const allGenerated = !!consentText && !!surgeryNotes && !!anesthesiaNotes;
  const sData = surgeryKey ? surgeryTemplates[surgeryKey] : null;
  const aData = anesthesiaKey ? anesthesiaTemplates[anesthesiaKey] : null;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5 font-sans">
      {/* Top Bar Header */}
      <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-cyan-950 rounded-2xl p-5 border border-cyan-500/30 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-cyan-400" />
            <h1 className="text-lg font-black text-white">ASTRA AI — Auto-Generated Consent &amp; Procedure Notes</h1>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono mt-1.5 flex-wrap text-slate-300">
            <div><span className="text-slate-500">UHID:</span> <strong className="text-cyan-300">{patient.uhid}</strong></div>
            <div><span className="text-slate-500">Patient:</span> <strong className="text-white">{patient.name}</strong></div>
            <div><span className="text-slate-500">Age/Sex:</span> <strong className="text-white">{patient.ageSex}</strong></div>
            <div><span className="text-slate-500">OT No:</span> <strong className="text-purple-300">{patient.otNumber}</strong></div>
          </div>
        </div>

        <div>
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold font-mono border ${
              allGenerated
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                : 'bg-amber-950/40 border-amber-500/40 text-amber-300'
            }`}
          >
            <CheckCircle2 size={13} />
            {allGenerated ? 'All 3 Documents Ready' : 'Documents Pending'}
          </span>
        </div>
      </div>

      {/* Section 1: Selection & Speech-to-Text */}
      <SectionCard
        id={1}
        title="Surgery Type & Anesthesia Selection (with Voice/Speech Input)"
        isOpen={openSections.has(1)}
        onToggle={() => toggleSection(1)}
        done={!!surgeryKey && !!anesthesiaKey}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-3.5">
          <FormGroup label="Surgeon Name">
            <input type="text" defaultValue={patient.surgeon} className="input-dark w-full" readOnly />
          </FormGroup>
          <FormGroup label="Anesthesiologist">
            <input type="text" defaultValue={patient.anesthesiologist} className="input-dark w-full" readOnly />
          </FormGroup>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-3.5">
          <FormGroup label="Surgery Type (20+ Procedures across 7 Specialties)">
            <select
              value={surgeryKey}
              onChange={(e) => setSurgeryKey(e.target.value)}
              className="input-dark w-full"
            >
              <option value="">-- Select Surgery --</option>
              {surgeryGroups.map((group) => (
                <optgroup key={group.label} label={group.label} className="bg-slate-900 text-white">
                  {group.items.map((key) => (
                    <option key={key} value={key}>
                      {surgeryTemplates[key].name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </FormGroup>

          <FormGroup label="Anesthesia Type">
            <select
              value={anesthesiaKey}
              onChange={(e) => setAnesthesiaKey(e.target.value)}
              className="input-dark w-full"
            >
              <option value="">-- Select Anesthesia --</option>
              {anesthesiaOptions.map((opt) => (
                <option key={opt.key} value={opt.key} className="bg-slate-900 text-white">
                  {opt.label}
                </option>
              ))}
            </select>
          </FormGroup>
        </div>

        {/* Speech-to-Text Bar */}
        <div className="mt-4 p-3.5 rounded-xl border border-cyan-500/30 bg-cyan-950/20 space-y-2">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-cyan-300">
            Speech-to-Text — Say Surgery Name or Anesthesia (Auto-Detects &amp; Fills)
          </label>
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={speechInput}
              onChange={(e) => setSpeechInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && processSpeech()}
              placeholder="Say or type: 'Tibia nailing spinal' or 'Appendectomy GA' or 'LSCS'..."
              className="input-dark flex-1"
            />
            <button
              onClick={toggleSpeech}
              title="Click to speak or simulate voice input"
              className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-all cursor-pointer ${
                isRecording
                  ? 'bg-rose-500/20 border-rose-500 text-rose-400 animate-pulse'
                  : 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/30'
              }`}
            >
              {isRecording ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
            <button
              onClick={processSpeech}
              className="px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-all cursor-pointer"
            >
              Detect &amp; Fill
            </button>
          </div>
          <p className="text-[10px] text-slate-400">
            Supported keywords: "tibia nailing", "CRIF", "TKR", "THR", "appendectomy", "cholecystectomy", "LSCS", "hysterectomy", "tonsillectomy", "TURP", "mastectomy", "spinal", "GA", "epidural", "CSE"
          </p>
        </div>

        <div className="flex gap-2.5 flex-wrap mt-4">
          <button
            onClick={generateAll}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-cyan-500/20 cursor-pointer"
          >
            <Sparkles size={14} /> Auto-Generate All Documents
          </button>
          <button
            onClick={clearAll}
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/10 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Trash2 size={13} /> Reset
          </button>
        </div>
      </SectionCard>

      {/* Section 2: Consent Form */}
      <SectionCard
        id={2}
        title="Auto-Generated Informed Consent Form (Telugu / English Compliant)"
        isOpen={openSections.has(2)}
        onToggle={() => toggleSection(2)}
        done={!!consentText}
      >
        <FormGroup label="Consent Form Content (Surgeon &amp; Attender Editable)">
          <textarea
            value={consentText}
            onChange={(e) => setConsentText(e.target.value)}
            placeholder="Select surgery and anesthesia type, then click 'Auto-Generate All Documents'..."
            className="input-dark w-full font-mono text-xs leading-relaxed min-h-[220px]"
          />
        </FormGroup>
        <DocActions
          type="consent"
          onDownload={downloadDoc}
          onPrint={printDoc}
          onDispatch={dispatchToReception}
          onCopy={() => copyToClipboard(consentText, 'Consent Form')}
        />
      </SectionCard>

      {/* Section 3: Surgery Notes */}
      <SectionCard
        id={3}
        title="Auto-Generated Surgery Operative Notes (Numbered Steps &amp; Blood Loss)"
        isOpen={openSections.has(3)}
        onToggle={() => toggleSection(3)}
        done={!!surgeryNotes}
      >
        <FormGroup label="Surgery Procedure Notes (Editable)">
          <textarea
            value={surgeryNotes}
            onChange={(e) => setSurgeryNotes(e.target.value)}
            placeholder="Select surgery type, then click 'Auto-Generate All Documents'..."
            className="input-dark w-full font-mono text-xs leading-relaxed min-h-[220px]"
          />
        </FormGroup>
        <DocActions
          type="surgery"
          onDownload={downloadDoc}
          onPrint={printDoc}
          onDispatch={dispatchToReception}
          onCopy={() => copyToClipboard(surgeryNotes, 'Surgery Notes')}
        />
      </SectionCard>

      {/* Section 4: Anesthesia Notes */}
      <SectionCard
        id={4}
        title="Auto-Generated Anesthesia Record &amp; Procedure Notes"
        isOpen={openSections.has(4)}
        onToggle={() => toggleSection(4)}
        done={!!anesthesiaNotes}
      >
        <FormGroup label="Anesthesia Procedure Notes (Editable)">
          <textarea
            value={anesthesiaNotes}
            onChange={(e) => setAnesthesiaNotes(e.target.value)}
            placeholder="Select anesthesia type, then click 'Auto-Generate All Documents'..."
            className="input-dark w-full font-mono text-xs leading-relaxed min-h-[220px]"
          />
        </FormGroup>
        <DocActions
          type="anesthesia"
          onDownload={downloadDoc}
          onPrint={printDoc}
          onDispatch={dispatchToReception}
          onCopy={() => copyToClipboard(anesthesiaNotes, 'Anesthesia Notes')}
        />
      </SectionCard>

      {/* Section 5: Preview & Dispatch Log */}
      <SectionCard
        id={5}
        title="Document Preview Summary &amp; Reception Print Queue Log"
        isOpen={openSections.has(5)}
        onToggle={() => toggleSection(5)}
        done={allGenerated}
      >
        <div className="bg-slate-950 p-4 rounded-xl border border-white/10 text-xs space-y-3">
          {sData && aData ? (
            <div>
              <div className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-400" />
                Live Document Summary
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono text-xs">
                <div className="p-2 rounded-lg bg-white/[0.02] border border-white/5">
                  <span className="text-[10px] text-slate-500 uppercase block">Patient</span>
                  <strong className="text-white">{patient.name}</strong> ({patient.ageSex})
                </div>
                <div className="p-2 rounded-lg bg-white/[0.02] border border-white/5">
                  <span className="text-[10px] text-slate-500 uppercase block">UHID</span>
                  <strong className="text-cyan-300">{patient.uhid}</strong>
                </div>
                <div className="p-2 rounded-lg bg-white/[0.02] border border-white/5">
                  <span className="text-[10px] text-slate-500 uppercase block">Procedure</span>
                  <strong className="text-white">{sData.name}</strong>
                </div>
                <div className="p-2 rounded-lg bg-white/[0.02] border border-white/5">
                  <span className="text-[10px] text-slate-500 uppercase block">Anesthesia</span>
                  <strong className="text-purple-300">{aData.name}</strong>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center text-slate-400 py-4">
              Select surgery &amp; anesthesia to view live document summary.
            </div>
          )}
        </div>

        <div className="pt-2">
          <div className="text-xs font-bold text-slate-300 mb-2">Reception Print Queue &amp; Dispatch Log</div>
          <div className="space-y-1.5 font-mono text-xs text-slate-400">
            {dispatchLog.length === 0 ? (
              <span className="text-slate-600">No dispatches logged yet today.</span>
            ) : (
              dispatchLog.map((entry) => (
                <div key={entry.id} className="p-2 rounded-lg bg-white/[0.02] border border-white/5 flex items-center gap-2">
                  <span className="text-cyan-400 font-semibold">[{entry.time}]</span>
                  <strong className="text-white">{entry.type.toUpperCase()}</strong> — {entry.action}
                </div>
              ))
            )}
          </div>
        </div>
      </SectionCard>
    </div>
  );
};

// === Sub-components ===

const SectionCard: React.FC<{
  id: number;
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  done: boolean;
  children: React.ReactNode;
}> = ({ id, title, isOpen, onToggle, done, children }) => (
  <div className="rounded-2xl border border-white/10 bg-slate-900/90 overflow-hidden shadow-sm transition-all">
    <div
      onClick={onToggle}
      className="flex items-center justify-between p-4 cursor-pointer select-none bg-white/[0.02] hover:bg-white/[0.05] transition-all"
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-bold font-mono ${
            done
              ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30'
              : 'bg-white/10 text-slate-400'
          }`}
        >
          {id}
        </div>
        <h3 className="text-sm font-bold text-white">{title}</h3>
      </div>
      <ChevronDown
        size={16}
        className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
      />
    </div>
    {isOpen && <div className="p-4 pt-1 border-t border-white/5 space-y-3">{children}</div>}
  </div>
);

const FormGroup: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-1.5">
    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">
      {label}
    </label>
    {children}
  </div>
);

const DocActions: React.FC<{
  type: 'consent' | 'surgery' | 'anesthesia';
  onDownload: (t: 'consent' | 'surgery' | 'anesthesia') => void;
  onPrint: (t: 'consent' | 'surgery' | 'anesthesia') => void;
  onDispatch: (t: 'consent' | 'surgery' | 'anesthesia') => void;
  onCopy: () => void;
}> = ({ type, onDownload, onPrint, onDispatch, onCopy }) => (
  <div className="flex gap-2 flex-wrap pt-2">
    <button
      onClick={() => onDownload(type)}
      className="px-3.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-all"
    >
      <Download size={13} /> Download (.txt)
    </button>
    <button
      onClick={() => onPrint(type)}
      className="px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-all"
    >
      <Printer size={13} /> Print
    </button>
    <button
      onClick={() => onDispatch(type)}
      className="px-3.5 py-1.5 rounded-xl bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-300 border border-emerald-500/40 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-all"
    >
      <Send size={13} /> Dispatch to Reception
    </button>
    <button
      onClick={onCopy}
      className="px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/10 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-all"
    >
      <Copy size={13} /> Copy Text
    </button>
  </div>
);

export default AutoConsentModule;
