// ============================================================================
// ASTRA AI — Supercore Layout
// Futuristic medical intelligence command layout
// Top bar, left navigation, dynamic center core, right context panel
// ============================================================================
import React, { useState } from 'react';
import { CommandCentre } from './CommandCentre';

interface SupercoreLayoutProps {
  children?: React.ReactNode;
}

// ─── Left Panel: Quick Actions ──────────────────────────────────────────────
function QuickActionsPanel({ isOpen, onToggle }: { isOpen: boolean; onToggle: () => void }) {
  const actions = [
    { icon: '🏥', label: 'Census', shortcut: 'C', action: 'show ip list' },
    { icon: '🧪', label: 'Pending Lab', shortcut: 'L', action: 'show pending lab' },
    { icon: '📡', label: 'Radiology', shortcut: 'R', action: 'show pending radiology' },
    { icon: '💊', label: 'Pharmacy', shortcut: 'P', action: 'show pending pharmacy' },
    { icon: '🔪', label: 'OT Today', shortcut: 'O', action: 'show today OT' },
    { icon: '📋', label: 'Discharge', shortcut: 'D', action: 'show pending discharge' },
    { icon: '🩺', label: 'Vitals', shortcut: 'V', action: 'show critical vitals' },
    { icon: '🚨', label: 'Alerts', shortcut: 'A', action: 'show active alerts' },
  ];

  const runAction = (action: string) => {
    window.dispatchEvent(new CustomEvent('astra:command', { detail: action }));
  };

  if (!isOpen) {
    return (
      <div style={{
        width: '48px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '12px 0',
        gap: '4px',
        borderRight: '1px solid rgba(100, 116, 139, 0.1)',
        background: 'rgba(2, 6, 23, 0.4)',
      }}>
        <button
          onClick={onToggle}
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            border: '1px solid rgba(212, 175, 55, 0.2)',
            background: 'rgba(212, 175, 55, 0.05)',
            color: '#d4af37',
            cursor: 'pointer',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '8px',
          }}
        >
          →
        </button>
        {actions.map((a, i) => (
          <button
            key={i}
            title={a.label}
            onClick={() => runAction(a.action)}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease',
            }}
          >
            {a.icon}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div style={{
      width: '218px',
      display: 'flex',
      flexDirection: 'column',
      borderRight: '1px solid rgba(100, 116, 139, 0.1)',
      background: '#0b101b',
      fontFamily: '"Inter", sans-serif',
    }}>
      <div style={{ padding: '10px 10px 4px' }}>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('astra:new-chat'))}
          style={{
            width: '100%', padding: '10px 12px', borderRadius: '7px',
            border: '1px solid rgba(148, 163, 184, 0.22)', background: 'rgba(255,255,255,0.035)',
            color: '#e2e8f0', cursor: 'pointer', textAlign: 'left', fontSize: '12px',
            fontFamily: '\"Inter\", sans-serif',
          }}
        >
          ＋ New clinical chat
        </button>
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 14px',
        borderBottom: '1px solid rgba(100, 116, 139, 0.1)',
      }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Quick Actions
        </span>
        <button
          onClick={onToggle}
          style={{
            background: 'none',
            border: 'none',
            color: '#64748b',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          ←
        </button>
      </div>

      <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {actions.map((a, i) => (
          <button
            key={i}
            onClick={() => runAction(a.action)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 10px',
              borderRadius: '8px',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              width: '100%',
              textAlign: 'left',
              fontFamily: '"Inter", sans-serif',
              transition: 'all 0.15s ease',
              color: '#94a3b8',
            }}
            onMouseOver={e => {
              (e.target as HTMLButtonElement).style.background = 'rgba(100, 116, 139, 0.1)';
            }}
            onMouseOut={e => {
              (e.target as HTMLButtonElement).style.background = 'transparent';
            }}
          >
            <span style={{ fontSize: '14px', minWidth: '20px' }}>{a.icon}</span>
            <span style={{ fontSize: '12px', flex: 1 }}>{a.label}</span>
            <span style={{
              fontSize: '9px',
              padding: '1px 4px',
              borderRadius: '3px',
              background: 'rgba(100, 116, 139, 0.15)',
              color: '#64748b',
              fontFamily: '"JetBrains Mono", monospace',
            }}>
              {a.shortcut}
            </span>
          </button>
        ))}
      </div>

      {/* System status */}
      <div style={{ marginTop: 'auto', padding: '12px 14px', borderTop: '1px solid rgba(100, 116, 139, 0.1)' }}>
        <div style={{ fontSize: '10px', color: '#475569', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          System Status
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {[
            { label: 'Hermes Brain', status: 'active', color: '#34d399' },
            { label: 'LangGraph', status: 'active', color: '#34d399' },
            { label: 'Susruta Engine', status: 'active', color: '#34d399' },
            { label: 'Shield Guardian', status: 'active', color: '#34d399' },
            { label: 'Voicebox', status: 'standby', color: '#fb923c' },
          ].map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: s.color,
                boxShadow: `0 0 6px ${s.color}44`,
              }} />
              <span style={{ fontSize: '10px', color: '#64748b' }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Right Panel: Context ───────────────────────────────────────────────────
function ContextPanel({ isOpen, onToggle }: { isOpen: boolean; onToggle: () => void }) {
  if (!isOpen) {
    return (
      <div style={{
        width: '48px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '12px 0',
        borderLeft: '1px solid rgba(100, 116, 139, 0.1)',
        background: 'rgba(2, 6, 23, 0.4)',
      }}>
        <button
          onClick={onToggle}
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            border: '1px solid rgba(100, 116, 139, 0.2)',
            background: 'transparent',
            color: '#64748b',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          ←
        </button>
      </div>
    );
  }

  return (
    <div style={{
      width: '280px',
      display: 'flex',
      flexDirection: 'column',
      borderLeft: '1px solid rgba(100, 116, 139, 0.1)',
      background: 'rgba(2, 6, 23, 0.4)',
      fontFamily: '"Inter", sans-serif',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 14px',
        borderBottom: '1px solid rgba(100, 116, 139, 0.1)',
      }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Active Patient
        </span>
        <button
          onClick={onToggle}
          style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '14px' }}
        >
          →
        </button>
      </div>

      {/* Patient card */}
      <div style={{ padding: '14px' }}>
        <div style={{
          padding: '14px',
          borderRadius: '12px',
          background: 'rgba(15, 23, 42, 0.5)',
          border: '1px solid rgba(212, 175, 55, 0.15)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #d4af37, #b8860b)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px',
              fontWeight: 700,
              color: '#0f172a',
            }}>
              RK
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0' }}>Rajesh Kumar</div>
              <div style={{ fontSize: '10px', color: '#64748b' }}>UH-2026-001 | M, 45y | ICU-01</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Dx:</span>
              <span style={{ color: '#fbbf24' }}>Dengue (DHF)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Admitted:</span>
              <span style={{ color: '#cbd5e1' }}>12 Aug 2026</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Day:</span>
              <span style={{ color: '#cbd5e1' }}>Day 3</span>
            </div>
          </div>
        </div>
      </div>

      {/* Vitals */}
      <div style={{ padding: '0 14px' }}>
        <div style={{ fontSize: '10px', color: '#475569', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Latest Vitals
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '6px',
        }}>
          {[
            { label: 'BP', value: '110/70', unit: 'mmHg', color: '#34d399' },
            { label: 'HR', value: '92', unit: 'bpm', color: '#34d399' },
            { label: 'Temp', value: '101.2', unit: '°F', color: '#fb923c' },
            { label: 'SpO₂', value: '96', unit: '%', color: '#34d399' },
            { label: 'RR', value: '20', unit: '/min', color: '#34d399' },
            { label: 'GCS', value: '14', unit: '/15', color: '#22d3ee' },
          ].map((v, i) => (
            <div key={i} style={{
              padding: '8px',
              borderRadius: '8px',
              background: 'rgba(15, 23, 42, 0.4)',
              border: `1px solid ${v.color}22`,
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '9px', color: '#64748b', marginBottom: '2px' }}>{v.label}</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: v.color, fontFamily: '"JetBrains Mono", monospace' }}>
                {v.value}
              </div>
              <div style={{ fontSize: '8px', color: '#475569' }}>{v.unit}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Labs */}
      <div style={{ padding: '14px', marginTop: '8px' }}>
        <div style={{ fontSize: '10px', color: '#475569', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Key Labs
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px' }}>
          {[
            { test: 'Platelets', value: '42,000', flag: '↓↓', color: '#ef4444' },
            { test: 'Hb', value: '11.2', flag: '↓', color: '#fb923c' },
            { test: 'WBC', value: '4,200', flag: 'N', color: '#34d399' },
            { test: 'CRP', value: '48', flag: '↑↑', color: '#ef4444' },
            { test: 'Creatinine', value: '0.9', flag: 'N', color: '#34d399' },
          ].map((lab, i) => (
            <div key={i} style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '4px 8px',
              borderRadius: '4px',
              background: lab.color === '#ef4444' ? 'rgba(239, 68, 68, 0.05)' : 'transparent',
            }}>
              <span style={{ color: '#94a3b8' }}>{lab.test}</span>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <span style={{ color: '#e2e8f0', fontFamily: '"JetBrains Mono", monospace' }}>{lab.value}</span>
                <span style={{ color: lab.color, fontWeight: 700, fontSize: '10px' }}>{lab.flag}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Supercore Layout (Main) ────────────────────────────────────────────────
export function SupercoreLayout({ children }: SupercoreLayoutProps) {
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);

  return (
    <div style={{
      display: 'flex',
      height: '100%',
      background: '#121827',
      overflow: 'hidden',
    }}>
      {/* Left: Quick Actions */}
      <QuickActionsPanel isOpen={leftPanelOpen} onToggle={() => setLeftPanelOpen(!leftPanelOpen)} />

      {/* Center: Command Centre */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {children || <CommandCentre />}
      </div>

      {/* Right: Patient Context */}
      <ContextPanel isOpen={rightPanelOpen} onToggle={() => setRightPanelOpen(!rightPanelOpen)} />
    </div>
  );
}
