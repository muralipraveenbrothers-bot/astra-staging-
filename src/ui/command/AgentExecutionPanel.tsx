// ============================================================================
// ASTRA AI — Agent Execution Panel
// Real-time visual trace of multi-agent execution pipeline
// ============================================================================
import React from 'react';

export interface AgentStep {
  agentId: string;
  agentName: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startTime?: number;
  endTime?: number;
  input?: string;
  output?: string;
  tokensUsed?: number;
  model?: string;
  confidence?: number;
  children?: AgentStep[];
}

export interface ExecutionTrace {
  id: string;
  query: string;
  startTime: number;
  endTime?: number;
  steps: AgentStep[];
  totalTokens: number;
  status: 'running' | 'completed' | 'failed';
}

interface AgentExecutionPanelProps {
  trace: ExecutionTrace | null;
  isVisible: boolean;
  onClose: () => void;
}

const STATUS_COLORS: Record<AgentStep['status'], string> = {
  pending: '#64748b',
  running: '#22d3ee',
  completed: '#34d399',
  failed: '#ef4444',
  skipped: '#94a3b8',
};

const STATUS_ICONS: Record<AgentStep['status'], string> = {
  pending: '○',
  running: '◉',
  completed: '●',
  failed: '✕',
  skipped: '◌',
};

function AgentStepNode({ step, depth = 0 }: { step: AgentStep; depth?: number }) {
  const color = STATUS_COLORS[step.status];
  const icon = STATUS_ICONS[step.status];
  const durationMs = step.startTime && step.endTime ? step.endTime - step.startTime : null;

  return (
    <div style={{ marginLeft: depth * 20 }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 12px',
        margin: '2px 0',
        borderRadius: '8px',
        background: step.status === 'running'
          ? 'rgba(34, 211, 238, 0.08)'
          : 'rgba(15, 23, 42, 0.4)',
        border: `1px solid ${color}33`,
        transition: 'all 0.3s ease',
      }}>
        {/* Status indicator */}
        <span style={{
          color,
          fontSize: '14px',
          fontWeight: 700,
          animation: step.status === 'running' ? 'spin 1s linear infinite' : 'none',
          minWidth: '16px',
          textAlign: 'center',
        }}>
          {icon}
        </span>

        {/* Agent name */}
        <span style={{
          flex: 1,
          fontSize: '12px',
          fontWeight: 500,
          fontFamily: '"Inter", sans-serif',
          color: step.status === 'running' ? '#e2e8f0' : '#94a3b8',
        }}>
          {step.agentName}
        </span>

        {/* Model badge */}
        {step.model && (
          <span style={{
            fontSize: '10px',
            padding: '2px 6px',
            borderRadius: '4px',
            background: 'rgba(100, 116, 139, 0.15)',
            color: '#94a3b8',
            fontFamily: '"JetBrains Mono", monospace',
          }}>
            {step.model}
          </span>
        )}

        {/* Duration */}
        {durationMs !== null && (
          <span style={{
            fontSize: '10px',
            fontFamily: '"JetBrains Mono", monospace',
            color: durationMs > 2000 ? '#fb923c' : '#64748b',
          }}>
            {durationMs}ms
          </span>
        )}

        {/* Confidence */}
        {step.confidence !== undefined && step.status === 'completed' && (
          <span style={{
            fontSize: '10px',
            fontFamily: '"JetBrains Mono", monospace',
            color: step.confidence > 0.8 ? '#34d399' : step.confidence > 0.5 ? '#fb923c' : '#ef4444',
          }}>
            {(step.confidence * 100).toFixed(0)}%
          </span>
        )}

        {/* Tokens */}
        {step.tokensUsed !== undefined && (
          <span style={{
            fontSize: '10px',
            fontFamily: '"JetBrains Mono", monospace',
            color: '#64748b',
          }}>
            {step.tokensUsed}t
          </span>
        )}
      </div>

      {/* Output preview */}
      {step.output && step.status === 'completed' && (
        <div style={{
          marginLeft: '24px',
          padding: '4px 8px',
          fontSize: '11px',
          color: '#64748b',
          borderLeft: `2px solid ${color}44`,
          fontFamily: '"JetBrains Mono", monospace',
          maxHeight: '40px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {step.output.substring(0, 120)}...
        </div>
      )}

      {/* Children */}
      {step.children?.map((child, i) => (
        <AgentStepNode key={i} step={child} depth={depth + 1} />
      ))}
    </div>
  );
}

export function AgentExecutionPanel({ trace, isVisible, onClose }: AgentExecutionPanelProps) {
  if (!isVisible || !trace) return null;

  const totalDuration = trace.endTime ? trace.endTime - trace.startTime : Date.now() - trace.startTime;
  const completedSteps = trace.steps.filter(s => s.status === 'completed').length;
  const failedSteps = trace.steps.filter(s => s.status === 'failed').length;

  return (
    <div style={{
      position: 'fixed',
      right: '16px',
      top: '80px',
      bottom: '16px',
      width: '380px',
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
          <span style={{ fontSize: '16px' }}>🔬</span>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0' }}>
            Agent Execution Trace
          </span>
          <span style={{
            fontSize: '10px',
            padding: '2px 6px',
            borderRadius: '4px',
            background: trace.status === 'running'
              ? 'rgba(34, 211, 238, 0.15)'
              : trace.status === 'completed'
              ? 'rgba(52, 211, 153, 0.15)'
              : 'rgba(239, 68, 68, 0.15)',
            color: trace.status === 'running' ? '#22d3ee' : trace.status === 'completed' ? '#34d399' : '#ef4444',
            fontWeight: 600,
          }}>
            {trace.status.toUpperCase()}
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#64748b',
            cursor: 'pointer',
            fontSize: '16px',
            padding: '4px',
          }}
        >
          ✕
        </button>
      </div>

      {/* Query */}
      <div style={{
        padding: '12px 16px',
        background: 'rgba(15, 23, 42, 0.5)',
        borderBottom: '1px solid rgba(100, 116, 139, 0.1)',
      }}>
        <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Query
        </div>
        <div style={{ fontSize: '12px', color: '#cbd5e1', fontStyle: 'italic' }}>
          "{trace.query}"
        </div>
      </div>

      {/* Stats bar */}
      <div style={{
        display: 'flex',
        gap: '16px',
        padding: '10px 16px',
        borderBottom: '1px solid rgba(100, 116, 139, 0.1)',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ fontSize: '9px', color: '#64748b', textTransform: 'uppercase' }}>Duration</span>
          <span style={{ fontSize: '12px', color: '#e2e8f0', fontFamily: '"JetBrains Mono", monospace' }}>
            {totalDuration}ms
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ fontSize: '9px', color: '#64748b', textTransform: 'uppercase' }}>Steps</span>
          <span style={{ fontSize: '12px', color: '#e2e8f0', fontFamily: '"JetBrains Mono", monospace' }}>
            {completedSteps}/{trace.steps.length}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ fontSize: '9px', color: '#64748b', textTransform: 'uppercase' }}>Tokens</span>
          <span style={{ fontSize: '12px', color: '#e2e8f0', fontFamily: '"JetBrains Mono", monospace' }}>
            {trace.totalTokens}
          </span>
        </div>
        {failedSteps > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '9px', color: '#ef4444', textTransform: 'uppercase' }}>Failed</span>
            <span style={{ fontSize: '12px', color: '#ef4444', fontFamily: '"JetBrains Mono", monospace' }}>
              {failedSteps}
            </span>
          </div>
        )}
      </div>

      {/* Execution steps */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '12px',
      }}>
        {trace.steps.map((step, i) => (
          <AgentStepNode key={i} step={step} />
        ))}
      </div>
    </div>
  );
}
