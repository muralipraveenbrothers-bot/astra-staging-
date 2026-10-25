// ============================================================================
// ASTRA AI — Clinical Supercore Command Centre
// Main interactive command center supporting 7 modes + Emergency
// ============================================================================
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ModeSelector, type CommandMode } from './ModeSelector';
import { AgentExecutionPanel, type ExecutionTrace, type AgentStep } from './AgentExecutionPanel';
import { TracePanel } from './TracePanel';
import { useAuth } from '../../lib/auth';

interface CommandMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  mode: CommandMode;
  agentTrace?: ExecutionTrace;
  structuredData?: Record<string, unknown>;
  citations?: Array<{ source: string; pmid?: string; url?: string }>;
  isStreaming?: boolean;
}

// ─── Mock Agent Trace Generator ─────────────────────────────────────────────
function generateMockTrace(query: string): ExecutionTrace {
  const now = Date.now();
  const steps: AgentStep[] = [];

  // Determine pipeline based on query
  if (/(?:show|list|how many|pending|count)/i.test(query)) {
    steps.push(
      { agentId: 'intent-resolver', agentName: 'Intent Resolver', status: 'completed', startTime: now, endTime: now + 15, model: 'local', confidence: 0.98 },
      { agentId: 'hospital-query', agentName: 'Hospital Query Agent', status: 'completed', startTime: now + 16, endTime: now + 45, model: 'database', confidence: 1.0, tokensUsed: 0 },
      { agentId: 'verifier', agentName: 'Universal Verifier', status: 'completed', startTime: now + 46, endTime: now + 55, confidence: 1.0 },
    );
  } else if (/(?:differential|diagnosis|pathophysiology|explain)/i.test(query)) {
    steps.push(
      { agentId: 'intent-resolver', agentName: 'Intent Resolver', status: 'completed', startTime: now, endTime: now + 20, model: 'flash', confidence: 0.95 },
      { agentId: 'patient-context', agentName: 'Patient Context Agent', status: 'completed', startTime: now + 21, endTime: now + 80, model: 'flash', tokensUsed: 120 },
      { agentId: 'clinical-reasoning', agentName: 'Clinical Reasoning Agent', status: 'completed', startTime: now + 81, endTime: now + 2500, model: 'med-gemini', tokensUsed: 3200, confidence: 0.88 },
      { agentId: 'evidence', agentName: 'Evidence Agent', status: 'completed', startTime: now + 2501, endTime: now + 3800, model: 'pro', tokensUsed: 1500 },
      { agentId: 'blindspot', agentName: 'Blind Spot Engine', status: 'completed', startTime: now + 3801, endTime: now + 4200, confidence: 0.92 },
      { agentId: 'shield', agentName: 'Shield Guardian', status: 'completed', startTime: now + 4201, endTime: now + 4400, confidence: 1.0 },
      { agentId: 'verifier', agentName: 'Universal Verifier', status: 'completed', startTime: now + 4401, endTime: now + 4500, confidence: 0.90 },
    );
  } else if (/(?:order|create|prescribe)/i.test(query)) {
    steps.push(
      { agentId: 'intent-resolver', agentName: 'Intent Resolver', status: 'completed', startTime: now, endTime: now + 18, model: 'local', confidence: 0.97 },
      { agentId: 'patient-context', agentName: 'Patient Context Agent', status: 'completed', startTime: now + 19, endTime: now + 60, model: 'flash', tokensUsed: 80 },
      { agentId: 'command-agent', agentName: 'Command Agent', status: 'completed', startTime: now + 61, endTime: now + 200, model: 'database', tokensUsed: 0 },
      { agentId: 'shield', agentName: 'Shield Guardian', status: 'completed', startTime: now + 201, endTime: now + 350, confidence: 1.0 },
      { agentId: 'verifier', agentName: 'Universal Verifier', status: 'completed', startTime: now + 351, endTime: now + 400, confidence: 1.0 },
    );
  } else {
    steps.push(
      { agentId: 'intent-resolver', agentName: 'Intent Resolver', status: 'completed', startTime: now, endTime: now + 20, model: 'flash', confidence: 0.92 },
      { agentId: 'hermes', agentName: 'Hermes Brain', status: 'completed', startTime: now + 21, endTime: now + 1200, model: 'pro', tokensUsed: 800, confidence: 0.85 },
      { agentId: 'cerebellum', agentName: 'Cerebellum Filter', status: 'completed', startTime: now + 1201, endTime: now + 1350, confidence: 0.95 },
      { agentId: 'verifier', agentName: 'Universal Verifier', status: 'completed', startTime: now + 1351, endTime: now + 1400, confidence: 0.88 },
    );
  }

  const endTime = Math.max(...steps.map(s => s.endTime || 0));
  const totalTokens = steps.reduce((sum, s) => sum + (s.tokensUsed || 0), 0);

  return {
    id: `trace-${Date.now()}`,
    query,
    startTime: now,
    endTime,
    steps,
    totalTokens,
    status: 'completed',
  };
}

// ─── Command Centre ─────────────────────────────────────────────────────────
export function CommandCentre() {
  const { account } = useAuth();
  const [mode, setMode] = useState<CommandMode>('COMMAND');
  const [isEmergencyActive, setIsEmergencyActive] = useState(false);
  const [messages, setMessages] = useState<CommandMessage[]>([
    {
      id: '0',
      role: 'system',
      content: 'ASTRA AI Command Centre initialized. I am your hospital intelligence system — ask me anything about patients, orders, clinical reasoning, or hospital operations.',
      timestamp: new Date(),
      mode: 'COMMAND',
    },
  ]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTrace, setActiveTrace] = useState<ExecutionTrace | null>(null);
  const [showTracePanel, setShowTracePanel] = useState(false);
  const [showAgentPanel, setShowAgentPanel] = useState(false);
  const [traces, setTraces] = useState<ExecutionTrace[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input on mode change
  useEffect(() => {
    inputRef.current?.focus();
  }, [mode]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key >= '1' && e.key <= '7') {
        const modes: CommandMode[] = ['COMMAND', 'CLINICAL', 'PATIENT', 'HOSPITAL', 'EVIDENCE', 'AGENTS', 'SYSTEM'];
        setMode(modes[parseInt(e.key) - 1]);
        e.preventDefault();
      }
      if (e.altKey && e.key === 'e') {
        setIsEmergencyActive(prev => !prev);
        e.preventDefault();
      }
      if (e.altKey && e.key === 't') {
        setShowAgentPanel(prev => !prev);
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const submitCommand = useCallback(async (rawCommand: string) => {
    const command = rawCommand.trim();
    if (!command || isProcessing) return;

    const userMessage: CommandMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: command,
      timestamp: new Date(),
      mode,
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsProcessing(true);

    const startedAt = Date.now();
    const token = localStorage.getItem('astra.serverToken');
    let response = '';
    let result: any;
    try {
      const apiResponse = await fetch('/api/command/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ query: userMessage.content, source: 'command-centre', isAiGenerated: false }),
      });
      result = await apiResponse.json();
      if (!apiResponse.ok) throw new Error(result?.message || result?.error || 'Command request failed');
      response = result.message || JSON.stringify(result.data || {});
    } catch (error) {
      response = error instanceof Error ? `Command unavailable: ${error.message}` : 'Command unavailable.';
      result = { success: false, message: response };
    }
    const finishedAt = Date.now();
    const trace: ExecutionTrace = {
      id: `trace-${Date.now()}`, query: userMessage.content, startTime: startedAt, endTime: finishedAt,
      totalTokens: 0, status: result.success === false ? 'failed' : 'completed',
      steps: [{ agentId: 'hospital-command-engine', agentName: 'Authoritative Hospital Command Engine', status: result.success === false ? 'failed' : 'completed', startTime: startedAt, endTime: finishedAt, model: 'server-command-engine', confidence: result.success === false ? 0 : 1 }],
    };
    setActiveTrace(trace); setTraces(prev => [trace, ...prev]); setShowAgentPanel(true);

    const assistantMessage: CommandMessage = {
      id: `msg-${Date.now()}-reply`,
      role: 'assistant',
      content: response,
      timestamp: new Date(),
      mode,
      agentTrace: trace,
    };

    setMessages(prev => [...prev, assistantMessage]);
    setIsProcessing(false);
  }, [mode, isProcessing, account?.id]);

  const handleSubmit = useCallback(() => submitCommand(input), [input, submitCommand]);

  useEffect(() => {
    const handleQuickCommand = (event: Event) => {
      const command = (event as CustomEvent<string>).detail;
      if (command) void submitCommand(command);
    };
    const handleNewChat = () => {
      setMessages(prev => prev.filter(message => message.role === 'system'));
      setActiveTrace(null);
      setShowAgentPanel(false);
      setShowTracePanel(false);
      setInput('');
    };
    window.addEventListener('astra:command', handleQuickCommand);
    window.addEventListener('astra:new-chat', handleNewChat);
    return () => {
      window.removeEventListener('astra:command', handleQuickCommand);
      window.removeEventListener('astra:new-chat', handleNewChat);
    };
  }, [submitCommand]);

  const isWelcome = messages.length === 1 && messages[0].role === 'system';
  const welcomeColumns = [
    {
      icon: '☀', title: 'Clinical examples',
      items: ['Show today’s inpatient census', 'Review critical vitals', 'Differential diagnosis of fever'],
      commands: ['show ip list', 'show critical vitals', 'differential diagnosis of fever'],
    },
    {
      icon: '⚡', title: 'Capabilities',
      items: ['Hospital operations and orders', 'Evidence-guided clinical reasoning', 'Multi-agent execution trace'],
    },
    {
      icon: '△', title: 'Safety limits',
      items: ['Clinician review remains required', 'Patient context is access controlled', 'Emergency actions stay auditable'],
    },
  ];

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
        background: '#121827',
      fontFamily: '"Inter", sans-serif',
    }}>
      {/* Top bar with mode selector */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 20px',
        borderBottom: '1px solid rgba(100, 116, 139, 0.12)',
        background: 'rgba(2, 6, 23, 0.6)',
        backdropFilter: 'blur(12px)',
      }}>
        <ModeSelector
          currentMode={mode}
          onModeChange={setMode}
          isEmergencyActive={isEmergencyActive}
          onEmergencyToggle={() => setIsEmergencyActive(!isEmergencyActive)}
        />

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setShowTracePanel(!showTracePanel)}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              border: '1px solid rgba(100, 116, 139, 0.2)',
              background: showTracePanel ? 'rgba(212, 175, 55, 0.1)' : 'transparent',
              color: showTracePanel ? '#d4af37' : '#64748b',
              cursor: 'pointer',
              fontSize: '11px',
              fontFamily: '"Inter", sans-serif',
            }}
          >
            📋 History
          </button>
          <button
            onClick={() => setShowAgentPanel(!showAgentPanel)}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              border: '1px solid rgba(100, 116, 139, 0.2)',
              background: showAgentPanel ? 'rgba(34, 211, 238, 0.1)' : 'transparent',
              color: showAgentPanel ? '#22d3ee' : '#64748b',
              cursor: 'pointer',
              fontSize: '11px',
              fontFamily: '"Inter", sans-serif',
            }}
          >
            🔬 Trace
          </button>
        </div>
      </div>

      {/* Emergency banner */}
      {isEmergencyActive && (
        <div style={{
          padding: '10px 20px',
          background: 'linear-gradient(90deg, rgba(239, 68, 68, 0.15), rgba(220, 38, 38, 0.1))',
          borderBottom: '1px solid rgba(239, 68, 68, 0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          animation: 'pulse 2s infinite',
        }}>
          <span style={{ fontSize: '18px' }}>🚨</span>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#ef4444' }}>
            EMERGENCY MODE ACTIVE
          </span>
          <span style={{ fontSize: '11px', color: '#fca5a5' }}>
            — All responses prioritized. Safety checks enabled. Code team protocols available.
          </span>
        </div>
      )}

      {/* Messages area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}>
        {isWelcome && (
          <div style={{
            width: '100%', maxWidth: '860px', margin: 'auto', padding: '28px 18px 12px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#e5e7eb',
          }}>
            <div style={{
              width: '54px', height: '54px', borderRadius: '14px', display: 'grid', placeItems: 'center',
              border: '2px solid #d4af37', color: '#f6c945', boxShadow: '0 0 22px rgba(212,175,55,.18)',
              fontSize: '25px', marginBottom: '16px',
            }}>✧</div>
            <div style={{ fontSize: '24px', fontWeight: 700, letterSpacing: '.02em' }}>ASTRA AI</div>
            <div style={{ color: '#94a3b8', fontSize: '13px', marginTop: '7px', marginBottom: '36px' }}>
              Hospital intelligence, ready when you are
            </div>
            <div style={{ width: '100%', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '16px' }}>
              {welcomeColumns.map(column => (
                <div key={column.title} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '20px', color: column.title === 'Clinical examples' ? '#d4af37' : '#cbd5e1' }}>{column.icon}</div>
                  <div style={{ fontSize: '12px', fontWeight: 600, margin: '8px 0 12px' }}>{column.title}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {column.items.map((item, index) => (
                      <button
                        key={item}
                        onClick={() => column.commands?.[index] && void submitCommand(column.commands[index])}
                        disabled={!column.commands}
                        style={{
                          minHeight: '52px', padding: '9px 10px', borderRadius: '7px',
                          border: '1px solid rgba(148,163,184,.10)', background: 'rgba(255,255,255,.045)',
                          color: '#aeb8c8', fontSize: '11px', lineHeight: 1.35,
                          cursor: column.commands ? 'pointer' : 'default', fontFamily: '\"Inter\", sans-serif',
                        }}
                      >{item}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {!isWelcome && messages.filter(msg => msg.role !== 'system').map(msg => (
          <div
            key={msg.id}
            style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '80%',
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <div style={{
              padding: '12px 16px',
              borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
              background: msg.role === 'user'
                ? 'linear-gradient(135deg, rgba(212, 175, 55, 0.15), rgba(212, 175, 55, 0.08))'
                : msg.role === 'system'
                ? 'rgba(100, 116, 139, 0.1)'
                : 'rgba(15, 23, 42, 0.6)',
              border: msg.role === 'user'
                ? '1px solid rgba(212, 175, 55, 0.2)'
                : '1px solid rgba(100, 116, 139, 0.12)',
              backdropFilter: 'blur(8px)',
            }}>
              {msg.role === 'assistant' && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginBottom: '8px',
                }}>
                  <span style={{
                    fontSize: '10px',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: 'rgba(212, 175, 55, 0.15)',
                    color: '#d4af37',
                    fontWeight: 600,
                    letterSpacing: '0.5px',
                  }}>
                    ASTRA
                  </span>
                  {msg.agentTrace && (
                    <button
                      onClick={() => {
                        setActiveTrace(msg.agentTrace!);
                        setShowAgentPanel(true);
                      }}
                      style={{
                        fontSize: '10px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: 'rgba(34, 211, 238, 0.1)',
                        color: '#22d3ee',
                        border: 'none',
                        cursor: 'pointer',
                        fontFamily: '"JetBrains Mono", monospace',
                      }}
                    >
                      {msg.agentTrace.steps.length} agents · {msg.agentTrace.endTime! - msg.agentTrace.startTime}ms
                    </button>
                  )}
                </div>
              )}
              <div style={{
                fontSize: '13px',
                lineHeight: 1.6,
                color: msg.role === 'system' ? '#94a3b8' : '#e2e8f0',
                whiteSpace: 'pre-wrap',
              }}>
                {msg.content}
              </div>
            </div>
          </div>
        ))}

        {isProcessing && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 16px',
            maxWidth: '60%',
          }}>
            <div style={{
              display: 'flex',
              gap: '4px',
            }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: '#d4af37',
                  animation: `bounce 0.8s ease-in-out ${i * 0.15}s infinite`,
                }} />
              ))}
            </div>
            <span style={{ fontSize: '11px', color: '#64748b' }}>ASTRA is thinking...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div style={{
        padding: '12px 20px 14px',
        background: '#121827',
        backdropFilter: 'blur(12px)',
      }}>
        <div style={{
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          maxWidth: '860px',
          margin: '0 auto',
        }}>
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px 16px',
            borderRadius: '12px',
            border: isEmergencyActive
              ? '1px solid rgba(239, 68, 68, 0.3)'
              : '1px solid rgba(100, 116, 139, 0.2)',
            background: 'rgba(15, 23, 42, 0.5)',
            boxShadow: '0 10px 28px rgba(0,0,0,.22)',
            transition: 'all 0.2s ease',
          }}>
            <span style={{ fontSize: '14px', opacity: 0.5 }}>
              {isEmergencyActive ? '🚨' : '⌘'}
            </span>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder={
                isEmergencyActive
                  ? 'Emergency command...'
                  : `${mode} mode — Ask anything or enter a command...`
              }
              disabled={isProcessing}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: '#e2e8f0',
                fontSize: '14px',
                fontFamily: '"Inter", sans-serif',
              }}
            />
            <span style={{
              fontSize: '10px',
              color: '#475569',
              fontFamily: '"JetBrains Mono", monospace',
            }}>
              Enter ↵
            </span>
          </div>
        </div>
        <div style={{ textAlign: 'center', color: '#526075', fontSize: '9px', marginTop: '8px' }}>
          ASTRA supports clinical work; verify patient-specific decisions before acting.
        </div>
      </div>

      {/* Side panels */}
      <AgentExecutionPanel
        trace={activeTrace}
        isVisible={showAgentPanel}
        onClose={() => setShowAgentPanel(false)}
      />
      <TracePanel
        traces={traces}
        isVisible={showTracePanel}
        onClose={() => setShowTracePanel(false)}
        onSelectTrace={trace => {
          setActiveTrace(trace);
          setShowAgentPanel(true);
        }}
      />

      {/* Animations */}
      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); opacity: 0.5; }
          50% { transform: translateY(-6px); opacity: 1; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// ─── Response Generator ─────────────────────────────────────────────────────
function generateResponse(query: string, mode: CommandMode): string {
  const q = query.toLowerCase().trim();

  // Identity
  if (/who are you|what is your name|your name/i.test(q)) {
    return `I am ASTRA AI — your Hospital Central AI Command Centre.\n\nI am powered by the Hermes Clinical Brain with 160+ specialist agents, operating across 7 intelligence modes:\n• COMMAND — Universal command interface\n• CLINICAL — Susruta clinical reasoning engine\n• PATIENT — Patient context & timeline\n• HOSPITAL — Operations & census\n• EVIDENCE — Medical evidence search\n• AGENTS — Agent monitoring\n• SYSTEM — Health & configuration\n\nI can process clinical queries, manage hospital operations, place orders, and provide evidence-based medical intelligence — all in real-time.\n\nHow can I help you today?`;
  }

  // Hospital queries
  if (/show (ip|admitted|inpatient) (list|patients)|ip patient list/i.test(q)) {
    return `📋 **IP Census — Active Inpatients**\n\n| # | UHID | Name | Ward | Bed | Dx | Adm Date |\n|---|------|------|------|-----|----|----------|\n| 1 | UH-2026-001 | Rajesh Kumar | ICU | ICU-01 | Dengue Fever (DHF) | 12 Aug 2026 |\n| 2 | UH-2026-002 | Priya Sharma | Ward A | A-04 | Community Acquired Pneumonia | 13 Aug 2026 |\n| 3 | UH-2026-003 | Venkat Reddy | Ward B | B-02 | Acute Pancreatitis | 11 Aug 2026 |\n| 4 | UH-2026-004 | Lakshmi Devi | ICU | ICU-03 | Septic Shock | 14 Aug 2026 |\n| 5 | UH-2026-005 | Mohammed Irfan | Ward A | A-06 | Type 2 DM with DKA | 10 Aug 2026 |\n\n**Total IP: 5** | ICU: 2 | General Ward: 3\n\n⚡ Routed deterministically via Hospital Query Agent — 45ms, zero LLM tokens.`;
  }

  if (/show (op|outpatient) (list|patients)|op patient list/i.test(q)) {
    return `📋 **OP Queue — Today's Outpatients**\n\n| # | Token | Name | Doctor | Dept | Status |\n|---|-------|------|--------|------|--------|\n| 1 | OP-101 | Anitha Rao | Dr. Murali | General Medicine | In Consultation |\n| 2 | OP-102 | Srinivas G | Dr. Priya | Pediatrics | Waiting |\n| 3 | OP-103 | Kavitha M | Dr. Murali | General Medicine | Waiting |\n| 4 | OP-104 | Ram Prasad | Dr. Suresh | Orthopedics | Completed |\n| 5 | OP-105 | Fatima Begum | Dr. Murali | General Medicine | Waiting |\n\n**Total OP Today: 5** | Completed: 1 | Waiting: 3 | In Progress: 1\n\n⚡ 38ms — zero LLM.`;
  }

  if (/how many patients|total patients|census/i.test(q)) {
    return `🏥 **Hospital Census — Real-Time**\n\n• Inpatients (IP): **5**\n  - ICU: 2\n  - General Ward: 3\n• Outpatients (OP) Today: **5**\n  - Completed: 1\n  - In Progress: 1\n  - Waiting: 3\n• Total Beds: 50\n• Occupancy: **10%**\n\n⚡ 22ms — deterministic query.`;
  }

  if (/show icu|icu patients/i.test(q)) {
    return `🔴 **ICU Census**\n\n| # | UHID | Name | Bed | Dx | Ventilator | GCS | SOFA |\n|---|------|------|-----|----|-----------|-----|------|\n| 1 | UH-2026-001 | Rajesh Kumar | ICU-01 | Dengue (DHF) | No | 14 | 4 |\n| 2 | UH-2026-004 | Lakshmi Devi | ICU-03 | Septic Shock | Yes | 8 | 9 |\n\n**ICU Occupancy: 2/6 beds** | 1 ventilated | Avg SOFA: 6.5`;
  }

  if (/pending lab/i.test(q)) {
    return `🧪 **Pending Lab Orders**\n\n| # | Order ID | Patient | Test | Priority | Ordered By | Time |\n|---|----------|---------|------|----------|-----------|------|\n| 1 | LAB-4521 | Rajesh Kumar | CBC, CRP | URGENT | Dr. Murali | 09:30 |\n| 2 | LAB-4522 | Priya Sharma | Blood Culture | STAT | Dr. Murali | 10:15 |\n| 3 | LAB-4523 | Venkat Reddy | Amylase, Lipase | ROUTINE | Dr. Suresh | 11:00 |\n\n**Total Pending: 3** | STAT: 1 | URGENT: 1 | ROUTINE: 1`;
  }

  if (/pending radiology/i.test(q)) {
    return `📡 **Pending Radiology**\n\n| # | Order ID | Patient | Study | Priority | Status |\n|---|----------|---------|-------|----------|--------|\n| 1 | RAD-801 | Rajesh Kumar | Chest X-ray | URGENT | Awaiting |\n| 2 | RAD-802 | Venkat Reddy | USG Abdomen | ROUTINE | Scheduled |\n\n**Total Pending: 2**`;
  }

  if (/pending pharmacy/i.test(q)) {
    return `💊 **Pending Pharmacy Orders**\n\n| # | Rx ID | Patient | Medications | Priority | Status |\n|---|-------|---------|-------------|----------|--------|\n| 1 | RX-3301 | Rajesh Kumar | IV NS, Paracetamol, Platelet watch | URGENT | Processing |\n| 2 | RX-3302 | Lakshmi Devi | Meropenem, Noradrenaline | STAT | Ready |\n| 3 | RX-3303 | Mohammed Irfan | Insulin Infusion | URGENT | Dispensed |\n\n**Total Pending: 3**`;
  }

  if (/today.*ot|ot.*schedule/i.test(q)) {
    return `🔪 **Today's OT Schedule**\n\n| # | Time | Patient | Procedure | Surgeon | OT Room | Status |\n|---|------|---------|-----------|---------|---------|--------|\n| 1 | 08:30 | Ram K | Appendectomy | Dr. Suresh | OT-1 | Completed |\n| 2 | 11:00 | Anitha R | Cholecystectomy | Dr. Suresh | OT-1 | In Progress |\n| 3 | 14:30 | Naveen P | Hernia Repair | Dr. Rajesh | OT-2 | Scheduled |\n\n**Total Surgeries: 3** | Completed: 1 | In Progress: 1 | Scheduled: 1`;
  }

  // Clinical reasoning
  if (/differential.*fever|fever.*differential/i.test(q)) {
    return `🩺 **Differential Diagnosis — Fever**\n\n**Susruta Clinical Reasoning (20-step analysis):**\n\n**Most Likely (Tier A):**\n1. **Dengue Fever** — Endemic area, seasonal, thrombocytopenia\n2. **Community Acquired Pneumonia** — Cough, consolidation, leukocytosis\n3. **Urinary Tract Infection** — Dysuria, pyuria, common in hospitalized\n\n**Consider (Tier B):**\n4. Malaria — Travel history, cyclical fever\n5. Typhoid Fever — Sustained fever, relative bradycardia\n6. Scrub Typhus — Eschar, outdoor exposure\n\n**Red Flags to Rule Out:**\n7. Meningitis — Neck stiffness, photophobia\n8. Infective Endocarditis — New murmur, embolic phenomena\n9. Deep tissue abscess — Localized pain, raised CRP\n\n**Recommended Workup:**\n- CBC with differential, CRP, Procalcitonin\n- Blood culture × 2 sets\n- Dengue NS1 Ag + IgM/IgG\n- Peripheral smear for malaria\n- Chest X-ray\n- Urinalysis + urine culture\n\n📚 *Evidence: Harrison's Principles of Internal Medicine, 21st Ed; WHO Dengue Guidelines 2024*\n\n🛡️ Shield: No safety concerns. Cerebellum: Output verified.`;
  }

  if (/search pubmed|pubmed.*dengue/i.test(q)) {
    return `📚 **PubMed Evidence Search — Dengue Guidelines**\n\n**Top Results (Tier A-B Evidence):**\n\n1. **WHO Dengue Guidelines for Diagnosis, Treatment, Prevention and Control (2024 Revision)**\n   PMID: 38901234 | Tier A (Systematic Review)\n   Key finding: Revised warning sign criteria, updated fluid management protocol\n\n2. **Dengue and Severe Dengue: Management Update 2025**\n   Authors: Simmons CP, et al. | NEJM 2025;392:45-58\n   PMID: 39123456 | Tier B (Large RCT)\n   Key finding: Early goal-directed fluid therapy reduces mortality by 32%\n\n3. **Platelet Transfusion in Dengue: A Randomized Controlled Trial**\n   Authors: Lye DC, et al. | Lancet 2024;403:1201-1210\n   PMID: 38567890 | Tier B (RCT)\n   Key finding: Prophylactic platelet transfusion not beneficial unless active bleeding\n\n**Consensus:** Current evidence strongly supports conservative fluid management with close monitoring over aggressive intervention.\n\n**⚠️ Conflict detected:** WHO 2024 vs. local protocol on platelet threshold — WHO recommends 10,000/µL for prophylactic transfusion, local protocol uses 20,000/µL. Higher evidence tier (WHO) preferred.\n\n*Searched: PubMed, PMC, ClinicalTrials.gov | 3 sources returned | 1,200ms*`;
  }

  // Order commands
  if (/order cbc/i.test(q)) {
    const patient = q.match(/for\s+(\w+)/i)?.[1] || 'Rajesh Kumar';
    return `✅ **Lab Order Created**\n\n• Order ID: LAB-${Math.floor(4500 + Math.random() * 500)}\n• Patient: ${patient}\n• Test: CBC (Complete Blood Count)\n• Priority: ROUTINE\n• Ordered By: Dr. Murali Praveen\n• Destination: Laboratory Workstation\n• Status: SENT ✓\n\n🛡️ Shield: No contraindications. RBAC: Authorized (Doctor role).\n📝 Audit: Immutable record created.`;
  }

  // Default
  return `I received your query in ${mode} mode: "${query}"\n\nThis has been routed through the Hermes Brain → LangGraph Orchestrator → Specialist Agents pipeline.\n\n💡 Try commands like:\n• "show ip list" — View inpatients\n• "how many patients in hospital" — Census\n• "differential diagnosis of fever" — Clinical reasoning\n• "search PubMed for dengue guidelines" — Evidence search\n• "order CBC for Rajesh" — Place a lab order\n• "show pending lab" — Lab queue`;
}
