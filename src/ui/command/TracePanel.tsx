// ============================================================================
// ASTRA AI — Trace Panel
// Execution inspector for deep-dive into agent trace data
// ============================================================================
import React, { useState } from 'react';
import type { ExecutionTrace, AgentStep } from './AgentExecutionPanel';

interface TracePanelProps {
  traces: ExecutionTrace[];
  isVisible: boolean;
  onClose: () => void;
  onSelectTrace: (trace: ExecutionTrace) => void;
}

export function TracePanel({ traces, isVisible, onClose, onSelectTrace }: TracePanelProps) {
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'running' | 'completed' | 'failed'>('all');

  if (!isVisible) return null;

  const filteredTraces = filter === 'all'
    ? traces
    : traces.filter(t => t.status === filter);

  return (
    <div style={{
      position: 'fixed',
      left: '16px',
      top: '80px',
      bottom: '16px',
      width: '340px',
      background: 'rgba(2, 6, 23, 0.95)',
      backdropFilter: 'blur(20px)',
      border: '1px solid rgba(100, 116, 139, 0.2)',
      borderRadius: '16px',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 50,
      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
      fontFamily: '"Inter", sans-serif',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px',
        borderBottom: '1px solid rgba(100, 116, 139, 0.15)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>📋</span>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0' }}>
            Execution History
          </span>
          <span style={{
            fontSize: '10px',
            padding: '2px 6px',
            borderRadius: '4px',
            background: 'rgba(100, 116, 139, 0.15)',
            color: '#94a3b8',
          }}>
            {traces.length}
          </span>
        </div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '16px', padding: '4px' }}
        >
          ✕
        </button>
      </div>

      {/* Filter tabs */}
      <div style={{
        display: 'flex',
        gap: '4px',
        padding: '8px 12px',
        borderBottom: '1px solid rgba(100, 116, 139, 0.1)',
      }}>
        {(['all', 'running', 'completed', 'failed'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: filter === f ? 600 : 400,
              fontFamily: '"Inter", sans-serif',
              background: filter === f ? 'rgba(212, 175, 55, 0.15)' : 'transparent',
              color: filter === f ? '#d4af37' : '#64748b',
              transition: 'all 0.2s ease',
            }}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Trace list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        {filteredTraces.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '200px',
            gap: '8px',
          }}>
            <span style={{ fontSize: '32px', opacity: 0.3 }}>🔍</span>
            <span style={{ fontSize: '12px', color: '#64748b' }}>No traces found</span>
          </div>
        ) : (
          filteredTraces.map(trace => {
            const isSelected = selectedTraceId === trace.id;
            const duration = trace.endTime ? trace.endTime - trace.startTime : Date.now() - trace.startTime;
            const completedSteps = trace.steps.filter(s => s.status === 'completed').length;

            return (
              <button
                key={trace.id}
                onClick={() => {
                  setSelectedTraceId(trace.id);
                  onSelectTrace(trace);
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  padding: '12px',
                  marginBottom: '4px',
                  borderRadius: '10px',
                  border: isSelected ? '1px solid rgba(212, 175, 55, 0.3)' : '1px solid rgba(100, 116, 139, 0.1)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontFamily: '"Inter", sans-serif',
                  background: isSelected ? 'rgba(212, 175, 55, 0.05)' : 'rgba(15, 23, 42, 0.3)',
                  transition: 'all 0.2s ease',
                }}
              >
                {/* Query */}
                <div style={{
                  fontSize: '12px',
                  color: '#cbd5e1',
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {trace.query}
                </div>

                {/* Stats row */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  fontSize: '10px',
                }}>
                  {/* Status */}
                  <span style={{
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: trace.status === 'running'
                      ? 'rgba(34, 211, 238, 0.15)'
                      : trace.status === 'completed'
                      ? 'rgba(52, 211, 153, 0.15)'
                      : 'rgba(239, 68, 68, 0.15)',
                    color: trace.status === 'running' ? '#22d3ee' : trace.status === 'completed' ? '#34d399' : '#ef4444',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                  }}>
                    {trace.status}
                  </span>

                  {/* Duration */}
                  <span style={{ color: '#64748b', fontFamily: '"JetBrains Mono", monospace' }}>
                    {duration}ms
                  </span>

                  {/* Steps */}
                  <span style={{ color: '#64748b' }}>
                    {completedSteps}/{trace.steps.length} steps
                  </span>

                  {/* Tokens */}
                  <span style={{ color: '#64748b', fontFamily: '"JetBrains Mono", monospace' }}>
                    {trace.totalTokens}t
                  </span>
                </div>

                {/* Progress bar */}
                <div style={{
                  width: '100%',
                  height: '3px',
                  borderRadius: '2px',
                  background: 'rgba(100, 116, 139, 0.15)',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%',
                    borderRadius: '2px',
                    width: `${trace.steps.length > 0 ? (completedSteps / trace.steps.length) * 100 : 0}%`,
                    background: trace.status === 'failed'
                      ? 'linear-gradient(90deg, #ef4444, #dc2626)'
                      : 'linear-gradient(90deg, #d4af37, #22d3ee)',
                    transition: 'width 0.5s ease',
                  }} />
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
