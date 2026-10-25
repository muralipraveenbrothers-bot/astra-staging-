// src/components/Doctor/AdvancedImageAnnotationViewer.tsx
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  X, Eye, EyeOff, Layers, AlertTriangle, Activity, CheckCircle2, Info,
  Ruler, Download, Scan, GitCompare, Bone, Maximize2, Minimize2
} from 'lucide-react';
import { Hotspot } from '@/lib/agents/MedicalImageAgentFinal';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface Measurement {
  id: string;
  pointA: { x: number; y: number };
  pointB: { x: number; y: number };
  pixelDistance: number;
  realDistanceMm?: number;
  label: string;
}

interface AdvancedImageAnnotationViewerProps {
  imageUrl: string;
  hotspots: Array<Hotspot & { confidence?: number; landmarkType?: string }>;
  regionName: string;
  injuryType: string;
  injurySeverity: string;
  analysisSummary: string;
  onExport?: (blob: Blob) => void;
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const TYPE_COLORS: Record<string, string> = {
  skin: '#f59e0b', nerve: '#eab308', artery: '#ef4444', vein: '#3b82f6',
  bone: '#94a3b8', tendon: '#a855f7', ligament: '#06b6d4', muscle: '#f97316',
  fascia: '#8b5cf6', other: '#64748b', joint: '#ec4899',
};

const TYPE_ICONS: Record<string, string> = {
  skin: '◎', nerve: '⚡', artery: '♥', vein: '💧', bone: '▣',
  tendon: '〰', ligament: '🔗', muscle: '💪', fascia: '⬡', other: '•', joint: '◉',
};

const STATUS_STYLES = {
  critical: { bg: 'rgba(239,68,68,0.15)', border: '#ef4444', text: '#fca5a5', label: 'CRITICAL' },
  damaged: { bg: 'rgba(245,158,11,0.15)', border: '#f59e0b', text: '#fcd34d', label: 'DAMAGED' },
  'at-risk': { bg: 'rgba(59,130,246,0.15)', border: '#3b82f6', text: '#93c5fd', label: 'AT RISK' },
  normal: { bg: 'rgba(34,197,94,0.15)', border: '#22c55e', text: '#86efac', label: 'NORMAL' },
};

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

export const AdvancedImageAnnotationViewer: React.FC<AdvancedImageAnnotationViewerProps> = ({
  imageUrl,
  hotspots,
  regionName,
  injuryType,
  injurySeverity,
  analysisSummary,
  onExport,
}) => {
  // ─── State ──────────────────────────────────────
  const [mode, setMode] = useState<'view' | 'measure' | 'calibrate'>('view');
  const [showCompare, setShowCompare] = useState(false);
  const [showReference, setShowReference] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [activeLayer, setActiveLayer] = useState<string>('all');
  const [selectedHotspot, setSelectedHotspot] = useState<Hotspot & { confidence?: number; landmarkType?: string } | null>(null);
  const [expandedDetail, setExpandedDetail] = useState(false);

  // Measurement state
  const [measurePoints, setMeasurePoints] = useState<{ x: number; y: number }[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [calibrationScale, setCalibrationScale] = useState<number | null>(null); // pixels per mm
  const [calInput, setCalInput] = useState({ value: '', unit: 'mm' });
  const [showCalPanel, setShowCalPanel] = useState(false);

  // Zoom / Pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [smartLabels, setSmartLabels] = useState(false);

  // Refs
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const exportCanvasRef = useRef<HTMLCanvasElement>(null);

  // ─── Zoom / Pan ──────────────────────────────────
  useEffect(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, [imageUrl]);

  useEffect(() => {
    const el = imageContainerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom(z => Math.min(4, Math.max(0.5, z * (e.deltaY < 0 ? 1.12 : 0.89))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const handlePanStart = (e: React.MouseEvent) => {
    if (zoom <= 1 || mode !== 'view') return;
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  };
  const handlePanMove = (e: React.MouseEvent) => {
    if (!isDragging || !dragStartRef.current) return;
    const dx = (e.clientX - dragStartRef.current.x) / zoom;
    const dy = (e.clientY - dragStartRef.current.y) / zoom;
    setPan({ x: dragStartRef.current.panX + dx, y: dragStartRef.current.panY + dy });
  };
  const handlePanEnd = () => { setIsDragging(false); dragStartRef.current = null; };

  const applyZoom = (factor: number) => setZoom(z => Math.min(4, Math.max(0.5, z * factor)));
  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  // ─── Derived ────────────────────────────────────
  const filteredHotspots = activeLayer === 'all'
    ? hotspots
    : hotspots.filter(h => h.layer === activeLayer);

  const stats = {
    critical: hotspots.filter(h => h.status === 'critical').length,
    damaged: hotspots.filter(h => h.status === 'damaged').length,
    atRisk: hotspots.filter(h => h.status === 'at-risk').length,
  };

  // ─── Smart label layout (spec §8/§10: labels move, anchors never do) ───
  interface AnnotationLayout {
    labelPosition: { x: number; y: number };
    leaderStart: { x: number; y: number };
    leaderEnd: { x: number; y: number };
  }
  const labelLayout = useMemo(() => {
    const placed: Array<{ x: number; y: number; w: number; h: number }> = [];
    const result = new Map<string, AnnotationLayout>();
    if (!smartLabels) return result;

    const PRIORITY_ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, MODERATE: 2, LOW: 3 };
    const sorted = [...filteredHotspots].sort(
      (a, b) => (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3)
    );

    const LW = 0.17, LH = 0.045;
    const angles = [0, 180, 90, 270, 45, 315, 135, 225];
    const radii = [0.09, 0.135, 0.18, 0.23];

    for (const h of sorted) {
      const candidates: Array<[number, number]> = [];
      for (const r of radii) {
        for (const a of angles) {
          const rad = (a * Math.PI) / 180;
          candidates.push([h.x + Math.cos(rad) * r - LW / 2, h.y + Math.sin(rad) * r - LH / 2]);
        }
      }
      let chosen: [number, number] | null = null;
      for (const [lx, ly] of candidates) {
        if (lx < 0.02 || lx + LW > 0.98 || ly < 0.02 || ly + LH > 0.98) continue;
        const overlaps = placed.some(p => lx < p.x + p.w && lx + LW > p.x && ly < p.y + p.h && ly + LH > p.y);
        if (!overlaps) { chosen = [lx, ly]; break; }
      }
      if (!chosen) {
        chosen = [
          Math.min(0.98 - LW, Math.max(0.02, h.x + 0.06)),
          Math.min(0.98 - LH, Math.max(0.02, h.y)),
        ];
      }
      const [lx, ly] = chosen;
      placed.push({ x: lx, y: ly, w: LW, h: LH });

      // Leader line: label-box edge (nearest to anchor) → exact anchor
      const cx = lx + LW / 2, cy = ly + LH / 2;
      const dx = h.x - cx, dy = h.y - cy;
      let sx = cx, sy = cy;
      if (dx !== 0 || dy !== 0) {
        const tx = dx !== 0 ? (LW / 2) / Math.abs(dx) : Infinity;
        const ty = dy !== 0 ? (LH / 2) / Math.abs(dy) : Infinity;
        const t = Math.min(tx, ty, 1);
        sx = cx + dx * t;
        sy = cy + dy * t;
      }
      result.set(h.id, {
        labelPosition: { x: lx, y: ly },
        leaderStart: { x: sx, y: sy },
        leaderEnd: { x: h.x, y: h.y },
      });
    }
    return result;
  }, [filteredHotspots, smartLabels]);

  // ─── Doctor corrections (spec §18: authoritative once corrected) ───
  const [corrections, setCorrections] = useState<Record<string, 'confirmed' | 'incorrect'>>(() => {
    try {
      const raw = localStorage.getItem(`astra-annotations-${imageUrl}`);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`astra-annotations-${imageUrl}`);
      setCorrections(raw ? JSON.parse(raw) : {});
    } catch { setCorrections({}); }
  }, [imageUrl]);

  useEffect(() => {
    try { localStorage.setItem(`astra-annotations-${imageUrl}`, JSON.stringify(corrections)); } catch { /* storage unavailable */ }
  }, [corrections, imageUrl]);

  const markCorrection = (id: string, verdict: 'confirmed' | 'incorrect') =>
    setCorrections(c => {
      const next = { ...c };
      if (next[id] === verdict) delete next[id];
      else next[id] = verdict;
      return next;
    });

  const currentPixelDist = measurePoints.length === 2
    ? Math.sqrt(
        Math.pow(measurePoints[1].x - measurePoints[0].x, 2) +
        Math.pow(measurePoints[1].y - measurePoints[0].y, 2)
      )
    : 0;

  const currentRealDist = calibrationScale && currentPixelDist > 0
    ? currentPixelDist / calibrationScale
    : null;

  // ─── Canvas Drawing ─────────────────────────────
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = imageContainerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw measurement points and lines
    measurePoints.forEach((p, i) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
      ctx.fillStyle = i === 0 ? '#22d3ee' : '#f59e0b';
      ctx.fill();
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Label A/B
      ctx.fillStyle = 'white';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(i === 0 ? 'A' : 'B', p.x - 14, p.y - 12);
    });

    if (measurePoints.length === 2) {
      ctx.beginPath();
      ctx.moveTo(measurePoints[0].x, measurePoints[0].y);
      ctx.lineTo(measurePoints[1].x, measurePoints[1].y);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Distance label at midpoint
      const midX = (measurePoints[0].x + measurePoints[1].x) / 2;
      const midY = (measurePoints[0].y + measurePoints[1].y) / 2;
      const dist = Math.sqrt(
        Math.pow(measurePoints[1].x - measurePoints[0].x, 2) +
        Math.pow(measurePoints[1].y - measurePoints[0].y, 2)
      );

      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.fillRect(midX - 40, midY - 14, 80, 20);
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 11px sans-serif';
      const label = calibrationScale
        ? `${(dist / calibrationScale).toFixed(1)} mm`
        : `${Math.round(dist)} px`;
      ctx.fillText(label, midX - 35, midY);
    }

    // Draw all saved measurements
    measurements.forEach((m) => {
      ctx.beginPath();
      ctx.moveTo(m.pointA.x, m.pointA.y);
      ctx.lineTo(m.pointB.x, m.pointB.y);
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Small dots at endpoints
      [m.pointA, m.pointB].forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(34, 211, 238, 0.8)';
        ctx.fill();
      });
    });
  }, [measurePoints, measurements, calibrationScale]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  // ─── Handlers ───────────────────────────────────
  const handleImageClick = useCallback((e: React.MouseEvent) => {
    if (mode !== 'measure') return;

    const container = imageContainerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (measurePoints.length === 0) {
      setMeasurePoints([{ x, y }]);
    } else if (measurePoints.length === 1) {
      const newPoints = [...measurePoints, { x, y }];
      setMeasurePoints(newPoints);

      const pixelDist = Math.sqrt(Math.pow(x - measurePoints[0].x, 2) + Math.pow(y - measurePoints[0].y, 2));

      // If not calibrated, show calibration panel
      if (!calibrationScale) {
        setShowCalPanel(true);
      } else {
        // Save measurement
        const realDist = pixelDist / calibrationScale;
        const newMeasurement: Measurement = {
          id: Date.now().toString(),
          pointA: measurePoints[0],
          pointB: { x, y },
          pixelDistance: pixelDist,
          realDistanceMm: realDist,
          label: `${realDist.toFixed(1)} mm`,
        };
        setMeasurements(prev => [...prev, newMeasurement]);
        setMeasurePoints([]);
        setMode('view');
      }
    }
  }, [mode, measurePoints, calibrationScale]);

  const handleHotspotClick = useCallback((e: React.MouseEvent, hotspot: Hotspot) => {
    // In measure mode, let clicks fall through to the measurement handler
    if (mode === 'measure') return;
    e.stopPropagation();

    setSelectedHotspot(hotspot);
    setExpandedDetail(true);
  }, [mode]);

  const applyCalibration = () => {
    const val = parseFloat(calInput.value);
    if (!val || measurePoints.length < 2) return;

    const [a, b] = measurePoints;
    const pixelDist = Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2));
    const mm = calInput.unit === 'cm' ? val * 10 : val;
    const scale = pixelDist / mm;

    setCalibrationScale(scale);
    setShowCalPanel(false);

    // Save this measurement too
    const realDist = pixelDist / scale;
    const newMeasurement: Measurement = {
      id: Date.now().toString(),
      pointA: a,
      pointB: b,
      pixelDistance: pixelDist,
      realDistanceMm: realDist,
      label: `${realDist.toFixed(1)} mm (calibrated)`,
    };
    setMeasurements(prev => [...prev, newMeasurement]);
    setMeasurePoints([]);
    setMode('view');
  };

  const clearMeasurements = () => {
    setMeasurePoints([]);
    setMeasurements([]);
    setCalibrationScale(null);
    setShowCalPanel(false);
  };

  // ─── EXPORT PNG ─────────────────────────────────
  const handleExport = async () => {
    const canvas = exportCanvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // High-res export: 1920x1440
    const W = 1920, H = 1440;
    canvas.width = W;
    canvas.height = H;

    // Background
    ctx.fillStyle = '#0b1120';
    ctx.fillRect(0, 0, W, H);

    // Header bar
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, 85);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 85); ctx.lineTo(W, 85); ctx.stroke();

    // Title
    ctx.fillStyle = '#60a5fa';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText('ASTRA CLINICAL IMAGE ANALYSIS REPORT', 30, 45);

    ctx.fillStyle = '#64748b';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(`Generated: ${new Date().toLocaleString()} | Patient: Confidential | Physician Verified Required`, 30, 72);

    // Image panel (left)
    const imgX = 30, imgY = 105, imgW = 850, imgH = 640;
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.strokeRect(imgX, imgY, imgW, imgH);

    // Draw image (scaled to fit)
    const imgAspect = img.naturalWidth / img.naturalHeight;
    const panelAspect = imgW / imgH;
    let drawW, drawH, drawX, drawY;
    if (imgAspect > panelAspect) {
      drawW = imgW; drawH = imgW / imgAspect;
      drawX = imgX; drawY = imgY + (imgH - drawH) / 2;
    } else {
      drawH = imgH; drawW = imgH * imgAspect;
      drawX = imgX + (imgW - drawW) / 2; drawY = imgY;
    }
    ctx.drawImage(img, drawX, drawY, drawW, drawH);

    // Scale factor for hotspot coordinates
    const scaleX = drawW;
    const scaleY = drawH;
    const offsetX = drawX;
    const offsetY = drawY;

    // Draw hotspots on export
    hotspots.forEach(h => {
      const hx = offsetX + h.x * scaleX;
      const hy = offsetY + h.y * scaleY;

      // Ring effect (static in export)
      ctx.beginPath();
      ctx.arc(hx, hy, 14, 0, Math.PI * 2);
      ctx.fillStyle = (TYPE_COLORS[h.type] || '#64748b') + '30';
      ctx.fill();

      // Dot
      ctx.beginPath();
      ctx.arc(hx, hy, 9, 0, Math.PI * 2);
      ctx.fillStyle = TYPE_COLORS[h.type] || '#64748b';
      ctx.fill();
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Label
      const labelText = h.name.split(' ').slice(0, 3).join(' ');
      const labelW = ctx.measureText(labelText).width + 12;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(hx + 14, hy - 10, labelW, 22);
      ctx.fillStyle = 'white';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.fillText(labelText, hx + 20, hy + 4);
    });

    // Draw measurements on export
    measurements.forEach(m => {
      const ax = offsetX + m.pointA.x * scaleX;
      const ay = offsetY + m.pointA.y * scaleY;
      const bx = offsetX + m.pointB.x * scaleX;
      const by = offsetY + m.pointB.y * scaleY;

      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      [m.pointA, m.pointB].forEach(p => {
        ctx.beginPath();
        ctx.arc(offsetX + p.x * scaleX, offsetY + p.y * scaleY, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#22d3ee';
        ctx.fill();
      });
    });

    // Legend
    const legY = imgY + imgH + 20;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(imgX, legY, imgW, 110);
    ctx.strokeStyle = '#334155';
    ctx.strokeRect(imgX, legY, imgW, 110);

    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText('ANATOMICAL LEGEND', imgX + 15, legY + 22);

    const legendItems = [
      { c: '#eab308', t: 'Nerve' }, { c: '#ef4444', t: 'Artery' },
      { c: '#3b82f6', t: 'Vein' }, { c: '#a855f7', t: 'Tendon' },
      { c: '#94a3b8', t: 'Bone' }, { c: '#f59e0b', t: 'Skin/Soft Tissue' },
      { c: '#06b6d4', t: 'Ligament' }, { c: '#f97316', t: 'Muscle' },
    ];
    legendItems.forEach((item, i) => {
      const lx = imgX + 15 + (i % 4) * 170;
      const ly = legY + 40 + Math.floor(i / 4) * 22;
      ctx.beginPath();
      ctx.arc(lx, ly, 7, 0, Math.PI * 2);
      ctx.fillStyle = item.c;
      ctx.fill();
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText(item.t, lx + 14, ly + 4);
    });

    // Right panel - Analysis
    const panX = 910, panY = 105, panW = 980, panH = 770;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(panX, panY, panW, panH);
    ctx.strokeStyle = '#334155';
    ctx.strokeRect(panX, panY, panW, panH);

    ctx.fillStyle = '#60a5fa';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText('CLINICAL ANALYSIS', panX + 20, panY + 28);

    // Region info
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(`Region: ${regionName}`, panX + 20, panY + 55);
    ctx.fillText(`Pattern: ${injuryType} — ${injurySeverity}`, panX + 20, panY + 75);

    // Summary
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px system-ui, sans-serif';
    const summaryWords = analysisSummary.split(' ');
    let sLine = panY + 98;
    let sCur = '';
    summaryWords.forEach(w => {
      if (ctx.measureText(sCur + w).width > panW - 50) {
        ctx.fillText(sCur, panX + 20, sLine);
        sLine += 16;
        sCur = w + ' ';
      } else {
        sCur += w + ' ';
      }
    });
    ctx.fillText(sCur, panX + 20, sLine);

    // Critical findings section
    let lineY = sLine + 18;
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillText('⚠️ CRITICAL FINDINGS', panX + 20, lineY);

    const critical = hotspots.filter(h => h.status === 'critical');
    lineY += 25;
    ctx.font = '12px system-ui, sans-serif';
    critical.forEach(h => {
      ctx.fillStyle = '#fca5a5';
      const words = h.name.split(' ');
      let line = `• `;
      words.forEach(w => {
        if (ctx.measureText(line + w).width > panW - 50) {
          ctx.fillText(line, panX + 20, lineY);
          lineY += 16;
          line = '  ' + w + ' ';
        } else {
          line += w + ' ';
        }
      });
      ctx.fillText(line, panX + 20, lineY);
      lineY += 18;
    });

    if (critical.length === 0) {
      ctx.fillStyle = '#86efac';
      ctx.fillText('• No critical structures identified', panX + 20, lineY);
      lineY += 20;
    }

    // Priority actions
    lineY += 10;
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillText('📋 PRIORITY ACTIONS', panX + 20, lineY);
    lineY += 25;

    ctx.fillStyle = '#fcd34d';
    ctx.font = '12px system-ui, sans-serif';
    const actions = hotspots
      .filter(h => h.status === 'critical' || h.status === 'damaged')
      .slice(0, 6)
      .map(h => h.actionRequired);

    actions.forEach((a, i) => {
      const words = a.split(' ');
      let line = `${i + 1}. `;
      words.forEach(w => {
        if (ctx.measureText(line + w).width > panW - 50) {
          ctx.fillText(line, panX + 20, lineY);
          lineY += 18;
          line = '   ' + w + ' ';
        } else {
          line += w + ' ';
        }
      });
      ctx.fillText(line, panX + 20, lineY);
      lineY += 20;
    });

    // Measurements
    if (measurements.length > 0) {
      lineY += 10;
      ctx.fillStyle = '#22d3ee';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.fillText('📏 MEASUREMENTS', panX + 20, lineY);
      lineY += 22;
      ctx.fillStyle = '#a5f3fc';
      ctx.font = '12px system-ui, sans-serif';
      measurements.forEach((m, i) => {
        ctx.fillText(
          `${i + 1}. ${m.label} (${Math.round(m.pixelDistance)} px)`,
          panX + 20, lineY
        );
        lineY += 18;
      });
    }

    // Disclaimer
    ctx.fillStyle = '#475569';
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText('DISCLAIMER: AI-assisted clinical decision support. Final diagnosis and treatment', panX + 20, panY + panH - 25);
    ctx.fillText('decisions are the sole responsibility of the attending physician.', panX + 20, panY + panH - 10);

    // Generate and download
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `Astra_Clinical_Analysis_${Date.now()}.png`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
      onExport?.(blob);
    }, 'image/png');
  };

  // ─── Render ─────────────────────────────────────
  return (
    <div data-testid="annotation-viewer" className="w-full bg-[#0b1120] rounded-xl border border-slate-800 overflow-hidden">

      {/* Hidden export canvas */}
      <canvas ref={exportCanvasRef} style={{ display: 'none' }} />

      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2.5 bg-[#0f172a] border-b border-slate-800 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Scan size={15} className="text-blue-400" />
          <span className="text-xs font-semibold text-slate-200">{regionName}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
            injurySeverity === 'critical' ? 'bg-red-900/30 text-red-400 border-red-800' :
            injurySeverity === 'severe' ? 'bg-amber-900/30 text-amber-400 border-amber-800' :
            'bg-blue-900/30 text-blue-400 border-blue-800'
          }`}>
            {injuryType} • {injurySeverity}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => { setShowLabels(!showLabels); }}
            className={`p-1.5 rounded-lg transition ${showLabels ? 'bg-blue-600/20 text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}
            title="Toggle labels"
          >
            {showLabels ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>

          <button
            onClick={() => { setSmartLabels(!smartLabels); setShowLabels(true); }}
            title="Smart labels"
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition border ${
              smartLabels
                ? 'bg-violet-600 text-white border-violet-500'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-600'
            }`}
          >
            <Scan size={12} />
            Smart
          </button>

          <button
            onClick={() => { setShowCompare(!showCompare); setShowReference(false); }}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition border ${
              showCompare
                ? 'bg-blue-600 text-white border-blue-500'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-600'
            }`}
          >
            <GitCompare size={12} />
            Compare
          </button>

          <button
            onClick={() => { setShowReference(!showReference); setShowCompare(false); }}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition border ${
              showReference
                ? 'bg-cyan-600 text-white border-cyan-500'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-600'
            }`}
          >
            <Bone size={12} />
            Reference
          </button>

          <button
            onClick={() => {
              setMode(mode === 'measure' ? 'view' : 'measure');
              setMeasurePoints([]);
              setShowCalPanel(false);
            }}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition border ${
              mode === 'measure'
                ? 'bg-amber-500 text-white border-amber-400'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-600'
            }`}
          >
            <Ruler size={12} />
            Measure
          </button>

          <button
            onClick={handleExport}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium bg-emerald-600 text-white border border-emerald-500 hover:bg-emerald-500 transition"
          >
            <Download size={12} />
            Export PNG
          </button>
        </div>
      </div>

      {/* Mode / Calibration Status */}
      <div className="px-3 py-1.5 bg-[#0f172a] border-b border-slate-800 flex items-center gap-3 flex-wrap">
        <span className="text-[10px] text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700">
          {mode === 'view' ? '🔍 View Mode' : mode === 'measure' ? '📏 Measurement Mode' : '⚖️ Calibration Mode'}
        </span>
        {mode === 'measure' && measurePoints.length === 0 && (
          <span className="text-[10px] text-amber-400 animate-pulse">Click Point A on image</span>
        )}
        {mode === 'measure' && measurePoints.length === 1 && (
          <span className="text-[10px] text-amber-400 animate-pulse">Click Point B on image</span>
        )}
        {calibrationScale && (
          <span className="text-[10px] text-cyan-400">
            Scale: {(1/calibrationScale).toFixed(3)} mm/px
          </span>
        )}

        {/* Status chips */}
        {stats.critical > 0 && (
          <span className="text-[10px] px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 font-medium">
            {stats.critical} Critical
          </span>
        )}
        {stats.damaged > 0 && (
          <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
            {stats.damaged} Damaged
          </span>
        )}
        {stats.atRisk > 0 && (
          <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">
            {stats.atRisk} At Risk
          </span>
        )}

        {/* Zoom Controls */}
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => applyZoom(1 / 1.2)}
            className="w-6 h-6 rounded bg-slate-800 border border-slate-700 text-slate-300 text-xs hover:border-slate-600"
            title="Zoom out"
          >
            −
          </button>
          <button
            onClick={resetView}
            className="px-2 h-6 rounded bg-slate-800 border border-slate-700 text-slate-300 text-[10px] hover:border-slate-600"
            title="Reset view"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={() => applyZoom(1.2)}
            className="w-6 h-6 rounded bg-slate-800 border border-slate-700 text-slate-300 text-xs hover:border-slate-600"
            title="Zoom in"
          >
            +
          </button>
        </div>
      </div>

      {/* Calibration Panel */}
      {showCalPanel && (
        <div className="mx-3 mt-2 p-3 bg-[#0f172a] border border-cyan-800/50 rounded-lg">
          <p className="text-[11px] text-cyan-400 font-semibold mb-1">⚖️ Calibration Required</p>
          <p className="text-[10px] text-slate-400 mb-2">
            The distance between your two points equals what real-world distance? Use a known reference (coin, ruler, or anatomical landmark).
          </p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={calInput.value}
              onChange={e => setCalInput(p => ({ ...p, value: e.target.value }))}
              placeholder="Distance"
              className="w-20 bg-slate-800 border border-slate-700 text-white text-xs rounded px-2 py-1"
            />
            <select
              value={calInput.unit}
              onChange={e => setCalInput(p => ({ ...p, unit: e.target.value }))}
              className="bg-slate-800 border border-slate-700 text-white text-xs rounded px-2 py-1"
            >
              <option value="mm">mm</option>
              <option value="cm">cm</option>
            </select>
            <button
              onClick={applyCalibration}
              className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-500"
            >
              Apply
            </button>
            <button
              onClick={() => { setShowCalPanel(false); setMeasurePoints([]); }}
              className="px-3 py-1 bg-slate-700 text-slate-300 text-xs rounded hover:bg-slate-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Measurement Results */}
      {measurements.length > 0 && (
        <div className="mx-3 mt-2 p-2.5 bg-[#0f172a] border border-slate-700 rounded-lg">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-slate-400 font-semibold uppercase">Saved Measurements</span>
            <button
              onClick={clearMeasurements}
              className="text-[10px] text-slate-500 hover:text-red-400"
            >
              Clear All
            </button>
          </div>
          <div className="flex gap-3 flex-wrap">
            {measurements.map((m, i) => (
              <div key={m.id} className="bg-slate-800 px-2.5 py-1 rounded border border-slate-700">
                <span className="text-[10px] text-cyan-400 font-bold">{i+1}. {m.label}</span>
                <span className="text-[9px] text-slate-500 ml-1">({Math.round(m.pixelDistance)} px)</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Layer Filter */}
      <div className="flex gap-1.5 px-3 py-2 bg-[#0f172a] border-b border-slate-800 flex-wrap">
        {['all', 'superficial', 'intermediate', 'neurovascular', 'deep', 'skeletal'].map(layer => (
          <button
            key={layer}
            onClick={() => { setActiveLayer(layer); setSelectedHotspot(null); }}
            className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition border ${
              activeLayer === layer
                ? 'bg-blue-600 text-white border-blue-500'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-600'
            }`}
          >
            {layer === 'all' ? 'All' : layer.charAt(0).toUpperCase() + layer.slice(1)}
            {layer !== 'all' && (
              <span className="ml-1 opacity-60">({hotspots.filter(h => h.layer === layer).length})</span>
            )}
          </button>
        ))}
      </div>

      {/* Viewport: Original + Compare/Ref */}
      <div className="flex gap-2 p-2" style={{ height: '420px' }}>

        {/* Original Image */}
        <div className={`relative rounded-lg overflow-hidden border border-slate-800 bg-[#0f172a] ${showCompare || showReference ? 'flex-1' : 'w-full'}`}>
          <div className="absolute top-2 left-2 z-10 bg-black/60 backdrop-blur px-2 py-0.5 rounded border border-slate-700">
            <span className="text-[10px] text-slate-300 font-semibold">📷 ORIGINAL</span>
          </div>

          <div
            ref={imageContainerRef}
            className={`relative w-full h-full ${zoom > 1 && mode === 'view' ? 'cursor-grab' : 'cursor-crosshair'} ${isDragging ? 'cursor-grabbing' : ''}`}
            onClick={handleImageClick}
            onMouseDown={handlePanStart}
            onMouseMove={handlePanMove}
            onMouseUp={handlePanEnd}
            onMouseLeave={handlePanEnd}
          >
            {/* Zoomable Content (image + hotspots) */}
            <div
              className="absolute inset-0"
              style={{
                transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`,
                transformOrigin: 'center center',
                transition: isDragging ? 'none' : 'transform 0.15s ease-out',
              }}
            >
            <img
              ref={imageRef}
              src={imageUrl}
              alt="Clinical"
              className="w-full h-full object-contain"
              crossOrigin="anonymous"
            />

            {/* Leader lines (spec §2: label box → exact anchor) */}
            {smartLabels && (
              <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                {filteredHotspots.map(h => {
                  const L = labelLayout.get(h.id);
                  if (!L) return null;
                  const col = TYPE_COLORS[h.type] || '#64748b';
                  return (
                    <line
                      key={`lead-${h.id}`}
                      data-testid="leader-line"
                      x1={L.leaderStart.x} y1={L.leaderStart.y}
                      x2={L.leaderEnd.x} y2={L.leaderEnd.y}
                      stroke={col}
                      strokeWidth={0.25}
                      strokeDasharray={h.uncertain ? '1 0.8' : undefined}
                      opacity={0.85}
                    />
                  );
                })}
              </svg>
            )}

            {/* Hotspots */}
            {filteredHotspots.map((h, idx) => {
              const corr = corrections[h.id];
              return (
              <div
                key={h.id}
                className={`absolute group cursor-pointer ${corr === 'incorrect' ? 'opacity-30 grayscale' : ''}`}
                style={{
                  left: `${h.x * 100}%`,
                  top: `${h.y * 100}%`,
                  transform: `translate(-50%, -50%) scale(${1 / zoom})`,
                }}
                onClick={(e) => handleHotspotClick(e, h)}
              >
                {h.uncertain ? (
                  <div className="absolute inset-0 rounded-full pointer-events-none"
                    style={{ width: '26px', height: '26px', margin: '-5px', border: `1.5px dashed ${TYPE_COLORS[h.type] || '#64748b'}`, opacity: 0.7 }}
                    title="Uncertain — limited by image quality/occlusion"
                  />
                ) : (
                  <div className="absolute inset-0 rounded-full animate-ping opacity-30 pointer-events-none"
                    style={{ width: '28px', height: '28px', margin: '-6px', backgroundColor: TYPE_COLORS[h.type] || '#64748b' }}
                  />
                )}
                <div className={`relative w-4 h-4 rounded-full border-2 border-white shadow-lg transition-transform group-hover:scale-125 ${corr === 'confirmed' ? 'ring-2 ring-emerald-400 ring-offset-1 ring-offset-slate-900' : ''}`}
                  style={{ backgroundColor: TYPE_COLORS[h.type] || '#64748b' }}
                >
                  {h.status === 'critical' && (
                    <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-white" />
                  )}
                  {corr === 'confirmed' && (
                    <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-emerald-500 rounded-full border border-white flex items-center justify-center">
                      <CheckCircle2 size={7} className="text-white" />
                    </div>
                  )}
                </div>
                {corr === 'incorrect' && (
                  <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-red-500 rounded-full border border-white flex items-center justify-center">
                    <X size={8} className="text-white" />
                  </div>
                )}
                {showLabels && (
                  <div className="absolute left-5 top-0 whitespace-nowrap text-[9px] font-medium px-1.5 py-0.5 rounded bg-black/60 text-white backdrop-blur-sm opacity-0 group-hover:opacity-100 transition pointer-events-none">
                    <span className="text-[8px] opacity-70 mr-0.5">{TYPE_ICONS[h.type] || '•'}</span>
                    {h.name.split(' ').slice(0, 3).join(' ')}
                  </div>
                )}
              </div>
              );
            })}

            {/* Smart label boxes (spec §8: labels move, anchors never do) */}
            {smartLabels && filteredHotspots.map((h, idx) => {
              const L = labelLayout.get(h.id);
              if (!L) return null;
              return (
                <div
                  key={`lb-${h.id}`}
                  data-testid="smart-label"
                  className="absolute cursor-pointer"
                  style={{
                    left: `${L.labelPosition.x * 100}%`,
                    top: `${L.labelPosition.y * 100}%`,
                    width: '17%',
                    transform: `scale(${1 / zoom})`,
                    transformOrigin: 'top left',
                    pointerEvents: mode === 'measure' ? 'none' : 'auto',
                  }}
                  onClick={(e) => handleHotspotClick(e, h)}
                >
                  <div className="bg-slate-900/90 backdrop-blur-sm border rounded px-1 py-0.5 text-[8px] leading-tight truncate"
                    style={{ borderColor: TYPE_COLORS[h.type] || '#64748b' }}
                  >
                    <span className="font-bold mr-0.5" style={{ color: TYPE_COLORS[h.type] || '#64748b' }}>{idx + 1}</span>
                    <span className="text-slate-200">{h.name.split(' ').slice(0, 3).join(' ')}</span>
                    {h.uncertain && <span className="ml-0.5 text-slate-500">?</span>}
                  </div>
                </div>
              );
            })}
            </div>

            {/* Measurement Canvas Overlay (container-space, unaffected by zoom) */}
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full pointer-events-none"
            />
          </div>
        </div>

        {/* Enhanced Panel */}
        {showCompare && (
          <div className="flex-1 relative rounded-lg overflow-hidden border border-slate-800 bg-[#0f172a]">
            <div className="absolute top-2 left-2 z-10 bg-black/60 backdrop-blur px-2 py-0.5 rounded border border-amber-800/50">
              <span className="text-[10px] text-amber-400 font-semibold">✨ ENHANCED</span>
            </div>
            <img
              src={imageUrl}
              alt="Enhanced"
              className="w-full h-full object-contain"
              style={{ filter: 'contrast(1.35) saturate(1.25) brightness(1.08)' }}
            />
            {/* Simulated vessel overlay */}
            <div className="absolute inset-0 pointer-events-none mix-blend-overlay opacity-20"
              style={{
                background: 'radial-gradient(circle at 30% 40%, rgba(239,68,68,0.2) 0%, transparent 50%), radial-gradient(circle at 70% 60%, rgba(234,179,8,0.15) 0%, transparent 50%)'
              }}
            />
          </div>
        )}

        {/* Reference Anatomy Panel */}
        {showReference && (
          <div className="flex-1 relative rounded-lg overflow-hidden border border-slate-800 bg-[#0f172a]">
            <div className="absolute top-2 left-2 z-10 bg-black/60 backdrop-blur px-2 py-0.5 rounded border border-cyan-800/50">
              <span className="text-[10px] text-cyan-400 font-semibold">🦴 REFERENCE</span>
            </div>
            <svg viewBox="0 0 400 300" className="w-full h-full">
              <rect width="400" height="300" fill="#0f172a"/>
              {/* Skeleton */}
              <path d="M 140 250 Q 130 200 135 150 Q 138 110 150 80 Q 160 55 180 50 Q 205 48 220 65 Q 235 85 230 110 Q 225 140 215 170 Q 208 200 205 250 Z"
                    fill="none" stroke="#475569" strokeWidth="3"/>
              {/* Bones */}
              <line x1="145" y1="250" x2="150" y2="170" stroke="#94a3b8" strokeWidth="8" strokeLinecap="round"/>
              <rect x="140" y="160" width="18" height="22" rx="9" fill="#64748b" opacity="0.5"/>
              <line x1="155" y1="100" x2="158" y2="60" stroke="#94a3b8" strokeWidth="6" strokeLinecap="round"/>
              <circle cx="180" cy="55" r="15" fill="#64748b" opacity="0.4"/>
              {/* Nerves */}
              <path d="M 128 160 Q 140 170 155 175" stroke="#eab308" strokeWidth="2.5" fill="none"/>
              <path d="M 228 165 Q 215 175 200 178" stroke="#eab308" strokeWidth="2.5" fill="none"/>
              {/* Arteries */}
              <path d="M 125 175 Q 140 185 155 190" stroke="#ef4444" strokeWidth="3" fill="none"/>
              <path d="M 230 180 Q 215 188 200 192" stroke="#ef4444" strokeWidth="3" fill="none"/>
              {/* Tendons */}
              <path d="M 155 195 Q 155 170 155 140" stroke="#a855f7" strokeWidth="2" fill="none" strokeDasharray="5,3"/>
              <path d="M 148 135 Q 148 110 150 90" stroke="#a855f7" strokeWidth="2" fill="none" strokeDasharray="5,3"/>
              {/* Labels */}
              <text x="105" y="160" fill="#eab308" fontSize="9">Nerve (R)</text>
              <text x="240" y="165" fill="#eab308" fontSize="9">Nerve (U)</text>
              <text x="100" y="180" fill="#ef4444" fontSize="9">Artery (R)</text>
              <text x="245" y="185" fill="#ef4444" fontSize="9">Artery (U)</text>
              <text x="160" y="200" fill="#a855f7" fontSize="9">FPL</text>
              <text x="155" y="100" fill="#a855f7" fontSize="9">EPL</text>
              <text x="130" y="175" fill="#94a3b8" fontSize="9">1st MC</text>
            </svg>
          </div>
        )}
      </div>

      {/* Expanded Detail Panel */}
      {expandedDetail && selectedHotspot && (
        <div className="mx-3 mb-3 bg-[#0f172a] border border-slate-700 rounded-xl overflow-hidden animate-in slide-in-from-bottom-2">
          <div className="flex items-center justify-between px-4 py-2.5 bg-[#1e293b] border-b border-slate-700">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: TYPE_COLORS[selectedHotspot.type] }} />
              <h4 className="text-sm font-bold text-slate-100">{selectedHotspot.name}</h4>
              <span className="text-[10px] px-2 py-0.5 rounded font-bold"
                style={{ color: STATUS_STYLES[selectedHotspot.status].text, border: `1px solid ${STATUS_STYLES[selectedHotspot.status].border}`, background: STATUS_STYLES[selectedHotspot.status].bg }}>
                {STATUS_STYLES[selectedHotspot.status].label}
              </span>
              {selectedHotspot.laterality && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400 uppercase tracking-wide">
                  {selectedHotspot.laterality}
                </span>
              )}
              {selectedHotspot.landmarkType && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-400 uppercase tracking-wide">
                  CV landmark • {selectedHotspot.landmarkType}
                </span>
              )}
            </div>
            <button
              onClick={() => setExpandedDetail(false)}
              className="p-1 hover:bg-slate-700 rounded text-slate-500 hover:text-white"
            >
              <Minimize2 size={14} />
            </button>
          </div>

          {/* Finding + Evidence strip (spec §18) */}
          {(selectedHotspot.finding || selectedHotspot.evidence) && (
            <div className="px-4 pt-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Finding</p>
              <p className="text-xs text-slate-100 mt-0.5">{selectedHotspot.finding}</p>
              {selectedHotspot.evidence && (
                <p className="text-[10px] text-slate-500 italic mt-1">Evidence: {selectedHotspot.evidence}</p>
              )}
            </div>
          )}

          <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Anatomy */}
            <div className="bg-slate-800/40 rounded-lg p-3 border border-slate-700/50">
              <div className="flex items-center gap-1.5 mb-2">
                <Info size={12} className="text-blue-400" />
                <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Anatomy & Course</p>
              </div>
              <p className="text-xs text-slate-200 leading-relaxed">{selectedHotspot.anatomyDetail}</p>
              {selectedHotspot.specificBranch && (
                <p className="text-[11px] text-slate-400 mt-1.5 italic">Branch: {selectedHotspot.specificBranch}</p>
              )}
            </div>

            {/* Clinical */}
            <div className="rounded-lg p-3 border-l-2" style={{
              background: STATUS_STYLES[selectedHotspot.status].bg,
              borderLeftColor: STATUS_STYLES[selectedHotspot.status].border
            }}>
              <div className="flex items-center gap-1.5 mb-2">
                <AlertTriangle size={12} style={{ color: STATUS_STYLES[selectedHotspot.status].text }} />
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: STATUS_STYLES[selectedHotspot.status].text }}>Clinical Significance</p>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: STATUS_STYLES[selectedHotspot.status].text }}>
                {selectedHotspot.clinicalImportance}
              </p>
            </div>

            {/* Repair */}
            <div className="bg-emerald-950/20 rounded-lg p-3 border border-emerald-800/30">
              <div className="flex items-center gap-1.5 mb-2">
                <CheckCircle2 size={12} className="text-emerald-400" />
                <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Repair / Management Protocol</p>
              </div>
              <p className="text-xs text-emerald-200 leading-relaxed">{selectedHotspot.repairProtocol}</p>
            </div>

            {/* Complications */}
            <div className="bg-amber-950/20 rounded-lg p-3 border border-amber-800/30">
              <div className="flex items-center gap-1.5 mb-2">
                <AlertTriangle size={12} className="text-amber-400" />
                <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Complications if Missed</p>
              </div>
              <p className="text-xs text-amber-200 leading-relaxed">{selectedHotspot.complications}</p>
            </div>
          </div>

          {/* Action Bar */}
          <div className="px-4 py-2.5 bg-[#1e293b] border-t border-slate-700 flex items-center gap-3 flex-wrap">
            <span className="text-[10px] text-slate-500">Current condition:</span>
            <span className="text-xs text-slate-200 font-medium">{selectedHotspot.condition}</span>
            {selectedHotspot.landmarkType && (
              <span className="text-[9px] px-1.5 py-0.5 rounded border border-slate-600 text-slate-400 uppercase tracking-wide">
                CV: {selectedHotspot.landmarkType}
              </span>
            )}
            {typeof selectedHotspot.confidence === 'number' && (
              <span className="text-[10px] text-cyan-400">
                Confidence: {Math.round(selectedHotspot.confidence * 100)}% {selectedHotspot.uncertain ? '(uncertain — limited by image quality/occlusion)' : ''}
              </span>
            )}
            {selectedHotspot.priority && (
              <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide ${
                selectedHotspot.priority === 'CRITICAL' ? 'bg-red-500/20 text-red-400' :
                selectedHotspot.priority === 'HIGH' ? 'bg-amber-500/20 text-amber-400' :
                selectedHotspot.priority === 'MODERATE' ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-700/40 text-slate-400'
              }">
                {selectedHotspot.priority}
              </span>
            )}
            {corrections[selectedHotspot.id] && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide ${
                corrections[selectedHotspot.id] === 'confirmed'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  : 'bg-red-500/20 text-red-400 border border-red-500/40'
              }`}>
                {corrections[selectedHotspot.id] === 'confirmed' ? '✓ Confirmed by clinician' : '✗ Marked incorrect'}
              </span>
            )}
            <span className="text-[10px] text-slate-500 ml-auto">Risk score:</span>
            <span className={`text-xs font-bold ${
              selectedHotspot.risk > 0.7 ? 'text-red-400' :
              selectedHotspot.risk > 0.4 ? 'text-amber-400' : 'text-emerald-400'
            }`}>{Math.round(selectedHotspot.risk * 100)}%</span>
            <button
              onClick={() => markCorrection(selectedHotspot.id, 'confirmed')}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-bold transition border ${
                corrections[selectedHotspot.id] === 'confirmed'
                  ? 'bg-emerald-600 text-white border-emerald-500'
                  : 'bg-slate-800 text-emerald-400 border-emerald-700/50 hover:border-emerald-500'
              }`}
            >
              <CheckCircle2 size={10} /> Confirm
            </button>
            <button
              onClick={() => markCorrection(selectedHotspot.id, 'incorrect')}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-bold transition border ${
                corrections[selectedHotspot.id] === 'incorrect'
                  ? 'bg-red-600 text-white border-red-500'
                  : 'bg-slate-800 text-red-400 border-red-700/50 hover:border-red-500'
              }`}
            >
              <X size={10} /> Incorrect
            </button>
          </div>
        </div>
      )}

      {/* Structure Checklist */}
      <div className="border-t border-slate-800">
        <div className="px-3 py-2 bg-[#0f172a] border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Layers size={12} className="text-blue-400" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Structure Checklist</span>
          </div>
          <span className="text-[10px] text-slate-600">{hotspots.filter(h => h.status !== 'normal').length} findings</span>
        </div>
        <div className="max-h-[140px] overflow-y-auto p-2 space-y-1">
          {hotspots.map(h => (
            <div
              key={h.id}
              onClick={() => { setSelectedHotspot(h); setExpandedDetail(true); }}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer transition ${
                selectedHotspot?.id === h.id ? 'bg-slate-800 border border-slate-600' : 'hover:bg-slate-800/50'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: TYPE_COLORS[h.type] }} />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-slate-200 truncate font-medium">{h.name}</p>
                <p className="text-[9px] text-slate-500 truncate">{h.condition}</p>
              </div>
              <span className="text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0" style={{
                background: STATUS_STYLES[h.status].bg,
                color: STATUS_STYLES[h.status].text
              }}>
                {STATUS_STYLES[h.status].label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
