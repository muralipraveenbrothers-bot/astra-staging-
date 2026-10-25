import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Layers3, Search, RotateCcw, RotateCw, Pause, Activity, X, Focus, ChevronRight, Bone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SYSTEMS, DEFAULT_VISIBLE, explanation, type Atlas, type Concept, type SceneState, type SystemId, type View } from '@/services/humanAtlas';
import AtlasScene from './AtlasScene';

// Map OrthoPlanner bone selection labels → atlas concept search terms
const BONE_TO_ATLAS: Record<string, string> = {
  humerus: 'humerus',
  'radius_ulna': 'radius',
  'radius / ulna': 'radius',
  radius: 'radius',
  ulna: 'ulna',
  femur: 'femur',
  'tibia_fibula': 'tibia',
  'tibia / fibula': 'tibia',
  tibia: 'tibia',
  fibula: 'fibula',
  mandible: 'mandible',
  'pelvis / acetabulum': 'hip bone',
  pelvis: 'hip bone',
  clavicle: 'clavicle',
  calcaneus: 'calcaneus',
  'thoracolumbar spine': 'vertebral column',
  spine: 'vertebral column',
  patella: 'patella',
};

const SYSTEM_PILLS = [
  { id: 'all',      label: '🔬 All',     systems: null },
  { id: 'skeletal', label: '🦴 Skeleton', systems: ['skeletal'] as SystemId[] },
  { id: 'muscular', label: '💪 Muscles',  systems: ['muscular'] as SystemId[] },
  { id: 'organs',   label: '🫀 Organs',   systems: ['cardiac','respiratory','digestive','urinary','endocrine'] as SystemId[] },
  { id: 'vascular', label: '🩸 Vessels',  systems: ['arterial','venous'] as SystemId[] },
  { id: 'nervous',  label: '🧠 Nerves',   systems: ['nervous'] as SystemId[] },
];

const initialState: SceneState = {
  explode: 0,
  visible: ['skeletal'] as SystemId[],
  selected: [],
  isolate: false,
  view: 'three-quarter',
  rotate: false,
  reset: 0,
};

export interface HumanAtlasViewerProps {
  onStructureSelect?: (name: string, system: string) => void;
  /** Auto-highlight & center this bone when opened (e.g. "humerus", "radius") */
  highlightStructure?: string;
  /** Start with only this system visible */
  focusSystem?: SystemId;
  /** Compact mode: no side panels, smaller controls (for split-view) */
  compact?: boolean;
}

export function HumanAtlasViewer({ onStructureSelect, highlightStructure, focusSystem, compact = false }: HumanAtlasViewerProps) {
  const [atlas, setAtlas] = useState<Atlas | null>(null);
  const [state, setState] = useState<SceneState>({
    ...initialState,
    visible: focusSystem ? [focusSystem] : ['skeletal'],
  });
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [panel, setPanel] = useState<'layers' | 'search' | null>(null);
  const [details, setDetails] = useState(false);
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<Concept | null>(null);
  const [activeSystemPill, setActiveSystemPill] = useState('skeletal');

  // Load atlas.json once
  useEffect(() => {
    const abort = new AbortController();
    setProgress(0); setError(''); setAtlas(null); setChosen(null); setDetails(false);
    fetch('/models/atlas.json', { signal: abort.signal })
      .then(r => { if (!r.ok) throw new Error('Anatomy catalogue could not be loaded.'); return r.json(); })
      .then(data => setAtlas(data as Atlas))
      .catch(e => { if (e.name !== 'AbortError') setError(e.message); });
    return () => abort.abort();
  }, []);

  // Auto-select when highlightStructure or atlas ready
  useEffect(() => {
    if (!atlas || !highlightStructure) return;
    const searchKey = (BONE_TO_ATLAS[highlightStructure.toLowerCase()] ?? highlightStructure).toLowerCase();
    const concept =
      atlas.concepts.find(c => c.name.toLowerCase() === searchKey) ??
      atlas.concepts.find(c => c.name.toLowerCase().startsWith(searchKey)) ??
      atlas.concepts.find(c => c.name.toLowerCase().includes(searchKey));
    if (concept) {
      setChosen(concept);
      setState(s => ({ ...s, selected: concept.elements, visible: ['skeletal'] as SystemId[], isolate: false, rotate: false, reset: s.reset + 1 }));
      setDetails(true);
      setActiveSystemPill('skeletal');
    }
  }, [atlas, highlightStructure]);

  const parts = useMemo(() => new Map(atlas?.parts.map(p => [p.id, p])), [atlas]);
  const counts = useMemo(() => Object.fromEntries(SYSTEMS.map(s => [s.id, atlas?.parts.filter(p => p.system === s.id).length ?? 0])), [atlas]);
  const activeSystems = SYSTEMS.filter(s => counts[s.id] > 0);

  const selectedParts = state.selected.map(id => parts.get(id)).filter((p): p is NonNullable<typeof p> => !!p);
  const selected = selectedParts[0];
  const system = SYSTEMS.find(s => s.id === selected?.system);

  const results = useMemo(() => {
    if (!atlas) return [];
    const term = query.toLowerCase().trim();
    if (!term) {
      const defaults = ['humerus','radius','femur','tibia','mandible','hip bone','clavicle','calcaneus','patella','fibula','ulna','scapula'];
      return defaults.map(name => atlas.concepts.find(c => c.name.toLowerCase() === name)).filter((x): x is Concept => !!x);
    }
    return atlas.concepts.filter(c => c.name.toLowerCase().includes(term)).sort((a, b) => a.name.length - b.name.length).slice(0, 80);
  }, [atlas, query]);

  const choose = useCallback((c: Concept) => {
    setChosen(c);
    setState(s => ({ ...s, selected: c.elements, isolate: false, rotate: false }));
    setDetails(true);
    setPanel(null);
    const p = parts.get(c.elements[0]);
    onStructureSelect?.(c.name, p?.system ?? '');
  }, [parts, onStructureSelect]);

  const choosePart = useCallback((id: string) => {
    const p = parts.get(id);
    if (!p) return;
    setChosen({ id: p.conceptId, name: p.name, elements: [id] });
    setState(s => ({ ...s, selected: [id], isolate: false, rotate: false }));
    setDetails(true);
    setPanel(null);
    onStructureSelect?.(p.name, p.system);
  }, [parts, onStructureSelect]);

  const applyPill = (pill: typeof SYSTEM_PILLS[0]) => {
    setActiveSystemPill(pill.id);
    setState(s => ({
      ...s,
      visible: (pill.systems ?? activeSystems.map(x => x.id)) as SystemId[],
      selected: [],
      isolate: false,
    }));
    setDetails(false);
    setChosen(null);
  };

  const reset = () => {
    setState(s => ({ ...initialState, visible: ['skeletal'] as SystemId[], reset: s.reset + 1 }));
    setChosen(null); setDetails(false); setPanel(null); setActiveSystemPill('skeletal');
  };

  const visibleCount = atlas?.parts.filter(p =>
    state.isolate ? state.selected.includes(p.id) : state.visible.includes(p.system) || state.selected.includes(p.id)
  ).length ?? 0;

  return (
    <div className="absolute inset-0 bg-slate-950 flex overflow-hidden select-none">

      {/* ── SCENE ── fills remaining space after side panels */}
      <div className="relative flex-1 min-w-0 overflow-hidden">
        {atlas && (
          <AtlasScene
            atlas={atlas}
            state={{ ...state, inspectorOpen: details && selectedParts.length > 0 }}
            onSelect={choosePart}
            onProgress={n => { setProgress(n); if (n === 100) setError(''); }}
            onError={setError}
          />
        )}

        {/* ── TOP BAR ── HUD + System pills */}
        <div className="absolute top-2 left-2 right-10 flex items-start gap-2 z-10 pointer-events-none">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-950/90 border border-cyan-500/30 backdrop-blur text-[9px] font-bold text-cyan-300 tracking-wide shadow pointer-events-none flex-shrink-0">
            <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", progress < 100 ? "bg-amber-400 animate-pulse" : "bg-cyan-400")} />
            HUMAN ATLAS · 2,234
            {highlightStructure && <span className="ml-1 text-emerald-300 truncate">· {highlightStructure.toUpperCase()}</span>}
          </div>
          {/* System filter pills */}
          <div className="flex items-center flex-wrap gap-1 pointer-events-auto">
            {SYSTEM_PILLS.map(pill => (
              <button key={pill.id} onClick={() => applyPill(pill)}
                className={cn("px-1.5 py-0.5 rounded text-[9px] font-bold border transition-all whitespace-nowrap",
                  activeSystemPill === pill.id
                    ? "bg-cyan-500/25 text-cyan-200 border-cyan-400/50"
                    : "bg-slate-900/80 text-slate-400 border-slate-700/70 hover:text-cyan-300 hover:border-cyan-500/40")}>
                {pill.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── RIGHT CONTROLS ── View angle + rotate + reset + panels */}
        <div className="absolute right-2 top-10 flex flex-col gap-1 z-10">
          {(['three-quarter','front','side','back'] as View[]).map((v, i) => (
            <button key={v} title={`${v} view`}
              onClick={() => setState(s => ({ ...s, view: v, reset: s.reset + 1, rotate: false }))}
              className={cn("h-6 w-6 rounded text-[9px] font-bold border transition-all flex items-center justify-center",
                state.view === v ? "bg-cyan-500/30 text-cyan-200 border-cyan-500/50" : "bg-slate-900/80 text-slate-400 border-slate-700 hover:text-cyan-300")}>
              {['¾','F','S','B'][i]}
            </button>
          ))}
          <div className="h-px bg-slate-700/50 my-0.5" />
          <button title="Auto rotate" onClick={() => setState(s => ({ ...s, rotate: !s.rotate }))}
            className={cn("h-6 w-6 rounded border transition-all flex items-center justify-center",
              state.rotate ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40" : "bg-slate-900/80 text-slate-400 border-slate-700 hover:text-cyan-300")}>
            {state.rotate ? <Pause size={11}/> : <RotateCw size={11}/>}
          </button>
          <button title="Reset" onClick={reset} className="h-6 w-6 rounded border border-slate-700 bg-slate-900/80 text-slate-400 hover:text-cyan-300 flex items-center justify-center">
            <RotateCcw size={11}/>
          </button>
          {!compact && (
            <>
              <div className="h-px bg-slate-700/50 my-0.5" />
              <button title="Search structures" onClick={() => setPanel(p => p === 'search' ? null : 'search')}
                className={cn("h-6 w-6 rounded border transition-all flex items-center justify-center",
                  panel === 'search' ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40" : "bg-slate-900/80 text-slate-400 border-slate-700 hover:text-cyan-300")}>
                <Search size={11}/>
              </button>
              <button title="System layers" onClick={() => setPanel(p => p === 'layers' ? null : 'layers')}
                className={cn("h-6 w-6 rounded border transition-all flex items-center justify-center",
                  panel === 'layers' ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40" : "bg-slate-900/80 text-slate-400 border-slate-700 hover:text-cyan-300")}>
                <Layers3 size={11}/>
              </button>
            </>
          )}
        </div>

        {/* ── EXPLODE SLIDER ── bottom center */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-slate-950/90 border border-slate-700/60 rounded-lg px-3 py-1.5 backdrop-blur z-10 flex items-center gap-3 w-[260px]">
          <span className="text-[9px] font-bold text-slate-400 whitespace-nowrap">Explode</span>
          <input type="range" min={0} max={100} step={1}
            value={Math.round(state.explode * 100)}
            onChange={e => setState(s => ({ ...s, explode: Number(e.target.value) / 100, rotate: false }))}
            className="flex-1 h-1 accent-cyan-400 cursor-pointer" />
          <span className="text-[9px] font-mono text-cyan-300 w-7 text-right">{Math.round(state.explode * 100)}%</span>
        </div>

        {/* hint */}
        {progress === 100 && !chosen && (
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 text-[8px] text-slate-600 font-mono whitespace-nowrap pointer-events-none">
            Drag to orbit · Scroll to zoom · Click any structure to inspect
          </div>
        )}

        {/* Loading */}
        {progress < 100 && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/90 z-20">
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 text-center space-y-3 w-60 shadow-2xl">
              <div className="flex items-center justify-center gap-2 text-cyan-400">
                <Activity size={15} className="animate-pulse"/><span className="text-xs font-bold">Loading Atlas</span>
              </div>
              <p className="text-[10px] text-slate-400">{progress}% · {Math.round(progress * 22.34)} / 2,234 structures</p>
              <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all" style={{ width: `${progress}%` }} />
              </div>
              {highlightStructure && <p className="text-[9px] text-emerald-400">Auto-selecting: <strong>{highlightStructure}</strong></p>}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 z-20">
            <div className="bg-rose-950/80 border border-rose-500/40 rounded-xl p-5 text-center max-w-xs shadow-2xl">
              <p className="text-xs text-rose-300 mb-3">{error}</p>
              <button onClick={() => { setError(''); setProgress(0); setAtlas(null); }} className="px-3 py-1.5 bg-rose-500/20 text-rose-200 border border-rose-500/40 rounded text-[10px] font-bold hover:bg-rose-500/30">Retry</button>
            </div>
          </div>
        )}
      </div>

      {/* ── LAYERS PANEL ── */}
      {panel === 'layers' && !compact && (
        <aside className="w-52 bg-slate-950 border-l border-slate-800 flex flex-col z-20">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
            <span className="text-[10px] font-bold text-slate-200 uppercase tracking-wide flex items-center gap-1"><Layers3 size={11}/>Systems</span>
            <button onClick={() => setPanel(null)} className="text-slate-500 hover:text-white"><X size={12}/></button>
          </div>
          <div className="flex flex-wrap gap-0.5 p-2 border-b border-slate-800">
            {['All','Skeleton','Organs'].map(preset => (
              <button key={preset} onClick={() => {
                if (preset === 'All') setState(s => ({ ...s, visible: activeSystems.map(x => x.id) as SystemId[], selected: [], isolate: false }));
                else if (preset === 'Skeleton') setState(s => ({ ...s, visible: ['skeletal'] as SystemId[], selected: [], isolate: false }));
                else setState(s => ({ ...s, visible: ['cardiac','respiratory','digestive','urinary','endocrine'] as SystemId[], selected: [], isolate: false }));
              }} className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700">{preset}</button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {activeSystems.map(s => (
              <div key={s.id} className={cn("flex items-center px-3 py-1.5 gap-1.5 hover:bg-slate-800/40", state.visible.includes(s.id) ? '' : 'opacity-40')}>
                <button className="flex items-center gap-1.5 flex-1 text-[9px] text-slate-300 text-left truncate"
                  onClick={() => setState(v => ({ ...v, visible: [s.id] as SystemId[], isolate: false, selected: [] }))}>
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }}/>{s.name}
                </button>
                <span className="text-[8px] text-slate-600">{counts[s.id]}</span>
                <button onClick={() => setState(v => ({ ...v, visible: v.visible.includes(s.id) ? v.visible.filter(x => x !== s.id) as SystemId[] : [...v.visible, s.id] as SystemId[], selected: [], isolate: false }))}
                  className={cn("w-6 h-3 rounded-full transition-colors relative flex-shrink-0", state.visible.includes(s.id) ? "bg-cyan-500" : "bg-slate-700")}>
                  <span className={cn("absolute top-0.5 w-2 h-2 rounded-full bg-white shadow transition-transform", state.visible.includes(s.id) ? "translate-x-3" : "translate-x-0.5")}/>
                </button>
              </div>
            ))}
          </div>
          <div className="px-3 py-1.5 border-t border-slate-800 text-[8px] text-slate-500 flex justify-between">
            <span>{visibleCount.toLocaleString()} visible</span>
            <button onClick={() => setState(s => ({ ...s, visible: [] as SystemId[], selected: [], isolate: false }))} className="hover:text-slate-300">Hide all</button>
          </div>
        </aside>
      )}

      {/* ── SEARCH PANEL ── */}
      {panel === 'search' && !compact && (
        <aside className="w-60 bg-slate-950 border-l border-slate-800 flex flex-col z-20">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
            <span className="text-[10px] font-bold text-slate-200 uppercase tracking-wide flex items-center gap-1"><Search size={11}/>Find</span>
            <button onClick={() => setPanel(null)} className="text-slate-500 hover:text-white"><X size={12}/></button>
          </div>
          <div className="p-2 border-b border-slate-800">
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Femur, radius, mandible…"
              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-[10px] text-slate-200 placeholder-slate-500 outline-none focus:border-cyan-500/50"/>
          </div>
          <div className="flex-1 overflow-y-auto">
            {results.map(c => (
              <button key={c.id} onClick={() => choose(c)} className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-slate-800/50 border-b border-slate-800/40">
                <span className="text-[10px] text-slate-200 text-left">{c.name}</span>
                <span className="text-[8px] text-slate-500 flex-shrink-0">{c.elements.length}p</span>
              </button>
            ))}
            {!query && <p className="text-[9px] text-slate-600 text-center py-3 px-2">Orthopaedic bones listed above.<br/>Type to search 3,432 structures.</p>}
          </div>
        </aside>
      )}

      {/* ── DETAIL PANEL ── */}
      {details && selected && !compact && (
        <aside className="w-60 bg-slate-950 border-l border-slate-800 flex flex-col z-20">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: system?.color }}/>
              <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{system?.name}</span>
            </div>
            <button onClick={() => setDetails(false)} className="text-slate-500 hover:text-white"><X size={12}/></button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            <div className="flex items-start gap-2">
              <Bone size={14} className="text-cyan-400 flex-shrink-0 mt-0.5"/>
              <h3 className="text-sm font-bold text-white leading-tight">{chosen?.name}</h3>
            </div>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              {chosen && selected ? explanation(chosen.name, selected.system) : ''}
            </p>
            <div className="bg-slate-900 border border-slate-700/60 rounded p-2 space-y-1 text-[9px] font-mono">
              <div className="flex justify-between"><span className="text-slate-500">Pieces</span><span className="text-cyan-300">{state.selected.length}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">System</span><span className="text-cyan-300">{system?.name}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Atlas ID</span><span className="text-cyan-300 truncate max-w-[120px]">{chosen?.id}</span></div>
            </div>
            {selectedParts.length > 1 && (
              <div>
                <p className="text-[8px] text-slate-500 uppercase tracking-wide font-bold mb-1">Structures ({selectedParts.length})</p>
                {selectedParts.slice(0, 15).map(p => (
                  <button key={p.id} onClick={() => choosePart(p.id)} className="w-full flex items-center justify-between px-1.5 py-1 rounded hover:bg-slate-800/60">
                    <span className="text-[9px] text-slate-300">{p.name}</span>
                    <ChevronRight size={9} className="text-slate-600 flex-shrink-0"/>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="p-2 border-t border-slate-800 space-y-1">
            <button onClick={() => setState(s => ({ ...s, isolate: !s.isolate, explode: 0 }))}
              className={cn("w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-[10px] font-bold transition-all border",
                state.isolate ? "bg-cyan-500/30 text-cyan-200 border-cyan-500/50" : "bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 border-cyan-500/30")}>
              <Focus size={11}/>{state.isolate ? 'Show full anatomy' : 'Isolate structure'}
            </button>
            <button onClick={() => { setState(s => ({ ...s, selected: [], isolate: false })); setDetails(false); setChosen(null); }}
              className="w-full px-2 py-1 rounded text-[9px] text-slate-500 hover:text-slate-300 hover:bg-slate-800/40">
              Clear selection
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}
