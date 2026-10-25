// ============================================================================
// ASTRA AI — Mode Selector
// 7 command modes + Emergency activation
// ============================================================================
import React from 'react';

export type CommandMode = 
  | 'COMMAND'
  | 'CLINICAL'
  | 'PATIENT'
  | 'HOSPITAL'
  | 'EVIDENCE'
  | 'AGENTS'
  | 'SYSTEM';

interface ModeConfig {
  mode: CommandMode;
  label: string;
  icon: string;
  color: string;
  description: string;
  shortcut: string;
}

const MODES: ModeConfig[] = [
  { mode: 'COMMAND', label: 'Command', icon: '⌘', color: '#d4af37', description: 'Universal command interface', shortcut: '1' },
  { mode: 'CLINICAL', label: 'Clinical', icon: '🩺', color: '#22d3ee', description: 'Clinical reasoning & diagnosis', shortcut: '2' },
  { mode: 'PATIENT', label: 'Patient', icon: '👤', color: '#a78bfa', description: 'Patient context & timeline', shortcut: '3' },
  { mode: 'HOSPITAL', label: 'Hospital', icon: '🏥', color: '#34d399', description: 'Hospital operations & census', shortcut: '4' },
  { mode: 'EVIDENCE', label: 'Evidence', icon: '📚', color: '#fb923c', description: 'Medical evidence & research', shortcut: '5' },
  { mode: 'AGENTS', label: 'Agents', icon: '🤖', color: '#f472b6', description: 'Agent monitoring & execution', shortcut: '6' },
  { mode: 'SYSTEM', label: 'System', icon: '⚙️', color: '#94a3b8', description: 'System health & configuration', shortcut: '7' },
];

interface ModeSelectorProps {
  currentMode: CommandMode;
  onModeChange: (mode: CommandMode) => void;
  isEmergencyActive: boolean;
  onEmergencyToggle: () => void;
}

export function ModeSelector({ currentMode, onModeChange, isEmergencyActive, onEmergencyToggle }: ModeSelectorProps) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      padding: '4px',
      borderRadius: '12px',
      background: 'rgba(15, 23, 42, 0.8)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(100, 116, 139, 0.2)',
    }}>
      {MODES.map(m => {
        const isActive = currentMode === m.mode;
        return (
          <button
            key={m.mode}
            onClick={() => onModeChange(m.mode)}
            title={`${m.description} (Alt+${m.shortcut})`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: isActive ? 600 : 400,
              fontFamily: '"Inter", sans-serif',
              transition: 'all 0.2s ease',
              background: isActive
                ? `linear-gradient(135deg, ${m.color}22, ${m.color}11)`
                : 'transparent',
              color: isActive ? m.color : 'rgba(148, 163, 184, 0.8)',
              boxShadow: isActive ? `0 0 12px ${m.color}22` : 'none',
              outline: isActive ? `1px solid ${m.color}44` : 'none',
            }}
          >
            <span style={{ fontSize: '14px' }}>{m.icon}</span>
            <span style={{ display: isActive ? 'inline' : 'none' }}>{m.label}</span>
          </button>
        );
      })}

      {/* Emergency Button */}
      <button
        onClick={onEmergencyToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 14px',
          marginLeft: '8px',
          borderRadius: '8px',
          border: isEmergencyActive ? '1px solid #ef4444' : '1px solid rgba(239, 68, 68, 0.3)',
          cursor: 'pointer',
          fontSize: '12px',
          fontWeight: 700,
          fontFamily: '"Inter", sans-serif',
          background: isEmergencyActive
            ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.3), rgba(220, 38, 38, 0.2))'
            : 'transparent',
          color: isEmergencyActive ? '#ef4444' : 'rgba(239, 68, 68, 0.6)',
          animation: isEmergencyActive ? 'pulse 1.5s infinite' : 'none',
          transition: 'all 0.2s ease',
        }}
      >
        <span>🚨</span>
        <span>EMERGENCY</span>
      </button>
    </div>
  );
}

export { MODES };
export type { ModeConfig };
