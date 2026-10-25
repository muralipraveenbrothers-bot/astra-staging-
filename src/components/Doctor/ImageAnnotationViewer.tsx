// src/components/Doctor/ImageAnnotationViewer.tsx
import React, { useState, useRef, useCallback } from 'react';
import { X, Eye, EyeOff, Layers, AlertTriangle, Activity, CheckCircle2, Info } from 'lucide-react';
import { Hotspot } from '@/lib/agents/MedicalImageAgent';

interface ImageAnnotationViewerProps {
  imageUrl: string;
  hotspots: Hotspot[];
  regionName: string;
  injuryType: string;
  onHotspotClick?: (hotspot: Hotspot) => void;
}

const TYPE_COLORS: Record<string, string> = {
  skin: '#f59e0b',
  nerve: '#eab308',
  artery: '#ef4444',
  vein: '#3b82f6',
  bone: '#94a3b8',
  tendon: '#a855f7',
  ligament: '#06b6d4',
  muscle: '#f97316',
  fascia: '#8b5cf6',
  other: '#64748b',
};

const STATUS_STYLES = {
  critical: { bg: 'rgba(239,68,68,0.15)', border: '#ef4444', text: '#fca5a5', label: 'CRITICAL' },
  damaged: { bg: 'rgba(245,158,11,0.15)', border: '#f59e0b', text: '#fcd34d', label: 'DAMAGED' },
  'at-risk': { bg: 'rgba(59,130,246,0.15)', border: '#3b82f6', text: '#93c5fd', label: 'AT RISK' },
  normal: { bg: 'rgba(34,197,94,0.15)', border: '#22c55e', text: '#86efac', label: 'NORMAL' },
};

export const ImageAnnotationViewer: React.FC<ImageAnnotationViewerProps> = ({
  imageUrl,
  hotspots,
  regionName,
  injuryType,
  onHotspotClick,
}) => {
  const [selectedHotspot, setSelectedHotspot] = useState<Hotspot | null>(null);
  const [activeLayer, setActiveLayer] = useState<string>('all');
  const [enhanced, setEnhanced] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [popupPos, setPopupPos] = useState({ x: 0, y: 0 });
  const imageRef = useRef<HTMLDivElement>(null);

  const filteredHotspots = activeLayer === 'all'
    ? hotspots
    : hotspots.filter(h => h.layer === activeLayer);

  const handleHotspotClick = useCallback((e: React.MouseEvent, hotspot: Hotspot) => {
    e.stopPropagation();
    setSelectedHotspot(hotspot);
    onHotspotClick?.(hotspot);

    // Position popup intelligently
    const rect = imageRef.current?.getBoundingClientRect();
    if (rect) {
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      const popupWidth = 280;
      const popupHeight = 220;

      let x = clickX + 16;
      let y = clickY - 20;
      if (x + popupWidth > rect.width) x = clickX - popupWidth - 16;
      if (y + popupHeight > rect.height) y = rect.height - popupHeight - 10;
      if (y < 0) y = 10;

      setPopupPos({ x, y });
    }
  }, [onHotspotClick]);

  const handleImageClick = () => setSelectedHotspot(null);

  const layers = ['all', 'superficial', 'intermediate', 'neurovascular', 'deep', 'skeletal'];

  return (
    <div className="w-full bg-[#0b1120] rounded-xl border border-slate-800 overflow-hidden">

      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#0f172a] border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-blue-400" />
          <span className="text-xs font-semibold text-slate-200">{regionName}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
            {injuryType}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowLabels(!showLabels)}
            className={`p-1.5 rounded-lg transition ${showLabels ? 'bg-blue-600/20 text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}
            title="Toggle labels"
          >
            {showLabels ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>
          <button
            onClick={() => setEnhanced(!enhanced)}
            className={`p-1.5 rounded-lg transition ${enhanced ? 'bg-amber-500/20 text-amber-400' : 'text-slate-500 hover:text-slate-300'}`}
            title="Enhance image"
          >
            <Layers size={14} />
          </button>
        </div>
      </div>

      {/* Layer Filter */}
      <div className="flex gap-1.5 px-3 py-2 bg-[#0f172a] border-b border-slate-800 flex-wrap">
        {layers.map(layer => (
          <button
            key={layer}
            onClick={() => { setActiveLayer(layer); setSelectedHotspot(null); }}
            className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition border ${
              activeLayer === layer
                ? 'bg-blue-600 text-white border-blue-500'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-600'
            }`}
          >
            {layer === 'all' ? 'All Layers' : layer.charAt(0).toUpperCase() + layer.slice(1)}
            {layer !== 'all' && (
              <span className="ml-1 opacity-60">
                ({hotspots.filter(h => h.layer === layer).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Image Container */}
      <div
        ref={imageRef}
        className="relative w-full overflow-hidden cursor-crosshair"
        style={{ aspectRatio: '4/3' }}
        onClick={handleImageClick}
      >
        {/* Base Image */}
        <img
          src={imageUrl}
          alt="Clinical image"
          className="w-full h-full object-contain transition-all duration-500"
          style={{
            filter: enhanced
              ? 'contrast(1.3) saturate(1.2) brightness(1.05)'
              : 'none'
          }}
        />

        {/* Enhanced Overlay (simulates vessel/edge enhancement) */}
        {enhanced && (
          <div
            className="absolute inset-0 pointer-events-none mix-blend-overlay opacity-30"
            style={{
              background: 'radial-gradient(circle at 30% 40%, rgba(239,68,68,0.15) 0%, transparent 50%), radial-gradient(circle at 70% 60%, rgba(234,179,8,0.1) 0%, transparent 50%)'
            }}
          />
        )}

        {/* Hotspots */}
        {filteredHotspots.map((hotspot) => (
          <div
            key={hotspot.id}
            className="absolute group cursor-pointer"
            style={{
              left: `${hotspot.x * 100}%`,
              top: `${hotspot.y * 100}%`,
              transform: 'translate(-50%, -50%)',
            }}
            onClick={(e) => handleHotspotClick(e, hotspot)}
          >
            {/* Pulsing ring */}
            <div
              className="absolute inset-0 rounded-full animate-ping opacity-40"
              style={{
                width: '24px',
                height: '24px',
                margin: '-4px',
                backgroundColor: TYPE_COLORS[hotspot.type] || '#64748b'
              }}
            />
            {/* Dot */}
            <div
              className="relative w-4 h-4 rounded-full border-2 border-white shadow-lg transition-transform group-hover:scale-125"
              style={{ backgroundColor: TYPE_COLORS[hotspot.type] || '#64748b' }}
            >
              {hotspot.status === 'critical' && (
                <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-white" />
              )}
            </div>
            {/* Label */}
            {showLabels && (
              <div
                className="absolute left-5 top-0 whitespace-nowrap text-[9px] font-medium px-1.5 py-0.5 rounded bg-black/60 text-white backdrop-blur-sm opacity-0 group-hover:opacity-100 transition pointer-events-none"
              >
                {hotspot.name.split(' ').slice(0, 3).join(' ')}
              </div>
            )}
          </div>
        ))}

        {/* Popup */}
        {selectedHotspot && (
          <div
            className="absolute z-50 w-[280px] bg-[#0f172a]/98 backdrop-blur-xl border border-slate-700 rounded-xl shadow-2xl overflow-hidden"
            style={{ left: popupPos.x, top: popupPos.y }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between p-3 border-b border-slate-800">
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: TYPE_COLORS[selectedHotspot.type] }}
                  />
                  <h4 className="text-xs font-bold text-slate-100 leading-tight">
                    {selectedHotspot.name}
                  </h4>
                </div>
                <p className="text-[10px] text-slate-500">
                  {selectedHotspot.layer} • {selectedHotspot.specificBranch}
                </p>
              </div>
              <button
                onClick={() => setSelectedHotspot(null)}
                className="p-0.5 hover:bg-slate-800 rounded text-slate-500 hover:text-white transition"
              >
                <X size={14} />
              </button>
            </div>

            {/* Body */}
            <div className="p-3 space-y-2.5">
              {/* Condition */}
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Condition</p>
                <p className="text-[11px] text-slate-200 leading-relaxed">{selectedHotspot.condition}</p>
              </div>

              {/* Risk Badge */}
              <div className="flex items-center gap-2">
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                  style={{
                    background: STATUS_STYLES[selectedHotspot.status].bg,
                    color: STATUS_STYLES[selectedHotspot.status].text,
                    border: `1px solid ${STATUS_STYLES[selectedHotspot.status].border}`
                  }}
                >
                  {STATUS_STYLES[selectedHotspot.status].label}
                </span>
                <span className="text-[10px] text-slate-500">
                  Risk: {Math.round(selectedHotspot.risk * 100)}%
                </span>
              </div>

              {/* Clinical Importance */}
              <div
                className="rounded-lg p-2.5 border-l-2"
                style={{
                  background: STATUS_STYLES[selectedHotspot.status].bg,
                  borderLeftColor: STATUS_STYLES[selectedHotspot.status].border
                }}
              >
                <div className="flex items-center gap-1 mb-1">
                  <AlertTriangle size={10} style={{ color: STATUS_STYLES[selectedHotspot.status].text }} />
                  <p className="text-[10px] font-bold" style={{ color: STATUS_STYLES[selectedHotspot.status].text }}>
                    Clinical Importance
                  </p>
                </div>
                <p className="text-[10px] leading-relaxed" style={{ color: STATUS_STYLES[selectedHotspot.status].text }}>
                  {selectedHotspot.clinicalImportance}
                </p>
              </div>

              {/* Action Required */}
              <div className="bg-emerald-950/30 rounded-lg p-2.5 border-l-2 border-emerald-600">
                <div className="flex items-center gap-1 mb-1">
                  <CheckCircle2 size={10} className="text-emerald-400" />
                  <p className="text-[10px] font-bold text-emerald-400">Action Required</p>
                </div>
                <p className="text-[10px] text-emerald-300 leading-relaxed">
                  {selectedHotspot.actionRequired}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Structure Checklist */}
      <div className="border-t border-slate-800">
        <div className="px-3 py-2 bg-[#0f172a] border-b border-slate-800 flex items-center gap-1.5">
          <Info size={12} className="text-blue-400" />
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Structure Checklist</span>
        </div>
        <div className="max-h-[140px] overflow-y-auto p-2 space-y-1">
          {hotspots.map(h => (
            <div
              key={h.id}
              onClick={() => {
                setSelectedHotspot(h);
                setActiveLayer('all');
              }}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition ${
                selectedHotspot?.id === h.id ? 'bg-slate-800' : 'hover:bg-slate-800/50'
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: TYPE_COLORS[h.type] }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-slate-200 truncate">{h.name}</p>
                <p className="text-[9px] text-slate-500 truncate">{h.condition}</p>
              </div>
              <span
                className="text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0"
                style={{
                  background: STATUS_STYLES[h.status].bg,
                  color: STATUS_STYLES[h.status].text
                }}
              >
                {STATUS_STYLES[h.status].label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
